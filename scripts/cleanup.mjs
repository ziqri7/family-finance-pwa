// Pemeliharaan pemilik: mode awal hanya menampilkan jumlah, tanpa menghapus objek.
import { spawnSync } from "node:child_process";
import { cleanupQueries } from "./cleanup-query.mjs";
const args = process.argv.slice(2),
  local = args.includes("--local"),
  remote = args.includes("--remote"),
  apply = args.includes("--apply");
if (local === remote) throw Error("Pilih tepat satu: --local atau --remote.");
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const database = option("--database", "family-finance"),
  bucket = option("--bucket", "family-finance-evidence"),
  config = option("--config", null),
  mode = local ? "--local" : "--remote";
if (!/^[a-zA-Z0-9_-]+$/.test(database) || !/^[a-z0-9-]+$/.test(bucket))
  throw Error("Nama penyimpanan tidak valid.");
const run = (argv) => {
  const p = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      ...argv,
      ...(config ? ["--config", config] : []),
    ],
    {
      encoding: "utf8",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  if (p.status !== 0)
    throw Error(p.stderr || "Pembersihan belum berhasil. Jalankan lagi.");
  return p.stdout;
};
const query = cleanupQueries(Date.now(), apply),
  results = JSON.parse(
    run([
      "d1",
      "execute",
      database,
      mode,
      "--command",
      [query.mark, query.select].filter(Boolean).join("; ") + ";",
      "--json",
    ]),
  ),
  files = results.at(-1).results;
console.log("Bukti tertunda lebih dari24jam/deleting:", files.length);
if (!apply) {
  console.log(
    "Mode periksa saja. Gunakan --apply untuk mencabut slot kedaluwarsa dan menghapus objeknya.",
  );
  process.exit(0);
}
for (const file of files) {
  if (
    !/^[a-f0-9]{32}$/.test(file.id) ||
    !/^evidence\/[a-f0-9-]{36}$/.test(file.object_key)
  )
    throw Error("Key gambar tidak valid.");
  run(["r2", "object", "delete", bucket + "/" + file.object_key, mode]);
}
console.log(
  "Objek dibersihkan; metadata deleting dipertahankan agar ID lama tidak hidup kembali. Pengulangan aman.",
);
