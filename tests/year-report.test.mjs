import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { randomBytes } from "node:crypto";
import { config, db, reset } from "./neon-helper.mjs";
import { credentials } from "../scripts/credentials.mjs";
test("year report is private, weighted, complete-only, transfer-free and year scoped", async (t) => {
  const auth = credentials(),
    origin = "http://localhost";
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
  const request = async (path, body, who = 0) => {
    const r = await mf.dispatchFetch(origin + "/api" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookies[who] || "",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  const id = () => randomBytes(16).toString("hex"),
    now = Date.now();
  async function month(
    period,
    income,
    spent,
    { missing = false, owners = 2, allocation = 0 } = {},
  ) {
    await db
      .prepare("INSERT INTO periods(id,created_at) VALUES($1,$2)")
      .bind(period, now)
      .run();
    for (let i = 0; i < owners; i++) {
      const owner = auth.users[i].id,
        item = id();
      await db
        .prepare("INSERT INTO budgets VALUES($1,$2,$3)")
        .bind(period, owner, now)
        .run();
      await db
        .prepare(
          "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,created_at,updated_at) VALUES($1,$2,$3,'Pemasukan contoh','income',$4,0,$5,$5)",
        )
        .bind(id(), period, owner, i === 0 ? income : 0, now)
        .run();
      await db
        .prepare(
          "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,created_at,updated_at) VALUES($1,$2,$3,'Alokasi contoh','allocation',$4,1,$5,$5)",
        )
        .bind(
          item,
          period,
          owner,
          missing && i === 0 ? null : i === 0 ? allocation : 0,
          now,
        )
        .run();
      if (i === 0 && spent)
        await db
          .prepare(
            "INSERT INTO expenses(id,period_id,owner_id,item_id,occurred_on,note,amount,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'Contoh',$6,$7,$7)",
          )
          .bind(id(), period, owner, item, period + "-01", spent, now)
          .run();
    }
  }
  try {
    await reset(auth.users);
    assert.equal((await request("/reports/year/2026")).status, 401);
    for (let i = 0; i < 2; i++) {
      const r = await request("/login", {
        email: auth.users[i].email,
        password: auth.passwords[i],
      });
      assert.equal(r.status, 200);
      cookies[i] = r.cookie;
    }
    for (const year of ["1999", "2101", "2026x", "2026%27"])
      assert.equal((await request("/reports/year/" + year)).status, 400);
    const empty = await request("/reports/year/2025");
    assert.equal(empty.status, 200);
    assert.equal(empty.data.months.length, 12);
    assert.equal(empty.data.included, 0);
    await month("2026-01", 10000000, 5000000, { allocation: 7000000 });
    await month("2026-02", 2000000, 2000000, { allocation: 3000000 });
    await month("2026-03", 900000000, 800000000, { missing: true });
    await month("2026-04", 500000000, 400000000, { owners: 1 });
    await month("2026-05", 0, 100);
    await month("2027-01", 999999999, 888888888);
    const transfer = id();
    await db
      .prepare(
        "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,created_at,updated_at) VALUES($1,'2026-01','partner-a','Kiriman internal','transfer_out',5000000,2,$2,$2)",
      )
      .bind(transfer, now)
      .run();
    await db
      .prepare(
        "INSERT INTO transfers(id,period_id,from_owner_id,to_owner_id,source_item_id,occurred_on,amount,created_at) VALUES($1,'2026-01','partner-a','partner-b',$2,'2026-01-01',5000000,$3)",
      )
      .bind(id(), transfer, now)
      .run();
    const a = await request("/reports/year/2026"),
      b = await request("/reports/year/2026", undefined, 1);
    assert.equal(a.status, 200, JSON.stringify(a.data));
    assert.deepEqual(a.data, b.data);
    assert.equal(a.data.included, 3);
    assert.equal(a.data.excluded, 2);
    assert.equal(a.data.income, 12000000);
    assert.equal(a.data.spent, 7000100);
    assert.equal(a.data.allocation, 10000000);
    assert.equal(a.data.remaining, 2000000);
    assert.equal(a.data.months[2].complete, false);
    assert.equal(a.data.months[3].missingOwners, 1);
    assert.equal(a.data.months[4].income, 0);
    assert.equal(a.data.months[5].exists, false);
    assert.ok(!JSON.stringify(a.data).includes("Contoh"));
    assert.match(a.data.months.at(-1).id, /2026-12/);
    await t.test(
      "deleted expenses excluded and incomplete month becomes eligible after filling zero",
      async () => {
        await db
          .prepare(
            "UPDATE expenses SET deleted_at=$1 WHERE period_id='2026-05'",
          )
          .bind(now)
          .run();
        await db
          .prepare(
            "UPDATE budget_items SET amount=0,amount_version=amount_version+1 WHERE period_id='2026-03' AND amount IS NULL",
          )
          .run();
        const updated = (await request("/reports/year/2026")).data;
        assert.equal(updated.included, 4);
        assert.equal(updated.excluded, 1);
        assert.equal(updated.spent, 807000000);
      },
    );
    await t.test("no implicit writes", async () => {
      const before = await db
        .prepare("SELECT count(*) AS n,sum(revision)::bigint AS r FROM periods")
        .first();
      await request("/reports/year/2026");
      assert.deepEqual(
        await db
          .prepare(
            "SELECT count(*) AS n,sum(revision)::bigint AS r FROM periods",
          )
          .first(),
        before,
      );
    });
  } finally {
    await mf.dispose();
  }
});
