import { runtime, loadConfig, migrate } from "../scripts/neon-runtime.mjs";
import { initializeCredentials } from "../scripts/initialize-credentials.mjs";
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
export async function reset(users) {
  await migrate(db);
  for (const f of (
    await db
      .prepare(
        "SELECT object_key FROM attachments UNION ALL SELECT object_key FROM income_attachments UNION ALL SELECT object_key FROM allocation_attachments",
      )
      .all()
  ).results)
    await bucket.delete(f.object_key);
  await db
    .prepare(
      "TRUNCATE allocation_attachments,income_attachments,attachments,transfers,expenses,budget_items,budgets,periods,default_items,sessions,login_attempts,account_credentials",
    )
    .run();
  if (users) await initializeCredentials(db, users);
}
