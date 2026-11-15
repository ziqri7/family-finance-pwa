import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { credentials } from "../scripts/credentials.mjs";
import { db, bucket, reset, config } from "./neon-helper.mjs";
import { runtime, loadConfig, migrate } from "../scripts/neon-runtime.mjs";
import {
  createBackup,
  restoreBackup,
  readBackup,
  digest,
} from "../scripts/neon-backup.mjs";
test("Neon snapshot and image restore to a separate branch; tamper and occupied destination rejected", async () => {
  await reset(credentials().users);
  const target = loadConfig(
    process.env.FINANCEE_RESTORE_ENV || ".env.neon-restore",
  );
  assert.equal(target.NEON_BRANCH, "financee-restore-test");
  assert.notEqual(
    new URL(target.DATABASE_URL).host,
    new URL(config.DATABASE_URL).host,
  );
  const { Database, EvidenceStorage } = await runtime(),
    destination = new Database(target.DATABASE_URL),
    storage = new EvidenceStorage(target);
  await migrate(destination);
  for (const f of (
    await destination.prepare("SELECT object_key FROM attachments").all()
  ).results)
    await storage.delete(f.object_key);
  await destination
    .prepare(
      "TRUNCATE income_attachments,attachments,transfers,expenses,budget_items,budgets,periods,default_items,sessions,login_attempts,account_credentials",
    )
    .run();
  const item = randomBytes(16).toString("hex"),
    expense = randomBytes(16).toString("hex"),
    file = randomBytes(16).toString("hex"),
    key = "evidence/" + crypto.randomUUID(),
    png = await readFile("public/icons/icon-192.png"),
    now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO periods VALUES($1,1,$2)").bind("2002-01", now),
    db
      .prepare("INSERT INTO budgets VALUES($1,$2,$3)")
      .bind("2002-01", "partner-a", now),
    db
      .prepare(
        "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,created_at,updated_at) VALUES($1,'2002-01','partner-a','Contoh','allocation',1000000000000,0,$2,$2)",
      )
      .bind(item, now),
    db
      .prepare(
        "INSERT INTO expenses(id,period_id,owner_id,item_id,occurred_on,note,amount,created_at,updated_at) VALUES($1,'2002-01','partner-a',$2,'2002-01-01','Contoh',1000000000000,$3,$3)",
      )
      .bind(expense, item, now),
    db
      .prepare(
        "INSERT INTO attachments(id,expense_id,owner_id,object_key,content_type,byte_size,sha256,status,created_at,updated_at) VALUES($1,$2,'partner-a',$3,'image/png',$4,$5,'ready',$6,$6)",
      )
      .bind(file, expense, key, png.length, digest(png), now),
  ]);
  await bucket.put(key, png, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: { sha256: digest(png) },
  });
  const anonymous = await fetch(
    config.AWS_ENDPOINT_URL_S3.replace(/\/$/, "") + "/evidence/" + key,
  );
  assert.ok([401, 403, 404].includes(anonymous.status));
  await anonymous.body?.cancel();
  const folder = await createBackup(db, bucket);
  assert.equal(
    (await readBackup(folder)).data.budget_items[0].amount,
    1000000000000,
  );
  assert.deepEqual(await restoreBackup(destination, storage, folder), {
    tables: 9,
    objects: 1,
  });
  assert.equal(
    (await destination.prepare("SELECT count(*) AS n FROM sessions").first()).n,
    0,
  );
  await assert.rejects(restoreBackup(destination, storage, folder), /kosong/);
  const manifestPath = folder + "/manifest.json",
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await writeFile(manifestPath, JSON.stringify({ ...manifest, version: 2 }));
  await assert.rejects(readBackup(folder), /versi 4/);
  await writeFile(manifestPath, JSON.stringify({ ...manifest, objects: [] }));
  await assert.rejects(readBackup(folder), /lengkap/);
  await writeFile(manifestPath, JSON.stringify(manifest));
  const imagePath = folder + "/" + manifest.objects[0].file;
  await writeFile(imagePath, Buffer.from("tampered"));
  await assert.rejects(readBackup(folder), /Checksum/);
  await writeFile(imagePath, png);
  console.log(
    "Backup and restore verified in isolated branches; no family data included.",
  );
});
