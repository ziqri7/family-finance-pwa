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
  income_item_id: string;
  owner_id: Owner;
  object_key: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  status: string;
}
const source = (c: C) =>
  c.req.path.includes("/income-") || c.req.path.startsWith("/api/income-items/")
    ? {
        table: "income_attachments" as const,
        parent: "budget_items" as const,
        key: "income_item_id" as const,
      }
    : {
        table: "attachments" as const,
        parent: "expenses" as const,
        key: "expense_id" as const,
      };
export async function reserve(c: C) {
  const src = source(c);
  const expenseId = rowId(c),
    v = await json(c, attachmentSchema),
    expense = await owned<Expense>(c, src.parent, expenseId);
  if (
    expense.deleted_at ||
    (src.parent === "budget_items" &&
      (expense as unknown as { kind: string }).kind !== "income")
  )
    fail(
      409,
      "EXPENSE_DELETED",
      "Pos atau catatan tidak dapat menerima bukti.",
    );
  const existing = await c.env.DB.prepare(
    `SELECT * FROM ${src.table} WHERE id=$1`,
  )
    .bind(v.id)
    .first<FileRow>();
  if (existing) {
    if (existing.owner_id !== c.get("user").id)
      fail(404, "NOT_FOUND", "Bukti tidak ditemukan.");
    if (
      existing[src.key] !== expenseId ||
      existing.sha256 !== v.sha256 ||
      existing.content_type !== v.contentType ||
      existing.byte_size !== v.byteSize ||
      existing.status === "deleting"
    )
      fail(409, "UPLOAD_CONFLICT", "Bukti dengan ID ini memiliki isi berbeda.");
    return c.json({ id: v.id, status: existing.status });
  }
  await c.env.DB.prepare(
    `INSERT INTO ${src.table}(id,${src.key},owner_id,object_key,content_type,byte_size,sha256,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9)`,
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
  const src = source(c);
  const id = rowId(c),
    file = await owned<FileRow>(c, src.table, id),
    expense = await owned<Expense>(c, src.parent, file[src.key]);
  if (expense.deleted_at || file.status === "deleting")
    fail(409, "EXPENSE_DELETED", "Pos, catatan, atau bukti sudah dihapus.");
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
      `UPDATE ${src.table} SET status='ready',width=$1,height=$2,updated_at=$3 WHERE id=$4 AND status IN ('pending','failed','ready') AND EXISTS(SELECT 1 FROM ${src.parent} WHERE id=${src.key} AND deleted_at IS NULL)`,
    )
      .bind(dimensions.width, dimensions.height, Date.now(), id)
      .run();
    if (!result.meta.changes) {
      await c.env.EVIDENCE.delete(file.object_key);
      fail(
        409,
        "EXPENSE_DELETED",
        "Pos atau catatan dihapus saat unggahan berlangsung.",
      );
    }
  } catch (e) {
    throw e;
  }
  return c.json({ id, status: "ready" });
}
export async function download(c: C) {
  const src = source(c);
  const id = rowId(c),
    file = await c.env.DB.prepare(
      `SELECT a.* FROM ${src.table} a JOIN ${src.parent} e ON e.id=a.${src.key} WHERE a.id=$1 AND a.status='ready' AND e.deleted_at IS NULL`,
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
  const src = source(c);
  const id = rowId(c),
    file = await owned<FileRow>(c, src.table, id);
  await c.env.DB.prepare(
    `UPDATE ${src.table} SET status='deleting',updated_at=$1 WHERE id=$2 AND owner_id=$3`,
  )
    .bind(Date.now(), id, c.get("user").id)
    .run();
  await c.env.EVIDENCE.delete(file.object_key);
  return c.json({ ok: true });
}
