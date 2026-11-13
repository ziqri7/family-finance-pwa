// Pemulihan uji selalu memakai direktori lokal baru, tidak menimpa data aplikasi.
import { readFile, mkdir } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { validateManifestObjects } from "./backup-contract.mjs";
const folder = resolve(process.argv[2] || "");
if (!process.argv[2]) throw Error("Berikan folder backup.");
const manifest = JSON.parse(
    await readFile(join(folder, "manifest.json"), "utf8"),
  ),
  sql = await readFile(join(folder, "database.sql"));
const digest = (data) => createHash("sha256").update(data).digest("hex");
if (
  manifest.version !== 1 ||
  !manifest.complete ||
  digest(sql) !== manifest.sqlSha256
)
  throw Error("Backup belum lengkap atau checksum SQL berbeda.");
const destination = resolve(
  "backups",
  "restore-check-" + Date.now() + "-" + randomBytes(3).toString("hex"),
);
await mkdir(destination, { recursive: true });
const run = (argv) => {
  const result = spawnSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", ...argv],
    {
      encoding: "utf8",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  if (result.status !== 0) throw Error(result.stderr || "Pemulihan uji gagal.");
  return result.stdout;
};
const expected = new DatabaseSync(":memory:");
expected.exec(sql.toString("utf8"));
validateManifestObjects(expected, manifest);
run([
  "d1",
  "execute",
  "family-finance",
  "--local",
  "--persist-to",
  destination,
  "--file",
  join(folder, "database.sql"),
]);
run([
  "d1",
  "execute",
  "family-finance",
  "--local",
  "--persist-to",
  destination,
  "--command",
  "DELETE FROM sessions; DELETE FROM login_attempts;",
]);
for (const file of manifest.objects) {
  const path = resolve(folder, file.file);
  if (
    !path.startsWith(folder + sep) ||
    !/^evidence\/[a-f0-9-]{36}$/.test(file.object_key)
  )
    throw Error("Path backup tidak valid.");
  const data = await readFile(path);
  if (digest(data) !== file.sha256 || data.length !== file.byte_size)
    throw Error("Checksum gambar berbeda.");
  run([
    "r2",
    "object",
    "put",
    "family-finance-evidence/" + file.object_key,
    "--local",
    "--persist-to",
    destination,
    "--file",
    path,
    "--content-type",
    file.content_type,
  ]);
  const check = join(destination, file.id + ".bin");
  run([
    "r2",
    "object",
    "get",
    "family-finance-evidence/" + file.object_key,
    "--local",
    "--persist-to",
    destination,
    "--file",
    check,
  ]);
  if (digest(await readFile(check)) !== file.sha256)
    throw Error("Hasil pemulihan gambar berbeda.");
}
const query =
  "SELECT (SELECT count(*) FROM budgets) AS budgets,(SELECT count(*) FROM budget_items) AS items,(SELECT count(*) FROM expenses) AS expenses,(SELECT count(*) FROM attachments) AS attachments,(SELECT count(*) FROM sessions) AS sessions,(SELECT count(*) FROM sqlite_master WHERE type='trigger') AS triggers";
const actual = JSON.parse(
  run([
    "d1",
    "execute",
    "family-finance",
    "--local",
    "--persist-to",
    destination,
    "--command",
    query,
    "--json",
  ]),
)[0].results[0];
for (const [key, table] of [
  ["budgets", "budgets"],
  ["items", "budget_items"],
  ["expenses", "expenses"],
  ["attachments", "attachments"],
])
  if (
    Number(actual[key]) !==
    expected.prepare("SELECT count(*) AS n FROM " + table).get().n
  )
    throw Error("Jumlah catatan pulihan berbeda: " + key);
if (
  actual.sessions !== 0 ||
  actual.triggers !==
    expected
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger'")
      .get().n
)
  throw Error("Sesi atau trigger pemulihan tidak sesuai.");
expected.close();
console.log(
  "Pemulihan SQL dan gambar terverifikasi pada database terpisah:",
  destination,
);
console.log("Sesi pulihan dicabut. Database aplikasi tidak ditimpa.");
