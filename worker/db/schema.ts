import {
  pgTable,
  text,
  integer,
  bigint,
  primaryKey,
  foreignKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
const owner = () =>
  text("owner_id").notNull().$type<"partner-a" | "partner-b">();
export const defaultItems = pgTable("default_items", {
  id: text().primaryKey(),
  owner_id: owner(),
  label: text().notNull(),
  kind: text().notNull(),
  position: integer().notNull(),
  posting_kind: text().$type<"external" | "internal" | "reserve">(),
});
export const allocationGroups = pgTable("allocation_groups", {
  id: text().primaryKey(),
  period_id: text().notNull(),
  owner_id: owner(),
  label: text().notNull(),
  posting_kind: text().$type<"external" | "internal" | "reserve">().notNull(),
  recipient_owner_id: text(),
  status: text().$type<"draft" | "posted" | "cancelled">().notNull(),
  posting_date: text(),
  version: integer().notNull(),
  position: integer().notNull(),
  created_at: bigint({ mode: "number" }).notNull(),
  updated_at: bigint({ mode: "number" }).notNull(),
  deleted_at: bigint({ mode: "number" }),
});
export const allocationGroupItems = pgTable("allocation_group_items", {
  group_id: text().notNull(),
  item_id: text().notNull(),
  position: integer().notNull(),
  posted: integer().notNull(),
  retired_at: bigint({ mode: "number" }),
});
export const groupAttachments = pgTable("group_attachments", {
  id: text().primaryKey(),
  group_id: text().notNull(),
  owner_id: owner(),
  content_type: text().notNull(),
  byte_size: integer().notNull(),
  status: text().$type<"pending" | "ready" | "failed" | "deleting">().notNull(),
  confirmed_group_version: integer().notNull(),
});
export const periods = pgTable("periods", {
  id: text().primaryKey(),
  revision: integer().notNull().default(1),
  created_at: bigint({ mode: "number" }).notNull(),
});
export const budgets = pgTable(
  "budgets",
  {
    period_id: text()
      .notNull()
      .references(() => periods.id),
    owner_id: owner(),
    created_at: bigint({ mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.period_id, t.owner_id] })],
);
export const budgetItems = pgTable(
  "budget_items",
  {
    id: text().primaryKey(),
    period_id: text().notNull(),
    owner_id: owner(),
    label: text().notNull(),
    kind: text().notNull().$type<"income" | "allocation" | "transfer_out">(),
    amount: bigint({ mode: "number" }),
    recording_mode: text()
      .notNull()
      .default("legacy")
      .$type<"legacy" | "actual">(),
    posting_kind: text().$type<"external" | "internal" | "reserve">(),
    posting_date: text(),
    posting_version: integer().notNull().default(1),
    position: integer().notNull(),
    label_version: integer().notNull().default(1),
    amount_version: integer().notNull().default(1),
    row_version: integer().notNull().default(1),
    created_at: bigint({ mode: "number" }).notNull(),
    updated_at: bigint({ mode: "number" }).notNull(),
    deleted_at: bigint({ mode: "number" }),
  },
  (t) => [
    foreignKey({
      columns: [t.period_id, t.owner_id],
      foreignColumns: [budgets.period_id, budgets.owner_id],
    }),
    uniqueIndex("item_identity").on(t.id, t.period_id, t.owner_id),
  ],
);
export const expenses = pgTable(
  "expenses",
  {
    id: text().primaryKey(),
    period_id: text().notNull(),
    owner_id: owner(),
    item_id: text().notNull(),
    occurred_on: text().notNull(),
    note: text().notNull(),
    amount: bigint({ mode: "number" }).notNull(),
    version: integer().notNull().default(1),
    created_at: bigint({ mode: "number" }).notNull(),
    updated_at: bigint({ mode: "number" }).notNull(),
    deleted_at: bigint({ mode: "number" }),
    superseded_by_item_id: text(),
    superseded_at: bigint({ mode: "number" }),
  },
  (t) => [
    foreignKey({
      columns: [t.item_id, t.period_id, t.owner_id],
      foreignColumns: [
        budgetItems.id,
        budgetItems.period_id,
        budgetItems.owner_id,
      ],
    }),
  ],
);
export const transfers = pgTable(
  "transfers",
  {
    id: text().primaryKey(),
    period_id: text().notNull(),
    from_owner_id: text().notNull().$type<"partner-a" | "partner-b">(),
    to_owner_id: text().notNull().$type<"partner-a" | "partner-b">(),
    source_item_id: text().notNull(),
    occurred_on: text().notNull(),
    amount: bigint({ mode: "number" }).notNull(),
    version: integer().notNull().default(1),
    created_at: bigint({ mode: "number" }).notNull(),
    deleted_at: bigint({ mode: "number" }),
    superseded_by_item_id: text(),
    superseded_at: bigint({ mode: "number" }),
  },
  (t) => [
    foreignKey({
      columns: [t.source_item_id, t.period_id, t.from_owner_id],
      foreignColumns: [
        budgetItems.id,
        budgetItems.period_id,
        budgetItems.owner_id,
      ],
    }),
  ],
);
export const attachments = pgTable("attachments", {
  id: text().primaryKey(),
  expense_id: text()
    .notNull()
    .references(() => expenses.id),
  owner_id: owner(),
  object_key: text().notNull().unique(),
  content_type: text().notNull(),
  byte_size: integer().notNull(),
  sha256: text().notNull(),
  width: integer(),
  height: integer(),
  status: text().notNull(),
  created_at: bigint({ mode: "number" }).notNull(),
  updated_at: bigint({ mode: "number" }).notNull(),
});
export const incomeAttachments = pgTable("income_attachments", {
  id: text().primaryKey(),
  income_item_id: text()
    .notNull()
    .references(() => budgetItems.id),
  owner_id: owner(),
  object_key: text().notNull().unique(),
  content_type: text().notNull(),
  byte_size: integer().notNull(),
  sha256: text().notNull(),
  width: integer(),
  height: integer(),
  status: text().notNull(),
  created_at: bigint({ mode: "number" }).notNull(),
  updated_at: bigint({ mode: "number" }).notNull(),
});
export const allocationAttachments = pgTable("allocation_attachments", {
  id: text().primaryKey(),
  allocation_item_id: text()
    .notNull()
    .references(() => budgetItems.id),
  owner_id: owner(),
  object_key: text().notNull().unique(),
  content_type: text().notNull(),
  byte_size: integer().notNull(),
  sha256: text().notNull(),
  width: integer(),
  height: integer(),
  status: text().notNull(),
  created_at: bigint({ mode: "number" }).notNull(),
  updated_at: bigint({ mode: "number" }).notNull(),
});
export const sessions = pgTable("sessions", {
  token_hash: text().primaryKey(),
  account_id: text().notNull(),
  auth_fingerprint: text().notNull(),
  created_at: bigint({ mode: "number" }).notNull(),
  expires_at: bigint({ mode: "number" }).notNull(),
});
export const accountCredentials = pgTable("account_credentials", {
  account_id: text().primaryKey(),
  scheme: text().notNull(),
  hash: text().notNull(),
  salt: text(),
  iterations: integer(),
  pepper_id: text(),
  version: integer().notNull().default(1),
  updated_at: bigint({ mode: "number" }).notNull(),
});
export const loginAttempts = pgTable("login_attempts", {
  key: text().primaryKey(),
  attempts: integer().notNull(),
  window_start: bigint({ mode: "number" }).notNull(),
  blocked_until: bigint({ mode: "number" }).notNull(),
});
