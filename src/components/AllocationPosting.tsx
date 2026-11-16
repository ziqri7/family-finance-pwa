import { useState } from "react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { MoneyInput } from "./MoneyInput";
import { IncomeEvidence } from "./IncomeEvidence";
import { api } from "../lib/api";
import type { FinanceStore } from "../lib/use-finance";
import { rupiah, type Item } from "../../shared/domain";
import { ledger, type PostingKind } from "../../shared/ledger";
const names = {
  external: "Pembayaran",
  internal: "Kiriman pasangan",
  reserve: "Tabungan sendiri",
};
interface Review {
  item: Item;
  relatedTotal: number;
  relatedCount: number;
  relatedEvidenceCount: number;
  expectedRevision: number;
}
export function AllocationPosting({
  item,
  store,
  canEdit,
  active,
}: {
  item: Item;
  store: FinanceStore;
  canEdit: boolean;
  active: boolean;
}) {
  const [review, setReview] = useState<Review | null>(null),
    [kind, setKind] = useState<PostingKind>("external"),
    [date, setDate] = useState(""),
    [amount, setAmount] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [evidence, setEvidence] = useState(false);
  async function open() {
    if (!(await store.flush())) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<Review>("/items/" + item.id + "/posting");
      setReview(r);
      setKind(
        r.item.posting_kind ??
          (r.item.kind === "transfer_out" ? "internal" : "external"),
      );
      setDate(r.item.posting_date ?? "");
      setAmount(
        String(
          r.item.recording_mode !== "actual" && r.relatedCount
            ? r.relatedTotal
            : (r.item.amount ?? ""),
        ),
      );
    } catch (e) {
      store.setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const files = store.snapshot!.attachments.filter(
    (f) => f.allocation_item_id === item.id && f.status === "ready",
  ).length;
  return (
    <>
      <div className="posting-controls">
        <span className="posting-state">
          {item.recording_mode === "actual"
            ? item.amount === null
              ? "Belum dibayar / diserahkan"
              : "Tercatat otomatis"
            : "Alur lama · belum digabung"}
        </span>
        {item.recording_mode === "actual" && item.posting_kind && (
          <small>{names[item.posting_kind]}</small>
        )}
        {canEdit && (
          <Button
            variant="ghost"
            disabled={busy || !active || !store.online}
            onClick={() => void open()}
          >
            {item.recording_mode === "actual"
              ? item.posting_kind
                ? "Jenis / tanggal"
                : "Pilih jenis pembagian"
              : "Tinjau pencatatan"}
          </Button>
        )}
        {item.recording_mode === "actual" && item.amount !== null && (
          <Button
            variant="ghost"
            disabled={!active || !store.online}
            onClick={async () => {
              if (await store.flush()) setEvidence(true);
            }}
          >
            {canEdit ? "Tambah / lihat bukti" : "Lihat bukti"} ({files})
          </Button>
        )}
      </div>
      {active && evidence && (
        <IncomeEvidence
          allocation
          item={item}
          store={store}
          canEdit={canEdit}
          onClose={() => setEvidence(false)}
        />
      )}
      {active && review && (
        <Dialog
          open
          title={
            review.item.recording_mode === "actual"
              ? "Rincian pembagian"
              : "Tinjau alokasi lama"
          }
          busy={busy}
          onOpenChange={(v) => {
            if (!v) setReview(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api("/items/" + item.id + "/posting", {
                  method: "PATCH",
                  body: {
                    expectedVersion: review.item.row_version,
                    expectedRevision: review.expectedRevision,
                    postingKind: kind,
                    date: date || null,
                    amount:
                      review.item.recording_mode === "actual"
                        ? review.item.amount
                        : amount === ""
                          ? null
                          : Number(amount),
                    confirmed: true,
                  },
                });
                await store.refresh(true);
                setReview(null);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              {item.label} ·{" "}
              {review.item.amount === null
                ? "Nominal belum diisi"
                : rupiah.format(review.item.amount)}
            </p>
            {review.item.recording_mode !== "actual" && (
              <>
                <p className="helper-note">
                  Nominal pos:{" "}
                  {review.item.amount === null
                    ? "belum diisi"
                    : rupiah.format(review.item.amount)}
                  . Ada {review.relatedCount} catatan terkait, total{" "}
                  {rupiah.format(review.relatedTotal)}. Ada{" "}
                  {review.relatedEvidenceCount} bukti lama. Catatan lama dan
                  buktinya tetap menjadi histori; totalnya tidak dijumlahkan
                  lagi sesudah digantikan Alokasi.
                </p>
                <label htmlFor={"review-amount-" + item.id}>
                  Nominal yang benar sudah dibayar / diserahkan
                </label>
                <MoneyInput
                  id={"review-amount-" + item.id}
                  value={amount}
                  onValueChange={setAmount}
                />
              </>
            )}
            <label htmlFor={"posting-kind-" + item.id}>Jenis pembagian</label>
            <select
              id={"posting-kind-" + item.id}
              value={kind}
              onChange={(e) => setKind(e.target.value as PostingKind)}
            >
              {Object.entries(names).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
            <p className="helper-note">
              Pembayaran masuk belanja keluarga. Kiriman masuk ke bagian
              pasangan. Tabungan sendiri mengurangi uang siap dibagi dan
              ditampilkan terpisah dari belanja.
            </p>
            <label htmlFor={"posting-date-" + item.id}>
              Tanggal (opsional)
            </label>
            <input
              id={"posting-date-" + item.id}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={item.period_id + "-01"}
              max={
                item.period_id +
                "-" +
                new Date(
                  Number(item.period_id.slice(0, 4)),
                  Number(item.period_id.slice(5)),
                  0,
                ).getDate()
              }
            />
            <p className="helper-note">
              Jika kosong, catatan memakai konteks bulan, tanpa mengarang
              tanggal pembayaran.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setReview(null)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Menyimpan…"
                  : review.item.recording_mode === "actual"
                    ? "Simpan rincian"
                    : "Setujui dan gunakan alokasi"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function AutomaticRecords({
  snapshot,
  owner,
  onItem,
}: {
  snapshot: NonNullable<FinanceStore["snapshot"]>;
  owner?: string | null;
  onItem: (item: Item) => void;
}) {
  return (
    <>
      {ledger(snapshot)
        .filter(
          (r) =>
            r.source === "allocation" &&
            (!owner || r.owner_id === owner || r.posting_kind === "internal"),
        )
        .map((r) => (
          <article className="record" key={r.id}>
            <div className="record-text">
              <strong>{r.label}</strong>
              <small>
                {owner && r.owner_id !== owner
                  ? "Kiriman masuk"
                  : names[r.posting_kind]}{" "}
                · {r.date || r.period_id} · dari Alokasi
              </small>
            </div>
            <strong className="record-amount">{rupiah.format(r.amount)}</strong>
            <Button
              variant="ghost"
              onClick={() => {
                const item = snapshot.items.find((i) => i.id === r.item_id);
                if (item) onItem(item);
              }}
            >
              Bukti
            </Button>
          </article>
        ))}
    </>
  );
}
