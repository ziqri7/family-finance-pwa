import { z } from "zod";
export const ownerIds = ["partner-a", "partner-b"] as const;
export type Owner = (typeof ownerIds)[number];
export const ownerName: Record<Owner, string> = {
  "partner-a": "Suami",
  "partner-b": "Istri",
};
export const other = (owner: Owner): Owner =>
  owner === "partner-a" ? "partner-b" : "partner-a";
export const kinds = ["income", "allocation", "transfer_out"] as const;
export type Kind = (typeof kinds)[number];
export const MAX_AMOUNT = 1_000_000_000_000;
export const idSchema = z.string().regex(/^[a-f0-9]{32}$/);
export const periodSchema = z
  .string()
  .regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/);
export const amountSchema = z.number().int().min(0).max(MAX_AMOUNT).nullable();
export const labelSchema = z.string().trim().min(1).max(100);
export const versionSchema = z.number().int().positive();
export const newPeriodSchema = z
  .object({
    id: periodSchema,
    mode: z.enum(["default", "copy"]),
    sourcePeriodId: periodSchema.optional(),
  })
  .strict()
  .refine(
    (v) => v.mode !== "copy" || Boolean(v.sourcePeriodId),
    "Pilih bulan sumber.",
  );
export const newItemSchema = z
  .object({
    id: idSchema,
    label: labelSchema,
    kind: z.enum(kinds),
    postingKind: z.enum(["external", "internal", "reserve"]).optional(),
  })
  .strict();
export const editItemSchema = z.discriminatedUnion("field", [
  z
    .object({
      field: z.literal("label"),
      value: labelSchema,
      expectedVersion: versionSchema,
    })
    .strict(),
  z
    .object({
      field: z.literal("amount"),
      value: amountSchema,
      confirmCancel: z.boolean().optional(),
      expectedVersion: versionSchema,
    })
    .strict(),
]);
export const deleteSchema = z
  .object({ expectedVersion: versionSchema })
  .strict();
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === s;
  }, "Tanggal tidak valid.");
export const expenseSchema = z
  .object({
    id: idSchema,
    date: dateSchema,
    itemId: idSchema,
    note: z.string().trim().min(1).max(150),
    amount: z.number().int().min(1).max(MAX_AMOUNT),
  })
  .strict();
export const expenseEditSchema = expenseSchema
  .omit({ id: true })
  .extend({ expectedVersion: versionSchema })
  .strict();
export const transferSchema = z
  .object({
    id: idSchema,
    date: dateSchema,
    sourceItemId: idSchema,
    amount: z.number().int().min(1).max(MAX_AMOUNT),
  })
  .strict();
export const attachmentSchema = z
  .object({
    id: idSchema,
    contentType: z.enum(["image/jpeg", "image/png"]),
    byteSize: z
      .number()
      .int()
      .min(1)
      .max(5 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export interface Item {
  id: string;
  period_id: string;
  owner_id: Owner;
  label: string;
  kind: Kind;
  amount: number | null;
  position: number;
  label_version: number;
  amount_version: number;
  row_version: number;
  deleted_at: number | null;
  recording_mode?: "legacy" | "actual";
  posting_kind?: "external" | "internal" | "reserve" | null;
  posting_date?: string | null;
  posting_version?: number;
}
export interface Expense {
  id: string;
  period_id: string;
  owner_id: Owner;
  item_id: string;
  occurred_on: string;
  note: string;
  amount: number;
  version: number;
  deleted_at: number | null;
  superseded_by_item_id?: string | null;
  superseded_at?: number | null;
}
export interface Transfer {
  id: string;
  period_id: string;
  from_owner_id: Owner;
  to_owner_id: Owner;
  source_item_id: string;
  occurred_on: string;
  amount: number;
  version: number;
  deleted_at: number | null;
  superseded_by_item_id?: string | null;
  superseded_at?: number | null;
}
export interface Attachment {
  id: string;
  expense_id: string | null;
  income_item_id?: string;
  allocation_item_id?: string;
  owner_id: Owner;
  content_type: string;
  byte_size: number;
  status: "pending" | "ready" | "deleting" | "failed";
}
export interface Period {
  id: string;
  revision: number;
}
export interface User {
  id: Owner;
  name: string;
}
export interface Snapshot {
  id: string;
  revision: number;
  budgets: { owner_id: Owner }[];
  items: Item[];
  expenses: Expense[];
  transfers: Transfer[];
  attachments: Attachment[];
}
export function totals(snapshot: Snapshot, owner: Owner) {
  const sum = (who: Owner, kind: Kind) =>
    snapshot.items
      .filter((i) => !i.deleted_at && i.owner_id === who && i.kind === kind)
      .reduce((s, i) => s + (i.amount ?? 0), 0);
  const external = sum(owner, "income"),
    incoming = sum(other(owner), "transfer_out"),
    outgoing = sum(owner, "transfer_out"),
    allocation = sum(owner, "allocation");
  const spent = snapshot.expenses
    .filter((e) => !e.deleted_at && e.owner_id === owner)
    .reduce((s, e) => s + e.amount, 0);
  return {
    external,
    incoming,
    outgoing,
    allocation,
    income: external + incoming,
    remaining: external + incoming - allocation - outgoing,
    spent,
  };
}
export function familyTotals(s: Snapshot) {
  const a = totals(s, "partner-a"),
    b = totals(s, "partner-b");
  return {
    income: a.external + b.external,
    allocation: a.allocation + b.allocation,
    remaining: a.external + b.external - a.allocation - b.allocation,
    spent: a.spent + b.spent,
  };
}
export const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
export const digits = new Intl.NumberFormat("id-ID");
export const ratio = (amount: number, income: number) =>
  income === 0
    ? "—"
    : new Intl.NumberFormat("id-ID", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(amount / income);
export const monthName = (id: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
    new Date(id + "-01T12:00:00"),
  );
export const randomId = () => crypto.randomUUID().replaceAll("-", "");
