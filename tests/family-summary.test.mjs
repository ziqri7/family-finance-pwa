import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const compiled = await build({
  entryPoints: ["shared/family-book.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { familyBook, usageTotal } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
const item = (id, kind, amount, owner_id = "partner-a", extra = {}) => ({
  id,
  label: id,
  kind,
  amount,
  owner_id,
  recording_mode: kind === "income" ? "legacy" : "actual",
  deleted_at: null,
  ...extra,
});
const base = () => ({
  id: "2026-11",
  revision: 1,
  budgets: [{ owner_id: "partner-a" }],
  items: [
    item("income", "income", 8000000),
    item("food", "allocation", 2000000),
    item("saving", "allocation", 6000000, "partner-a", {
      posting_kind: "internal",
    }),
  ],
  expenses: [],
  transfers: [],
  attachments: [],
  usages: [],
});
test("one book includes savings and old internal allocations without needing wife budget", () => {
  const t = familyBook(base());
  assert.equal(t.income, 8000000);
  assert.equal(t.distributed, 8000000);
  assert.equal(t.remaining, 0);
  assert.equal(t.complete, true);
});
test("proof bundles and cross-creator usage leave primary family totals unchanged", () => {
  const s = base(),
    before = familyBook(s);
  s.groups = [{ id: "bundle", amount: 9999999 }];
  s.attachments = [{ id: "photo", group_id: "bundle" }];
  s.usages = [
    {
      id: "usage",
      item_id: "food",
      amount: 100000,
      owner_id: "partner-b",
      deleted_at: null,
    },
  ];
  assert.deepEqual(familyBook(s), before);
  assert.equal(usageTotal(s, "food"), 100000);
});
test("zero is complete; null, legacy reviews and unmapped extras are incomplete", () => {
  let s = base();
  s.items.push(item("zero", "allocation", 0));
  assert.equal(familyBook(s).complete, true);
  s.items.at(-1).amount = null;
  assert.equal(familyBook(s).complete, false);
  s.items.at(-1).amount = 0;
  s.items.at(-1).recording_mode = "legacy";
  assert.equal(familyBook(s).legacy.length, 1);
  s.items.at(-1).recording_mode = "actual";
  s.expenses.push({
    id: "extra",
    amount: 100,
    note: "Tambahan lama",
    item_id: "food",
    deleted_at: null,
    superseded_by_item_id: null,
  });
  assert.equal(familyBook(s).distributed, 8000100);
  assert.equal(familyBook(s).complete, false);
  s.expenses[0].converted_to = "usage";
  assert.equal(familyBook(s).distributed, 8000000);
});
test("deleted parent usage stays readable; retired children do not consume allowance", () => {
  const s = base();
  s.items[1].deleted_at = 1;
  s.usages = [
    { id: "u1", item_id: "food", amount: 100000, deleted_at: null },
    { id: "u2", item_id: "food", amount: 200000, deleted_at: 1 },
  ];
  assert.equal(usageTotal(s, "food"), 100000);
  assert.equal(familyBook(s).distributed, 6000000);
});
test("unsafe totals fail explicitly", () => {
  const s = base();
  s.items[0].amount = Number.MAX_SAFE_INTEGER;
  s.items.push(item("income2", "income", 1));
  assert.throws(() => familyBook(s), /INTEGER_RANGE/);
});
