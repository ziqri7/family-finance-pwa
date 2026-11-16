import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
await mkdir("private/chart-test", { recursive: true });
await build({
  entryPoints: ["src/components/FinanceCharts.tsx"],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  loader: { ".css": "empty" },
  outfile: "private/chart-test/charts.mjs",
});
const { MonthCharts } = await import(
  pathToFileURL(resolve("private/chart-test/charts.mjs")).href
);
test("rendered donut percentages include reserve in the denominator, including a reserve-only month", () => {
  const s = {
    id: "2026-11",
    revision: 1,
    budgets: [{ owner_id: "partner-a" }, { owner_id: "partner-b" }],
    items: [
      { id: "income", owner_id: "partner-a", kind: "income", amount: 200 },
      {
        id: "expense",
        owner_id: "partner-a",
        kind: "allocation",
        recording_mode: "actual",
        posting_kind: "external",
        amount: 100,
        label: "Tagihan",
      },
      {
        id: "reserve",
        owner_id: "partner-a",
        kind: "allocation",
        recording_mode: "actual",
        posting_kind: "reserve",
        amount: 100,
        label: "Disisihkan",
      },
    ],
    expenses: [],
    transfers: [],
    attachments: [],
  };
  const shares = () => {
    const html = renderToStaticMarkup(
        createElement(MonthCharts, { snapshot: s }),
      ),
      start = html.indexOf("allocation-legend"),
      list = html.slice(start, html.indexOf("</ul>", start));
    return [...list.matchAll(/<strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
  };
  assert.deepEqual(shares(), ["50%", "50%"]);
  s.items[1].amount = null;
  assert.deepEqual(shares(), ["100%"]);
});
