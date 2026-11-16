import type { Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types";
import {
  idSchema,
  labelSchema,
  periodSchema,
  versionSchema,
  MAX_AMOUNT,
  other,
} from "../shared/domain";
import { fail, json } from "./http";
import { hash } from "./auth";
type C = Context<AppEnv>;
const configureSchema = z
  .object({
    id: idSchema,
    label: labelSchema,
    postingKind: z.enum(["external", "internal", "reserve"]),
    itemIds: z.array(idSchema).min(1).max(200),
    expectedVersion: versionSchema.optional(),
  })
  .strict()
  .refine((v) => new Set(v.itemIds).size === v.itemIds.length);
const operationSchema = z
  .object({
    operationId: idSchema,
    expectedVersion: versionSchema,
    expectedRevision: versionSchema,
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const d = new Date(value + "T12:00:00Z");
        return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === value;
      })
      .nullable(),
    evidenceDecision: z.enum(["keep", "history"]).optional(),
    items: z
      .array(
        z
          .object({
            id: idSchema,
            expectedVersion: versionSchema,
            selected: z.boolean(),
            amount: z.number().int().min(0).max(MAX_AMOUNT).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
export async function configure(c: C) {
  const v = await json(c, configureSchema, 64 * 1024);
  const owner = c.get("user").id;
  const existing =
    c.req.method === "PATCH"
      ? await c.env.DB.prepare(
          "SELECT period_id FROM allocation_groups WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL",
        )
          .bind(idSchema.parse(c.req.param("id")), owner)
          .first<{ period_id: string }>()
      : null;
  if (c.req.method === "PATCH" && (!existing || v.id !== c.req.param("id")))
    fail(404, "NOT_FOUND", "Kelompok tidak ditemukan.");
  const period = existing?.period_id ?? periodSchema.parse(c.req.param("id"));
  const result = await c.env.DB.prepare(
    "SELECT configure_allocation_group($1,$2,$3::jsonb,$4) AS id",
  )
    .bind(
      period,
      owner,
      JSON.stringify({
        ...v,
        recipientOwnerId: v.postingKind === "internal" ? other(owner) : null,
      }),
      Date.now(),
    )
    .first();
  return c.json({ id: result!.id });
}
export async function remove(c: C) {
  const id = idSchema.parse(c.req.param("id")),
    v = await json(c, z.object({ expectedVersion: versionSchema }).strict());
  await c.env.DB.prepare("SELECT remove_allocation_group($1,$2,$3,$4)")
    .bind(id, c.get("user").id, v.expectedVersion, Date.now())
    .run();
  return c.json({ ok: true });
}
export async function review(c: C) {
  const id = idSchema.parse(c.req.param("id"));
  const rows = await c.env.DB.batch([
    c.env.DB.prepare(
      "SELECT g.*,p.revision AS expected_revision FROM allocation_groups g JOIN periods p ON p.id=g.period_id WHERE g.id=$1 AND g.deleted_at IS NULL",
    ).bind(id),
    c.env.DB.prepare(
      "SELECT i.*,m.posted,m.position AS group_position,coalesce((SELECT sum(amount) FROM expenses WHERE item_id=i.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL),0)+coalesce((SELECT sum(amount) FROM transfers WHERE source_item_id=i.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL),0) AS related_total,(SELECT count(*)::int FROM expenses WHERE item_id=i.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL)+(SELECT count(*)::int FROM transfers WHERE source_item_id=i.id AND deleted_at IS NULL AND superseded_by_item_id IS NULL) AS related_count FROM allocation_group_items m JOIN budget_items i ON i.id=m.item_id WHERE m.group_id=$1 AND m.retired_at IS NULL ORDER BY m.position,i.id",
    ).bind(id),
    c.env.DB.prepare(
      "SELECT id,group_id,owner_id,content_type,byte_size,status,confirmed_group_version FROM group_attachments WHERE group_id=$1 AND status<>'deleting' ORDER BY created_at,id",
    ).bind(id),
  ]);
  if (!rows[0].results.length)
    fail(404, "NOT_FOUND", "Penyerahan tidak ditemukan.");
  return c.json({
    group: rows[0].results[0],
    items: rows[1].results,
    attachments: rows[2].results,
  });
}
export async function save(c: C) {
  const id = idSchema.parse(c.req.param("id")),
    v = await json(c, operationSchema, 64 * 1024),
    action = c.req.path.endsWith("/cancel") ? "cancel" : "commit";
  const payload = {
    ...v,
    items: [...v.items].sort((a, b) => a.id.localeCompare(b.id)),
    action,
  };
  const serialized = JSON.stringify(payload);
  const row = await c.env.DB.prepare(
    "SELECT apply_allocation_group($1,$2,$3::jsonb,$4,$5) AS receipt",
  )
    .bind(
      id,
      c.get("user").id,
      serialized,
      await hash(new TextEncoder().encode(serialized)),
      Date.now(),
    )
    .first<{ receipt: string }>();
  return c.json({ receipt: JSON.parse(row!.receipt) });
}
