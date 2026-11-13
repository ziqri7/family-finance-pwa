import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  foreignKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
const owner = () =>
  text("owner_id").notNull().$type<"partner-a" | "partner-b">();
export const defaultItems = sqliteTable("default_items", {
  id: text().primaryKey(),
  owner_id: owner(),
  label: text().notNull(),
  kind: text().notNull(),
  position: integer().notNull(),
});
export const periods = sqliteTable("periods", {
  id: text().primaryKey(),
  revision: integer().notNull().default(1),
  created_at: integer().notNull(),
});
export const budgets = sqliteTable(
  "budgets",
  {
    period_id: text()
      .notNull()
      .references(() => periods.id),
    owner_id: owner(),
    created_at: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.period_id, t.owner_id] })],
);
export const budgetItems = sqliteTable(
  "budget_items",
  {
    id: text().primaryKey(),
    period_id: text().notNull(),
    owner_id: owner(),
    label: text().notNull(),
    kind: text().notNull().$type<"income" | "allocation" | "transfer_out">(),
    amount: integer(),
    position: integer().notNull(),
    label_version: integer().notNull().default(1),
    amount_version: integer().notNull().default(1),
    row_version: integer().notNull().default(1),
    created_at: integer().notNull(),
    updated_at: integer().notNull(),
    deleted_at: integer(),
  },
  (t) => [
    foreignKey({
      columns: [t.period_id, t.owner_id],
      foreignColumns: [budgets.period_id, budgets.owner_id],
    }),
    uniqueIndex("item_identity").on(t.id, t.period_id, t.owner_id),
  ],
);
export const expenses = sqliteTable(
  "expenses",
  {
    id: text().primaryKey(),
    period_id: text().notNull(),
    owner_id: owner(),
    item_id: text().notNull(),
    occurred_on: text().notNull(),
    note: text().notNull(),
    amount: integer().notNull(),
    version: integer().notNull().default(1),
    created_at: integer().notNull(),
    updated_at: integer().notNull(),
    deleted_at: integer(),
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
export const transfers = sqliteTable(
  "transfers",
  {
    id: text().primaryKey(),
    period_id: text().notNull(),
    from_owner_id: text().notNull().$type<"partner-a" | "partner-b">(),
    to_owner_id: text().notNull().$type<"partner-a" | "partner-b">(),
    source_item_id: text().notNull(),
    occurred_on: text().notNull(),
    amount: integer().notNull(),
    version: integer().notNull().default(1),
    created_at: integer().notNull(),
    deleted_at: integer(),
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
export const attachments = sqliteTable("attachments", {
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
  created_at: integer().notNull(),
  updated_at: integer().notNull(),
});
export const sessions = sqliteTable("sessions", {
  token_hash: text().primaryKey(),
  account_id: text().notNull(),
  auth_fingerprint: text().notNull(),
  created_at: integer().notNull(),
  expires_at: integer().notNull(),
});
export const loginAttempts = sqliteTable("login_attempts", {
  key: text().primaryKey(),
  attempts: integer().notNull(),
  window_start: integer().notNull(),
  blocked_until: integer().notNull(),
});
