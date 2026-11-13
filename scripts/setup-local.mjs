import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { credentials } from "./credentials.mjs";
await mkdir("private", { recursive: true });
await mkdir("dist", { recursive: true });
if (!existsSync(".dev.vars")) {
  const { users, passwords, secret } = credentials();
  await writeFile(
    ".dev.vars",
    `APP_ORIGIN=http://127.0.0.1:5173\nLOCAL_DEV=1\nSESSION_SECRET=${secret}\nAUTH_USERS_JSON='${JSON.stringify(users)}'\n`,
    { mode: 0o600 },
  );
  await writeFile(
    ".initial-credentials.txt",
    `AKUN LOKAL SAJA — BUKAN UNTUK PRODUKSI\nSimpan pada pengelola sandi Anda. Berkas ini dikecualikan dari Git.\n\n${users.map((u, i) => `${u.name}\nIdentitas: ${u.email}\nSandi: ${passwords[i]}`).join("\n\n")}\n`,
    { mode: 0o600 },
  );
  console.log(
    "Dua akun lokal dibuat. Identitas dan sandi ada di .initial-credentials.txt; tidak dicetak ke log.",
  );
}
const run = (args) => {
  const result = spawnSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", ...args],
    {
      encoding: "utf8",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  if (result.status !== 0)
    throw Error(result.stderr || "Perintah database gagal.");
  return result.stdout;
};
run(["d1", "migrations", "apply", "family-finance", "--local"]);
const result = JSON.parse(
  run([
    "d1",
    "execute",
    "family-finance",
    "--local",
    "--command",
    "SELECT count(*) AS count FROM default_items",
    "--json",
  ]),
);
if (!Number(result[0].results[0].count)) {
  const template = JSON.parse(
    await readFile(
      existsSync("private/template.json")
        ? "private/template.json"
        : "data/template.json",
      "utf8",
    ),
  );
  const rows = [];
  for (const owner of ["partner-a", "partner-b"]) {
    if (!Array.isArray(template[owner]) || template[owner].length > 200)
      throw Error("Template tidak valid.");
    template[owner].forEach((r, i) => {
      if (
        typeof r.label !== "string" ||
        !r.label.trim() ||
        r.label.length > 100 ||
        !["income", "allocation", "transfer_out"].includes(r.kind)
      )
        throw Error("Pos template tidak valid.");
      rows.push(
        `('${(owner === "partner-a" ? "a" : "b") + i.toString(16).padStart(31, "0")}','${owner}','${r.label.trim().replaceAll("'", "''")}','${r.kind}',${i})`,
      );
    });
  }
  await writeFile(
    "private/seed.sql",
    "INSERT INTO default_items(id,owner_id,label,kind,position) VALUES " +
      rows.join(",") +
      ";\n",
    { mode: 0o600 },
  );
  run([
    "d1",
    "execute",
    "family-finance",
    "--local",
    "--file",
    "private/seed.sql",
  ]);
  console.log("Template disiapkan tanpa nominal historis.");
}
console.log(
  "Migrasi lokal siap. Jalankan npm run dev. Tidak ada layanan Cloudflare jarak jauh yang dibuat.",
);
