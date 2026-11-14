import { existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { credentials } from "./credentials.mjs";
import { runtime, loadConfig, migrate } from "./neon-runtime.mjs";
import { seed } from "./seed-template.mjs";
const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const source = option("--from", ".env.neon-dev"),
  origin = option("--origin", "http://127.0.0.1:5173"),
  url = new URL(origin);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  url.origin !== origin
)
  throw Error("Alamat lokal harus origin loopback.");
const config = loadConfig(source);
if (!config.NEON_BRANCH || config.NEON_BRANCH === "production")
  throw Error("Setup lokal memerlukan cabang development terpisah.");
await mkdir("private", { recursive: true });
await mkdir("dist", { recursive: true });
if (!existsSync(".dev.vars")) {
  const { users, passwords, secret } = credentials();
  const vars = Object.fromEntries(
    Object.entries(config).filter(([key]) => !key.startsWith("NEON_")),
  );
  Object.assign(vars, {
    APP_ORIGIN: origin,
    LOCAL_DEV: "1",
    SESSION_SECRET: secret,
    AUTH_USERS_JSON: JSON.stringify(users),
  });
  await writeFile(
    ".dev.vars",
    Object.entries(vars)
      .map(([k, v]) => {
        if (v.includes("'") || /[\r\n]/.test(v))
          throw Error(
            "Nilai konfigurasi lokal tidak dapat ditulis dengan aman.",
          );
        return k + "='" + v + "'";
      })
      .join("\n") + "\n",
    { mode: 0o600, flag: "wx" },
  );
  await writeFile(
    ".initial-credentials.txt",
    "AKUN LOKAL DUMMY — BUKAN PRODUKSI\n\n" +
      users
        .map(
          (u, i) => `${u.name}\nIdentitas: ${u.email}\nSandi: ${passwords[i]}`,
        )
        .join("\n\n") +
      "\n",
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Akun lokal dibuat; identitas dan sandi ada pada .initial-credentials.txt.",
  );
} else
  throw Error(
    ".dev.vars sudah ada; tidak diganti. Gunakan db:migrate/seed-template untuk pembaruan.",
  );
const { Database } = await runtime(),
  db = new Database(config.DATABASE_URL);
await migrate(db);
await seed(db);
console.log(
  "Setup selesai. Backend lokal memakai cabang Neon online; memerlukan internet.",
);
