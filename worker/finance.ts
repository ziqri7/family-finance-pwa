import type { Context } from "hono";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull, asc, sql } from "drizzle-orm";
import * as schema from "./db/schema";
import type { AppEnv } from "./types";
import { fail, json } from "./http";
import {
  idSchema,
  periodSchema,
  newPeriodSchema,
  newItemSchema,
  editItemSchema,
  deleteSchema,
  expenseSchema,
  expenseEditSchema,
  transferSchema,
  other,
  type Item,
  type Expense,
  type Transfer,
  type Owner,
} from "../shared/domain";
type C = Context<AppEnv>;
export const rowId = (c: C) => idSchema.parse(c.req.param("id"));
export const periodId = (c: C) => periodSchema.parse(c.req.param("id"));
export async function owned<T extends { owner_id: Owner }>(
  c: C,
  table:
    | "budget_items"
    | "expenses"
    | "attachments"
    | "income_attachments"
    | "allocation_attachments",
  id: string,
) {
  const row = await c.env.DB.prepare(
    `SELECT * FROM ${table} WHERE id=$1 AND owner_id=$2`,
  )
    .bind(id, c.get("user").id)
    .first<T>();
  if (!row)
    fail(404, "NOT_FOUND", "Catatan tidak ditemukan atau bukan milik Anda.");
  return row;
}
export async function snapshot(c: C) {
  const id = periodId(c),
    db = drizzle(c.env.DB.client);
  const [
    ,
    period,
    budgets,
    items,
    expenses,
    transfers,
    attachments,
    incomeFiles,
    allocationFiles,
  ] = await db.batch([
    db.execute(sql`SELECT pg_advisory_xact_lock(61324017)`),
    db.select().from(schema.periods).where(eq(schema.periods.id, id)),
    db
      .select({ owner_id: schema.budgets.owner_id })
      .from(schema.budgets)
      .where(eq(schema.budgets.period_id, id)),
    db
      .select()
      .from(schema.budgetItems)
      .where(
        and(
          eq(schema.budgetItems.period_id, id),
          isNull(schema.budgetItems.deleted_at),
        ),
      )
      .orderBy(asc(schema.budgetItems.position), asc(schema.budgetItems.id)),
    db
      .select()
      .from(schema.expenses)
      .where(
        and(
          eq(schema.expenses.period_id, id),
          isNull(schema.expenses.deleted_at),
        ),
      ),
    db
      .select()
      .from(schema.transfers)
      .where(
        and(
          eq(schema.transfers.period_id, id),
          isNull(schema.transfers.deleted_at),
        ),
      ),
    db
      .select({
        id: schema.attachments.id,
        expense_id: schema.attachments.expense_id,
        owner_id: schema.attachments.owner_id,
        content_type: schema.attachments.content_type,
        byte_size: schema.attachments.byte_size,
        status: schema.attachments.status,
      })
      .from(schema.attachments)
      .innerJoin(
        schema.expenses,
        eq(schema.attachments.expense_id, schema.expenses.id),
      )
      .where(
        and(
          eq(schema.expenses.period_id, id),
          isNull(schema.expenses.deleted_at),
        ),
      ),
    db
      .select({
        id: schema.incomeAttachments.id,
        expense_id: sql<null>`NULL`,
        income_item_id: schema.incomeAttachments.income_item_id,
        owner_id: schema.incomeAttachments.owner_id,
        content_type: schema.incomeAttachments.content_type,
        byte_size: schema.incomeAttachments.byte_size,
        status: schema.incomeAttachments.status,
      })
      .from(schema.incomeAttachments)
      .innerJoin(
        schema.budgetItems,
        eq(schema.incomeAttachments.income_item_id, schema.budgetItems.id),
      )
      .where(
        and(
          eq(schema.budgetItems.period_id, id),
          isNull(schema.budgetItems.deleted_at),
        ),
      ),
    db
      .select({
        id: schema.allocationAttachments.id,
        expense_id: sql<null>`NULL`,
        allocation_item_id: schema.allocationAttachments.allocation_item_id,
        owner_id: schema.allocationAttachments.owner_id,
        content_type: schema.allocationAttachments.content_type,
        byte_size: schema.allocationAttachments.byte_size,
        status: schema.allocationAttachments.status,
      })
      .from(schema.allocationAttachments)
      .innerJoin(
        schema.budgetItems,
        eq(
          schema.allocationAttachments.allocation_item_id,
          schema.budgetItems.id,
        ),
      )
      .where(
        and(
          eq(schema.budgetItems.period_id, id),
          isNull(schema.budgetItems.deleted_at),
        ),
      ),
  ]);
  if (!period[0]) fail(404, "PERIOD_NOT_FOUND", "Bulan belum dibuat.");
  if (c.req.query("revision") === String(period[0].revision))
    return c.json({ unchanged: true, revision: period[0].revision });
  return c.json({
    id,
    revision: period[0].revision,
    budgets,
    items,
    expenses,
    transfers,
    attachments: [
      ...allocationFiles.filter((a) => a.status !== "deleting"),
      ...attachments.filter((a) => a.status !== "deleting"),
      ...incomeFiles.filter((a) => a.status !== "deleting"),
    ],
  });
}
export async function listPeriods(c: C) {
  const rows = await c.env.DB.prepare(
    "SELECT id,revision,(SELECT string_agg(owner_id,',' ORDER BY owner_id) FROM budgets WHERE period_id=periods.id) AS owners FROM periods ORDER BY id DESC",
  ).all<{ id: string; revision: number; owners: string }>();
  return c.json({
    periods: rows.results.map((r) => ({
      ...r,
      owners: r.owners?.split(",") || [],
    })),
  });
}
export async function createPeriod(c: C) {
  const input = await json(c, newPeriodSchema),
    owner = c.get("user").id,
    now = Date.now(),
    db = c.env.DB;
  const condition = (offset: number) =>
    input.mode === "copy"
      ? `EXISTS(SELECT 1 FROM budgets WHERE period_id=$${offset + 1} AND owner_id=$${offset + 2})`
      : `EXISTS(SELECT 1 FROM default_items WHERE owner_id=$${offset + 1})`;
  const args = input.mode === "copy" ? [input.sourcePeriodId!, owner] : [owner];
  const result = await db.batch([
    db
      .prepare(
        `INSERT INTO periods(id,created_at) SELECT $1,$2 WHERE ${condition(2)} ON CONFLICT(id) DO NOTHING`,
      )
      .bind(input.id, now, ...args),
    db
      .prepare(
        `INSERT INTO budgets(period_id,owner_id,created_at) SELECT $1,$2,$3 WHERE ${condition(3)}`,
      )
      .bind(input.id, owner, now, ...args),
    input.mode === "copy"
      ? db
          .prepare(
            "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,created_at,updated_at,recording_mode,posting_kind) SELECT replace(gen_random_uuid()::text,'-',''),$1,$2,label,kind,NULL,position,$3,$4,CASE WHEN kind='income' THEN 'legacy' ELSE 'actual' END,posting_kind FROM budget_items WHERE period_id=$5 AND owner_id=$6 AND deleted_at IS NULL",
          )
          .bind(input.id, owner, now, now, input.sourcePeriodId!, owner)
      : db
          .prepare(
            "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,created_at,updated_at,recording_mode,posting_kind) SELECT replace(gen_random_uuid()::text,'-',''),$1,$2,label,kind,NULL,position,$3,$4,CASE WHEN kind='income' THEN 'legacy' ELSE 'actual' END,posting_kind FROM default_items WHERE owner_id=$5",
          )
          .bind(input.id, owner, now, now, owner),
  ]);
  if (!result[1].meta.changes)
    fail(
      409,
      "SOURCE_UNAVAILABLE",
      "Bulan sumber atau pos bawaan belum tersedia.",
    );
  return c.json({ id: input.id }, 201);
}
export async function createItem(c: C) {
  const period = periodId(c),
    v = await json(c, newItemSchema),
    owner = c.get("user").id,
    now = Date.now();
  const existing = await c.env.DB.prepare(
    "SELECT * FROM budget_items WHERE id=$1",
  )
    .bind(v.id)
    .first<Item>();
  if (existing) {
    if (existing.owner_id !== owner)
      fail(404, "NOT_FOUND", "Pos tidak ditemukan.");
    if (
      existing.deleted_at ||
      existing.period_id !== period ||
      existing.kind !== v.kind ||
      (v.postingKind !== undefined &&
        existing.posting_kind !== v.postingKind) ||
      existing.label !== v.label
    )
      fail(409, "ID_CONFLICT", "Permintaan tambah pos berbeda.");
    return c.json({ item: existing });
  }
  if (
    !(await c.env.DB.prepare(
      "SELECT 1 FROM budgets WHERE period_id=$1 AND owner_id=$2",
    )
      .bind(period, owner)
      .first())
  )
    fail(404, "BUDGET_NOT_FOUND", "Buat anggaran Anda dahulu.");
  const item = await c.env.DB.prepare(
    "INSERT INTO budget_items(id,period_id,owner_id,label,kind,position,created_at,updated_at,recording_mode,posting_kind) VALUES($1,$2,$3,$4,$5,(SELECT coalesce(max(position),-1)+1 FROM budget_items WHERE period_id=$6 AND owner_id=$7 AND kind=$8),$9,$10,CASE WHEN $5='income' THEN 'legacy' ELSE 'actual' END,$11) RETURNING *",
  )
    .bind(
      v.id,
      period,
      owner,
      v.label,
      v.kind,
      period,
      owner,
      v.kind,
      now,
      now,
      v.kind === "income" ? null : (v.postingKind ?? null),
    )
    .first<Item>();
  return c.json({ item }, 201);
}
export async function editItem(c: C) {
  const id = rowId(c),
    v = await json(c, editItemSchema),
    row = await owned<Item>(c, "budget_items", id);
  if (row.deleted_at)
    fail(409, "ITEM_DELETED", "Pos telah dihapus di perangkat lain.");
  if (row[v.field] === v.value) return c.json({ item: row });
  if (
    v.field === "amount" &&
    row.recording_mode === "actual" &&
    v.value !== null &&
    !row.posting_kind
  )
    fail(
      400,
      "CHOOSE_POSTING_KIND",
      "Pilih jenis pembagian pada pos ini dahulu.",
    );
  const column = v.field === "label" ? "label" : "amount",
    version = column === "label" ? "label_version" : "amount_version";
  const item = await c.env.DB.prepare(
    `UPDATE budget_items SET ${column}=$1,${version}=${version}+1,row_version=row_version+1,updated_at=$2 WHERE id=$3 AND owner_id=$4 AND deleted_at IS NULL AND ${version}=$5 AND ($6::boolean OR $7::boolean OR NOT EXISTS(SELECT 1 FROM allocation_attachments WHERE allocation_item_id=$3 AND status IN ('ready','pending'))) RETURNING *`,
  )
    .bind(
      v.value,
      Date.now(),
      id,
      c.get("user").id,
      v.expectedVersion,
      v.field !== "amount" || v.value !== null,
      v.field === "amount" && v.confirmCancel === true,
    )
    .first<Item>();
  if (!item)
    return c.json(
      {
        error: {
          code: "FIELD_CONFLICT",
          message: "Nilai berubah di perangkat lain.",
        },
        current: await owned<Item>(c, "budget_items", id),
      },
      409,
    );
  return c.json({ item });
}
export async function deleteItem(c: C) {
  const id = rowId(c),
    v = await json(c, deleteSchema),
    row = await owned<Item>(c, "budget_items", id);
  if (row.deleted_at) return c.json({ ok: true });
  const result = await c.env.DB.prepare(
    "UPDATE budget_items SET deleted_at=$1,updated_at=$2,row_version=row_version+1 WHERE id=$3 AND owner_id=$4 AND row_version=$5 AND deleted_at IS NULL",
  )
    .bind(Date.now(), Date.now(), id, c.get("user").id, v.expectedVersion)
    .run();
  if (!result.meta.changes)
    fail(409, "ROW_CONFLICT", "Pos telah berubah. Tinjau sebelum menghapus.");
  return c.json({ ok: true });
}
async function allocation(c: C, id: string, date: string) {
  const row = await owned<Item>(c, "budget_items", id);
  if (
    row.deleted_at ||
    row.kind !== "allocation" ||
    row.period_id !== date.slice(0, 7)
  )
    fail(
      400,
      "INVALID_EXPENSE_ITEM",
      "Pilih pos alokasi Anda pada bulan tanggal tersebut.",
    );
  return row;
}
export async function createExpense(c: C) {
  const v = await json(c, expenseSchema),
    owner = c.get("user").id,
    row = await allocation(c, v.itemId, v.date),
    now = Date.now();
  const existing = await c.env.DB.prepare("SELECT * FROM expenses WHERE id=$1")
    .bind(v.id)
    .first<Expense>();
  if (existing) {
    if (existing.owner_id !== owner)
      fail(404, "NOT_FOUND", "Catatan tidak ditemukan.");
    if (
      existing.deleted_at ||
      existing.item_id !== v.itemId ||
      existing.occurred_on !== v.date ||
      existing.note !== v.note ||
      existing.amount !== v.amount
    )
      fail(409, "ID_CONFLICT", "Permintaan catatan berbeda.");
    return c.json({ expense: existing });
  }
  const expense = await c.env.DB.prepare(
    "INSERT INTO expenses(id,period_id,owner_id,item_id,occurred_on,note,amount,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
  )
    .bind(
      v.id,
      row.period_id,
      owner,
      v.itemId,
      v.date,
      v.note,
      v.amount,
      now,
      now,
    )
    .first<Expense>();
  return c.json({ expense }, 201);
}
export async function editExpense(c: C) {
  const id = rowId(c),
    v = await json(c, expenseEditSchema),
    row = await owned<Expense>(c, "expenses", id);
  if (row.deleted_at)
    fail(409, "EXPENSE_DELETED", "Pengeluaran sudah dihapus.");
  if (row.superseded_by_item_id)
    fail(
      409,
      "HISTORY_LOCKED",
      "Catatan ini sudah terwakili Alokasi. Koreksi melalui pos sumber.",
    );
  await allocation(c, v.itemId, v.date);
  if (v.date.slice(0, 7) !== row.period_id)
    fail(400, "WRONG_PERIOD", "Tanggal harus berada pada bulan catatan.");
  if (
    row.item_id === v.itemId &&
    row.occurred_on === v.date &&
    row.note === v.note &&
    row.amount === v.amount
  )
    return c.json({ expense: row });
  const expense = await c.env.DB.prepare(
    "UPDATE expenses SET item_id=$1,occurred_on=$2,note=$3,amount=$4,updated_at=$5,version=version+1 WHERE id=$6 AND owner_id=$7 AND version=$8 AND deleted_at IS NULL RETURNING *",
  )
    .bind(
      v.itemId,
      v.date,
      v.note,
      v.amount,
      Date.now(),
      id,
      c.get("user").id,
      v.expectedVersion,
    )
    .first<Expense>();
  if (!expense)
    return c.json(
      {
        error: {
          code: "RECORD_CONFLICT",
          message:
            "Pengeluaran berubah. Muat catatan terbaru sebelum mengedit.",
        },
        current: await owned<Expense>(c, "expenses", id),
      },
      409,
    );
  return c.json({ expense });
}
export async function deleteExpense(c: C) {
  const id = rowId(c),
    v = await json(c, deleteSchema),
    row = await owned<Expense>(c, "expenses", id);
  if (row.deleted_at) return c.json({ ok: true });
  if (row.superseded_by_item_id)
    fail(
      409,
      "HISTORY_LOCKED",
      "Histori sudah terwakili Alokasi dan tetap dipertahankan.",
    );
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE expenses SET deleted_at=$1,updated_at=$2,version=version+1 WHERE id=$3 AND owner_id=$4 AND version=$5 AND deleted_at IS NULL RETURNING id",
    ).bind(Date.now(), Date.now(), id, c.get("user").id, v.expectedVersion),
    c.env.DB.prepare(
      "UPDATE attachments SET status='deleting',updated_at=$1 WHERE expense_id=$2 AND EXISTS(SELECT 1 FROM expenses WHERE id=$3 AND deleted_at IS NOT NULL)",
    ).bind(Date.now(), id, id),
  ]);
  if (!result[0].meta.changes)
    fail(
      409,
      "RECORD_CONFLICT",
      "Pengeluaran berubah. Muat catatan terbaru sebelum menghapus.",
    );
  const files = await c.env.DB.prepare(
    "SELECT object_key FROM attachments WHERE expense_id=$1",
  )
    .bind(id)
    .all<{ object_key: string }>();
  await Promise.allSettled(
    files.results.map((f) => c.env.EVIDENCE.delete(f.object_key)),
  );
  return c.json({ ok: true });
}
export async function createTransfer(c: C) {
  const v = await json(c, transferSchema),
    owner = c.get("user").id,
    row = await owned<Item>(c, "budget_items", v.sourceItemId);
  if (
    row.deleted_at ||
    row.kind !== "transfer_out" ||
    row.period_id !== v.date.slice(0, 7)
  )
    fail(
      400,
      "INVALID_TRANSFER_ITEM",
      "Pilih rencana kiriman Anda pada bulan yang sama.",
    );
  if (row.recording_mode === "actual")
    fail(
      409,
      "AUTOMATIC_TRANSFER",
      "Kiriman sudah dicatat langsung melalui Alokasi.",
    );
  const existing = await c.env.DB.prepare("SELECT * FROM transfers WHERE id=$1")
    .bind(v.id)
    .first<Transfer>();
  if (existing) {
    if (existing.from_owner_id !== owner)
      fail(404, "NOT_FOUND", "Kiriman tidak ditemukan.");
    if (
      existing.deleted_at ||
      existing.source_item_id !== v.sourceItemId ||
      existing.amount !== v.amount ||
      existing.occurred_on !== v.date
    )
      fail(409, "ID_CONFLICT", "Permintaan kiriman berbeda.");
    return c.json({ transfer: existing });
  }
  const transfer = await c.env.DB.prepare(
    "INSERT INTO transfers(id,period_id,from_owner_id,to_owner_id,source_item_id,occurred_on,amount,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
  )
    .bind(
      v.id,
      row.period_id,
      owner,
      other(owner),
      v.sourceItemId,
      v.date,
      v.amount,
      Date.now(),
    )
    .first<Transfer>();
  return c.json({ transfer }, 201);
}
export async function deleteTransfer(c: C) {
  const id = rowId(c),
    v = await json(c, deleteSchema),
    row = await c.env.DB.prepare(
      "SELECT * FROM transfers WHERE id=$1 AND from_owner_id=$2",
    )
      .bind(id, c.get("user").id)
      .first<Transfer>();
  if (!row)
    fail(404, "NOT_FOUND", "Kiriman tidak ditemukan atau bukan milik Anda.");
  if (row.deleted_at) return c.json({ ok: true });
  if (row.superseded_by_item_id)
    fail(409, "HISTORY_LOCKED", "Histori kiriman sudah terwakili Alokasi.");
  const result = await c.env.DB.prepare(
    "UPDATE transfers SET deleted_at=$1,version=version+1 WHERE id=$2 AND from_owner_id=$3 AND version=$4 AND deleted_at IS NULL",
  )
    .bind(Date.now(), id, c.get("user").id, v.expectedVersion)
    .run();
  if (!result.meta.changes)
    fail(409, "RECORD_CONFLICT", "Kiriman berubah. Tinjau catatan terbaru.");
  return c.json({ ok: true });
}
