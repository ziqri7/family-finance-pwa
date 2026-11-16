import type { Snapshot, Owner, Item } from "./domain";
const other = (owner: Owner): Owner =>
  owner === "partner-a" ? "partner-b" : "partner-a";
export type PostingKind = "external" | "internal" | "reserve";
export interface LedgerEntry {
  id: string;
  source: "allocation" | "expense" | "transfer";
  sourceId: string;
  owner_id: Owner;
  item_id: string;
  label: string;
  amount: number;
  posting_kind: PostingKind;
  date: string | null;
  period_id: string;
}
export const actual = (i: Item) => i.recording_mode === "actual";
export function ledger(s: Snapshot): LedgerEntry[] {
  return [
    ...s.items
      .filter(
        (i) =>
          !i.deleted_at && actual(i) && i.amount !== null && i.posting_kind,
      )
      .map((i) => ({
        id: "allocation:" + i.id,
        source: "allocation" as const,
        sourceId: i.id,
        owner_id: i.owner_id,
        item_id: i.id,
        label: i.label,
        amount: i.amount!,
        posting_kind: i.posting_kind!,
        date: i.posting_date ?? null,
        period_id: i.period_id,
      })),
    ...s.expenses
      .filter((e) => !e.deleted_at && !e.superseded_by_item_id)
      .map((e) => ({
        id: "expense:" + e.id,
        source: "expense" as const,
        sourceId: e.id,
        owner_id: e.owner_id,
        item_id: e.item_id,
        label: e.note,
        amount: e.amount,
        posting_kind: "external" as const,
        date: e.occurred_on,
        period_id: e.period_id,
      })),
    ...s.transfers
      .filter((t) => !t.deleted_at && !t.superseded_by_item_id)
      .map((t) => ({
        id: "transfer:" + t.id,
        source: "transfer" as const,
        sourceId: t.id,
        owner_id: t.from_owner_id,
        item_id: t.source_item_id,
        label:
          s.items.find((i) => i.id === t.source_item_id)?.label ??
          "Kiriman pasangan",
        amount: t.amount,
        posting_kind: "internal" as const,
        date: t.occurred_on,
        period_id: t.period_id,
      })),
  ];
}
export function safeSum(values: number[]) {
  let n = 0n;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) throw Error("INTEGER_RANGE");
    n += BigInt(value);
  }
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw Error("INTEGER_RANGE");
  return Number(n);
}
export function ledgerTotals(s: Snapshot, owner: Owner) {
  const entries = ledger(s),
    sum = (o: Owner, k: PostingKind) =>
      safeSum(
        entries
          .filter((e) => e.owner_id === o && e.posting_kind === k)
          .map((e) => e.amount),
      );
  const external = safeSum(
      s.items
        .filter(
          (i) => !i.deleted_at && i.owner_id === owner && i.kind === "income",
        )
        .map((i) => i.amount ?? 0),
    ),
    incoming = sum(other(owner), "internal"),
    outgoing = sum(owner, "internal"),
    allocation = sum(owner, "external"),
    reserved = sum(owner, "reserve"),
    income = safeSum([external, incoming]),
    distributed = safeSum([allocation, outgoing, reserved]);
  return {
    external,
    incoming,
    outgoing,
    allocation,
    reserved,
    distributed,
    income,
    remaining: income - distributed,
    spent: allocation,
  };
}
export function effectiveFamilyTotals(s: Snapshot) {
  const a = ledgerTotals(s, "partner-a"),
    b = ledgerTotals(s, "partner-b"),
    income = safeSum([a.external, b.external]),
    spent = safeSum([a.spent, b.spent]),
    reserved = safeSum([a.reserved, b.reserved]);
  return {
    income,
    allocation: spent,
    reserved,
    remaining: income - spent - reserved,
    spent,
  };
}
