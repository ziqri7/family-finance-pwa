import type { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, isNull, asc } from "drizzle-orm";
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
  table: "budget_items" | "expenses" | "attachments",
  id: string,
) {
  const row = await c.env.DB.prepare(
    `SELECT * FROM ${table} WHERE id=? AND owner_id=?`,
  )
    .bind(id, c.get("user").id)
    .first<T>();
  if (!row)
    fail(404, "NOT_FOUND", "Catatan tidak ditemukan atau bukan milik Anda.");
  return row;
}
export async function snapshot(c: C) {
  const id = periodId(c),
    db = drizzle(c.env.DB);
  const [period, budgets, items, expenses, transfers, attachments] =
    await db.batch([
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
    attachments: attachments.filter((a) => a.status !== "deleting"),
  });
}
export async function listPeriods(c: C) {
  const rows = await c.env.DB.prepare(
    "SELECT id,revision,(SELECT group_concat(owner_id) FROM budgets WHERE period_id=periods.id) AS owners FROM periods ORDER BY id DESC",
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
  const condition =
    input.mode === "copy"
      ? "EXISTS(SELECT 1 FROM budgets WHERE period_id=? AND owner_id=?)"
      : "EXISTS(SELECT 1 FROM default_items WHERE owner_id=?)";
  const args = input.mode === "copy" ? [input.sourcePeriodId!, owner] : [owner];
  const result = await db.batch([
    db
      .prepare(
        `INSERT INTO periods(id,created_at) SELECT ?,? WHERE ${condition} ON CONFLICT(id) DO NOTHING`,
      )
      .bind(input.id, now, ...args),
    db
      .prepare(
        `INSERT INTO budgets(period_id,owner_id,created_at) SELECT ?,?,? WHERE ${condition}`,
      )
      .bind(input.id, owner, now, ...args),
    input.mode === "copy"
      ? db
          .prepare(
            "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,created_at,updated_at) SELECT lower(hex(randomblob(16))),?,?,label,kind,amount,position,?,? FROM budget_items WHERE period_id=? AND owner_id=? AND deleted_at IS NULL",
          )
          .bind(input.id, owner, now, now, input.sourcePeriodId!, owner)
      : db
          .prepare(
            "INSERT INTO budget_items(id,period_id,owner_id,label,kind,amount,position,created_at,updated_at) SELECT lower(hex(randomblob(16))),?,?,label,kind,NULL,position,?,? FROM default_items WHERE owner_id=?",
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
    "SELECT * FROM budget_items WHERE id=?",
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
      existing.label !== v.label
    )
      fail(409, "ID_CONFLICT", "Permintaan tambah pos berbeda.");
    return c.json({ item: existing });
  }
  if (
    !(await c.env.DB.prepare(
      "SELECT 1 FROM budgets WHERE period_id=? AND owner_id=?",
    )
      .bind(period, owner)
      .first())
  )
    fail(404, "BUDGET_NOT_FOUND", "Buat anggaran Anda dahulu.");
  const item = await c.env.DB.prepare(
    "INSERT INTO budget_items(id,period_id,owner_id,label,kind,position,created_at,updated_at) VALUES(?,?,?,?,?,(SELECT coalesce(max(position),-1)+1 FROM budget_items WHERE period_id=? AND owner_id=? AND kind=?),?,?) RETURNING *",
  )
    .bind(v.id, period, owner, v.label, v.kind, period, owner, v.kind, now, now)
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
  const column = v.field === "label" ? "label" : "amount",
    version = column === "label" ? "label_version" : "amount_version";
  const item = await c.env.DB.prepare(
    `UPDATE budget_items SET ${column}=?,${version}=${version}+1,row_version=row_version+1,updated_at=? WHERE id=? AND owner_id=? AND deleted_at IS NULL AND ${version}=? RETURNING *`,
  )
    .bind(v.value, Date.now(), id, c.get("user").id, v.expectedVersion)
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
    "UPDATE budget_items SET deleted_at=?,updated_at=?,row_version=row_version+1 WHERE id=? AND owner_id=? AND row_version=? AND deleted_at IS NULL",
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
  const existing = await c.env.DB.prepare("SELECT * FROM expenses WHERE id=?")
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
    "INSERT INTO expenses(id,period_id,owner_id,item_id,occurred_on,note,amount,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) RETURNING *",
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
    "UPDATE expenses SET item_id=?,occurred_on=?,note=?,amount=?,updated_at=?,version=version+1 WHERE id=? AND owner_id=? AND version=? AND deleted_at IS NULL RETURNING *",
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
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE expenses SET deleted_at=?,updated_at=?,version=version+1 WHERE id=? AND owner_id=? AND version=? AND deleted_at IS NULL RETURNING id",
    ).bind(Date.now(), Date.now(), id, c.get("user").id, v.expectedVersion),
    c.env.DB.prepare(
      "UPDATE attachments SET status='deleting',updated_at=? WHERE expense_id=? AND EXISTS(SELECT 1 FROM expenses WHERE id=? AND deleted_at IS NOT NULL)",
    ).bind(Date.now(), id, id),
  ]);
  if (!result[0].meta.changes)
    fail(
      409,
      "RECORD_CONFLICT",
      "Pengeluaran berubah. Muat catatan terbaru sebelum menghapus.",
    );
  const files = await c.env.DB.prepare(
    "SELECT object_key FROM attachments WHERE expense_id=?",
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
  const existing = await c.env.DB.prepare("SELECT * FROM transfers WHERE id=?")
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
    "INSERT INTO transfers(id,period_id,from_owner_id,to_owner_id,source_item_id,occurred_on,amount,created_at) VALUES(?,?,?,?,?,?,?,?) RETURNING *",
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
      "SELECT * FROM transfers WHERE id=? AND from_owner_id=?",
    )
      .bind(id, c.get("user").id)
      .first<Transfer>();
  if (!row)
    fail(404, "NOT_FOUND", "Kiriman tidak ditemukan atau bukan milik Anda.");
  if (row.deleted_at) return c.json({ ok: true });
  const result = await c.env.DB.prepare(
    "UPDATE transfers SET deleted_at=?,version=version+1 WHERE id=? AND from_owner_id=? AND version=? AND deleted_at IS NULL",
  )
    .bind(Date.now(), id, c.get("user").id, v.expectedVersion)
    .run();
  if (!result.meta.changes)
    fail(409, "RECORD_CONFLICT", "Kiriman berubah. Tinjau catatan terbaru.");
  return c.json({ ok: true });
}
