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
  default_items: ["id", "owner_id", "label", "kind", "position"],
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
export const digest = (data) => createHash("sha256").update(data).digest("hex");
export async function snapshot(db, includeMigrations = false) {
  const tables = Object.keys(columns),
    rows = await db.batch([
      ...tables.map((t) =>
        db.prepare(
          `SELECT * FROM ${t} ORDER BY ${t === "account_credentials" ? "account_id" : columns[t].includes("id") ? "id" : "period_id,owner_id"}`,
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
  return data.attachments
    .filter((a) => a.status === "ready" && live.has(a.expense_id))
    .map((a) =>
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
  for (const a of copy.attachments)
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
        version: 3,
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
  if (manifest.version !== 3)
    throw Error(
      "Format backup harus versi 3 yang memuat kredensial; gunakan panduan pemulihan versi lama secara terpisah.",
    );
  if (manifest.complete !== true || digest(bytes) !== manifest.databaseSha256)
    throw Error("Backup tidak lengkap atau checksum berbeda.");
  const data = JSON.parse(bytes);
  if (Object.keys(data).sort().join() !== Object.keys(columns).sort().join())
    throw Error("Tabel backup tidak sesuai.");
  for (const [t, keys] of Object.entries(columns)) {
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
  if (JSON.stringify(versions) !== JSON.stringify(manifest.migrations))
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
