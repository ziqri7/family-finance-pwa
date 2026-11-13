import type { Context } from "hono";
import type { AppEnv } from "./types";
import { attachmentSchema, type Expense, type Owner } from "../shared/domain";
import { owned, rowId } from "./finance";
import { fail, json, bytes } from "./http";
import { hash } from "./auth";
import { validateImage } from "./images";
type C = Context<AppEnv>;
interface FileRow {
  id: string;
  expense_id: string;
  owner_id: Owner;
  object_key: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  status: string;
}
export async function reserve(c: C) {
  const expenseId = rowId(c),
    v = await json(c, attachmentSchema),
    expense = await owned<Expense>(c, "expenses", expenseId);
  if (expense.deleted_at)
    fail(409, "EXPENSE_DELETED", "Pengeluaran telah dihapus.");
  const existing = await c.env.DB.prepare(
    "SELECT * FROM attachments WHERE id=?",
  )
    .bind(v.id)
    .first<FileRow>();
  if (existing) {
    if (existing.owner_id !== c.get("user").id)
      fail(404, "NOT_FOUND", "Bukti tidak ditemukan.");
    if (
      existing.expense_id !== expenseId ||
      existing.sha256 !== v.sha256 ||
      existing.content_type !== v.contentType ||
      existing.byte_size !== v.byteSize ||
      existing.status === "deleting"
    )
      fail(409, "UPLOAD_CONFLICT", "Bukti dengan ID ini memiliki isi berbeda.");
    return c.json({ id: v.id, status: existing.status });
  }
  await c.env.DB.prepare(
    "INSERT INTO attachments(id,expense_id,owner_id,object_key,content_type,byte_size,sha256,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending',?,?)",
  )
    .bind(
      v.id,
      expenseId,
      c.get("user").id,
      "evidence/" + crypto.randomUUID(),
      v.contentType,
      v.byteSize,
      v.sha256,
      Date.now(),
      Date.now(),
    )
    .run();
  return c.json({ id: v.id, status: "pending" }, 201);
}
export async function upload(c: C) {
  const id = rowId(c),
    file = await owned<FileRow>(c, "attachments", id),
    expense = await owned<Expense>(c, "expenses", file.expense_id);
  if (expense.deleted_at || file.status === "deleting")
    fail(409, "EXPENSE_DELETED", "Pengeluaran atau bukti sudah dihapus.");
  if (c.req.header("content-type") !== file.content_type)
    fail(415, "IMAGE_TYPE", "Format gambar tidak sesuai reservasi.");
  const data = await bytes(c.req.raw, 5 * 1024 * 1024);
  if (data.length !== file.byte_size || (await hash(data)) !== file.sha256)
    fail(
      400,
      "CHECKSUM_MISMATCH",
      "Isi gambar berbeda. Pilih ulang berkas yang benar.",
    );
  const dimensions = validateImage(data, file.content_type);
  await c.env.EVIDENCE.put(file.object_key, data, {
    httpMetadata: { contentType: file.content_type },
    customMetadata: { sha256: file.sha256 },
  });
  try {
    const result = await c.env.DB.prepare(
      "UPDATE attachments SET status='ready',width=?,height=?,updated_at=? WHERE id=? AND status IN ('pending','failed','ready') AND EXISTS(SELECT 1 FROM expenses WHERE id=expense_id AND deleted_at IS NULL)",
    )
      .bind(dimensions.width, dimensions.height, Date.now(), id)
      .run();
    if (!result.meta.changes) {
      await c.env.EVIDENCE.delete(file.object_key);
      fail(
        409,
        "EXPENSE_DELETED",
        "Pengeluaran dihapus saat unggahan berlangsung.",
      );
    }
  } catch (e) {
    throw e;
  }
  return c.json({ id, status: "ready" });
}
export async function download(c: C) {
  const id = rowId(c),
    file = await c.env.DB.prepare(
      "SELECT a.* FROM attachments a JOIN expenses e ON e.id=a.expense_id WHERE a.id=? AND a.status='ready' AND e.deleted_at IS NULL",
    )
      .bind(id)
      .first<FileRow>();
  if (!file) fail(404, "NOT_FOUND", "Bukti tidak tersedia.");
  const object = await c.env.EVIDENCE.get(file.object_key);
  if (!object) fail(404, "NOT_FOUND", "Bukti belum dapat dibaca.");
  c.header("Content-Type", file.content_type);
  c.header(
    "Content-Disposition",
    `inline; filename="bukti-${id.slice(0, 6)}.${file.content_type === "image/png" ? "png" : "jpg"}"`,
  );
  return c.body(object.body);
}
export async function remove(c: C) {
  const id = rowId(c),
    file = await owned<FileRow>(c, "attachments", id);
  await c.env.DB.prepare(
    "UPDATE attachments SET status='deleting',updated_at=? WHERE id=? AND owner_id=?",
  )
    .bind(Date.now(), id, c.get("user").id)
    .run();
  await c.env.EVIDENCE.delete(file.object_key);
  return c.json({ ok: true });
}
