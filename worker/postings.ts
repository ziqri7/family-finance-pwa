import type { Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types";
import { rowId } from "./finance";
import { json, fail } from "./http";
import { amountSchema, versionSchema } from "../shared/domain";
type C = Context<AppEnv>;
export async function review(c: C) {
  const id = rowId(c),
    rows = await c.env.DB.batch([
      c.env.DB.prepare(
        "SELECT i.*,p.revision AS period_revision FROM budget_items i JOIN periods p ON p.id=i.period_id WHERE i.id=$1 AND i.owner_id=$2 AND i.deleted_at IS NULL",
      ).bind(id, c.get("user").id),
      c.env.DB.prepare(
        "SELECT id,amount,version,superseded_by_item_id,deleted_at FROM expenses WHERE item_id=$1 AND owner_id=$2 ORDER BY id",
      ).bind(id, c.get("user").id),
      c.env.DB.prepare(
        "SELECT id,amount,version,superseded_by_item_id,deleted_at FROM transfers WHERE source_item_id=$1 AND from_owner_id=$2 ORDER BY id",
      ).bind(id, c.get("user").id),
      c.env.DB.prepare(
        "SELECT count(*)::int AS n FROM attachments WHERE status='ready' AND expense_id IN (SELECT id FROM expenses WHERE item_id=$1 AND owner_id=$2 AND deleted_at IS NULL)",
      ).bind(id, c.get("user").id),
    ]);
  const item = rows[0].results[0];
  if (!item || item.kind === "income")
    fail(404, "NOT_FOUND", "Pos alokasi tidak ditemukan.");
  const expenses = rows[1].results,
    transfers = rows[2].results,
    active = [...expenses, ...transfers].filter(
      (r) => r.deleted_at === null && r.superseded_by_item_id === null,
    );
  return c.json({
    item,
    expenses,
    transfers,
    relatedTotal: active.reduce((s, r) => s + Number(r.amount), 0),
    relatedCount: active.length,
    expectedRevision: item.period_revision,
    relatedEvidenceCount: Number(rows[3].results[0]?.n ?? 0),
  });
}
const schema = z
  .object({
    expectedVersion: versionSchema,
    expectedRevision: versionSchema,
    postingKind: z.enum(["external", "internal", "reserve"]),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    amount: amountSchema,
    confirmed: z.literal(true),
  })
  .strict();
export async function save(c: C) {
  const id = rowId(c),
    v = await json(c, schema),
    owner = c.get("user").id,
    now = Date.now();
  const current = await c.env.DB.prepare(
    "SELECT * FROM budget_items WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL AND kind<>'income'",
  )
    .bind(id, owner)
    .first();
  if (!current) fail(404, "NOT_FOUND", "Pos alokasi tidak ditemukan.");
  if (v.date) {
    const date = new Date(v.date + "T12:00:00Z");
    if (
      Number.isNaN(+date) ||
      date.toISOString().slice(0, 10) !== v.date ||
      v.date.slice(0, 7) !== current.period_id
    )
      fail(
        400,
        "INVALID_DATE",
        "Tanggal harus valid dan berada pada bulan pos.",
      );
  }
  if (
    current.recording_mode === "actual" &&
    current.amount === v.amount &&
    current.posting_kind === v.postingKind &&
    current.posting_date === v.date
  )
    return c.json({ item: current });
  if (current.recording_mode === "actual" && current.amount !== v.amount)
    fail(400, "USE_AMOUNT_FIELD", "Koreksi nominal melalui kolom Alokasi.");
  const result = await c.env.DB.prepare(
    `WITH changed AS (
 UPDATE budget_items SET recording_mode='actual',posting_kind=$1,posting_date=$2,amount=$3,posting_version=posting_version+1,amount_version=amount_version+1,row_version=row_version+1,updated_at=$4
 WHERE id=$5 AND owner_id=$6 AND deleted_at IS NULL AND row_version=$7 AND kind<>'income' AND EXISTS(SELECT 1 FROM periods WHERE id=period_id AND revision=$8) RETURNING *,recording_mode AS saved_mode
), old_expenses AS (
 UPDATE expenses SET superseded_by_item_id=$5,superseded_at=$4,updated_at=$4,version=version+1 WHERE item_id=$5 AND deleted_at IS NULL AND superseded_by_item_id IS NULL AND $9='legacy' AND EXISTS(SELECT 1 FROM changed) RETURNING id
),old_transfers AS (
 UPDATE transfers SET superseded_by_item_id=$5,superseded_at=$4,version=version+1 WHERE source_item_id=$5 AND deleted_at IS NULL AND superseded_by_item_id IS NULL AND $9='legacy' AND EXISTS(SELECT 1 FROM changed) RETURNING id
) SELECT * FROM changed`,
  )
    .bind(
      v.postingKind,
      v.date,
      v.amount,
      now,
      id,
      owner,
      v.expectedVersion,
      v.expectedRevision,
      current.recording_mode,
    )
    .first();
  if (!result)
    fail(
      409,
      "REVIEW_CHANGED",
      "Pos atau catatan terkait berubah. Tinjau ulang sebelum menyimpan.",
    );
  return c.json({ item: result });
}
