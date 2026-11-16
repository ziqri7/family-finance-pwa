import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { MoneyInput } from "./MoneyInput";
import { api } from "../lib/api";
import {
  submitPostings,
  type PostingReview,
  type BatchResult,
} from "../lib/batch-postings";
import type { FinanceStore } from "../lib/use-finance";
import { rupiah, type Owner } from "../../shared/domain";
import type { PostingKind } from "../../shared/ledger";
interface Row {
  review: PostingReview;
  selected: boolean;
  amount: string;
  kind: PostingKind;
  result?: BatchResult;
}
export function QuickPosting({
  store,
  owner,
  active,
}: {
  store: FinanceStore;
  owner: Owner;
  active: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!active) controller.current?.abort();
    return () => controller.current?.abort();
  }, [active]);
  const eligible = store.snapshot!.items.filter(
    (i) =>
      i.owner_id === owner &&
      i.kind !== "income" &&
      i.recording_mode !== "actual" &&
      i.amount !== null &&
      !store.snapshot!.groupItems?.some((m) => m.item_id === i.id) &&
      !i.deleted_at,
  );
  async function start() {
    if (!(await store.flush())) return;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setOpen(true);
    setRows([]);
    setError("");
    setLoading(true);
    try {
      const loaded: Row[] = [];
      for (const item of eligible) {
        const review = await api<PostingReview>(
          "/items/" + item.id + "/posting",
          { signal: c.signal },
        );
        if (
          review.item.recording_mode === "actual" ||
          review.item.amount === null
        )
          continue;
        loaded.push({
          review,
          selected: true,
          amount: String(
            review.relatedCount
              ? review.relatedTotal
              : (review.item.amount ?? 0),
          ),
          kind: review.item.kind === "transfer_out" ? "internal" : "external",
        });
      }
      setRows(loaded);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const selected = rows.filter(
      (r) => r.selected && r.result?.status !== "done",
    ),
    done = rows.filter((r) => r.result?.status === "done").length;
  function update(index: number, patch: Partial<Row>) {
    setRows((old) => old.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  return (
    <>
      {eligible.length > 0 && (
        <div className="quick-posting">
          <div>
            <strong>Alokasi lama sudah dibayar?</strong>
            <p>Tandai sekaligus, tanpa membuka setiap pos.</p>
          </div>
          <Button
            disabled={!active || !store.online || store.busy}
            onClick={() => void start()}
          >
            Sudah dibayar / diserahkan ({eligible.length})
          </Button>
        </div>
      )}
      {open && active && (
        <Dialog
          open
          title="Tandai pembayaran sekaligus"
          description="Hanya bagian Anda pada bulan ini. Pos kosong tidak ikut ditandai."
          busy={busy || loading}
          wide
          onOpenChange={(v) => {
            if (!v) setOpen(false);
          }}
        >
          {loading ? (
            <p role="status">Memuat ringkasan pos…</p>
          ) : (
            <form
              className="quick-posting-form"
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  e.target instanceof HTMLInputElement &&
                  e.target.type !== "checkbox"
                ) {
                  e.preventDefault();
                  e.target.blur();
                }
              }}
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const c = new AbortController();
                controller.current = c;
                try {
                  await submitPostings(
                    selected.map((r) => ({
                      review: r.review,
                      amount: Number(r.amount),
                      kind: r.kind,
                    })),
                    api,
                    c.signal,
                    (result) =>
                      setRows((old) =>
                        old.map((r) =>
                          r.review.item.id === result.id ? { ...r, result } : r,
                        ),
                      ),
                  );
                  await store.refresh(true);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p className="helper-note">
                Periksa nominal dan jenis, lalu tandai sekaligus. Pilih Ke
                pasangan untuk kiriman suami/istri, Tabungan sendiri untuk
                tabungan. Catatan lama tidak dihitung ganda.
              </p>
              {rows.length > 0 && (
                <label className="quick-select">
                  <input
                    type="checkbox"
                    checked={rows.every(
                      (r) => r.selected || r.result?.status === "done",
                    )}
                    disabled={busy}
                    onChange={(e) =>
                      setRows((old) =>
                        old.map((r) =>
                          r.result?.status === "done"
                            ? r
                            : { ...r, selected: e.target.checked },
                        ),
                      )
                    }
                  />
                  Pilih semua pos terisi
                </label>
              )}
              <div className="quick-posting-list">
                {rows.map((r, i) => (
                  <div className="quick-posting-row" key={r.review.item.id}>
                    <label className="quick-select">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        disabled={busy || r.result?.status === "done"}
                        onChange={(e) =>
                          update(i, { selected: e.target.checked })
                        }
                      />
                      <strong>{r.review.item.label}</strong>
                    </label>
                    {r.review.relatedCount > 0 && (
                      <small>
                        Nominal pos {rupiah.format(r.review.item.amount ?? 0)}
                        {r.review.relatedCount
                          ? ` · ${r.review.relatedCount} catatan lama: ${rupiah.format(r.review.relatedTotal)}`
                          : ""}
                      </small>
                    )}
                    <div className="quick-posting-fields">
                      <label>
                        Nominal (Rp)
                        <MoneyInput
                          aria-label={
                            "Nominal sekaligus " + r.review.item.label
                          }
                          value={r.amount}
                          min="0"
                          max="1000000000000"
                          required
                          disabled={
                            busy || !r.selected || r.result?.status === "done"
                          }
                          onValueChange={(amount) => update(i, { amount })}
                        />
                      </label>
                      <label>
                        Jenis
                        <select
                          aria-label={"Jenis sekaligus " + r.review.item.label}
                          value={r.kind}
                          disabled={
                            busy || !r.selected || r.result?.status === "done"
                          }
                          onChange={(e) =>
                            update(i, { kind: e.target.value as PostingKind })
                          }
                        >
                          <option value="external">Pembayaran</option>
                          <option value="internal">Ke pasangan</option>
                          <option value="reserve">Tabungan sendiri</option>
                        </select>
                      </label>
                    </div>
                    {r.result && (
                      <p
                        className={
                          r.result.status === "done" ? "quick-done" : "error"
                        }
                        role="status"
                      >
                        {r.result.status === "done"
                          ? "Sudah dicatat"
                          : r.result.message}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {!rows.length && !error && (
                <p>Tidak ada pos terisi yang perlu ditandai.</p>
              )}
              {done > 0 && (
                <p className="helper-note" role="status">
                  {done} pos berhasil dicatat. Pos yang belum berhasil tetap
                  dapat dicoba lagi; yang berhasil tidak diulang.
                </p>
              )}
              {rows.some((r) => r.result?.status === "changed") && (
                <Button
                  variant="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void start()}
                >
                  Muat ulang ringkasan
                </Button>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="dialog-actions">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  Tutup
                </Button>
                {selected.length > 0 && (
                  <Button type="submit" disabled={busy || !store.online}>
                    {busy
                      ? "Mencatat…"
                      : `Tandai ${selected.length} pos selesai`}
                  </Button>
                )}
              </div>
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}
