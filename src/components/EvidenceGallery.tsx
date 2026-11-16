import { useState } from "react";
import {
  ownerName,
  rupiah,
  type Snapshot,
  type Expense,
  type Item,
} from "../../shared/domain";
export function EvidenceGallery({
  snapshot,
  onGroup,
  onExpense,
  onIncome,
}: {
  snapshot: Snapshot;
  onGroup: (id: string) => void;
  onExpense: (expense: Expense) => void;
  onIncome: (item: Item) => void;
}) {
  const [filter, setFilter] = useState("all");
  const files = snapshot.attachments.filter(
    (f) =>
      f.status === "ready" &&
      (filter === "all" ||
        (filter === "income" ? Boolean(f.income_item_id) : !f.income_item_id)),
  );
  return (
    <>
      <div className="evidence-filter" role="group" aria-label="Jenis bukti">
        {[
          ["all", "Semua"],
          ["expense", "Pengeluaran"],
          ["income", "Pemasukan"],
        ].map(([id, name]) => (
          <button
            key={id}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {name}
          </button>
        ))}
      </div>
      {!files.length && (
        <p className="evidence-empty">
          Belum ada bukti yang diunggah pada bulan ini.
        </p>
      )}
      <div className="evidence-gallery">
        {files.map((file) => {
          const group = file.group_id
            ? snapshot.groups?.find((g) => g.id === file.group_id)
            : null;
          const allocation = file.allocation_item_id
            ? snapshot.items.find((i) => i.id === file.allocation_item_id)
            : null;
          const income = file.income_item_id
              ? snapshot.items.find((i) => i.id === file.income_item_id)
              : null,
            expense = file.expense_id
              ? snapshot.expenses.find((e) => e.id === file.expense_id)
              : null,
            label =
              group?.label ||
              allocation?.label ||
              income?.label ||
              expense?.note ||
              "Bukti pengeluaran";
          return (
            <button
              className="evidence-tile"
              key={file.id}
              onClick={() => {
                if (group) onGroup(group.id);
                else if (allocation) onIncome(allocation);
                else if (income) onIncome(income);
                else if (expense) onExpense(expense);
              }}
              aria-label={"Lihat bukti " + label}
            >
              <img
                loading="lazy"
                src={
                  "/api/" +
                  (group
                    ? "group-attachments/"
                    : allocation
                      ? "allocation-attachments/"
                      : income
                        ? "income-attachments/"
                        : "attachments/") +
                  file.id +
                  "/content"
                }
                alt={"Bukti " + label}
              />
              <span>
                <strong>{label}</strong>
                <small>
                  {group
                    ? "Bukti bersama"
                    : income
                      ? "Pemasukan"
                      : "Pengeluaran"}{" "}
                  · {ownerName[file.owner_id]}
                </small>
                <small>
                  {group
                    ? (snapshot.groupItems ?? []).filter(
                        (m) => m.group_id === group.id && m.posted,
                      ).length + " pos"
                    : allocation || income
                      ? (allocation || income)!.amount === null
                        ? "Nominal belum diisi"
                        : rupiah.format((allocation || income)!.amount!)
                      : expense
                        ? rupiah.format(expense.amount)
                        : ""}
                </small>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
