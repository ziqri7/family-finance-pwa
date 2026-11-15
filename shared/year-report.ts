export interface MonthReport {
  id: string;
  exists: boolean;
  missingOwners: number;
  missingAmounts: number;
  income: number;
  allocation: number;
  spent: number;
}
export type ReportMonth = MonthReport & { complete: boolean };
export interface YearReport {
  year: string;
  months: ReportMonth[];
  included: number;
  excluded: number;
  income: number;
  allocation: number;
  spent: number;
  remaining: number;
}
export function summarizeYear(year: string, rows: MonthReport[]): YearReport {
  const months = rows.map((row) => ({
    ...row,
    complete: row.exists && row.missingOwners === 0 && row.missingAmounts === 0,
  }));
  const complete = months.filter((row) => row.complete);
  const sum = (key: "income" | "allocation" | "spent") => {
    let total = 0n;
    for (const row of complete) {
      if (!Number.isSafeInteger(row[key]) || row[key] < 0)
        throw Error("REPORT_RANGE");
      total += BigInt(row[key]);
    }
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw Error("REPORT_RANGE");
    return Number(total);
  };
  const income = sum("income"),
    allocation = sum("allocation"),
    spent = sum("spent");
  return {
    year,
    months,
    included: complete.length,
    excluded: months.filter((row) => row.exists && !row.complete).length,
    income,
    allocation,
    spent,
    remaining: income - allocation,
  };
}
