import type { Snapshot } from "./domain";
export function allocationChart(snapshot: Snapshot) {
  const items = snapshot.items.filter((i) => !i.deleted_at),
    missing = items.filter(
      (i) => ["income", "allocation"].includes(i.kind) && i.amount === null,
    ).length;
  const ownersComplete =
    new Set(snapshot.budgets.map((b) => b.owner_id)).size === 2;
  const incomeComplete =
    ownersComplete &&
    !items.some((i) => i.kind === "income" && i.amount === null);
  const groups = new Map<string, { label: string; amount: number }>();
  for (const i of items.filter(
    (i) => i.kind === "allocation" && i.amount !== null && i.amount > 0,
  )) {
    const key = i.label.trim().toLocaleLowerCase("id-ID"),
      old = groups.get(key);
    groups.set(key, {
      label: old?.label || i.label,
      amount: (old?.amount || 0) + i.amount!,
    });
  }
  const all = [...groups.values()].sort((a, b) => b.amount - a.amount),
    slices = all.slice(0, 3);
  if (all.length > 3)
    slices.push({
      label: "Pos lain (gabungan)",
      amount: all.slice(3).reduce((n, r) => n + r.amount, 0),
    });
  return { slices, missing, ownersComplete, incomeComplete };
}
