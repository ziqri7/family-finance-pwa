import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db, reset, bucket, config } from "./neon-helper.mjs";
import { credentials } from "../scripts/credentials.mjs";
import { runtime, loadConfig, migrate } from "../scripts/neon-runtime.mjs";
import {
  createBackup,
  restoreBackup,
  snapshot,
  digest,
} from "../scripts/neon-backup.mjs";
test("converted transfers and superseded expense images restore after their original sources are deleted", async () => {
  const auth = credentials();
  await reset(auth.users);
  const id = () => randomBytes(16).toString("hex"),
    income = id(),
    tracked = id(),
    source = id(),
    historical = id(),
    expense = id(),
    transfer = id(),
    now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO periods VALUES('2026-11',1,1)"),
    db.prepare("INSERT INTO budgets VALUES('2026-11','partner-a',1)"),
    db
      .prepare(
        "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,recording_mode,posting_kind,tracking_enabled,created_at,updated_at) VALUES($1,'2026-11','partner-a','Pemasukan','income',1500,0,'legacy',NULL,0,1,1),($2,'2026-11','partner-a','Dilacak','allocation',900,1,'actual','external',1,1,1),($3,'2026-11','partner-a','Kiriman lama','transfer_out',200,2,'legacy',NULL,0,1,1),($4,'2026-11','partner-a','Histori pembayaran','allocation',100,3,'actual','external',0,1,1)",
      )
      .bind(income, tracked, source, historical),
    db
      .prepare(
        "INSERT INTO transfers(id,period_id,from_owner_id,to_owner_id,source_item_id,occurred_on,amount,created_at) VALUES($1,'2026-11','partner-a','partner-b',$2,'2026-11-01',200,1)",
      )
      .bind(transfer, source),
    db
      .prepare(
        "INSERT INTO expenses(id,period_id,owner_id,item_id,occurred_on,note,amount,superseded_by_item_id,superseded_at,created_at,updated_at) VALUES($1,'2026-11','partner-a',$2,'2026-11-01','Histori',100,$2,1,1,1)",
      )
      .bind(expense, historical),
  ]);
  const png = await readFile("public/icons/icon-192.png"),
    key = "evidence/" + crypto.randomUUID();
  await bucket.put(key, png, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: { sha256: digest(png) },
  });
  await db
    .prepare(
      "INSERT INTO attachments(id,expense_id,owner_id,object_key,content_type,byte_size,sha256,status,created_at,updated_at) VALUES($1,$2,'partner-a',$3,'image/png',$4,$5,'ready',1,1)",
    )
    .bind(id(), expense, key, png.length, digest(png))
    .run();
  await db
    .prepare("SELECT convert_family_extra('partner-a',$1,$2,$3)")
    .bind(
      transfer,
      JSON.stringify({
        source: "transfer",
        mode: "usage",
        itemId: tracked,
        label: "Kiriman dipetakan",
        expectedVersion: 1,
        confirmed: true,
      }),
      now,
    )
    .run();
  await db
    .prepare("SELECT review_family_items('2026-11','partner-a',$1,$2)")
    .bind(
      JSON.stringify({
        expectedRevision: (
          await db
            .prepare("SELECT revision FROM periods WHERE id='2026-11'")
            .first()
        ).revision,
        items: [{ id: source, expectedVersion: 1 }],
      }),
      now,
    )
    .run();
  for (const item of [source, historical])
    await db
      .prepare("SELECT family_item_write('partner-a',$1,$2,$3)")
      .bind(
        item,
        JSON.stringify({
          action: "delete",
          expectedVersion: (
            await db
              .prepare("SELECT row_version FROM budget_items WHERE id=$1")
              .bind(item)
              .first()
          ).row_version,
        }),
        now,
      )
      .run();
  const backup = await createBackup(db, bucket),
    restore = loadConfig(".env.neon-restore");
  assert.equal(restore.NEON_BRANCH, "financee-restore-test");
  assert.notEqual(
    new URL(config.DATABASE_URL).hostname,
    new URL(restore.DATABASE_URL).hostname,
  );
  const { Database, EvidenceStorage } = await runtime(),
    target = new Database(restore.DATABASE_URL);
  await migrate(target);
  await target
    .prepare(
      "TRUNCATE usage_attachments,usage_entries,group_attachments,allocation_group_operations,allocation_group_items,allocation_groups,allocation_attachments,income_attachments,attachments,transfers,expenses,budget_items,budgets,periods,default_items,sessions,login_attempts,account_credentials",
    )
    .run();
  assert.deepEqual(
    await restoreBackup(
      target,
      new EvidenceStorage(restore),
      backup,
      auth.pepper,
    ),
    { tables: 16, objects: 1 },
  );
  assert.deepEqual(await snapshot(target), await snapshot(db));
  assert.equal(
    (
      await target
        .prepare(
          "SELECT distributed FROM family_book_totals WHERE period_id='2026-11'",
        )
        .first()
    ).distributed,
    900,
  );
  assert.equal(
    (await target.prepare("SELECT status FROM attachments").first()).status,
    "ready",
  );
});
