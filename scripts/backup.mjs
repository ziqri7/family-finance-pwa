import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
const args = process.argv.slice(2),
  local = args.includes("--local"),
  remote = args.includes("--remote");
if (local === remote) throw Error("Pilih tepat satu: --local atau --remote.");
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const database = option("--database", "family-finance"),
  bucket = option("--bucket", "family-finance-evidence"),
  config = option("--config", null);
if (!/^[a-zA-Z0-9_-]+$/.test(database) || !/^[a-z0-9-]+$/.test(bucket))
  throw Error("Nama database/bucket tidak valid.");
const mode = local ? "--local" : "--remote",
  root = resolve("backups"),
  folder = join(
    root,
    new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      randomBytes(3).toString("hex"),
  );
await mkdir(join(folder, "objects"), { recursive: true });
const run = (argv) => {
  const p = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      ...argv,
      ...(config ? ["--config", resolve(config)] : []),
    ],
    {
      encoding: "utf8",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  if (p.status !== 0)
    throw Error(
      "Backup belum lengkap: perintah penyimpanan gagal. " + p.stderr,
    );
  return p.stdout;
};
const digest = (data) => createHash("sha256").update(data).digest("hex");
run(["d1", "export", database, mode, "--output", join(folder, "database.sql")]);
const sql = await readFile(join(folder, "database.sql")),
  db = new DatabaseSync(":memory:");
db.exec(sql.toString("utf8"));
const files = db
  .prepare(
    "SELECT a.id,a.object_key,a.sha256,a.byte_size,a.content_type FROM attachments a JOIN expenses e ON e.id=a.expense_id WHERE a.status='ready' AND e.deleted_at IS NULL",
  )
  .all();
for (const file of files) {
  if (
    !/^[a-f0-9]{32}$/.test(file.id) ||
    !/^evidence\/[a-f0-9-]{36}$/.test(file.object_key)
  )
    throw Error("Metadata bukti tidak valid.");
  file.file = "objects/" + file.id + ".bin";
  run([
    "r2",
    "object",
    "get",
    bucket + "/" + file.object_key,
    mode,
    "--file",
    join(folder, file.file),
  ]);
  const data = await readFile(join(folder, file.file));
  if (data.length !== file.byte_size || digest(data) !== file.sha256)
    throw Error("Backup gambar tidak sesuai checksum; backup belum lengkap.");
}
db.close();
await writeFile(
  join(folder, "manifest.json"),
  JSON.stringify(
    {
      version: 1,
      complete: true,
      createdAt: new Date().toISOString(),
      mode: local ? "local" : "remote",
      database,
      bucket,
      sqlSha256: digest(sql),
      objects: files,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log("Backup privat lengkap:", folder);
console.log("Gambar terverifikasi:", files.length);
console.log(
  "Manifest complete:true ditulis hanya setelah SQL dan seluruh gambar terverifikasi.",
);
