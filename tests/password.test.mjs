import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { credentials } from "../scripts/credentials.mjs";
import { initializeCredentials } from "../scripts/initialize-credentials.mjs";
import { config, db, reset } from "./neon-helper.mjs";
import { runtime, loadConfig, migrate } from "../scripts/neon-runtime.mjs";
import { createBackup, restoreBackup } from "../scripts/neon-backup.mjs";

test("password changes: ownership, validation, revocation, concurrency, rollback and recovery", async (t) => {
  const auth = credentials(),
    origin = "http://localhost";
  // Test-only transaction faults and a deterministic stale-login interleaving.
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
 import {app} from './worker/index.ts';
 import {Database} from './worker/db/postgres.ts';
 import {EvidenceStorage} from './worker/storage.ts';
 export default {async fetch(req,env,ctx){
  const db=new Database(env.DATABASE_URL),fault=req.headers.get('X-Test-Fault');
  const proxy=new Proxy(db,{get(target,key){
   if(key==='batch')return async statements=>{
    if(fault==='rollback'&&statements[0]?.text.startsWith('UPDATE account_credentials'))
     return target.batch([...statements,target.prepare('SELECT 1/0')]);
    if(fault==='stale-login'&&statements[0]?.text.startsWith('INSERT INTO sessions')){
     await target.batch([target.prepare("UPDATE account_credentials SET version=version+1 WHERE account_id='partner-a'"),target.prepare("DELETE FROM sessions WHERE account_id='partner-a'")]);
    }
    return target.batch(statements);
   };
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  return app.fetch(req,{...env,DB:proxy,EVIDENCE:new EvidenceStorage(env)},ctx);
 }};`,
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    target: "es2022",
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: compiled.outputFiles[0].text,
      compatibilityDate: "2026-11-12",
      bindings: {
        ...config,
        APP_ORIGIN: origin,
        LOCAL_DEV: "1",
        AUTH_USERS_JSON: JSON.stringify(auth.users),
        SESSION_SECRET: auth.secret,
        PASSWORD_PEPPER: auth.pepper,
      },
    }),
  );
  async function req(path, body, cookie = "", extra = {}) {
    const r = await mf.dispatchFetch(origin + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
      headers: r.headers,
    };
  }
  const login = (i = 0, password = auth.passwords[i], extra = {}) =>
    req("/login", { email: auth.users[i].email, password }, "", extra);
  const body = (
    currentPassword,
    newPassword = "Ruang hijau pukul tujuh 2026",
  ) => ({ currentPassword, newPassword, confirmPassword: newPassword });
  const row = () =>
    db
      .prepare("SELECT * FROM account_credentials WHERE account_id='partner-a'")
      .first();
  const clearLimits = () => db.prepare("DELETE FROM login_attempts").run();
  try {
    await reset(auth.users);
    await t.test(
      "existing five-column sessions remain valid after additive credential initialization",
      async () => {
        const token = randomBytes(32).toString("hex"),
          now = Date.now();
        await db
          .prepare("INSERT INTO sessions VALUES($1,$2,$3,$4,$5)")
          .bind(
            createHash("sha256").update(token).digest("hex"),
            "partner-b",
            createHmac("sha256", auth.secret)
              .update(JSON.stringify(auth.users))
              .digest("hex"),
            now,
            now + 60000,
          )
          .run();
        assert.equal(
          (await req("/me", undefined, "ff_local_session=" + token)).status,
          200,
        );
      },
    );
    const a = await login(),
      a2 = await login(),
      b = await login(1);
    assert.equal(a.status, 200);
    assert.equal(a2.status, 200);
    assert.equal(b.status, 200);
    await t.test(
      "unauthenticated, cross-origin and forged owner requests rejected",
      async () => {
        assert.equal(
          (await req("/account/password", body(auth.passwords[0]))).status,
          401,
        );
        assert.equal(
          (
            await req("/account/password", body(auth.passwords[0]), a.cookie, {
              Origin: "https://foreign.invalid",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await req(
              "/account/password",
              { ...body(auth.passwords[0]), accountId: "partner-b" },
              a.cookie,
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "wrong old password and invalid new password do not change credentials",
      async () => {
        const before = await row();
        assert.equal(
          (await req("/account/password", body("wrong-old-password"), a.cookie))
            .data.error.code,
          "WRONG_PASSWORD",
        );
        for (const next of [
          "short",
          "passwordpassword",
          "x".repeat(129),
          "😀".repeat(129),
        ])
          assert.equal(
            (
              await req(
                "/account/password",
                body(auth.passwords[0], next),
                a.cookie,
              )
            ).status,
            400,
          );
        assert.equal(
          (
            await req(
              "/account/password",
              { ...body(auth.passwords[0]), confirmPassword: "different" },
              a.cookie,
            )
          ).status,
          400,
        );
        assert.deepEqual(await row(), before);
      },
    );
    await t.test(
      "transaction failure rolls back hash and session revocation",
      async () => {
        const before = await row();
        assert.equal(
          (
            await req("/account/password", body(auth.passwords[0]), a.cookie, {
              "X-Test-Fault": "rollback",
            })
          ).status,
          500,
        );
        assert.deepEqual(await row(), before);
        assert.equal((await req("/me", undefined, a.cookie)).status, 200);
        assert.equal((await req("/me", undefined, a2.cookie)).status, 200);
      },
    );
    await t.test(
      "one account changes password; its sessions revoked, partner preserved",
      async () => {
        const result = await req(
          "/account/password",
          body(auth.passwords[0]),
          a.cookie,
        );
        assert.equal(result.status, 200, JSON.stringify(result.data));
        assert.deepEqual(result.data, { ok: true, loginRequired: true });
        assert.match(result.headers.get("set-cookie"), /Max-Age=0/);
        for (const cookie of [a.cookie, a2.cookie])
          assert.equal((await req("/me", undefined, cookie)).status, 401);
        assert.equal((await req("/me", undefined, b.cookie)).status, 200);
        const stored = await row();
        assert.equal(stored.scheme, "bcrypt_hmac_sha384");
        assert.equal(stored.version, 2);
        assert.match(stored.hash, /^\$2[abxy]\$12\$/);
        assert.ok(!stored.hash.includes(body("").newPassword));
        await initializeCredentials(db, auth.users);
        assert.deepEqual(await row(), stored);
        assert.equal((await login()).status, 401);
        assert.equal((await login(0, body("").newPassword)).status, 200);
        const me = (await req("/me", undefined, b.cookie)).data;
        assert.deepEqual(Object.keys(me).sort(), ["people", "user"]);
        assert.ok(!JSON.stringify(me).includes(stored.hash));
      },
    );
    await t.test(
      "concurrent changes have only one winner and cannot kill a newer session",
      async () => {
        await clearLimits();
        const current = body("").newPassword,
          c = await login(0, current);
        const results = await Promise.all(
          ["Kebun senja untuk esok 2030", "Teras pagi bersama kopi 2031"].map(
            (p) => req("/account/password", body(current, p), c.cookie),
          ),
        );
        assert.equal(
          results.filter((r) => r.status === 200).length,
          1,
          JSON.stringify(results.map((r) => r.status)),
        );
        assert.ok(results.some((r) => [401, 409].includes(r.status)));
        assert.equal((await row()).version, 3);
        const winner =
          results[0].status === 200
            ? "Kebun senja untuk esok 2030"
            : "Teras pagi bersama kopi 2031";
        const fresh = await login(0, winner);
        assert.equal(fresh.status, 200);
        assert.equal(
          (await req("/account/password", body(current), c.cookie)).status,
          401,
        );
        assert.equal((await req("/me", undefined, fresh.cookie)).status, 200);
      },
    );
    await t.test(
      "changed credentials survive backup and restore with matching separate pepper",
      async () => {
        const folder = await createBackup(
          db,
          (await import("./neon-helper.mjs")).bucket,
        );
        const target = loadConfig(".env.neon-restore");
        assert.equal(target.NEON_BRANCH, "financee-restore-test");
        assert.notEqual(
          new URL(target.DATABASE_URL).host,
          new URL(config.DATABASE_URL).host,
        );
        const { Database, EvidenceStorage } = await runtime(),
          dest = new Database(target.DATABASE_URL),
          storage = new EvidenceStorage(target);
        await migrate(dest);
        await dest
          .prepare(
            "TRUNCATE attachments,transfers,expenses,budget_items,budgets,periods,default_items,sessions,login_attempts,account_credentials",
          )
          .run();
        await assert.rejects(
          restoreBackup(dest, storage, folder),
          /PASSWORD_PEPPER/,
        );
        await assert.rejects(
          restoreBackup(dest, storage, folder, "0".repeat(64)),
          /PASSWORD_PEPPER/,
        );
        assert.deepEqual(
          await restoreBackup(dest, storage, folder, auth.pepper),
          { tables: 8, objects: 0 },
        );
        assert.deepEqual(
          await dest
            .prepare(
              "SELECT * FROM account_credentials WHERE account_id='partner-a'",
            )
            .first(),
          await row(),
        );
        await assert.rejects(
          restoreBackup(dest, storage, folder, auth.pepper),
          /kosong/,
        );
      },
    );
    await t.test(
      "stale login cannot insert a session after credential version changes",
      async () => {
        await reset(auth.users);
        const result = await login(0, auth.passwords[0], {
          "X-Test-Fault": "stale-login",
        });
        assert.equal(result.status, 401);
        assert.equal(result.cookie, undefined);
        assert.equal(
          (await db.prepare("SELECT count(*) n FROM sessions").first()).n,
          0,
        );
      },
    );
    await t.test(
      "password attempt limit follows account across sessions",
      async () => {
        await reset(auth.users);
        const c = await login(),
          d = await login();
        for (let i = 0; i < 5; i++)
          assert.equal(
            (
              await req(
                "/account/password",
                body("wrong-old-password"),
                i % 2 ? c.cookie : d.cookie,
              )
            ).status,
            400,
          );
        assert.equal(
          (await req("/account/password", body(auth.passwords[0]), d.cookie))
            .status,
          429,
        );
        assert.equal((await row()).version, 1);
      },
    );
  } finally {
    await mf.dispose();
  }
});
