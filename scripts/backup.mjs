import { runtime, loadConfig } from "./neon-runtime.mjs";
import { createBackup } from "./neon-backup.mjs";
const config = loadConfig(),
  { Database, EvidenceStorage } = await runtime();
console.log(
  "Backup privat lengkap:",
  await createBackup(
    new Database(config.DATABASE_URL),
    new EvidenceStorage(config),
  ),
);
