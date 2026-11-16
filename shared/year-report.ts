export interface MonthReport {
  id: string;
  exists: boolean;
  missingOwners: number;
  missingAmounts: number;
  income: number;
  allocation: number;
  spent: number;
  reserved?: number;
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
  reserved?: number;
}
export function summarizeYear(year: string, rows: MonthReport[]): YearReport {
  const months = rows.map((row) => ({
    ...row,
    complete: row.exists && row.missingOwners === 0 && row.missingAmounts === 0,
  }));
  const complete = months.filter((row) => row.complete);
  const sum = (key: "income" | "allocation" | "spent" | "reserved") => {
    let total = 0n;
    for (const row of complete) {
      if (!Number.isSafeInteger(row[key] ?? 0) || (row[key] ?? 0) < 0)
        throw Error("REPORT_RANGE");
      total += BigInt(row[key] ?? 0);
    }
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw Error("REPORT_RANGE");
    return Number(total);
  };
  const income = sum("income"),
    allocation = sum("allocation"),
    spent = sum("spent"),
    reserved = sum("reserved");
  return {
    year,
    months,
    included: complete.length,
    excluded: months.filter((row) => row.exists && !row.complete).length,
    income,
    allocation,
    spent,
    reserved,
    remaining: income - allocation - reserved,
  };
}
