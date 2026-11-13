import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const output = await build({
  entryPoints: ["shared/domain.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { totals, familyTotals, ratio, amountSchema } = await import(
  "data:text/javascript;base64," +
    Buffer.from(output.outputFiles[0].text).toString("base64")
);
const item = (owner_id, kind, amount) => ({
  owner_id,
  kind,
  amount,
  deleted_at: null,
});
test("verified formula examples, deficit and zero denominator", () => {
  let s = {
    items: [
      item("partner-a", "income", 10000000),
      item("partner-a", "allocation", 7000000),
    ],
    expenses: [],
  };
  assert.equal(totals(s, "partner-a").remaining, 3000000);
  assert.equal(ratio(7000000, 10000000), "70%");
  s.items[1].amount = 12000000;
  assert.equal(totals(s, "partner-a").remaining, -2000000);
  assert.equal(ratio(2000000, 10000000), "20%");
  assert.equal(ratio(1, 0), "—");
  assert.equal(amountSchema.parse(null), null);
  assert.equal(amountSchema.parse(0), 0);
  assert.equal(amountSchema.safeParse(1.5).success, false);
});
test("internal plan cancels in family totals; actual transfers do not count as spending", () => {
  const s = {
    items: [
      item("partner-a", "income", 10000000),
      item("partner-b", "income", 2000000),
      item("partner-a", "allocation", 6500000),
      item("partner-b", "allocation", 1300000),
      item("partner-a", "transfer_out", 1000000),
    ],
    expenses: [
      { owner_id: "partner-a", amount: 175000, deleted_at: null },
      { owner_id: "partner-b", amount: 120000, deleted_at: null },
    ],
    transfers: [{ amount: 900000 }],
  };
  assert.equal(totals(s, "partner-a").remaining, 2500000);
  assert.equal(totals(s, "partner-b").remaining, 1700000);
  assert.deepEqual(familyTotals(s), {
    income: 12000000,
    allocation: 7800000,
    remaining: 4200000,
    spent: 295000,
  });
  assert.equal(
    totals(s, "partner-a").remaining + totals(s, "partner-b").remaining,
    familyTotals(s).remaining,
  );
});
