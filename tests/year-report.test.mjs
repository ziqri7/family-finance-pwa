import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { randomBytes } from "node:crypto";
import { db, reset, config } from "./neon-helper.mjs";
import { credentials } from "../scripts/credentials.mjs";
test("annual book report includes one-creator months, all allocation types and excludes incomplete months", async () => {
  const auth = credentials();
  await reset(auth.users);
  const id = () => randomBytes(16).toString("hex");
  for (const [period, income, amount, mode] of [
    ["2026-01", 10000000, 5000000, "actual"],
    ["2026-02", 2000000, 2000000, "actual"],
    ["2026-03", 9000000, 8000000, "legacy"],
    ["2026-04", 1000000, null, "actual"],
    ["2027-01", 9999999, 9999999, "actual"],
  ]) {
    await db.batch([
      db.prepare("INSERT INTO periods VALUES($1,1,1)").bind(period),
      db.prepare("INSERT INTO budgets VALUES($1,'partner-a',1)").bind(period),
      db
        .prepare(
          "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,recording_mode,posting_kind,created_at,updated_at) VALUES($1,$2,'partner-a','Contoh','income',$3,0,'legacy',NULL,1,1),($4,$2,'partner-a','Contoh alokasi','allocation',$5,1,$6,CASE WHEN $6='actual' THEN 'internal' ELSE NULL END,1,1)",
        )
        .bind(id(), period, income, id(), amount, mode),
    ]);
  }
  const code = await build({
      entryPoints: ["worker/index.ts"],
      bundle: true,
      format: "esm",
      platform: "browser",
      write: false,
    }),
    origin = "http://localhost",
    mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: code.outputFiles[0].text,
        compatibilityDate: "2026-11-12",
        bindings: {
          ...config,
          LOCAL_DEV: "1",
          APP_ORIGIN: origin,
          AUTH_USERS_JSON: JSON.stringify(auth.users),
          SESSION_SECRET: auth.secret,
          PASSWORD_PEPPER: auth.pepper,
        },
      }),
    );
  try {
    assert.equal(
      (await mf.dispatchFetch(origin + "/api/reports/year/2026")).status,
      401,
    );
    const login = await mf.dispatchFetch(origin + "/api/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: auth.users[0].email,
        password: auth.passwords[0],
      }),
    });
    const headers = {
      Cookie: login.headers.get("set-cookie").split(";")[0],
      "X-Financee-Client": "3",
    };
    const before = await db
      .prepare("SELECT sum(revision)::bigint AS n FROM periods")
      .first();
    const r = await mf.dispatchFetch(origin + "/api/reports/year/2026", {
      headers,
    });
    assert.equal(r.status, 200);
    const report = await r.json();
    assert.equal(report.included, 2);
    assert.equal(report.excluded, 2);
    assert.equal(report.income, 12000000);
    assert.equal(report.allocation, 7000000);
    assert.equal(report.remaining, 5000000);
    assert.equal(report.months[0].missingOwners, 0);
    assert.equal(report.months[2].complete, false);
    assert.equal(report.months[4].exists, false);
    assert.deepEqual(
      await db
        .prepare("SELECT sum(revision)::bigint AS n FROM periods")
        .first(),
      before,
    );
    assert.equal(
      (await mf.dispatchFetch(origin + "/api/reports/year/1999", { headers }))
        .status,
      400,
    );
  } finally {
    await mf.dispose();
  }
});
