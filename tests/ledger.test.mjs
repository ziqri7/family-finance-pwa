import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const out = await build({
  entryPoints: ["shared/ledger.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { ledger, ledgerTotals, effectiveFamilyTotals, safeSum } = await import(
  "data:text/javascript;base64," +
    Buffer.from(out.outputFiles[0].text).toString("base64")
);
const fixture = () => {
  let n = 0;
  const item = (owner_id, kind, amount, posting_kind) => ({
    id: String(++n),
    owner_id,
    kind,
    amount,
    posting_kind,
    recording_mode: kind === "income" ? "legacy" : "actual",
    period_id: "2026-11",
    deleted_at: null,
  });
  return {
    items: [
      item("partner-a", "income", 10000000),
      item("partner-b", "income", 2000000),
      ...[
        [450000, "external"],
        [150000, "external"],
        [350000, "external"],
        [600000, "external"],
        [2000000, "internal"],
      ].map(([a, k]) => item("partner-a", "allocation", a, k)),
      item("partner-b", "allocation", 400000, "external"),
      item("partner-b", "allocation", 600000, "external"),
    ],
    expenses: [],
    transfers: [],
    attachments: [],
    budgets: [],
  };
};
test("approved cash distribution: internal transfer conserved, zero/null distinct, correction keeps identity", () => {
  const s = fixture();
  assert.equal(ledgerTotals(s, "partner-a").remaining, 6450000);
  assert.equal(ledgerTotals(s, "partner-b").remaining, 3000000);
  assert.equal(effectiveFamilyTotals(s).spent, 2550000);
  assert.equal(effectiveFamilyTotals(s).remaining, 9450000);
  const id = ledger(s)[0].id;
  s.items[2].amount = 500000;
  assert.equal(ledger(s)[0].id, id);
  assert.equal(ledger(s).length, 7);
  s.items[2].amount = 0;
  assert.equal(ledger(s).length, 7);
  s.items[2].amount = null;
  assert.equal(ledger(s).length, 6);
});
test("reserve reduces unassigned money without counting external spending; history stays excluded, new manual extras remain", () => {
  const s = fixture();
  s.items.push({
    id: "reserve",
    owner_id: "partner-a",
    kind: "allocation",
    recording_mode: "actual",
    posting_kind: "reserve",
    amount: 500000,
    period_id: "2026-11",
  });
  s.expenses = [
    {
      id: "old",
      owner_id: "partner-a",
      item_id: "3",
      amount: 450000,
      superseded_by_item_id: "3",
    },
    {
      id: "extra",
      owner_id: "partner-a",
      item_id: "3",
      amount: 50000,
      note: "Tambahan",
      occurred_on: "2026-11-16",
    },
  ];
  assert.equal(effectiveFamilyTotals(s).spent, 2600000);
  assert.equal(effectiveFamilyTotals(s).remaining, 8900000);
  assert.equal(
    ledger(s).some((e) => e.sourceId === "old"),
    false,
  );
  s.items[2].amount = null;
  assert.equal(
    ledger(s).some((e) => e.sourceId === "old"),
    false,
  );
});
test("totals reject unsafe money rather than silently rounding", () => {
  assert.throws(() => safeSum([Number.MAX_SAFE_INTEGER, 1]));
  assert.throws(() => safeSum([-1]));
  assert.throws(() => safeSum([0.5]));
});
