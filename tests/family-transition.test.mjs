import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { db, reset } from "./neon-helper.mjs";
const id = () => randomBytes(16).toString("hex");
test("legacy review is explicit, atomic and preserves monetary sources and proof links", async () => {
  await reset();
  const income = id(),
    a = id(),
    b = id(),
    expense = id(),
    g = id(),
    now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO periods VALUES('2026-11',1,1)"),
    db.prepare("INSERT INTO budgets VALUES('2026-11','partner-a',1)"),
    db
      .prepare(
        "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,created_at,updated_at) VALUES($1,'2026-11','partner-a','Pemasukan','income',10000000,0,1,1),($2,'2026-11','partner-a','Pos lama A','allocation',5000000,1,1,1),($3,'2026-11','partner-a','Pos lama B','allocation',6000000,2,1,1)",
      )
      .bind(income, a, b),
    db
      .prepare(
        "INSERT INTO expenses(id,period_id,owner_id,item_id,occurred_on,note,amount,created_at,updated_at) VALUES($1,'2026-11','partner-a',$2,'2026-11-01','Tambahan lama',100000,1,1)",
      )
      .bind(expense, a),
    db
      .prepare(
        "INSERT INTO allocation_groups(id,period_id,owner_id,label,posting_kind,recipient_owner_id,status,created_at,updated_at) VALUES($1,'2026-11','partner-a','Nama bukti lama','internal','partner-b','posted',1,1)",
      )
      .bind(g),
    db
      .prepare(
        "INSERT INTO allocation_group_items VALUES($1,$2,0,1,NULL,NULL,NULL,NULL)",
      )
      .bind(g, a),
  ]);
  const review = async (items) =>
    db
      .prepare("SELECT review_family_items('2026-11','partner-a',$1,$2)")
      .bind(
        JSON.stringify({
          expectedRevision: (
            await db
              .prepare("SELECT revision FROM periods WHERE id='2026-11'")
              .first()
          ).revision,
          items: await Promise.all(
            items.map(async (i) => ({
              id: i,
              expectedVersion: (
                await db
                  .prepare("SELECT row_version FROM budget_items WHERE id=$1")
                  .bind(i)
                  .first()
              ).row_version,
            })),
          ),
        }),
        now,
      )
      .run();
  await assert.rejects(review([a]), /LEGACY_REVIEW_REQUIRED/);
  const convert = {
    source: "expense",
    mode: "allocation",
    label: "Tambahan terpisah",
    expectedVersion: 1,
    confirmed: true,
  };
  await assert.rejects(
    db
      .prepare("SELECT convert_family_extra($1,$2,$3,$4)")
      .bind("partner-b", expense, JSON.stringify(convert), now)
      .run(),
    /FAMILY_NOT_FOUND/,
  );
  const before = await db
    .prepare("SELECT amount,owner_id,label FROM budget_items WHERE id=$1")
    .bind(a)
    .first();
  await db
    .prepare("SELECT convert_family_extra($1,$2,$3,$4)")
    .bind("partner-a", expense, JSON.stringify(convert), now)
    .run();
  await db
    .prepare("SELECT convert_family_extra($1,$2,$3,$4)")
    .bind("partner-a", expense, JSON.stringify(convert), now)
    .run();
  await assert.rejects(
    db
      .prepare("SELECT convert_family_extra($1,$2,$3,$4)")
      .bind(
        "partner-a",
        expense,
        JSON.stringify({ ...convert, label: "Isi lain" }),
        now,
      )
      .run(),
    /FAMILY_CHANGED/,
  );
  await assert.rejects(review([a, b]), /FUNDS_EXCEEDED/);
  assert.equal(
    (
      await db
        .prepare("SELECT recording_mode FROM budget_items WHERE id=$1")
        .bind(a)
        .first()
    ).recording_mode,
    "legacy",
  );
  assert.deepEqual(
    await db
      .prepare("SELECT amount,owner_id,label FROM budget_items WHERE id=$1")
      .bind(a)
      .first(),
    before,
  );
  await review([a]);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT distributed FROM family_book_totals WHERE period_id='2026-11'",
        )
        .first()
    ).distributed,
    5100000,
  );
  const group = await db
    .prepare("SELECT * FROM allocation_groups WHERE id=$1")
    .bind(g)
    .first();
  assert.equal(group.purpose, "legacy");
  assert.equal(group.posting_kind, "internal");
  assert.equal(group.recipient_owner_id, "partner-b");
  assert.equal(
    (
      await db
        .prepare("SELECT amount FROM expenses WHERE id=$1")
        .bind(expense)
        .first()
    ).amount,
    100000,
  );
  await assert.rejects(
    db.prepare("UPDATE expenses SET amount=1 WHERE id=$1").bind(expense).run(),
    /HISTORY_LOCKED/,
  );
});
test("mapping old extras to usage reduces only compatibility sources and keeps source identity", async () => {
  await reset();
  const income = id(),
    parent = id(),
    extra = id();
  await db.batch([
    db.prepare("INSERT INTO periods VALUES('2026-11',1,1)"),
    db.prepare("INSERT INTO budgets VALUES('2026-11','partner-a',1)"),
    db
      .prepare(
        "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,recording_mode,posting_kind,tracking_enabled,created_at,updated_at) VALUES($1,'2026-11','partner-a','Pemasukan','income',1000,0,'legacy',NULL,0,1,1),($2,'2026-11','partner-a','Pos','allocation',900,1,'actual','external',1,1,1)",
      )
      .bind(income, parent),
    db
      .prepare(
        "INSERT INTO expenses(id,period_id,owner_id,item_id,occurred_on,note,amount,created_at,updated_at) VALUES($1,'2026-11','partner-a',$2,'2026-11-01','Lama',100,1,1)",
      )
      .bind(extra, parent),
  ]);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT distributed FROM family_book_totals WHERE period_id='2026-11'",
        )
        .first()
    ).distributed,
    1000,
  );
  await db
    .prepare("SELECT convert_family_extra($1,$2,$3,$4)")
    .bind(
      "partner-a",
      extra,
      JSON.stringify({
        source: "expense",
        mode: "usage",
        itemId: parent,
        label: "Lama",
        expectedVersion: 1,
        confirmed: true,
      }),
      Date.now(),
    )
    .run();
  assert.equal(
    (
      await db
        .prepare(
          "SELECT distributed FROM family_book_totals WHERE period_id='2026-11'",
        )
        .first()
    ).distributed,
    900,
  );
  const child = await db.prepare("SELECT * FROM usage_entries").first();
  assert.equal(child.amount, 100);
  assert.equal(child.owner_id, "partner-a");
  assert.equal(
    (
      await db
        .prepare("SELECT converted_id FROM expenses WHERE id=$1")
        .bind(extra)
        .first()
    ).converted_id,
    child.id,
  );
});
