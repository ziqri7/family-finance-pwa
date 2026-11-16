import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { runtime, loadConfig, migrate } from "./neon-runtime.mjs";
export async function seed(db) {
  const template = JSON.parse(
    await readFile(
      existsSync("private/template.json")
        ? "private/template.json"
        : "data/template.json",
      "utf8",
    ),
  );
  const rows = [];
  for (const owner of ["partner-a", "partner-b"]) {
    if (
      !Array.isArray(template[owner]) ||
      !template[owner].length ||
      template[owner].length > 200
    )
      throw Error("Template tidak valid.");
    for (const [i, r] of template[owner].entries()) {
      if (
        typeof r.label !== "string" ||
        !r.label.trim() ||
        r.label.length > 100 ||
        !["income", "allocation", "transfer_out"].includes(r.kind) ||
        (r.posting_kind != null &&
          !["external", "internal", "reserve"].includes(r.posting_kind)) ||
        (r.kind === "income" && r.posting_kind != null)
      )
        throw Error("Pos template tidak valid.");
      rows.push(
        db
          .prepare(
            "INSERT INTO default_items(id,owner_id,label,kind,position,posting_kind) VALUES($1,$2,$3,$4,$5,$6)",
          )
          .bind(
            (owner === "partner-a" ? "a" : "b") +
              i.toString(16).padStart(31, "0"),
            owner,
            r.label.trim(),
            r.kind,
            i,
            r.posting_kind ?? (r.kind === "transfer_out" ? "internal" : null),
          ),
      );
    }
  }
  if (
    Number(
      (await db.prepare("SELECT count(*) AS n FROM default_items").first()).n,
    )
  )
    return false;
  await db.batch([
    db.prepare(
      "DO $$ BEGIN IF EXISTS(SELECT 1 FROM default_items) THEN RAISE EXCEPTION 'TEMPLATE_ALREADY_PRESENT'; END IF; END $$",
    ),
    ...rows,
  ]);
  return true;
}
if (process.argv[1]?.endsWith("seed-template.mjs")) {
  const config = loadConfig(),
    { Database } = await runtime(),
    db = new Database(config.DATABASE_URL);
  await migrate(db);
  console.log(
    (await seed(db))
      ? "Template tanpa nominal disiapkan."
      : "Template sudah ada, dipertahankan.",
  );
}
