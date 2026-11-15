import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const compiled = await build({
  entryPoints: ["shared/year-report.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { summarizeYear } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
const month = (id, income, spent, extra = {}) => ({
  id,
  exists: true,
  missingOwners: 0,
  missingAmounts: 0,
  income,
  allocation: 0,
  spent,
  ...extra,
});
test("year percentage uses total amounts; never mean of monthly percentages", () => {
  const r = summarizeYear("2026", [
    month("2026-01", 10000000, 5000000),
    month("2026-02", 2000000, 2000000),
    month("2026-03", 999999999, 999999999, { missingAmounts: 1 }),
  ]);
  assert.equal(r.included, 2);
  assert.equal(r.excluded, 1);
  assert.equal(r.spent / r.income, 7 / 12);
  assert.notEqual(r.spent / r.income, 0.75);
});
test("zero, deficit and missing months retain distinct meanings", () => {
  const r = summarizeYear("2026", [
    month("2026-01", 0, 0),
    month("2026-02", 100, 200, { allocation: 150 }),
    month("2026-03", 100, 100, { missingOwners: 1 }),
    month("2026-04", 0, 0, { exists: false }),
  ]);
  assert.equal(r.included, 2);
  assert.equal(r.excluded, 1);
  assert.equal(r.remaining, -50);
  assert.equal(r.spent / r.income, 2);
  assert.equal(r.months[3].complete, false);
});
test("unsafe annual totals fail explicitly instead of rounding", () => {
  assert.throws(
    () =>
      summarizeYear("2026", [
        month("2026-01", 1, Number.MAX_SAFE_INTEGER),
        month("2026-02", 1, 1),
      ]),
    /REPORT_RANGE/,
  );
});
