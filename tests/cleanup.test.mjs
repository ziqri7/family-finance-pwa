import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { cleanupQueries } from "../scripts/cleanup-query.mjs";
test("maintenance never claims ready or fresh pending evidence; old IDs remain tombstoned", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE attachments(id TEXT,object_key TEXT,status TEXT,updated_at INTEGER)",
  );
  const now = 200000000;
  for (const [id, status, time] of [
    ["ready", "ready", 1],
    ["fresh", "pending", now],
    ["old", "pending", 1],
    ["deleted", "deleting", now],
  ])
    db.prepare("INSERT INTO attachments VALUES(?,?,?,?)").run(
      id,
      id,
      status,
      time,
    );
  const dry = cleanupQueries(now);
  assert.equal(dry.mark, null);
  assert.deepEqual(
    db
      .prepare(dry.select)
      .all()
      .map((r) => r.id)
      .sort(),
    ["deleted", "old"],
  );
  assert.equal(
    db.prepare("SELECT status FROM attachments WHERE id='old'").get().status,
    "pending",
  );
  const apply = cleanupQueries(now, true);
  db.exec(apply.mark);
  assert.deepEqual(
    db
      .prepare(apply.select)
      .all()
      .map((r) => r.id)
      .sort(),
    ["deleted", "old"],
  );
  assert.equal(
    db.prepare("SELECT status FROM attachments WHERE id='ready'").get().status,
    "ready",
  );
  assert.equal(db.prepare("SELECT count(*) AS n FROM attachments").get().n, 4);
  db.close();
});
