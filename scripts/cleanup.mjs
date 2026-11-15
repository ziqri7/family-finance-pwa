import { runtime, loadConfig } from "./neon-runtime.mjs";
import { cleanupQueries } from "./cleanup-query.mjs";
const config = loadConfig(),
  { Database, EvidenceStorage } = await runtime(),
  db = new Database(config.DATABASE_URL),
  storage = new EvidenceStorage(config),
  apply = process.argv.includes("--apply"),
  query = cleanupQueries(Date.now(), apply);
const incomeQuery = {
  mark: query.mark?.replaceAll("attachments", "income_attachments"),
  select: query.select.replaceAll("attachments", "income_attachments"),
};
const rows = await db.batch([
    ...(query.mark ? [db.prepare(query.mark)] : []),
    ...(incomeQuery.mark ? [db.prepare(incomeQuery.mark)] : []),
    db.prepare(query.select),
    db.prepare(incomeQuery.select),
  ]),
  files = [...rows.at(-2).results, ...rows.at(-1).results];
console.log("Bukti kedaluwarsa/deleting:", files.length);
if (apply) {
  for (const f of files) await storage.delete(f.object_key);
  console.log("Objek dibersihkan, metadata deleting dipertahankan.");
} else console.log("Periksa saja; --apply untuk membersihkan.");
