import { credentials } from "./credentials.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
const args = process.argv.slice(2),
  value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
const a = value("--suami"),
  b = value("--istri");
if (
  !a ||
  !b ||
  a.toLowerCase() === b.toLowerCase() ||
  ![a, b].every((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
)
  throw Error(
    "Gunakan --suami alamat --istri alamat yang berbeda. Jangan memakai sandi pilihan sendiri.",
  );
const bundle = credentials();
bundle.users[0].email = a.toLowerCase();
bundle.users[1].email = b.toLowerCase();
const folder = resolve(
  "private",
  "provision-" + randomBytes(6).toString("hex"),
);
await mkdir(folder, { recursive: true });
await writeFile(folder + "/AUTH_USERS_JSON.txt", JSON.stringify(bundle.users), {
  mode: 0o600,
});
await writeFile(folder + "/SESSION_SECRET.txt", bundle.secret, { mode: 0o600 });
await writeFile(
  folder + "/credentials.txt",
  bundle.users
    .map(
      (u, i) =>
        `${u.name}\nIdentitas: ${u.email}\nSandi: ${bundle.passwords[i]}`,
    )
    .join("\n\n"),
  { mode: 0o600 },
);
console.log("Berkas provisioning privat dibuat:", folder);
console.log(
  "Tidak ada akun, secret Cloudflare atau deployment yang diubah. Simpan sandi pada pengelola sandi; jangan unggah folder private.",
);
