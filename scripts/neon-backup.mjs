import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { validateManifestObjects } from "./backup-contract.mjs";
import { migrate } from "./neon-runtime.mjs";
export const columns = {
  account_credentials: [
    "account_id",
    "scheme",
    "hash",
    "salt",
    "iterations",
    "pepper_id",
    "version",
    "updated_at",
  ],
  default_items: [
    "id",
    "owner_id",
    "label",
    "kind",
    "position",
    "posting_kind",
  ],
  periods: ["id", "revision", "created_at"],
  budgets: ["period_id", "owner_id", "created_at"],
  budget_items: [
    "id",
    "period_id",
    "owner_id",
    "label",
    "kind",
    "amount",
    "position",
    "label_version",
    "amount_version",
    "row_version",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  expenses: [
    "id",
    "period_id",
    "owner_id",
    "item_id",
    "occurred_on",
    "note",
    "amount",
    "version",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  transfers: [
    "id",
    "period_id",
    "from_owner_id",
    "to_owner_id",
    "source_item_id",
    "occurred_on",
    "amount",
    "version",
    "created_at",
    "deleted_at",
  ],
  attachments: [
    "id",
    "expense_id",
    "owner_id",
    "object_key",
    "content_type",
    "byte_size",
    "sha256",
    "width",
    "height",
    "status",
    "created_at",
    "updated_at",
  ],
};
columns.budget_items.push(
  "recording_mode",
  "posting_kind",
  "posting_date",
  "posting_version",
);
columns.expenses.push("superseded_by_item_id", "superseded_at");
columns.transfers.push("superseded_by_item_id", "superseded_at");
columns.income_attachments = columns.attachments.map((k) =>
  k === "expense_id" ? "income_item_id" : k,
);
columns.allocation_attachments = columns.attachments.map((k) =>
  k === "expense_id" ? "allocation_item_id" : k,
);
columns.allocation_groups = [
  "id",
  "period_id",
  "owner_id",
  "label",
  "posting_kind",
  "recipient_owner_id",
  "status",
  "posting_date",
  "version",
  "position",
  "created_at",
  "updated_at",
  "deleted_at",
];
columns.allocation_group_items = [
  "group_id",
  "item_id",
  "position",
  "posted",
  "retired_at",
];
columns.allocation_group_operations = [
  "operation_id",
  "owner_id",
  "group_id",
  "action",
  "payload_hash",
  "resulting_version",
  "receipt",
  "created_at",
];
columns.group_attachments = [
  ...columns.attachments.map((k) => (k === "expense_id" ? "group_id" : k)),
  "confirmed_group_version",
];
const groupTables = [
  "allocation_groups",
  "allocation_group_items",
  "allocation_group_operations",
  "group_attachments",
];
const version6Columns = structuredClone(columns);
columns.budget_items.push(
  "tracking_enabled",
  "copied_from_item_id",
  "copied_by",
);
columns.expenses.push("converted_to", "converted_id", "converted_payload");
columns.transfers.push("converted_to", "converted_id", "converted_payload");
columns.allocation_groups.push("purpose");
columns.allocation_group_items.push(
  "linked_version",
  "linked_amount",
  "linked_label",
);
columns.usage_entries = [
  "id",
  "period_id",
  "item_id",
  "owner_id",
  "occurred_on",
  "note",
  "amount",
  "version",
  "created_at",
  "updated_at",
  "deleted_at",
];
columns.usage_attachments = columns.attachments.map((k) =>
  k === "expense_id" ? "usage_entry_id" : k,
);
export const digest = (data) => createHash("sha256").update(data).digest("hex");
export async function snapshot(db, includeMigrations = false) {
  const tables = Object.keys(columns),
    rows = await db.batch([
      ...tables.map((t) =>
        db.prepare(
          `SELECT * FROM ${t} ORDER BY ${t === "budgets" ? "period_id,owner_id" : t === "allocation_group_items" ? "group_id,item_id" : columns[t][0]}`,
        ),
      ),
      ...(includeMigrations
        ? [db.prepare("SELECT id,sha256 FROM schema_migrations ORDER BY id")]
        : []),
    ]);
  return Object.fromEntries([
    ...tables.map((t, i) => [t, rows[i].results]),
    ...(includeMigrations ? [["schema_migrations", rows.at(-1).results]] : []),
  ]);
}
export function requiredObjects(data) {
  const live = new Set(
    data.expenses.filter((e) => e.deleted_at === null).map((e) => e.id),
  );
  const income = new Set(
    data.budget_items
      .filter((i) => i.deleted_at === null && i.kind === "income")
      .map((i) => i.id),
  );
  const allocations = new Set(
    data.budget_items
      .filter(
        (i) =>
          i.deleted_at === null &&
          i.recording_mode === "actual" &&
          i.amount !== null,
      )
      .map((i) => i.id),
  );
  const groups = new Set(
    (data.allocation_groups || [])
      .filter((g) => g.status === "posted" && g.deleted_at === null)
      .map((g) => g.id),
  );
  return [
    ...(data.usage_attachments || []).filter(
      (a) =>
        a.status === "ready" &&
        (data.usage_entries || []).some(
          (u) => u.id === a.usage_entry_id && u.deleted_at === null,
        ),
    ),
    ...(data.group_attachments || []).filter(
      (a) => a.status === "ready" && groups.has(a.group_id),
    ),
    ...(data.allocation_attachments || []).filter(
      (a) => a.status === "ready" && allocations.has(a.allocation_item_id),
    ),
    ...data.attachments.filter(
      (a) => a.status === "ready" && live.has(a.expense_id),
    ),
    ...(data.income_attachments || []).filter(
      (a) => a.status === "ready" && income.has(a.income_item_id),
    ),
  ].map((a) =>
    Object.fromEntries(
      ["id", "object_key", "sha256", "byte_size", "content_type"].map((k) => [
        k,
        a[k],
      ]),
    ),
  );
}
export function restoredData(data) {
  const copy = structuredClone(data),
    required = new Set(requiredObjects(copy).map((a) => a.id));
  for (const a of [
    ...copy.attachments,
    ...(copy.income_attachments || []),
    ...(copy.allocation_attachments || []),
    ...(copy.group_attachments || []),
    ...(copy.usage_attachments || []),
  ])
    if (!required.has(a.id)) a.status = "deleting";
  return copy;
}
export async function createBackup(
  db,
  storage,
  folder = resolve(
    "backups",
    new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      randomBytes(3).toString("hex"),
  ),
) {
  await mkdir(join(folder, "objects"), { recursive: true });
  const data = await snapshot(db, true),
    migrations = data.schema_migrations;
  delete data.schema_migrations;
  const json = JSON.stringify(data, null, 2);
  await writeFile(join(folder, "database.json"), json, { mode: 0o600 });
  const files = requiredObjects(data).map((f) => ({
    ...f,
    file: "objects/" + f.id + ".bin",
  }));
  validateManifestObjects(requiredObjects(data), { objects: files });
  for (const f of files) {
    const object = await storage.get(f.object_key);
    if (!object) throw Error("Backup belum lengkap: gambar hilang.");
    const bytes = Buffer.from(await new Response(object.body).arrayBuffer());
    if (bytes.length !== f.byte_size || digest(bytes) !== f.sha256)
      throw Error("Backup gambar berbeda checksum.");
    await writeFile(join(folder, f.file), bytes, { mode: 0o600 });
  }
  await writeFile(
    join(folder, "manifest.json"),
    JSON.stringify(
      {
        version: 7,
        complete: true,
        createdAt: new Date().toISOString(),
        databaseSha256: digest(json),
        migrations,
        objects: files,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  return folder;
}
export async function readBackup(folder) {
  const manifest = JSON.parse(
      await readFile(join(folder, "manifest.json"), "utf8"),
    ),
    bytes = await readFile(join(folder, "database.json"));
  if (![5, 6, 7].includes(manifest.version))
    throw Error("Format backup harus versi 5 atau 6 yang memuat kredensial.");
  if (manifest.complete !== true || digest(bytes) !== manifest.databaseSha256)
    throw Error("Backup tidak lengkap atau checksum berbeda.");
  const data = JSON.parse(bytes);
  const expectedColumns =
    manifest.version === 5
      ? Object.fromEntries(
          Object.entries(version6Columns).filter(
            ([t]) => !groupTables.includes(t),
          ),
        )
      : manifest.version === 6
        ? version6Columns
        : columns;
  if (
    Object.keys(data).sort().join() !==
    Object.keys(expectedColumns).sort().join()
  )
    throw Error("Tabel backup tidak sesuai.");
  for (const [t, keys] of Object.entries(expectedColumns)) {
    if (!Array.isArray(data[t])) throw Error("Isi tabel backup tidak sesuai.");
    for (const r of data[t])
      if (
        !r ||
        Object.keys(r).sort().join() !== [...keys].sort().join() ||
        Object.values(r).some(
          (v) =>
            v !== null &&
            typeof v !== "string" &&
            !(typeof v === "number" && Number.isSafeInteger(v)),
        )
      )
        throw Error("Kolom backup tidak valid.");
  }
  if (
    data.account_credentials.length !== 2 ||
    data.account_credentials
      .map((r) => r.account_id)
      .sort()
      .join() !== "partner-a,partner-b"
  )
    throw Error(
      "Backup harus memuat dua kredensial akun; tidak boleh kembali ke sandi awal.",
    );
  if (manifest.version === 5) for (const t of groupTables) data[t] = [];
  if (manifest.version < 7) {
    for (const i of data.budget_items)
      Object.assign(i, {
        tracking_enabled: 0,
        copied_from_item_id: null,
        copied_by: null,
      });
    for (const r of [...data.expenses, ...data.transfers])
      Object.assign(r, {
        converted_to: null,
        converted_id: null,
        converted_payload: null,
      });
    for (const g of data.allocation_groups) g.purpose = "legacy";
    for (const m of data.allocation_group_items)
      Object.assign(m, {
        linked_version: null,
        linked_amount: null,
        linked_label: null,
      });
    data.usage_entries = [];
    data.usage_attachments = [];
  }
  validateManifestObjects(requiredObjects(data), manifest);
  for (const f of manifest.objects) {
    const bytes = await readFile(join(folder, f.file));
    if (bytes.length !== f.byte_size || digest(bytes) !== f.sha256)
      throw Error("Checksum gambar backup berbeda.");
  }
  return { manifest, data: restoredData(data) };
}
export async function restoreBackup(db, storage, folder, passwordPepper) {
  const { manifest, data } = await readBackup(folder);
  for (const row of data.account_credentials)
    if (
      row.scheme === "bcrypt_hmac_sha384" &&
      (!passwordPepper || digest(passwordPepper) !== row.pepper_id)
    )
      throw Error("Kunci PASSWORD_PEPPER pemulihan tidak sesuai.");
  await migrate(db);
  const versions = (
    await db
      .prepare("SELECT id,sha256 FROM schema_migrations ORDER BY id")
      .all()
  ).results;
  if (
    JSON.stringify(versions.slice(0, manifest.version)) !==
      JSON.stringify(manifest.migrations) ||
    manifest.migrations.length !== manifest.version
  )
    throw Error("Versi migrasi backup berbeda.");
  const emptySql = `SELECT ${[...Object.keys(columns), "sessions", "login_attempts"].map((t) => `(SELECT count(*) FROM ${t})`).join("+")} AS n`;
  if (Number((await db.prepare(emptySql).first()).n) !== 0)
    throw Error("Tujuan pemulihan harus kosong; data tidak ditimpa.");
  for (const f of manifest.objects) {
    const bytes = await readFile(join(folder, f.file));
    const existing = await storage.get(f.object_key);
    if (existing) {
      if (
        digest(Buffer.from(await new Response(existing.body).arrayBuffer())) !==
        f.sha256
      )
        throw Error("Key tujuan sudah memiliki gambar berbeda; tidak ditimpa.");
    } else {
      await storage.put(f.object_key, bytes, {
        httpMetadata: { contentType: f.content_type },
        customMetadata: { sha256: f.sha256 },
      });
    }
    const object = await storage.get(f.object_key);
    if (
      !object ||
      digest(Buffer.from(await new Response(object.body).arrayBuffer())) !==
        f.sha256
    )
      throw Error("Gambar pulihan berbeda.");
  }
  const writes = [
    db.prepare("SELECT set_config('financee.restore','1',true)"),
    db.prepare(
      `DO $$ BEGIN IF (${emptySql})<>0 THEN RAISE EXCEPTION 'RESTORE_DESTINATION_NOT_EMPTY'; END IF; END $$`,
    ),
  ];
  for (const [t, keys] of Object.entries(columns))
    for (const row of data[t])
      writes.push(
        db
          .prepare(
            `INSERT INTO ${t}(${keys.join(",")}) VALUES(${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
          )
          .bind(...keys.map((k) => row[k])),
      );
  for (const p of data.periods)
    writes.push(
      db
        .prepare("UPDATE periods SET revision=$1 WHERE id=$2")
        .bind(p.revision, p.id),
    );
  await db.batch(writes);
  const actual = await snapshot(db);
  const canonical = (v) => JSON.stringify(v, Object.keys(v).sort());
  for (const t of Object.keys(columns)) {
    const norm = (rows) => rows.map(canonical).sort();
    if (JSON.stringify(norm(actual[t])) !== JSON.stringify(norm(data[t])))
      throw Error("Isi pulihan berbeda: " + t);
  }
  return {
    tables: Object.keys(columns).length,
    objects: manifest.objects.length,
  };
}
