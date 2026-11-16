import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const code = await build({
  entryPoints: ["shared/chart-data.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { allocationChart } = await import(
  "data:text/javascript;base64," +
    Buffer.from(code.outputFiles[0].text).toString("base64")
);
const base = () => ({
  budgets: [{ owner_id: "partner-a" }, { owner_id: "partner-b" }],
  items: [],
  expenses: [],
  transfers: [],
  attachments: [],
});
test("pie combines matching allocation labels, ignores transfers/deletes and preserves total with top three", () => {
  const s = base();
  s.items = [
    { label: "Belanja", amount: 40, kind: "allocation" },
    { label: " belanja ", amount: 10, kind: "allocation" },
    { label: "Rumah", amount: 30, kind: "allocation" },
    { label: "Sekolah", amount: 20, kind: "allocation" },
    { label: "A", amount: 5, kind: "allocation" },
    { label: "B", amount: 5, kind: "allocation" },
    { label: "Kiriman", amount: 100, kind: "transfer_out" },
    { label: "Hapus", amount: 100, kind: "allocation", deleted_at: 1 },
  ];
  s.items = s.items.map((i, n) => ({
    ...i,
    id: String(n),
    recording_mode: "actual",
    posting_kind: i.kind === "transfer_out" ? "internal" : "external",
  }));
  const r = allocationChart(s);
  assert.equal(r.slices.length, 4);
  assert.equal(r.slices[0].amount, 50);
  assert.equal(
    r.slices.reduce((n, v) => n + v.amount, 0),
    110,
  );
  assert.equal(r.slices.at(-1).amount, 10);
});
test("missing amounts differ from explicit zero and require both owners", () => {
  const s = base();
  s.items = [
    { label: "Gaji", amount: null, kind: "income" },
    { label: "Rumah", amount: 0, kind: "allocation" },
  ];
  assert.equal(allocationChart(s).incomeComplete, false);
  assert.equal(allocationChart(s).missing, 1);
  s.items[0].amount = 0;
  assert.equal(allocationChart(s).incomeComplete, true);
  assert.equal(allocationChart(s).missing, 0);
  assert.equal(allocationChart(s).slices.length, 0);
  s.budgets.pop();
  assert.equal(allocationChart(s).ownersComplete, false);
});
