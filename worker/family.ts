import type { Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types";
import { fail, json } from "./http";
import { rowId, periodId } from "./finance";
import {
  idSchema,
  labelSchema,
  versionSchema,
  newPeriodSchema,
  editItemSchema,
  deleteSchema,
  expenseSchema,
  expenseEditSchema,
  dateSchema,
} from "../shared/domain";
type C = Context<AppEnv>;
async function call(c: C, name: string, args: unknown[]) {
  const row = await c.env.DB.prepare(
    `SELECT ${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) AS result`,
  )
    .bind(...args)
    .first<{ result: unknown }>();
  return row!.result;
}
export async function snapshot(c: C) {
  const id = periodId(c),
    db = c.env.DB;
  const result = await db.batch([
    db.prepare("SELECT * FROM periods WHERE id=$1").bind(id),
    db.prepare("SELECT owner_id FROM budgets WHERE period_id=$1").bind(id),
    db
      .prepare(
        "SELECT * FROM budget_items WHERE period_id=$1 ORDER BY position,id",
      )
      .bind(id),
    db
      .prepare(
        "SELECT * FROM expenses WHERE period_id=$1 AND deleted_at IS NULL ORDER BY id",
      )
      .bind(id),
    db
      .prepare(
        "SELECT * FROM transfers WHERE period_id=$1 AND deleted_at IS NULL ORDER BY id",
      )
      .bind(id),
    db
      .prepare(
        "SELECT * FROM allocation_groups WHERE period_id=$1 AND deleted_at IS NULL ORDER BY created_at,id",
      )
      .bind(id),
    db
      .prepare(
        "SELECT m.* FROM allocation_group_items m JOIN allocation_groups g ON g.id=m.group_id WHERE g.period_id=$1 AND g.deleted_at IS NULL AND m.retired_at IS NULL ORDER BY m.position,m.item_id",
      )
      .bind(id),
    db
      .prepare(
        "SELECT * FROM usage_entries WHERE period_id=$1 ORDER BY occurred_on,created_at,id",
      )
      .bind(id),
    db
      .prepare(
        `SELECT a.id,a.expense_id,NULL::text AS income_item_id,NULL::text AS allocation_item_id,NULL::text AS group_id,NULL::text AS usage_entry_id,a.owner_id,a.content_type,a.byte_size,a.status,NULL::integer AS confirmed_group_version FROM attachments a JOIN expenses e ON e.id=a.expense_id WHERE e.period_id=$1 AND a.status<>'deleting'
      UNION ALL SELECT a.id,NULL,a.income_item_id,NULL,NULL,NULL,a.owner_id,a.content_type,a.byte_size,a.status,NULL FROM income_attachments a JOIN budget_items i ON i.id=a.income_item_id WHERE i.period_id=$1 AND a.status<>'deleting'
      UNION ALL SELECT a.id,NULL,NULL,a.allocation_item_id,NULL,NULL,a.owner_id,a.content_type,a.byte_size,a.status,NULL FROM allocation_attachments a JOIN budget_items i ON i.id=a.allocation_item_id WHERE i.period_id=$1 AND a.status<>'deleting'
      UNION ALL SELECT a.id,NULL,NULL,NULL,a.group_id,NULL,a.owner_id,a.content_type,a.byte_size,a.status,a.confirmed_group_version FROM group_attachments a JOIN allocation_groups g ON g.id=a.group_id WHERE g.period_id=$1 AND g.deleted_at IS NULL AND a.status<>'deleting'
      UNION ALL SELECT a.id,NULL,NULL,NULL,NULL,a.usage_entry_id,a.owner_id,a.content_type,a.byte_size,a.status,NULL FROM usage_attachments a JOIN usage_entries u ON u.id=a.usage_entry_id WHERE u.period_id=$1 AND u.deleted_at IS NULL AND a.status<>'deleting'`,
      )
      .bind(id),
  ]);
  const p = result[0].results[0];
  if (!p) fail(404, "PERIOD_NOT_FOUND", "Bulan belum dibuat.");
  if (c.req.query("revision") === String(p.revision))
    return c.json({ unchanged: true, revision: p.revision });
  return c.json({
    id,
    revision: p.revision,
    budgets: result[1].results,
    items: result[2].results,
    expenses: result[3].results,
    transfers: result[4].results,
    groups: result[5].results,
    groupItems: result[6].results,
    usages: result[7].results,
    attachments: result[8].results,
  });
}
export async function createPeriod(c: C) {
  const input = await json(c, newPeriodSchema);
  await call(c, "family_create_period", [
    c.get("user").id,
    JSON.stringify(input),
    Date.now(),
  ]);
  return c.json({ id: input.id }, 201);
}
export async function createItem(c: C) {
  const input = await json(
    c,
    z
      .object({
        id: idSchema,
        label: labelSchema,
        kind: z.enum(["income", "allocation"]),
        trackingEnabled: z.boolean().default(false),
      })
      .strict(),
  );
  if (input.kind === "income" && input.trackingEnabled)
    fail(400, "INVALID_INPUT", "Pelacakan hanya untuk alokasi.");
  const item = await call(c, "family_create_item", [
    c.get("user").id,
    periodId(c),
    JSON.stringify({
      ...input,
      trackingEnabled: Number(input.trackingEnabled),
    }),
    Date.now(),
  ]);
  return c.json({ item }, 201);
}
export async function editItem(c: C) {
  const input = await json(
    c,
    z.union([
      editItemSchema,
      z
        .object({
          field: z.literal("date"),
          value: dateSchema.nullable(),
          expectedVersion: versionSchema,
        })
        .strict(),
    ]),
  );
  const item = await call(c, "family_item_write", [
    c.get("user").id,
    rowId(c),
    JSON.stringify(input),
    Date.now(),
  ]);
  return c.json({ item });
}
export async function tracking(c: C) {
  const input = await json(
    c,
    z.object({ enabled: z.boolean(), expectedVersion: versionSchema }).strict(),
  );
  const item = await call(c, "family_item_write", [
    c.get("user").id,
    rowId(c),
    JSON.stringify({
      field: "tracking",
      value: Number(input.enabled),
      expectedVersion: input.expectedVersion,
    }),
    Date.now(),
  ]);
  return c.json({ item });
}
export async function deleteItem(c: C) {
  const input = await json(c, deleteSchema);
  await call(c, "family_item_write", [
    c.get("user").id,
    rowId(c),
    JSON.stringify({ ...input, action: "delete" }),
    Date.now(),
  ]);
  return c.json({ ok: true });
}
export async function createUsage(c: C) {
  const input = await json(c, expenseSchema);
  const usage = await call(c, "family_usage_write", [
    c.get("user").id,
    input.id,
    JSON.stringify(input),
    Date.now(),
  ]);
  return c.json({ usage }, 201);
}
export async function editUsage(c: C) {
  const input = await json(c, expenseEditSchema);
  const usage = await call(c, "family_usage_write", [
    c.get("user").id,
    rowId(c),
    JSON.stringify(input),
    Date.now(),
  ]);
  return c.json({ usage });
}
export async function deleteUsage(c: C) {
  const input = await json(c, deleteSchema);
  await call(c, "family_usage_write", [
    c.get("user").id,
    rowId(c),
    JSON.stringify({ ...input, action: "delete" }),
    Date.now(),
  ]);
  return c.json({ ok: true });
}
const member = z
  .object({ id: idSchema, expectedVersion: versionSchema })
  .strict();
export async function reviewItems(c: C) {
  const input = await json(
    c,
    z
      .object({
        expectedRevision: versionSchema,
        items: z.array(member).min(1).max(400),
        confirmed: z.literal(true),
      })
      .strict(),
    64 * 1024,
  );
  if (new Set(input.items.map((i) => i.id)).size !== input.items.length)
    fail(400, "INVALID_INPUT", "Pos terpilih berulang.");
  await call(c, "review_family_items", [
    periodId(c),
    c.get("user").id,
    JSON.stringify(input),
    Date.now(),
  ]);
  return c.json({ ok: true });
}
export async function saveBundle(c: C) {
  const input = await json(
    c,
    z
      .object({
        id: idSchema,
        label: labelSchema,
        items: z.array(member).min(1).max(400),
        expectedVersion: versionSchema.optional(),
      })
      .strict(),
    64 * 1024,
  );
  if (new Set(input.items.map((i) => i.id)).size !== input.items.length)
    fail(400, "INVALID_INPUT", "Pos terpilih berulang.");
  const group = await call(c, "family_evidence_write", [
    c.get("user").id,
    periodId(c),
    JSON.stringify(input),
    Date.now(),
  ]);
  return c.json({ group }, 201);
}
export async function deleteBundle(c: C) {
  const input = await json(c, deleteSchema),
    id = rowId(c);
  const group = await c.env.DB.prepare(
    "SELECT period_id FROM allocation_groups WHERE id=$1 AND owner_id=$2",
  )
    .bind(id, c.get("user").id)
    .first<{ period_id: string }>();
  if (!group) fail(404, "NOT_FOUND", "Bukti tidak ditemukan.");
  await call(c, "family_evidence_write", [
    c.get("user").id,
    group.period_id,
    JSON.stringify({ ...input, id, action: "delete" }),
    Date.now(),
  ]);
  return c.json({ ok: true });
}
export async function convertExtra(c: C) {
  const input = await json(
    c,
    z
      .object({
        source: z.enum(["expense", "transfer"]),
        mode: z.enum(["allocation", "usage"]),
        label: labelSchema,
        itemId: idSchema.optional(),
        expectedVersion: versionSchema,
        confirmed: z.literal(true),
      })
      .strict(),
  );
  if (input.mode === "usage" && !input.itemId)
    fail(400, "INVALID_INPUT", "Pilih pos pelacakan.");
  const id = await call(c, "convert_family_extra", [
    c.get("user").id,
    rowId(c),
    JSON.stringify(input),
    Date.now(),
  ]);
  return c.json({ id });
}
