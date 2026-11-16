import { AllocationPosting } from "./AllocationPosting";
import { ledgerTotals as totals } from "../../shared/ledger";
import { MoneyInput } from "./MoneyInput";
import { useState } from "react";
import { IncomeEvidence } from "./IncomeEvidence";
import { Trash2, Plus, Check, LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
import type { FinanceStore } from "../lib/use-finance";
import type { Item, Owner, Kind } from "../../shared/domain";
import { rupiah, ratio, other, ownerName } from "../../shared/domain";
const groupOf = (i: Item): Kind =>
  i.recording_mode === "actual" && i.posting_kind
    ? i.posting_kind === "internal"
      ? "transfer_out"
      : "allocation"
    : i.kind;
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
  active,
}: {
  item: Item;
  canEdit: boolean;
  store: FinanceStore;
  income: number;
  active: boolean;
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const label = store.drafts.get(item.id + ":label"),
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
          <MoneyInput
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
            disabled={
              disabled ||
              (item.recording_mode === "actual" && !item.posting_kind)
            }
            placeholder="Belum diisi"
            value={
              amount?.value ?? (item.amount === null ? "" : String(item.amount))
            }
            onValueChange={(value) => {
              if (
                value === "" &&
                store.snapshot!.attachments.some(
                  (f) =>
                    f.allocation_item_id === item.id && f.status !== "deleting",
                ) &&
                !confirm(
                  "Batalkan pembagian ini dan lepaskan seluruh buktinya?",
                )
              )
                return;
              store.edit(
                item,
                "amount",
                value,
                value === "" &&
                  store.snapshot!.attachments.some(
                    (f) =>
                      f.allocation_item_id === item.id &&
                      f.status !== "deleting",
                  ),
              );
            }}
            onBlur={() => {
              if (amount) void store.commit(item.id + ":amount");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>
        <span className="row-ratio">
          {item.amount === null ? "—" : ratio(item.amount, income)}
        </span>
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
      {item.kind !== "income" && (
        <div className="budget-progress" aria-hidden="true">
          <span
            className={
              item.amount !== null && item.amount > income ? "over" : ""
            }
            style={{
              width:
                income > 0
                  ? Math.min(100, ((item.amount || 0) / income) * 100) + "%"
                  : "0%",
            }}
          />
        </div>
      )}
      {item.kind !== "income" && (
        <AllocationPosting
          item={item}
          store={store}
          canEdit={canEdit}
          active={active}
        />
      )}
      <FieldError item={item} field="label" store={store} />
      <FieldError item={item} field="amount" store={store} />
      {item.kind === "income" && (
        <Button
          variant="ghost"
          className="income-evidence-action"
          disabled={!active || store.busy || !store.online}
          onClick={async () => {
            if (await store.flush()) setEvidenceOpen(true);
          }}
        >
          {canEdit ? "Tambah / lihat bukti" : "Lihat bukti"} (
          {
            store.snapshot!.attachments.filter(
              (f) => f.income_item_id === item.id && f.status === "ready",
            ).length
          }
          )
        </Button>
      )}
      {active && evidenceOpen && (
        <IncomeEvidence
          key={item.id}
          item={item}
          store={store}
          canEdit={canEdit}
          onClose={() => setEvidenceOpen(false)}
        />
      )}
    </div>
  );
}
export function Budget({
  store,
  owner,
  actor,
  onCreate,
  onAdd,
  active = true,
}: {
  store: FinanceStore;
  owner: Owner;
  actor: Owner;
  onCreate: () => void;
  onAdd: (kind: Kind) => void;
  active?: boolean;
}) {
  const s = store.snapshot!;
  const stats = totals(s, owner),
    canEdit = owner === actor,
    exists = s.budgets.some((b) => b.owner_id === owner);
  return (
    <>
      <p className="access-note">
        {canEdit
          ? "Isi nominal sesudah membayar atau menyerahkan uang."
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
          <section
            className={
              "budget-summary visual-owner " +
              (owner === "partner-b" ? "owner-wife " : "") +
              (stats.remaining < 0 ? "has-deficit" : "")
            }
            aria-label="Ringkasan anggaran"
          >
            <div className="budget-remaining">
              <span>Sisa belum dibagikan</span>
              <strong className={stats.remaining < 0 ? "negative" : ""}>
                {rupiah.format(stats.remaining)}
              </strong>
              <small>
                {stats.income === 0
                  ? "Isi pemasukan untuk menghitung persentase."
                  : ratio(Math.abs(stats.remaining), stats.income) +
                    (stats.remaining < 0
                      ? " melebihi dana anggaran"
                      : " belum dibagikan")}
              </small>
            </div>
            <div className="budget-total">
              <div>
                <span>Pemasukan + kiriman masuk</span>
                <strong>{rupiah.format(stats.income)}</strong>
              </div>
              <div>
                <span>Dibayar / diserahkan</span>
                <strong>{rupiah.format(stats.distributed)}</strong>
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
                          : "Kiriman pasangan ke " +
                            ownerName[other(owner)].toLowerCase()}
                    </h3>
                    <strong>
                      {rupiah.format(
                        s.items
                          .filter(
                            (i) =>
                              i.owner_id === owner &&
                              !i.deleted_at &&
                              groupOf(i) === kind,
                          )
                          .reduce((sum, i) => sum + (i.amount ?? 0), 0),
                      )}
                    </strong>
                  </div>
                  {s.items
                    .filter((i) => i.owner_id === owner && groupOf(i) === kind)
                    .map((item) => (
                      <BudgetRow
                        key={item.id}
                        item={item}
                        canEdit={canEdit}
                        store={store}
                        income={stats.income}
                        active={active}
                      />
                    ))}
                  {kind === "income" && stats.incoming > 0 && (
                    <div className="derived-income">
                      <span>
                        Kiriman pasangan dari{" "}
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
                          : "Tambah pos kiriman"}
                    </Button>
                  )}
                </section>
              ),
            )}
          </section>
          <p className="helper-note">
            Untuk bulan ini. Kiriman internal tidak menambah belanja keluarga.
          </p>
        </>
      )}
    </>
  );
}
