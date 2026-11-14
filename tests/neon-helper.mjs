import { runtime, loadConfig, migrate } from "../scripts/neon-runtime.mjs";
export const config = loadConfig(
  process.env.FINANCEE_TEST_ENV || ".env.neon-test",
);
if (process.env.FINANCEE_TEST !== "1" || config.NEON_BRANCH !== "financee-test")
  throw Error(
    "Tes integrasi memerlukan FINANCEE_TEST=1 dan cabang financee-test terpisah.",
  );
const { Database, EvidenceStorage } = await runtime();
export const db = new Database(config.DATABASE_URL),
  bucket = new EvidenceStorage(config);
export async function reset() {
  await migrate(db);
  for (const f of (await db.prepare("SELECT object_key FROM attachments").all())
    .results)
    await bucket.delete(f.object_key);
  await db
    .prepare(
      "TRUNCATE attachments,transfers,expenses,budget_items,budgets,periods,default_items,sessions,login_attempts",
    )
    .run();
}
