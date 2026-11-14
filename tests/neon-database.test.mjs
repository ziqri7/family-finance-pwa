import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { db, reset } from "./neon-helper.mjs";
import { migrate } from "../scripts/neon-runtime.mjs";
test("PostgreSQL migration replay, rollback, composite ownership and concurrent quota at 200 live items", async () => {
  await reset();
  assert.equal(await migrate(db), false);
  await assert.rejects(
    db.batch([
      db.prepare("INSERT INTO periods VALUES('2003-02',1,1)"),
      db.prepare("INSERT INTO budgets VALUES('2003-02','foreign-owner',1)"),
    ]),
  );
  assert.equal(
    await db.prepare("SELECT * FROM periods WHERE id='2003-02'").first(),
    null,
  );
  await db.batch([
    db.prepare("INSERT INTO periods VALUES('2003-01',1,1)"),
    db.prepare("INSERT INTO budgets VALUES('2003-01','partner-a',1)"),
    db.prepare(
      "INSERT INTO budget_items(id,period_id,owner_id,label,kind,position,created_at,updated_at) SELECT replace(gen_random_uuid()::text,'-',''),'2003-01','partner-a','Contoh','allocation',n,1,1 FROM generate_series(0,198) n",
    ),
  ]);
  const add = () =>
    db
      .prepare(
        "INSERT INTO budget_items(id,period_id,owner_id,label,kind,position,created_at,updated_at) VALUES($1,'2003-01','partner-a','Contoh','allocation',199,1,1)",
      )
      .bind(randomBytes(16).toString("hex"))
      .run();
  const results = await Promise.allSettled([add(), add()]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(
    String(results.find((r) => r.status === "rejected").reason),
    /ITEM_LIMIT/,
  );
  await db
    .prepare(
      "INSERT INTO budget_items(id,period_id,owner_id,label,kind,position,created_at,updated_at,deleted_at) VALUES($1,'2003-01','partner-a','Dihapus','allocation',200,1,1,1)",
    )
    .bind(randomBytes(16).toString("hex"))
    .run();
  const item = await db
    .prepare("SELECT id FROM budget_items WHERE deleted_at IS NULL LIMIT 1")
    .first();
  await assert.rejects(
    db
      .prepare(
        "INSERT INTO expenses(id,period_id,owner_id,item_id,occurred_on,note,amount,created_at,updated_at) VALUES($1,'2003-01','partner-b',$2,'2003-01-01','Contoh',1,1,1)",
      )
      .bind(randomBytes(16).toString("hex"), item.id)
      .run(),
  );
  assert.equal(
    Number((await db.prepare("SELECT count(*) AS n FROM expenses").first()).n),
    0,
  );
});
