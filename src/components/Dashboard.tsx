import {
  ArrowUpRight,
  ReceiptText,
  ArrowLeftRight,
  NotebookPen,
} from "lucide-react";
import { Button } from "./ui/button";
import { YearDashboard } from "./YearDashboard";
import {
  ownerIds,
  ownerName,
  totals,
  familyTotals,
  rupiah,
  monthName,
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
            src={"/api/attachments/" + f.id + "/content"}
            alt={"Bukti pengeluaran " + (i + 1)}
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
}) {
  const f = familyTotals(snapshot);
  return (
    <>
      <section aria-label="Anggaran suami dan istri">
        <div className="section-heading">
          <h2>Anggaran kita</h2>
          <Button variant="ghost" onClick={() => onView(actor)}>
            Isi bagian saya
          </Button>
        </div>
        <div
          className="account-deck"
          tabIndex={0}
          aria-label="Kartu anggaran; gunakan panah kanan atau kiri untuk bergeser"
          onKeyDown={(e) => {
            if (
              e.target === e.currentTarget &&
              ["ArrowLeft", "ArrowRight"].includes(e.key)
            ) {
              e.preventDefault();
              e.currentTarget.scrollBy({
                left:
                  e.currentTarget.clientWidth *
                  (e.key === "ArrowRight" ? 1 : -1),
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "auto"
                  : "smooth",
              });
            }
          }}
        >
          {ownerIds.map((owner) => {
            const t = totals(snapshot, owner),
              exists = snapshot.budgets.some((b) => b.owner_id === owner);
            return (
              <article
                className={
                  "budget-card " + (owner === "partner-a" ? "husband" : "wife")
                }
                key={owner}
              >
                <div className="card-face">
                  <h3>{ownerName[owner]}</h3>
                  <p>{exists ? "Sisa anggaran" : "Anggaran bulan ini"}</p>
                  <strong
                    className={
                      "card-amount" + (t.remaining < 0 ? " card-negative" : "")
                    }
                  >
                    {exists ? rupiah.format(t.remaining) : "Belum dibuat"}
                  </strong>
                  <div className="card-details">
                    <span>Dana anggaran</span>
                    <strong>{exists ? rupiah.format(t.income) : "—"}</strong>
                  </div>
                </div>
                <div className="card-footer">
                  <span>
                    {exists
                      ? "Alokasi + kiriman " +
                        rupiah.format(t.allocation + t.outgoing)
                      : "Belum ada rencana"}
                  </span>
                  <button onClick={() => onView(owner)}>
                    Buka {ownerName[owner].toLowerCase()}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
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
      <section className="family-strip" aria-label="Ringkasan keluarga">
        {[
          ["Sisa keluarga", f.remaining],
          ["Pemasukan", f.income],
          ["Alokasi", f.allocation],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong className={Number(value) < 0 ? "negative" : ""}>
              {rupiah.format(Number(value))}
            </strong>
          </div>
        ))}
        <p>Anggaran gabungan · kiriman internal tidak dihitung dua kali.</p>
      </section>
      <YearDashboard snapshot={snapshot} periods={periods} active={active} />
      <div className="dashboard-columns">
        <div>
          <section className="records-panel" id="records">
            <div className="section-heading">
              <div>
                <h2>Catatan bulan ini</h2>
                <p>{monthName(snapshot.id)} · suami dan istri</p>
              </div>
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
          <section className="actual-stats" aria-label="Realisasi keluarga">
            {[
              [
                "Pengeluaran tercatat",
                rupiah.format(f.spent),
                "Total belanja suami dan istri. Kiriman antar pasangan tidak ikut dihitung.",
              ],
              [
                "Sisa setelah pengeluaran",
                rupiah.format(f.income - f.spent),
                "Pemasukan dikurangi pengeluaran tercatat. Angka ini bukan saldo rekening.",
              ],
              [
                "Bukti pengeluaran",
                snapshot.attachments.filter((a) => a.status === "ready")
                  .length + " gambar",
                "Ketuk bukti pada catatan untuk melihat gambarnya.",
              ],
            ].map(([label, value, hint]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{hint}</small>
              </div>
            ))}
          </section>
        </div>
        <aside className="family-detail">
          <h2>Rincian keluarga</h2>
          {ownerIds.map((owner) => {
            const t = totals(snapshot, owner);
            return (
              <section key={owner}>
                <div className="section-heading">
                  <h3>{ownerName[owner]}</h3>
                  <Button variant="ghost" onClick={() => onView(owner)}>
                    Lihat bagian
                  </Button>
                </div>
                <dl>
                  {[
                    ["Pemasukan sendiri", t.external],
                    ["Rencana kiriman masuk", t.incoming],
                    ["Alokasi sendiri", t.allocation],
                    ["Rencana kiriman keluar", t.outgoing],
                    ["Sisa anggaran", t.remaining],
                    ["Pengeluaran tercatat", t.spent],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd className={Number(value) < 0 ? "negative" : ""}>
                        {rupiah.format(Number(value))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
          <p className="helper-note">
            Rencana kiriman dan uang yang sudah dikirim dicatat terpisah.
            Keduanya bisa dilihat di bagian suami dan istri.
          </p>
        </aside>
      </div>
    </>
  );
}
