import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { config, db, bucket, reset } from "./neon-helper.mjs";
import { credentials } from "../scripts/credentials.mjs";

test("upload storage faults and parent deletion recover without exposing incomplete evidence", async (t) => {
  const auth = credentials(),
    origin = "http://localhost",
    id = () => randomBytes(16).toString("hex");
  // Fault injection exists only in this test wrapper, never in the deployed Worker.
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
 import {app} from './worker/index.ts';
 import {Database} from './worker/db/postgres.ts';
 import {EvidenceStorage} from './worker/storage.ts';
 export default {async fetch(req,env,ctx){
  env={...env,DB:new Database(env.DATABASE_URL),EVIDENCE:new EvidenceStorage(env)};
  const fault=req.headers.get('X-Test-Fault');
  if(!fault)return app.fetch(req,env,ctx);
  const bucket=env.EVIDENCE,db=env.DB;
  const evidence=new Proxy(bucket,{get(target,key){
   if(key==='put')return async(...args)=>{
    if(fault==='put')throw Error('injected storage outage');
    const result=await target.put(...args);
    if(fault==='parent')await db.prepare('UPDATE expenses SET deleted_at=1,version=version+1').run();
    return result;
   };
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  const database=new Proxy(db,{get(target,key){
   if(key==='prepare')return sql=>{
    if(fault==='finalize'&&sql.startsWith("UPDATE attachments SET status='ready'"))throw Error('injected finalize outage');
    return target.prepare(sql);
   };
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  return app.fetch(req,{...env,DB:database,EVIDENCE:evidence},ctx);
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
  try {
    await reset(auth.users);
    await db
      .prepare(
        "INSERT INTO default_items(id,owner_id,label,kind,position,posting_kind) VALUES($1,$2,$3,$4,$5,CASE WHEN $4='income' THEN NULL WHEN $4='transfer_out' THEN 'internal' ELSE 'external' END)",
      )
      .bind(id(), "partner-a", "Allocation", "allocation", 0)
      .run();
    let cookie = "";
    const req = async (method, path, body, fault, raw = false) => {
      const r = await mf.dispatchFetch(origin + "/api" + path, {
        method,
        headers: {
          Origin: origin,
          "X-Financee-Client": "2",
          Cookie: cookie,
          "Content-Type": raw ? "image/png" : "application/json",
          ...(fault ? { "X-Test-Fault": fault } : {}),
        },
        body:
          body === undefined ? undefined : raw ? body : JSON.stringify(body),
      });
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      return {
        status: r.status,
        data: r.headers.get("content-type")?.includes("json")
          ? await r.json()
          : await r.arrayBuffer(),
      };
    };
    assert.equal(
      (
        await req("POST", "/login", {
          email: auth.users[0].email,
          password: auth.passwords[0],
        })
      ).status,
      200,
    );
    assert.equal(
      (await req("POST", "/periods", { id: "2001-01", mode: "default" }))
        .status,
      201,
    );
    const item = (await req("GET", "/periods/2001-01")).data.items[0];
    const png = await readFile("public/icons/icon-192.png");
    for (const fault of ["put", "finalize", "parent"])
      await t.test(fault, async () => {
        const expense = id(),
          file = id(),
          path = "/attachments/" + file + "/content";
        assert.equal(
          (
            await req("POST", "/expenses", {
              id: expense,
              date: "2001-01-01",
              itemId: item.id,
              note: "Fault fixture",
              amount: 25000,
            })
          ).status,
          201,
        );
        const reservation = {
          id: file,
          contentType: "image/png",
          byteSize: png.length,
          sha256: createHash("sha256").update(png).digest("hex"),
        };
        assert.equal(
          (
            await req(
              "POST",
              "/expenses/" + expense + "/attachments",
              reservation,
            )
          ).status,
          201,
        );
        assert.equal(
          (await req("PUT", path, png, fault, true)).status,
          fault === "parent" ? 409 : 500,
        );
        const row = await db
          .prepare("SELECT * FROM attachments WHERE id=$1")
          .bind(file)
          .first();
        assert.equal(row.status, "pending");
        assert.equal((await req("GET", path)).status, 404);
        assert.equal(
          Boolean(await bucket.head(row.object_key)),
          fault === "finalize",
        );
        if (fault === "parent") {
          assert.equal(
            (await req("PUT", path, png, undefined, true)).status,
            409,
          );
        } else {
          assert.equal(
            (
              await req(
                "POST",
                "/expenses/" + expense + "/attachments",
                reservation,
              )
            ).status,
            200,
          );
          assert.equal(
            (await req("PUT", path, png, undefined, true)).status,
            200,
          );
          assert.equal((await req("GET", path)).status, 200);
          assert.equal(
            (
              await db
                .prepare(
                  "SELECT count(*) AS n FROM attachments WHERE expense_id=$1",
                )
                .bind(expense)
                .first()
            ).n,
            1,
          );
          assert.ok(await bucket.head(row.object_key));
        }
      });
  } finally {
    await mf.dispose();
  }
});
