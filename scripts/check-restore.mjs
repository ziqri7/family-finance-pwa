import { runtime, loadConfig } from "./neon-runtime.mjs";
import { restoreBackup } from "./neon-backup.mjs";
if (!process.argv[2])
  throw Error(
    "Berikan folder backup dan FINANCEE_ENV untuk cabang tujuan kosong.",
  );
const config = loadConfig(),
  { Database, EvidenceStorage } = await runtime();
console.log(
  "Pemulihan database dan gambar terverifikasi:",
  await restoreBackup(
    new Database(config.DATABASE_URL),
    new EvidenceStorage(config),
    process.argv[2],
    config.PASSWORD_PEPPER,
  ),
);
console.log(
  "Hash dan versi sandi dipulihkan; sesi tidak disalin. Identitas dan kunci pelindung berasal dari secret tujuan.",
);
