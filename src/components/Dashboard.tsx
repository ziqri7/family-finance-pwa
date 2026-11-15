import { MonthCharts } from "./FinanceCharts";
import {
  ArrowUpRight,
  ReceiptText,
  ArrowLeftRight,
  NotebookPen,
} from "lucide-react";
import { Button } from "./ui/button";
import { YearDashboard } from "./YearDashboard";
import {
  ownerName,
  rupiah,
  type Snapshot,
  type Owner,
  type Expense,
  type Attachment,
} from "../../shared/domain";
export function ExpenseList({
  snapshot,
  owner,
  actor,
  onEdit,
  onDelete,
  onEvidence,
}: {
  snapshot: Snapshot;
  owner: Owner | null;
  actor: Owner;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  onEvidence: (e: Expense) => void;
}) {
  const list = snapshot.expenses
    .filter((e) => !e.deleted_at && (!owner || e.owner_id === owner))
    .sort(
      (a, b) =>
        b.occurred_on.localeCompare(a.occurred_on) || b.id.localeCompare(a.id),
    );
  return (
    <>
      {!list.length && (
        <p className="empty-note">Belum ada pengeluaran yang dicatat.</p>
      )}
      {list.map((e) => {
        const files = snapshot.attachments.filter((a) => a.expense_id === e.id),
          ready = files.filter((a) => a.status === "ready"),
          pending = files.filter((a) => a.status !== "ready"),
          item = snapshot.items.find((i) => i.id === e.item_id);
        return (
          <article className="record" key={e.id}>
            <span className="record-icon">
              <ArrowUpRight size={18} />
            </span>
            <div className="record-text">
              <strong>{e.note}</strong>
              <small>
                {ownerName[e.owner_id]} ·{" "}
                {new Intl.DateTimeFormat("id-ID", {
                  day: "numeric",
                  month: "short",
                }).format(new Date(e.occurred_on + "T12:00:00"))}{" "}
                · {item?.label}
              </small>
            </div>
            <strong className="record-amount">{rupiah.format(e.amount)}</strong>
            <div className="record-actions">
              {ready.length ? (
                <Button variant="ghost" onClick={() => onEvidence(e)}>
                  Lihat {ready.length} bukti
                </Button>
              ) : (
                <small>Tanpa bukti</small>
              )}
              {pending.length > 0 && (
                <small>{pending.length} bukti belum selesai</small>
              )}
              {owner === actor && e.owner_id === actor && (
                <>
                  <Button variant="ghost" onClick={() => onEdit(e)}>
                    Ubah
                  </Button>
                  <Button variant="ghost" onClick={() => onDelete(e)}>
                    Hapus
                  </Button>
                </>
              )}
            </div>
            {ready.length > 0 && (
              <div className="proof-strip">
                {ready.map((a) => (
                  <button
                    key={a.id}
                    className="proof-thumb"
                    aria-label={"Buka bukti " + e.note}
                    onClick={() => onEvidence(e)}
                  >
                    <img
                      loading="lazy"
                      src={"/api/attachments/" + a.id + "/content"}
                      alt={"Bukti " + e.note}
                    />
                  </button>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </>
  );
}
export function EvidenceImages({ files }: { files: Attachment[] }) {
  return (
    <div className="evidence-images">
      {files.map((f, i) => (
        <figure key={f.id}>
          <img
            src={
              "/api/" +
              (f.income_item_id ? "income-attachments/" : "attachments/") +
              f.id +
              "/content"
            }
            alt={
              (f.income_item_id ? "Bukti pemasukan " : "Bukti pengeluaran ") +
              (i + 1)
            }
          />
          <figcaption>Bukti {i + 1}</figcaption>
        </figure>
      ))}
    </div>
  );
}
export function Dashboard({
  snapshot,
  periods,
  active = true,
  actor,
  onView,
  onExpense,
  onTransfer,
  onEdit,
  onDelete,
  onEvidence,
  mode,
  onMode,
}: {
  snapshot: Snapshot;
  periods: { id: string; revision: number }[];
  active?: boolean;
  actor: Owner;
  onView: (owner: Owner) => void;
  onExpense: () => void;
  onTransfer: () => void;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  onEvidence: (e: Expense) => void;
  mode: "bulan" | "tahun";
  onMode: (mode: "bulan" | "tahun") => void;
}) {
  if (!active) return null;
  return (
    <>
      <div
        className="finance-switch"
        role="group"
        aria-label="Periode ringkasan"
      >
        <button aria-pressed={mode === "bulan"} onClick={() => onMode("bulan")}>
          Bulan
        </button>
        <button aria-pressed={mode === "tahun"} onClick={() => onMode("tahun")}>
          Tahun
        </button>
      </div>
      {mode === "bulan" ? (
        <MonthCharts snapshot={snapshot} />
      ) : (
        <YearDashboard snapshot={snapshot} periods={periods} active={active} />
      )}
      <div className="quick-actions">
        <Button variant="secondary" onClick={() => onView(actor)}>
          <NotebookPen size={17} />
          Isi anggaran
        </Button>
        <Button variant="secondary" onClick={onExpense}>
          <ReceiptText size={17} />
          Pengeluaran
        </Button>
        <Button variant="secondary" onClick={onTransfer}>
          <ArrowLeftRight size={17} />
          Catat kiriman
        </Button>
      </div>
      <section className="records-panel" id="records">
        <div className="section-heading">
          <h2>Catatan bulan ini</h2>
          <Button onClick={onExpense}>+ Catat</Button>
        </div>
        <ExpenseList
          snapshot={snapshot}
          owner={null}
          actor={actor}
          onEdit={onEdit}
          onDelete={onDelete}
          onEvidence={onEvidence}
        />
      </section>
    </>
  );
}
