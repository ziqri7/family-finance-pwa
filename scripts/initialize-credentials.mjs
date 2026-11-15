import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { runtime, loadConfig, migrate } from "./neon-runtime.mjs";
export async function initializeCredentials(db, users) {
  if (
    !Array.isArray(users) ||
    users.length !== 2 ||
    new Set(users.map((u) => u.id)).size !== 2
  )
    throw Error("Two bootstrap accounts required");
  for (const u of users)
    if (
      !["partner-a", "partner-b"].includes(u.id) ||
      !/^[a-f0-9]{64}$/.test(u.hash) ||
      !/^[a-f0-9]{32}$/.test(u.salt) ||
      u.iterations !== 100000
    )
      throw Error("Invalid bootstrap account");
  await db.batch(
    users.map((u) =>
      db
        .prepare(
          "INSERT INTO account_credentials(account_id,scheme,hash,salt,iterations,version,updated_at) VALUES($1,'legacy_pbkdf2',$2,$3,100000,1,$4) ON CONFLICT(account_id) DO NOTHING",
        )
        .bind(u.id, u.hash, u.salt, Date.now()),
    ),
  );
}
if (process.argv[1]?.endsWith("initialize-credentials.mjs")) {
  const file = process.env.FINANCEE_ENV || ".dev.vars",
    values = parseEnv(await readFile(file, "utf8")),
    c = loadConfig(file),
    { Database } = await runtime(),
    db = new Database(c.DATABASE_URL);
  await migrate(db);
  await initializeCredentials(db, JSON.parse(values.AUTH_USERS_JSON));
  console.log(
    "Credential bootstrap initialized; existing passwords never overwritten.",
  );
}
