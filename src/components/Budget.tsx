import { useState } from "react";
import { Trash2, Plus, Check, LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
import type { FinanceStore } from "../lib/use-finance";
import type { Item, Owner, Kind } from "../../shared/domain";
import {
  totals,
  rupiah,
  digits,
  ratio,
  other,
  ownerName,
} from "../../shared/domain";
function FieldError({
  item,
  field,
  store,
}: {
  item: Item;
  field: "label" | "amount";
  store: FinanceStore;
}) {
  const key = item.id + ":" + field,
    draft = store.drafts.get(key);
  if (!draft || !["error", "conflict"].includes(draft.status)) return null;
  return (
    <div id={"error-" + key} className="field-error" role="alert">
      <p>{draft.message}</p>
      {draft.status === "conflict" ? (
        <>
          <p>
            Nilai terbaru:{" "}
            {draft.current?.deleted_at
              ? "Pos telah dihapus"
              : field === "amount"
                ? draft.current?.amount == null
                  ? "Belum diisi"
                  : rupiah.format(draft.current.amount)
                : draft.current?.label}
          </p>
          <div className="inline-actions">
            <Button
              variant="secondary"
              onClick={() => store.resolve(key, false)}
            >
              Gunakan nilai terbaru
            </Button>
            <Button
              variant="ghost"
              disabled={!draft.current || Boolean(draft.current.deleted_at)}
              onClick={() => store.resolve(key, true)}
            >
              Simpan isian saya
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant="ghost"
          disabled={!store.online}
          onClick={() => void store.commit(key)}
        >
          Coba lagi
        </Button>
      )}
    </div>
  );
}
function BudgetRow({
  item,
  canEdit,
  store,
  income,
}: {
  item: Item;
  canEdit: boolean;
  store: FinanceStore;
  income: number;
}) {
  const [focused, setFocused] = useState(false),
    label = store.drafts.get(item.id + ":label"),
    amount = store.drafts.get(item.id + ":amount");
  const disabled =
    !canEdit || !store.online || store.busy || Boolean(item.deleted_at);
  return (
    <div className="budget-row">
      <div className="row-fields">
        <div className="label-field">
          <input
            aria-label={"Nama pos " + item.label}
            aria-invalid={
              label?.status === "error" ||
              label?.status === "conflict" ||
              undefined
            }
            aria-describedby={
              label && ["error", "conflict"].includes(label.status)
                ? "error-" + item.id + ":label"
                : undefined
            }
            value={label?.value ?? item.label}
            maxLength={100}
            disabled={disabled}
            onChange={(e) => store.edit(item, "label", e.target.value)}
            onBlur={() => {
              if (label) void store.commit(item.id + ":label");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>
        <div className="amount-field">
          <span aria-hidden="true">Rp</span>
          <input
            aria-label={"Nominal " + item.label}
            aria-invalid={
              amount?.status === "error" ||
              amount?.status === "conflict" ||
              undefined
            }
            aria-describedby={
              amount && ["error", "conflict"].includes(amount.status)
                ? "error-" + item.id + ":amount"
                : undefined
            }
            inputMode="numeric"
            autoComplete="off"
            disabled={disabled}
            placeholder="Belum diisi"
            value={
              amount?.value ??
              (item.amount === null
                ? ""
                : focused
                  ? String(item.amount)
                  : digits.format(item.amount))
            }
            onFocus={() => setFocused(true)}
            onChange={(e) => store.edit(item, "amount", e.target.value)}
            onBlur={() => {
              setFocused(false);
              if (amount) void store.commit(item.id + ":amount");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>
        <span className="row-ratio">{ratio(item.amount ?? 0, income)}</span>
        {canEdit && (
          <button
            className="icon-button delete-item"
            aria-label={"Hapus " + item.label}
            disabled={disabled}
            onClick={async () => {
              try {
                const confirmed = await store.itemForDelete(item);
                if (
                  confirm(
                    `Hapus pos “${confirmed.label}” (${confirmed.amount === null ? "belum diisi" : rupiah.format(confirmed.amount)}) dari bulan ini?`,
                  )
                )
                  await store.mutate("/items/" + confirmed.id, "DELETE", {
                    expectedVersion: confirmed.row_version,
                  });
              } catch (e) {
                store.setMessage((e as Error).message);
              }
            }}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <FieldError item={item} field="label" store={store} />
      <FieldError item={item} field="amount" store={store} />
    </div>
  );
}
export function Budget({
  store,
  owner,
  actor,
  onCreate,
  onAdd,
}: {
  store: FinanceStore;
  owner: Owner;
  actor: Owner;
  onCreate: () => void;
  onAdd: (kind: Kind) => void;
}) {
  const s = store.snapshot!;
  const stats = totals(s, owner),
    canEdit = owner === actor,
    exists = s.budgets.some((b) => b.owner_id === owner);
  return (
    <>
      <p className="access-note">
        {canEdit
          ? "Isi nominal pada pos anggaran Anda."
          : `Bagian ${ownerName[owner].toLowerCase()} · hanya bisa dilihat dari akun Anda.`}
      </p>
      {!exists ? (
        <section className="empty-panel">
          <h2>Anggaran belum dibuat</h2>
          <p>Anggaran bulan ini belum dibuat.</p>
          {canEdit && <Button onClick={onCreate}>Buat anggaran saya</Button>}
        </section>
      ) : (
        <>
          <section className="budget-summary" aria-label="Ringkasan anggaran">
            <div className="budget-remaining">
              <span>Sisa anggaran</span>
              <strong className={stats.remaining < 0 ? "negative" : ""}>
                {rupiah.format(stats.remaining)}
              </strong>
              <small>
                {stats.income === 0
                  ? "Isi pemasukan untuk menghitung persentase."
                  : ratio(Math.abs(stats.remaining), stats.income) +
                    (stats.remaining < 0
                      ? " melebihi dana anggaran"
                      : " belum dialokasikan")}
              </small>
            </div>
            <div className="budget-total">
              <div>
                <span>Dana anggaran</span>
                <strong>{rupiah.format(stats.income)}</strong>
              </div>
              <div>
                <span>Alokasi + kiriman</span>
                <strong>
                  {rupiah.format(stats.allocation + stats.outgoing)}
                </strong>
              </div>
            </div>
          </section>
          <section className="budget-workspace" aria-label="Pengisian anggaran">
            <div className="section-heading">
              <div>
                <h2>Pos keuangan</h2>
                <p>Isi nominal, lalu tekan Enter atau pindah kolom.</p>
              </div>
              <span className="save-status" role="status">
                {store.draftList.some(([, d]) => d.status === "saving") ? (
                  <>
                    <LoaderCircle size={14} />
                    Menyimpan…
                  </>
                ) : store.hasDrafts ? (
                  "Ada isian belum tersimpan"
                ) : (
                  <>
                    <Check size={14} />
                    Tersimpan
                  </>
                )}
              </span>
            </div>
            <div className="column-head" aria-hidden="true">
              <span>Nama pos</span>
              <span>Nominal (Rp)</span>
              <span>% dana</span>
              <span />
            </div>
            {(["income", "allocation", "transfer_out"] as Kind[]).map(
              (kind) => (
                <section className="budget-group" key={kind}>
                  <div className="group-heading">
                    <h3>
                      <span className="group-dot" />
                      {kind === "income"
                        ? "Pemasukan sendiri"
                        : kind === "allocation"
                          ? "Alokasi"
                          : "Rencana kiriman ke " +
                            ownerName[other(owner)].toLowerCase()}
                    </h3>
                    <strong>
                      {rupiah.format(
                        s.items
                          .filter(
                            (i) =>
                              i.owner_id === owner &&
                              !i.deleted_at &&
                              i.kind === kind,
                          )
                          .reduce((sum, i) => sum + (i.amount ?? 0), 0),
                      )}
                    </strong>
                  </div>
                  {s.items
                    .filter((i) => i.owner_id === owner && i.kind === kind)
                    .map((item) => (
                      <BudgetRow
                        key={item.id}
                        item={item}
                        canEdit={canEdit}
                        store={store}
                        income={stats.income}
                      />
                    ))}
                  {kind === "income" && stats.incoming > 0 && (
                    <div className="derived-income">
                      <span>
                        Rencana kiriman dari{" "}
                        {ownerName[other(owner)].toLowerCase()} · otomatis
                      </span>
                      <strong>{rupiah.format(stats.incoming)}</strong>
                    </div>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      className="add-item"
                      disabled={!store.online || store.busy}
                      onClick={() => onAdd(kind)}
                    >
                      <Plus size={15} />
                      {kind === "income"
                        ? "Tambah pemasukan"
                        : kind === "allocation"
                          ? "Tambah alokasi"
                          : "Tambah rencana kiriman"}
                    </Button>
                  )}
                </section>
              ),
            )}
          </section>
          <p className="helper-note">
            Perubahan hanya untuk bulan ini. Kiriman internal tidak dihitung
            sebagai belanja keluarga.
          </p>
        </>
      )}
    </>
  );
}
