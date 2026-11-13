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
let mf, db, workerScript;
const id = () => randomBytes(16).toString("hex");
async function req(method, path, body, who = "a", extra = {}) {
  const headers = { Origin: origin, ...extra };
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
      d1Databases: ["DB"],
      r2Buckets: ["EVIDENCE"],
      bindings: {
        APP_ORIGIN: origin,
        LOCAL_DEV: "1",
        AUTH_USERS_JSON: JSON.stringify(auth.users),
        SESSION_SECRET: auth.secret,
      },
    }),
  );
  db = await mf.getD1Database("DB");
  await db.exec(await readFile("migrations/0001_initial.sql", "utf8"));
  const template = JSON.parse(await readFile("data/template.json", "utf8"));
  for (const owner of ["partner-a", "partner-b"])
    for (const [position, item] of template[owner].entries())
      await db
        .prepare("INSERT INTO default_items VALUES(?,?,?,?,?)")
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
test("new budgets contain nulls and are independent per owner; duplicate month is atomic", async () => {
  assert.equal(
    (await req("POST", "/periods", { id: "2026-11", mode: "default" })).status,
    201,
  );
  let s = await snap();
  assert.equal(s.items.length, 16);
  assert.ok(s.items.every((i) => i.amount === null));
  assert.deepEqual(
    s.budgets.map((b) => b.owner_id),
    ["partner-a"],
  );
  assert.equal(
    (await req("POST", "/periods", { id: "2026-11", mode: "default" })).status,
    409,
  );
  assert.equal((await snap()).items.length, 16);
  assert.equal(
    (await req("POST", "/periods", { id: "2026-11", mode: "default" }, "b"))
      .status,
    201,
  );
  s = await snap();
  assert.equal(s.items.length, 20);
  assert.equal(s.budgets.length, 2);
  state.income = s.items.find(
    (i) => i.owner_id === "partner-a" && i.kind === "income",
  );
  state.allocation = s.items.find(
    (i) => i.owner_id === "partner-a" && i.kind === "allocation",
  );
  state.transfer = s.items.find(
    (i) => i.owner_id === "partner-a" && i.kind === "transfer_out",
  );
});
test("owner authorization is enforced in backend and both accounts can read", async () => {
  assert.equal(
    (
      await req(
        "PATCH",
        "/items/" + state.income.id,
        { field: "amount", value: 8, expectedVersion: 1 },
        "b",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await req(
        "DELETE",
        "/items/" + state.income.id,
        { expectedVersion: 1 },
        "b",
      )
    ).status,
    404,
  );
  assert.equal((await snap("b")).items.length, 20);
  const r = await req(
    "POST",
    "/expenses",
    {
      id: id(),
      date: "2026-11-10",
      itemId: state.allocation.id,
      note: "Bukan pos sendiri",
      amount: 1,
    },
    "b",
  );
  assert.equal(r.status, 404);
});
test("field versions support independent edits, concurrent CAS, and retry after a lost reply", async () => {
  state.income = await set(state.income, 10000000);
  state.allocation = await set(state.allocation, 7000000);
  const item = state.income;
  const results = await Promise.all([
    req("PATCH", "/items/" + item.id, {
      field: "label",
      value: "Penghasilan contoh",
      expectedVersion: item.label_version,
    }),
    req("PATCH", "/items/" + item.id, {
      field: "amount",
      value: 11000000,
      expectedVersion: item.amount_version,
    }),
  ]);
  assert.ok(results.every((r) => r.status === 200));
  const latest = (await snap()).items.find((i) => i.id === item.id);
  const body = {
    field: "amount",
    value: 12000000,
    expectedVersion: latest.amount_version,
  };
  const racing = await Promise.all([
    req("PATCH", "/items/" + item.id, body),
    req("PATCH", "/items/" + item.id, { ...body, value: 13000000 }),
  ]);
  assert.deepEqual(racing.map((r) => r.status).sort(), [200, 409]);
  const winner = racing.find((r) => r.status === 200).data.item;
  const retry = await req("PATCH", "/items/" + item.id, {
    ...body,
    value: winner.amount,
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.data.item.amount_version, winner.amount_version);
  state.income = await set(winner, 10000000);
});
test("new item ID is idempotent; null differs from zero; deleted ID is not resurrected", async () => {
  const itemId = id(),
    body = { id: itemId, label: "Pos contoh", kind: "allocation" };
  const a = await req("POST", "/periods/2026-11/items", body);
  assert.equal(a.status, 201);
  assert.equal((await req("POST", "/periods/2026-11/items", body)).status, 200);
  const zero = await set(a.data.item, 0);
  assert.equal(zero.amount, 0);
  const blank = await set(zero, null);
  assert.equal(blank.amount, null);
  assert.equal(
    (
      await req("DELETE", "/items/" + itemId, {
        expectedVersion: blank.row_version,
      })
    ).status,
    200,
  );
  assert.equal((await req("POST", "/periods/2026-11/items", body)).status, 409);
  assert.equal(
    (
      await req("PATCH", "/items/" + itemId, {
        field: "amount",
        value: 1,
        expectedVersion: blank.amount_version,
      })
    ).data.error.code,
    "ITEM_DELETED",
  );
});
test("expense, internal transfer and copy preserve the financial model", async () => {
  ids.expense = id();
  assert.equal(
    (
      await req("POST", "/expenses", {
        id: ids.expense,
        date: "2026-02-30",
        itemId: state.allocation.id,
        note: "Tanggal salah",
        amount: 25000,
      })
    ).status,
    400,
  );
  const body = {
    id: ids.expense,
    date: "2026-11-10",
    itemId: state.allocation.id,
    note: "Belanja contoh",
    amount: 25000,
  };
  let expense = await req("POST", "/expenses", body);
  assert.equal(expense.status, 201);
  assert.equal((await req("POST", "/expenses", body)).status, 200);
  assert.equal(
    (
      await req(
        "PATCH",
        "/expenses/" + ids.expense,
        {
          date: body.date,
          itemId: body.itemId,
          note: body.note,
          amount: 25000,
          expectedVersion: 1,
        },
        "b",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await req("DELETE", "/items/" + state.allocation.id, {
        expectedVersion: state.allocation.row_version,
      })
    ).status,
    409,
  );
  state.transfer = await set(state.transfer, 1000000);
  ids.transfer = id();
  assert.equal(
    (
      await req("POST", "/transfers", {
        id: ids.transfer,
        date: "2026-11-10",
        sourceItemId: state.transfer.id,
        amount: 900000,
      })
    ).status,
    201,
  );
  let s = await snap("b");
  assert.equal(
    s.expenses.reduce((sum, e) => sum + e.amount, 0),
    25000,
  );
  assert.equal(s.transfers.length, 1);
  assert.equal(s.transfers[0].to_owner_id, "partner-b");
  assert.equal(
    (
      await req(
        "DELETE",
        "/transfers/" + ids.transfer,
        { expectedVersion: 1 },
        "b",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await req("POST", "/periods", {
        id: "2026-12",
        mode: "copy",
        sourcePeriodId: "2026-11",
      })
    ).status,
    201,
  );
  const copy = await snap("a", "2026-12");
  assert.equal(copy.items.length, 16);
  assert.equal(
    copy.items
      .filter((i) => i.kind === "income")
      .reduce((sum, i) => sum + (i.amount || 0), 0),
    10000000,
  );
  assert.equal(copy.expenses.length, 0);
  assert.equal(copy.transfers.length, 0);
  assert.equal(copy.attachments.length, 0);
  assert.equal(
    (
      await req("POST", "/periods", {
        id: "2027-01",
        mode: "copy",
        sourcePeriodId: "2025-01",
      })
    ).status,
    409,
  );
  assert.equal((await req("GET", "/periods/2027-01")).status, 404);
});
test("JPG/PNG evidence is private, decoded, checksummed and read by either family account", async () => {
  const png = new Uint8Array(await readFile("public/icons/icon-192.png"));
  const jpg = jpeg.encode(
    { width: 2, height: 2, data: Buffer.alloc(16, 255) },
    80,
  ).data;
  for (const [data, type] of [
    [png, "image/png"],
    [jpg, "image/jpeg"],
  ]) {
    const attachmentId = id(),
      body = {
        id: attachmentId,
        contentType: type,
        byteSize: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
      };
    assert.equal(
      (await req("POST", "/expenses/" + ids.expense + "/attachments", body))
        .status,
      201,
    );
    assert.equal(
      (
        await req(
          "PUT",
          "/attachments/" + attachmentId + "/content",
          data,
          "a",
          { "Content-Type": type },
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await req(
          "GET",
          "/attachments/" + attachmentId + "/content",
          undefined,
          "b",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await req(
          "GET",
          "/attachments/" + attachmentId + "/content",
          undefined,
          "none",
        )
      ).status,
      401,
    );
    assert.equal(
      (await req("DELETE", "/attachments/" + attachmentId, {}, "b")).status,
      404,
    );
    ids.evidence = attachmentId;
  }
  const s = await snap();
  assert.equal(s.attachments.filter((a) => a.status === "ready").length, 2);
  assert.equal(JSON.stringify(s).includes("object_key"), false);
});
test("fake image and trailing polyglot are rejected; the eleventh concurrent slot is denied", async () => {
  for (const [data, type] of [
    [Buffer.from("not a jpeg"), "image/jpeg"],
    [
      Buffer.concat([
        await readFile("public/icons/icon-192.png"),
        Buffer.from("<script>"),
      ]),
      "image/png",
    ],
  ]) {
    const attachmentId = id();
    await req("POST", "/expenses/" + ids.expense + "/attachments", {
      id: attachmentId,
      contentType: type,
      byteSize: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
    assert.equal(
      (
        await req(
          "PUT",
          "/attachments/" + attachmentId + "/content",
          data,
          "a",
          { "Content-Type": type },
        )
      ).status,
      400,
    );
  }
  const expenseId = id();
  await req("POST", "/expenses", {
    id: expenseId,
    date: "2026-11-11",
    itemId: state.allocation.id,
    note: "Kuota contoh",
    amount: 1,
  });
  const results = await Promise.all(
    Array.from({ length: 11 }, () =>
      req("POST", "/expenses/" + expenseId + "/attachments", {
        id: id(),
        contentType: "image/png",
        byteSize: 1,
        sha256: "0".repeat(64),
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 10);
  assert.equal(results.filter((r) => r.status === 409).length, 1);
});
test("delete revokes evidence access and logout revokes the server session", async () => {
  assert.equal(
    (await req("DELETE", "/expenses/" + ids.expense, { expectedVersion: 1 }))
      .status,
    200,
  );
  assert.equal(
    (
      await req(
        "GET",
        "/attachments/" + ids.evidence + "/content",
        undefined,
        "b",
      )
    ).status,
    404,
  );
  const cookie = cookies.a;
  assert.equal((await req("POST", "/logout", {})).status, 200);
  assert.equal(
    (await req("GET", "/me", undefined, "none", { Cookie: cookie })).status,
    401,
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
      d1Databases: ["DB"],
      r2Buckets: ["EVIDENCE"],
      bindings: {
        APP_ORIGIN: https,
        AUTH_USERS_JSON: JSON.stringify(auth.users),
        SESSION_SECRET: auth.secret,
      },
    }),
  );
  try {
    const database = await prod.getD1Database("DB");
    await database.exec(await readFile("migrations/0001_initial.sql", "utf8"));
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
