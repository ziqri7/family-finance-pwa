import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { randomBytes, createHash } from "node:crypto";
import jpeg from "jpeg-js";
import { credentials } from "../scripts/credentials.mjs";
const origin = "http://localhost",
  auth = credentials(),
  cookies = {},
  ids = {},
  state = {};
let mf, workerScript;
import { config, db, reset } from "./neon-helper.mjs";
const id = () => randomBytes(16).toString("hex");
async function req(method, path, body, who = "a", extra = {}) {
  const headers = { Origin: origin, "X-Financee-Client": "3", ...extra };
  if (cookies[who]) headers.Cookie = cookies[who];
  if (body !== undefined && !headers["Content-Type"])
    headers["Content-Type"] = "application/json";
  const response = await mf.dispatchFetch(origin + "/api" + path, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : headers["Content-Type"] === "application/json"
          ? JSON.stringify(body)
          : body,
  });
  const contentType = response.headers.get("content-type") || "";
  return {
    status: response.status,
    data: contentType.includes("application/json")
      ? await response.json()
      : new Uint8Array(await response.arrayBuffer()),
    headers: response.headers,
  };
}
async function snap(who = "a", period = "2026-11") {
  const r = await req("GET", "/periods/" + period, undefined, who);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
async function set(item, value, field = "amount", who = "a") {
  const r = await req(
    "PATCH",
    "/items/" + item.id,
    {
      field,
      value,
      expectedVersion:
        item[field === "label" ? "label_version" : "amount_version"],
    },
    who,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.item;
}
before(async () => {
  const result = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    target: "es2022",
  });
  workerScript = result.outputFiles[0].text;
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: workerScript,
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
  await reset(auth.users);
  const template = JSON.parse(await readFile("data/template.json", "utf8"));
  for (const owner of ["partner-a", "partner-b"])
    for (const [position, item] of template[owner].entries())
      await db
        .prepare(
          "INSERT INTO default_items(id,owner_id,label,kind,position,posting_kind) VALUES($1,$2,$3,$4,$5,CASE WHEN $4='income' THEN NULL WHEN $4='transfer_out' THEN 'internal' ELSE 'external' END)",
        )
        .bind(id(), owner, item.label, item.kind, position)
        .run();
});
after(async () => {
  await mf?.dispose();
});
test("API requires a session; login uses native Worker PBKDF2 and cookie controls", async () => {
  assert.equal((await req("GET", "/periods", undefined, "none")).status, 401);
  for (const [who, i] of [
    ["a", 0],
    ["b", 1],
  ]) {
    const r = await req(
      "POST",
      "/login",
      { email: auth.users[i].email, password: auth.passwords[i] },
      "none",
    );
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const cookie = r.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    cookies[who] = cookie.split(";")[0];
  }
  const me = await req("GET", "/me");
  assert.equal(me.data.user.id, "partner-a");
  assert.equal(JSON.stringify(me.data).includes("hash"), false);
  assert.equal(me.headers.get("cache-control"), "no-store");
  assert.equal(me.headers.get("x-frame-options"), "DENY");
});
test("origin, unknown properties, dates and actual byte limits are validated", async () => {
  assert.equal(
    (
      await req("POST", "/periods", { id: "2026-11", mode: "default" }, "a", {
        Origin: "https://foreign.invalid",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await req("POST", "/periods", {
        id: "2026-11",
        mode: "default",
        owner: "partner-b",
      })
    ).status,
    400,
  );
  assert.equal(
    (await req("POST", "/periods", { id: "2026-00", mode: "default" })).status,
    400,
  );
  assert.equal(
    (await req("POST", "/periods", { padding: "x".repeat(17000) })).status,
    413,
  );
});
test("login rate limit is atomic and returns the same invalid-login message", async () => {
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      req(
        "POST",
        "/login",
        { email: "unknown@example.invalid", password: "wrong" },
        "none",
        { "CF-Connecting-IP": "192.0.2.55" },
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === 429).length, 1);
  assert.ok(
    results
      .filter((r) => r.status === 401)
      .every((r) => r.data.error.code === "INVALID_LOGIN"),
  );
});

test("HTTPS configuration uses host-only Secure cookies, hashed tokens and fingerprint revocation", async () => {
  const https = "https://family.example.invalid";
  const prod = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: workerScript,
      compatibilityDate: "2026-11-12",
      bindings: {
        ...config,
        APP_ORIGIN: https,
        AUTH_USERS_JSON: JSON.stringify(auth.users),
        SESSION_SECRET: auth.secret,
        PASSWORD_PEPPER: auth.pepper,
      },
    }),
  );
  try {
    const database = db;
    await db.prepare("DELETE FROM sessions").run();
    const response = await prod.dispatchFetch(https + "/api/login", {
      method: "POST",
      headers: { Origin: https, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: auth.users[0].email,
        password: auth.passwords[0],
      }),
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie");
    assert.match(cookie, /^__Host-ff_session=/);
    assert.match(cookie, /; Secure/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Path=\//);
    assert.doesNotMatch(cookie, /Domain=/i);
    const token = cookie.split(";")[0].split("=")[1],
      row = await database.prepare("SELECT * FROM sessions").first();
    assert.equal(
      row.token_hash,
      createHash("sha256").update(token).digest("hex"),
    );
    assert.notEqual(row.token_hash, token);
    const me = await prod.dispatchFetch(https + "/api/me", {
      headers: { Cookie: cookie.split(";")[0] },
    });
    assert.equal(me.status, 200);
    await database
      .prepare("UPDATE sessions SET auth_fingerprint='revoked'")
      .run();
    assert.equal(
      (
        await prod.dispatchFetch(https + "/api/me", {
          headers: { Cookie: cookie.split(";")[0] },
        })
      ).status,
      401,
    );
  } finally {
    await prod.dispose();
  }
});
