import { runtime, loadConfig, migrate } from "./neon-runtime.mjs";
const config = loadConfig(),
  { Database } = await runtime();
console.log(
  (await migrate(new Database(config.DATABASE_URL)))
    ? "Migrasi PostgreSQL diterapkan."
    : "Migrasi sudah sesuai; tidak ada perubahan.",
);
