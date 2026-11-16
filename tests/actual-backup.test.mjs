import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import jpeg from "jpeg-js";
import { db, bucket, reset, config } from "./neon-helper.mjs";
import { credentials } from "../scripts/credentials.mjs";
import { runtime, loadConfig, migrate } from "../scripts/neon-runtime.mjs";
import {
  createBackup,
  restoreBackup,
  snapshot,
  digest,
  readBackup,
} from "../scripts/neon-backup.mjs";
test("format6 restores allocation JPG, archived expense PNG, income proof and superseded history without resurrecting spending", async () => {
  const auth = credentials();
  await reset(auth.users);
  const target = loadConfig(".env.neon-restore");
  assert.equal(target.NEON_BRANCH, "financee-restore-test");
  assert.notEqual(
    new URL(target.DATABASE_URL).hostname,
    new URL(config.DATABASE_URL).hostname,
  );
  const { Database, EvidenceStorage } = await runtime(),
    dest = new Database(target.DATABASE_URL),
    storage = new EvidenceStorage(target);
  await migrate(dest);
  for (const f of (
    await dest
      .prepare(
        "SELECT object_key FROM attachments UNION ALL SELECT object_key FROM income_attachments UNION ALL SELECT object_key FROM allocation_attachments UNION ALL SELECT object_key FROM group_attachments",
      )
      .all()
  ).results)
    await storage.delete(f.object_key);
  await dest
    .prepare(
      "TRUNCATE group_attachments,allocation_group_operations,allocation_group_items,allocation_groups,allocation_attachments,income_attachments,attachments,transfers,expenses,budget_items,budgets,periods,default_items,sessions,login_attempts,account_credentials",
    )
    .run();
  const id = () => randomBytes(16).toString("hex"),
    parent = id(),
    old = id(),
    income = id(),
    png = await readFile("public/icons/icon-192.png"),
    jpg = jpeg.encode(
      { width: 2, height: 2, data: Buffer.alloc(16, 255) },
      80,
    ).data;
  await db.batch([
    db.prepare("INSERT INTO periods VALUES('2001-11',1,1)"),
    db.prepare("INSERT INTO budgets VALUES('2001-11','partner-a',1)"),
    db
      .prepare(
        "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,created_at,updated_at,recording_mode,posting_kind) VALUES($1,'2001-11','partner-a','Listrik','allocation',450000,1,1,1,'actual','external'),($2,'2001-11','partner-a','Gaji','income',1000000,0,1,1,'legacy',NULL)",
      )
      .bind(parent, income),
    db
      .prepare(
        "INSERT INTO expenses(id,period_id,owner_id,item_id,occurred_on,note,amount,created_at,updated_at,superseded_by_item_id,superseded_at) VALUES($1,'2001-11','partner-a',$2,'2001-11-03','Histori',400000,1,1,$2,1)",
      )
      .bind(old, parent),
  ]);
  for (const [table, key, value, bytes, type] of [
    ["attachments", "expense_id", old, png, "image/png"],
    ["allocation_attachments", "allocation_item_id", parent, jpg, "image/jpeg"],
    ["income_attachments", "income_item_id", income, png, "image/png"],
  ]) {
    const keyName = "evidence/" + crypto.randomUUID();
    await bucket.put(keyName, bytes, {
      httpMetadata: { contentType: type },
      customMetadata: { sha256: digest(bytes) },
    });
    await db
      .prepare(
        `INSERT INTO ${table}(id,${key},owner_id,object_key,content_type,byte_size,sha256,status,created_at,updated_at) VALUES($1,$2,'partner-a',$3,$4,$5,$6,'ready',1,1)`,
      )
      .bind(id(), value, keyName, type, bytes.length, digest(bytes))
      .run();
  }
  const folder = await createBackup(db, bucket),
    backup = await readBackup(folder);
  assert.equal(backup.manifest.version, 6);
  assert.equal(backup.manifest.objects.length, 3);
  assert.equal(Object.keys(backup.data).length, 14);
  assert.deepEqual(await restoreBackup(dest, storage, folder, auth.pepper), {
    tables: 14,
    objects: 3,
  });
  assert.deepEqual(await snapshot(dest), await snapshot(db));
  assert.equal(
    (
      await dest
        .prepare(
          "SELECT sum(amount)::bigint AS n FROM effective_postings WHERE posting_kind='external'",
        )
        .first()
    ).n,
    450000,
  );
  await dest
    .prepare("UPDATE budget_items SET amount=NULL WHERE id=$1")
    .bind(parent)
    .run();
  assert.equal(
    (
      await dest
        .prepare(
          "SELECT count(*)::int AS n FROM effective_postings WHERE posting_kind='external'",
        )
        .first()
    ).n,
    0,
  );
  assert.equal(
    (await dest.prepare("SELECT status FROM allocation_attachments").first())
      .status,
    "deleting",
  );
  assert.equal(
    (await dest.prepare("SELECT status FROM attachments").first()).status,
    "ready",
  );
  assert.equal(
    (await dest.prepare("SELECT superseded_by_item_id FROM expenses").first())
      .superseded_by_item_id,
    parent,
  );
});
