import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db, reset, config } from "./neon-helper.mjs";
import { credentials } from "../scripts/credentials.mjs";
test("actual allocations: migration, reviewed cutover, single source, concurrency, evidence, privacy, blank copying and reports", async () => {
  const auth = credentials(),
    origin = "http://localhost",
    id = () => randomBytes(16).toString("hex");
  await reset(auth.users);
  const item = id(),
    stale = id(),
    old = id(),
    income = id();
  await db.batch([
    db.prepare("INSERT INTO periods VALUES('2026-11',1,1)"),
    db.prepare(
      "INSERT INTO budgets VALUES('2026-11','partner-a',1),('2026-11','partner-b',1)",
    ),
    db
      .prepare(
        "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,created_at,updated_at) VALUES($1,'2026-11','partner-a','Gaji','income',10000000,0,1,1),($2,'2026-11','partner-a','Listrik','allocation',450000,1,1,1),($3,'2026-11','partner-a','Air','allocation',150000,2,1,1)",
      )
      .bind(income, item, stale),
    db
      .prepare(
        "INSERT INTO expenses(id,period_id,owner_id,item_id,occurred_on,note,amount,created_at,updated_at) VALUES($1,'2026-11','partner-a',$2,'2026-11-01','Tagihan',400000,1,1)",
      )
      .bind(old, item),
  ]);
  assert.equal(
    (
      await db
        .prepare("SELECT recording_mode FROM budget_items WHERE id=$1")
        .bind(item)
        .first()
    ).recording_mode,
    "legacy",
  );
  const compiled = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
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
  const cookies = [];
  async function req(
    path,
    { method = "GET", body, who = 0, modern = true, raw } = {},
  ) {
    const r = await mf.dispatchFetch(origin + "/api" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookies[who] || "",
        "Content-Type": raw ? "image/png" : "application/json",
        ...(modern ? { "X-Financee-Client": "2" } : {}),
      },
      body:
        method === "GET"
          ? undefined
          : raw || (body === undefined ? undefined : JSON.stringify(body)),
    });
    return {
      status: r.status,
      data: raw && method === "GET" ? null : await r.json().catch(() => null),
      headers: r.headers,
    };
  }
  try {
    for (const [i, u] of auth.users.entries()) {
      const r = await req("/login", {
        method: "POST",
        body: { email: u.email, password: auth.passwords[i] },
      });
      assert.equal(r.status, 200);
      cookies[i] = r.headers.get("set-cookie").split(";")[0];
    }
    assert.equal(
      (
        await req("/items/" + item, {
          method: "PATCH",
          modern: false,
          body: { field: "amount", value: 1, expectedVersion: 1 },
        })
      ).data.error.code,
      "UPDATE_REQUIRED",
    );
    assert.equal(
      (await req("/items/" + item + "/posting", { who: 1 })).status,
      404,
    );
    const review = (await req("/items/" + item + "/posting")).data;
    assert.equal(review.relatedTotal, 400000);
    const convert = {
      expectedVersion: review.item.row_version,
      expectedRevision: review.expectedRevision,
      postingKind: "external",
      date: null,
      amount: 400000,
      confirmed: true,
    };
    const saved = await req("/items/" + item + "/posting", {
      method: "PATCH",
      body: convert,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(
      (
        await req("/items/" + item + "/posting", {
          method: "PATCH",
          body: convert,
        })
      ).status,
      200,
    );
    assert.equal(
      (await db.prepare("SELECT count(*)::int AS n FROM expenses").first()).n,
      1,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT amount FROM effective_postings WHERE source_id=$1")
          .bind(item)
          .first()
      ).amount,
      400000,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT superseded_by_item_id FROM expenses WHERE id=$1")
          .bind(old)
          .first()
      ).superseded_by_item_id,
      item,
    );
    assert.equal(
      (
        await req("/expenses/" + old, {
          method: "DELETE",
          body: { expectedVersion: 2 },
        })
      ).status,
      409,
    );
    const added = await req("/expenses", {
      method: "POST",
      body: {
        id: id(),
        date: "2026-11-02",
        itemId: item,
        note: "Tambahan",
        amount: 50000,
      },
    });
    assert.equal(added.status, 201);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT sum(amount)::bigint AS n FROM effective_postings WHERE posting_kind='external'",
          )
          .first()
      ).n,
      450000,
    );
    const oldReview = (await req("/items/" + stale + "/posting")).data;
    await req("/items/" + stale, {
      method: "PATCH",
      body: { field: "label", value: "Air bersih", expectedVersion: 1 },
    });
    assert.equal(
      (
        await req("/items/" + stale + "/posting", {
          method: "PATCH",
          body: {
            ...convert,
            expectedVersion: oldReview.item.row_version,
            expectedRevision: oldReview.expectedRevision,
            amount: 150000,
          },
        })
      ).status,
      409,
    );
    let current = (await req("/periods/2026-11")).data.items.find(
      (i) => i.id === item,
    );
    const body = {
      field: "amount",
      value: 475000,
      expectedVersion: current.amount_version,
    };
    const results = await Promise.all([
      req("/items/" + item, { method: "PATCH", body }),
      req("/items/" + item, {
        method: "PATCH",
        body: { ...body, value: 480000 },
      }),
    ]);
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT count(*)::int AS n FROM effective_postings WHERE source_id=$1",
          )
          .bind(item)
          .first()
      ).n,
      1,
    );
    const png = await readFile("public/icons/icon-192.png"),
      file = id(),
      reserve = {
        id: file,
        contentType: "image/png",
        byteSize: png.length,
        sha256: createHash("sha256").update(png).digest("hex"),
      };
    assert.equal(
      (
        await req("/allocation-items/" + item + "/attachments", {
          method: "POST",
          who: 1,
          body: reserve,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await req("/allocation-items/" + item + "/attachments", {
          method: "POST",
          body: reserve,
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await req("/allocation-attachments/" + file + "/content", {
          method: "PUT",
          raw: png,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await req("/allocation-attachments/" + file + "/content", {
          who: 1,
          raw: Buffer.alloc(0),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await req("/allocation-attachments/" + file, {
          method: "DELETE",
          who: 1,
        })
      ).status,
      404,
    );
    const anonymous = await mf.dispatchFetch(
      origin + "/api/allocation-attachments/" + file + "/content",
    );
    assert.equal(anonymous.status, 401);
    current = (await req("/periods/2026-11")).data.items.find(
      (i) => i.id === item,
    );
    assert.equal(
      (
        await req("/items/" + item, {
          method: "PATCH",
          body: {
            field: "amount",
            value: null,
            expectedVersion: current.amount_version,
          },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await req("/items/" + item, {
          method: "PATCH",
          body: {
            field: "amount",
            value: null,
            expectedVersion: current.amount_version,
            confirmCancel: true,
          },
        })
      ).status,
      200,
    );
    assert.equal(
      (await req("/allocation-attachments/" + file + "/content")).status,
      404,
    );
    assert.equal(
      (
        await req("/allocation-attachments/" + file + "/content", {
          method: "PUT",
          raw: png,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT count(*)::int AS n FROM effective_postings WHERE source_id=$1",
          )
          .bind(old)
          .first()
      ).n,
      0,
    );
    assert.equal(
      (
        await req("/periods", {
          method: "POST",
          body: { id: "2026-12", mode: "copy", sourcePeriodId: "2026-11" },
        })
      ).status,
      201,
    );
    const copy = (await req("/periods/2026-12")).data;
    assert.ok(copy.items.every((i) => i.amount === null));
    assert.equal(copy.attachments.length, 0);
    assert.equal(copy.expenses.length, 0);
    const report = await req("/reports/year/2026");
    assert.equal(report.status, 200);
    assert.equal(
      report.data.months.find((m) => m.id === "2026-11").spent,
      50000,
    );
    const latest = (await req("/periods/2026-11")).data.items.find(
      (i) => i.id === item,
    );
    assert.equal(
      (
        await req("/items/" + item, {
          method: "PATCH",
          body: {
            field: "amount",
            value: 0,
            expectedVersion: latest.amount_version,
          },
        })
      ).status,
      200,
    );
    const reservations = await Promise.all(
      Array.from({ length: 12 }, () =>
        req("/allocation-items/" + item + "/attachments", {
          method: "POST",
          body: { ...reserve, id: id() },
        }),
      ),
    );
    assert.equal(reservations.filter((r) => r.status === 201).length, 10);
    assert.equal(reservations.filter((r) => r.status === 409).length, 2);
    const reviewDate = (await req("/items/" + item + "/posting")).data;
    assert.equal(
      (
        await req("/items/" + item + "/posting", {
          method: "PATCH",
          body: {
            ...convert,
            expectedVersion: reviewDate.item.row_version,
            expectedRevision: reviewDate.expectedRevision,
            amount: 0,
            date: "2026-11-31",
          },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await req("/income-items/" + income + "/attachments", {
          method: "POST",
          body: { ...reserve, id: file },
        })
      ).status,
      409,
    );
  } finally {
    await mf.dispose();
  }
});
