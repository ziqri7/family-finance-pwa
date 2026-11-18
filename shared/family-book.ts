import type { Snapshot, Item } from "./domain";
import { safeSum } from "./ledger";
export function familyEntries(s: Snapshot) {
  return [
    ...s.items
      .filter(
        (i) =>
          !i.deleted_at &&
          i.kind !== "income" &&
          i.recording_mode === "actual" &&
          i.amount !== null,
      )
      .map((i) => ({ id: i.id, label: i.label, amount: i.amount! })),
    ...s.expenses
      .filter(
        (e) => !e.deleted_at && !e.superseded_by_item_id && !e.converted_to,
      )
      .map((e) => ({ id: e.id, label: e.note, amount: e.amount })),
    ...s.transfers
      .filter(
        (t) => !t.deleted_at && !t.superseded_by_item_id && !t.converted_to,
      )
      .map((t) => ({
        id: t.id,
        label:
          s.items.find((i) => i.id === t.source_item_id)?.label ||
          "Catatan lama",
        amount: t.amount,
      })),
  ];
}
export function usageTotal(s: Snapshot, itemId: string) {
  return safeSum(
    (s.usages || [])
      .filter((u) => u.item_id === itemId && !u.deleted_at)
      .map((u) => u.amount),
  );
}
export function familyBook(s: Snapshot) {
  const items = s.items.filter((i) => !i.deleted_at),
    income = safeSum(
      items.filter((i) => i.kind === "income").map((i) => i.amount ?? 0),
    );
  const entries = familyEntries(s),
    distributed = safeSum(entries.map((e) => e.amount));
  const legacy = items.filter(
    (i) =>
      i.kind !== "income" && i.amount !== null && i.recording_mode !== "actual",
  );
  const extras =
    s.expenses.filter(
      (e) => !e.deleted_at && !e.superseded_by_item_id && !e.converted_to,
    ).length +
    s.transfers.filter(
      (t) => !t.deleted_at && !t.superseded_by_item_id && !t.converted_to,
    ).length;
  const missing = items.filter((i) => i.amount === null).length;
  const complete =
    items.some((i) => i.kind === "income") &&
    missing === 0 &&
    legacy.length === 0 &&
    extras === 0;
  const grouped = new Map<string, { label: string; amount: number }>();
  for (const e of entries.filter((e) => e.amount > 0)) {
    const key = e.label.trim().toLocaleLowerCase("id-ID"),
      old = grouped.get(key);
    grouped.set(key, {
      label: old?.label || e.label,
      amount: safeSum([old?.amount || 0, e.amount]),
    });
  }
  const all = [...grouped.values()].sort((a, b) => b.amount - a.amount),
    slices = all.slice(0, 3);
  if (all.length > 3)
    slices.push({
      label: "Pos lainnya",
      amount: safeSum(all.slice(3).map((e) => e.amount)),
    });
  return {
    income,
    distributed,
    remaining: income - distributed,
    complete,
    missing,
    legacy,
    extras,
    slices,
  };
}
export const needsReview = (i: Item) =>
  i.kind !== "income" && i.amount !== null && i.recording_mode !== "actual";
