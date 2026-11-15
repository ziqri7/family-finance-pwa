import type { Context } from "hono";
import type { AppEnv } from "./types";
import { fail } from "./http";
import { summarizeYear, type MonthReport } from "../shared/year-report";
export async function yearReport(c: Context<AppEnv>) {
  const year = c.req.param("year");
  if (!year || !/^(20\d{2}|2100)$/.test(year))
    fail(400, "INVALID_YEAR", "Pilih tahun antara 2000 dan 2100.");
  // Pre-aggregate each collection to avoid join multiplication; internal transfers
  // never enter the income/allocation/spending totals. One statement = one snapshot.
  const result = await c.env.DB.prepare(
    `
    WITH months AS (SELECT $1 || '-' || lpad(n::text,2,'0') AS id FROM generate_series(1,12) n),
    plans AS (SELECT period_id,
      count(*) FILTER (WHERE kind IN ('income','allocation') AND amount IS NULL)::int AS missing,
      coalesce(sum(amount) FILTER (WHERE kind='income'),0)::bigint AS income,
      coalesce(sum(amount) FILTER (WHERE kind='allocation'),0)::bigint AS allocation
      FROM budget_items WHERE deleted_at IS NULL AND period_id >= $1 || '-01' AND period_id <= $1 || '-12' GROUP BY period_id),
    owners AS (SELECT period_id,count(*)::int AS n FROM budgets WHERE period_id >= $1 || '-01' AND period_id <= $1 || '-12' GROUP BY period_id),
    spending AS (SELECT period_id,coalesce(sum(amount),0)::bigint AS spent FROM expenses
      WHERE deleted_at IS NULL AND period_id >= $1 || '-01' AND period_id <= $1 || '-12' GROUP BY period_id)
    SELECT m.id,p.id IS NOT NULL AS exists,(2-coalesce(o.n,0))::int AS "missingOwners",
      coalesce(b.missing,0)::int AS "missingAmounts",coalesce(b.income,0)::bigint AS income,
      coalesce(b.allocation,0)::bigint AS allocation,coalesce(s.spent,0)::bigint AS spent
    FROM months m LEFT JOIN periods p ON p.id=m.id LEFT JOIN plans b ON b.period_id=m.id
      LEFT JOIN owners o ON o.period_id=m.id LEFT JOIN spending s ON s.period_id=m.id ORDER BY m.id
  `,
  )
    .bind(year)
    .all<MonthReport>();
  try {
    return c.json(summarizeYear(year, result.results));
  } catch {
    fail(
      503,
      "REPORT_RANGE",
      "Total tahun ini terlalu besar untuk dihitung dengan aman.",
    );
  }
}
