import type { Context } from "hono";
import type { AppEnv } from "./types";
import { fail } from "./http";
import { summarizeYear, type MonthReport } from "../shared/year-report";
export async function yearReport(c: Context<AppEnv>) {
  const year = c.req.param("year");
  if (!year || !/^(20\d{2}|2100)$/.test(year))
    fail(400, "INVALID_YEAR", "Pilih tahun antara 2000 dan 2100.");
  // One book, one aggregate. Usage and evidence are never financial sources.
  const result = await c.env.DB.prepare(
    `
    WITH months AS (SELECT $1 || '-' || lpad(n::text,2,'0') AS id FROM generate_series(1,12) n),
    plans AS (SELECT period_id,
      (count(*) FILTER (WHERE amount IS NULL OR (kind<>'income' AND recording_mode='legacy' AND amount IS NOT NULL)))::int AS missing,
      coalesce(sum(amount) FILTER (WHERE kind='income'),0)::bigint AS income,
      0::bigint AS allocation
      FROM budget_items WHERE deleted_at IS NULL AND period_id >= $1 || '-01' AND period_id <= $1 || '-12' GROUP BY period_id),
    extras AS (SELECT period_id,count(*)::int AS n FROM (
      SELECT period_id FROM expenses WHERE deleted_at IS NULL AND superseded_by_item_id IS NULL AND converted_to IS NULL
      UNION ALL SELECT period_id FROM transfers WHERE deleted_at IS NULL AND superseded_by_item_id IS NULL AND converted_to IS NULL
    ) e GROUP BY period_id)
    SELECT m.id,p.id IS NOT NULL AS exists,CASE WHEN EXISTS(SELECT 1 FROM budget_items WHERE period_id=m.id AND kind='income' AND deleted_at IS NULL) THEN 0 ELSE 1 END AS "missingOwners",
      (coalesce(b.missing,0)+coalesce(e.n,0))::int AS "missingAmounts",coalesce(b.income,0)::bigint AS income,
      coalesce(s.distributed,0)::bigint AS allocation,coalesce(s.distributed,0)::bigint AS spent,0::bigint AS reserved
    FROM months m LEFT JOIN periods p ON p.id=m.id LEFT JOIN plans b ON b.period_id=m.id
      LEFT JOIN extras e ON e.period_id=m.id LEFT JOIN family_book_totals s ON s.period_id=m.id ORDER BY m.id
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
