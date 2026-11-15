// Pemeriksaan kandidat berkas publik; tidak mengunggah atau membuat repositori.
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { publicFiles } from "./public-files.mjs";
import { parseEnv } from "node:util";
const files = await publicFiles();
const sourceCount = files.length;
// Built assets are checked separately and never copied into the source package.
async function walkBuild(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = path + "/" + entry.name;
    if (entry.isSymbolicLink()) throw Error("Symlink aset tidak diizinkan.");
    if (entry.isDirectory()) await walkBuild(name);
    else files.push(name);
  }
}
if (existsSync("dist")) await walkBuild("dist");
const secrets = [];
for (const file of await readdir(".")) {
  if (
    !/^(\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/.test(file) ||
    file.endsWith(".example")
  )
    continue;
  const vars = parseEnv(await readFile(file, "utf8"));
  for (const name of [
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "SESSION_SECRET",
    "PASSWORD_PEPPER",
  ])
    if (vars[name]) secrets.push(vars[name]);
  if (vars.DATABASE_URL) {
    const password = new URL(vars.DATABASE_URL).password;
    if (password) secrets.push(password, decodeURIComponent(password));
  }
}
if (existsSync(".dev.vars")) {
  const vars = await readFile(".dev.vars", "utf8");
  const secret = vars.match(/^SESSION_SECRET=(.+)$/m)?.[1].trim();
  if (secret) secrets.push(secret);
  const encoded = vars.match(/^AUTH_USERS_JSON=(.+)$/m)?.[1]?.trim();
  if (encoded) {
    const users = JSON.parse(encoded.replace(/^['"]|['"]$/g, ""));
    for (const user of users) {
      secrets.push(user.hash, user.salt);
      if (!user.email.endsWith("@example.invalid")) secrets.push(user.email);
    }
  }
}
if (existsSync(".initial-credentials.txt"))
  for (const match of (
    await readFile(".initial-credentials.txt", "utf8")
  ).matchAll(/^Sandi: (.+)$/gm))
    secrets.push(match[1].trim());
for (const path of files) {
  if (
    /\.(xlsx|xls|sqlite|db)$/i.test(path) ||
    /\.(dev\.vars|initial-credentials)/.test(path)
  )
    throw Error("Berkas privat masuk kandidat publik: " + path);
  const body = await readFile(path);
  if (secrets.some((secret) => secret && body.includes(Buffer.from(secret))))
    throw Error("Nilai rahasia terdeteksi dalam kandidat publik: " + path);
}
console.log(
  "Pemeriksaan kandidat publik lulus:",
  sourceCount,
  "berkas sumber; aset build juga diperiksa bila ada. Tidak ada nilai secret/kredensial lokal atau workbook yang ikut.",
);
console.log(
  "Ini pemeriksaan kandidat, bukan audit seluruh riwayat Git atau bukti publikasi GitHub.",
);
