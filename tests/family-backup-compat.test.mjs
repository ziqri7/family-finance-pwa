import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { db, reset, bucket, config } from "./neon-helper.mjs";
import { credentials } from "../scripts/credentials.mjs";
import { runtime, loadConfig, migrate } from "../scripts/neon-runtime.mjs";
import {
  columns,
  digest,
  createBackup,
  readBackup,
  restoreBackup,
  requiredObjects,
} from "../scripts/neon-backup.mjs";
test("format5/6 upgrade restores original values, legacy bundle and image keys to empty schema7", async () => {
  const auth = credentials();
  await reset(auth.users);
  const id = () => randomBytes(16).toString("hex"),
    income = id(),
    item = id(),
    group = id(),
    png = await readFile("public/icons/icon-192.png");
  await db.batch([
    db.prepare("INSERT INTO periods VALUES('2026-11',1,1)"),
    db.prepare("INSERT INTO budgets VALUES('2026-11','partner-a',1)"),
    db
      .prepare(
        "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,recording_mode,posting_kind,created_at,updated_at) VALUES($1,'2026-11','partner-a','Pemasukan','income',1000000,0,'legacy',NULL,1,1),($2,'2026-11','partner-a','Pos lama','allocation',500000,1,'actual','internal',1,1)",
      )
      .bind(income, item),
    db
      .prepare(
        "INSERT INTO allocation_groups(id,period_id,owner_id,label,posting_kind,recipient_owner_id,status,created_at,updated_at) VALUES($1,'2026-11','partner-a','Bukti lama','internal','partner-b','posted',1,1)",
      )
      .bind(group),
    db
      .prepare(
        "INSERT INTO allocation_group_items(group_id,item_id,position,posted) VALUES($1,$2,0,1)",
      )
      .bind(group, item),
  ]);
  for (const [table, key, parent] of [
    ["allocation_attachments", "allocation_item_id", item],
    ["group_attachments", "group_id", group],
  ]) {
    const fid = id(),
      objectKey = "evidence/" + crypto.randomUUID();
    await bucket.put(objectKey, png, {
      httpMetadata: { contentType: "image/png" },
      customMetadata: { sha256: digest(png) },
    });
    await db
      .prepare(
        `INSERT INTO ${table}(id,${key},owner_id,object_key,content_type,byte_size,sha256,status,created_at,updated_at${table === "group_attachments" ? ",confirmed_group_version" : ""}) VALUES($1,$2,'partner-a',$3,'image/png',$4,$5,'ready',1,1${table === "group_attachments" ? ",1" : ""})`,
      )
      .bind(fid, parent, objectKey, png.length, digest(png))
      .run();
  }
  const source = await createBackup(db, bucket),
    sourceManifest = JSON.parse(
      await readFile(source + "/manifest.json", "utf8"),
    ),
    sourceData = JSON.parse(await readFile(source + "/database.json", "utf8"));
  const restore = loadConfig(".env.neon-restore");
  assert.equal(restore.NEON_BRANCH, "financee-restore-test");
  assert.notEqual(
    new URL(restore.DATABASE_URL).hostname,
    new URL(config.DATABASE_URL).hostname,
  );
  const { Database, EvidenceStorage } = await runtime(),
    dest = new Database(restore.DATABASE_URL),
    storage = new EvidenceStorage(restore);
  await migrate(dest);
  const newFields = new Set([
      "tracking_enabled",
      "copied_from_item_id",
      "copied_by",
      "purpose",
      "linked_version",
      "linked_amount",
      "linked_label",
      "converted_to",
      "converted_id",
      "converted_payload",
    ]),
    groupTables = new Set([
      "allocation_groups",
      "allocation_group_items",
      "allocation_group_operations",
      "group_attachments",
    ]);
  for (const version of [6, 5]) {
    const folder = source + "-legacy" + version;
    await mkdir(folder + "/objects", { recursive: true });
    const data = Object.fromEntries(
      Object.entries(sourceData)
        .filter(
          ([table]) =>
            !table.startsWith("usage_") &&
            (version === 6 || !groupTables.has(table)),
        )
        .map(([table, rows]) => [
          table,
          rows.map((row) =>
            Object.fromEntries(
              Object.entries(row).filter(([key]) => !newFields.has(key)),
            ),
          ),
        ]),
    );
    const bytes = JSON.stringify(data, null, 2),
      required = new Set(requiredObjects(data).map((f) => f.id)),
      objects = sourceManifest.objects.filter((f) => required.has(f.id));
    await writeFile(folder + "/database.json", bytes);
    await writeFile(
      folder + "/manifest.json",
      JSON.stringify({
        ...sourceManifest,
        version,
        migrations: sourceManifest.migrations.slice(0, version),
        databaseSha256: digest(bytes),
        objects,
      }),
    );
    for (const f of objects)
      await copyFile(source + "/" + f.file, folder + "/" + f.file);
    const upgraded = await readBackup(folder);
    assert.equal(
      upgraded.data.budget_items.find((i) => i.id === item).tracking_enabled,
      0,
    );
    assert.equal(
      upgraded.data.budget_items.find((i) => i.id === item).amount,
      500000,
    );
    assert.equal(upgraded.data.usage_entries.length, 0);
    if (version === 6)
      assert.equal(upgraded.data.allocation_groups[0].purpose, "legacy");
    await dest
      .prepare(
        "TRUNCATE usage_attachments,usage_entries,group_attachments,allocation_group_operations,allocation_group_items,allocation_groups,allocation_attachments,income_attachments,attachments,transfers,expenses,budget_items,budgets,periods,default_items,sessions,login_attempts,account_credentials",
      )
      .run();
    const result = await restoreBackup(dest, storage, folder, auth.pepper);
    assert.equal(result.tables, 16);
    assert.equal(result.objects, version === 6 ? 2 : 1);
    assert.equal(
      (
        await dest
          .prepare("SELECT amount FROM budget_items WHERE id=$1")
          .bind(item)
          .first()
      ).amount,
      500000,
    );
  }
});
