import { build } from "esbuild";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
export async function runtime() {
  await mkdir("private/runtime", { recursive: true });
  const outfile = resolve("private/runtime/neon-" + process.pid + ".mjs");
  await build({
    stdin: {
      contents:
        'export {Database,FAMILY_LOCK} from "./worker/db/postgres.ts"; export {EvidenceStorage} from "./worker/storage.ts";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "browser",
    format: "esm",
    outfile,
  });
  return import(pathToFileURL(outfile).href);
}
export function loadConfig(file = process.env.FINANCEE_ENV || ".dev.vars") {
  const values = { ...parseEnv(readFileSync(file, "utf8")), ...process.env };
  const names = [
    "DATABASE_URL",
    "AWS_ENDPOINT_URL_S3",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_REGION",
    "EVIDENCE_BUCKET",
  ];
  for (const key of names)
    if (!values[key]) throw Error("Konfigurasi belum lengkap: " + key);
  return Object.fromEntries(
    [...names, "NEON_BRANCH", "NEON_BRANCH_ID", "PASSWORD_PEPPER"]
      .filter((key) => values[key])
      .map((key) => [key, values[key]]),
  );
}
export function statements(sql) {
  const result = [];
  let current = "",
    single = false,
    dollar = false;
  for (let i = 0; i < sql.length; i++) {
    if (!single && !dollar && sql.slice(i, i + 2) === "--") {
      while (i < sql.length && sql[i] !== "\n") i++;
      current += "\n";
      continue;
    }
    if (!single && sql.slice(i, i + 2) === "$$") {
      dollar = !dollar;
      current += "$$";
      i++;
      continue;
    }
    const c = sql[i];
    if (!dollar && c === "'") {
      if (single && sql[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      single = !single;
    }
    if (c === ";" && !single && !dollar) {
      if (current.trim()) result.push(current.trim());
      current = "";
    } else current += c;
  }
  if (single || dollar) throw Error("SQL tidak lengkap");
  if (current.trim()) result.push(current.trim());
  return result;
}
export async function migrate(db) {
  const { createHash } = await import("node:crypto");
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS schema_migrations(id text PRIMARY KEY, sha256 text NOT NULL, applied_at bigint NOT NULL)",
    )
    .run();
  let changed = false;
  for (const file of (await readdir("migrations"))
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()) {
    const id = file.slice(0, -4),
      sql = await readFile("migrations/" + file, "utf8"),
      hash = createHash("sha256").update(sql).digest("hex");
    const applied = await db
      .prepare("SELECT sha256 FROM schema_migrations WHERE id=$1")
      .bind(id)
      .first();
    if (applied) {
      if (applied.sha256 !== hash)
        throw Error("Migrasi yang sudah diterapkan berubah: " + id);
      continue;
    }
    await db.batch([
      ...statements(sql).map((s) => db.prepare(s)),
      db
        .prepare("INSERT INTO schema_migrations VALUES($1,$2,$3)")
        .bind(id, hash, Date.now()),
    ]);
    changed = true;
  }
  return changed;
}
