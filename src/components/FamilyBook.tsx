import { useState, useRef, useEffect } from "react";
import {
  Plus,
  ChevronRight,
  Check,
  Settings2,
  ImagePlus,
  Trash2,
  CircleHelp,
} from "lucide-react";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { MoneyInput } from "./MoneyInput";
import { FieldError } from "./Budget";
import { YearDashboard } from "./YearDashboard";
import { ChartInfo, compactMoney } from "./FinanceCharts";
import { api, upload } from "../lib/api";
import type { FinanceStore } from "../lib/use-finance";
import { familyBook, needsReview, usageTotal } from "../../shared/family-book";
import {
  ownerName,
  rupiah,
  ratio,
  randomId,
  MAX_AMOUNT,
  type Item,
  type Usage,
  type Attachment,
  type Owner,
  type Snapshot,
  type AllocationGroup,
} from "../../shared/domain";
import "./family-book.css";
const money = (n: number | null) =>
  n === null ? "Belum diisi" : rupiah.format(n);
export const fileCollection = (f: Attachment) =>
  f.usage_entry_id
    ? "usage-attachments"
    : f.group_id
      ? "group-attachments"
      : f.income_item_id
        ? "income-attachments"
        : f.allocation_item_id
          ? "allocation-attachments"
          : "attachments";
const imageUrl = (f: Attachment) => `/api/${fileCollection(f)}/${f.id}/content`;
function ErrorText({ value }: { value: string }) {
  return value ? (
    <p className="error" role="alert">
      {value}
    </p>
  ) : null;
}
function AmountField({
  item,
  store,
  actor,
}: {
  item: Item;
  store: FinanceStore;
  actor: Owner;
}) {
  const draft = store.drafts.get(item.id + ":amount"),
    disabled =
      item.owner_id !== actor ||
      !store.online ||
      store.busy ||
      needsReview(item) ||
      !!item.deleted_at;
  function commit() {
    if (!draft) return;
    if (
      draft.value === "" &&
      item.amount !== null &&
      store.snapshot?.attachments.some(
        (f) =>
          f.allocation_item_id === item.id &&
          ["ready", "pending"].includes(f.status),
      )
    ) {
      const confirmed = confirm(
        "Kosongkan nominal dan hapus akses bukti langsung pos ini? Bukti bersama tetap tersimpan.",
      );
      store.edit(
        item,
        "amount",
        confirmed ? "" : String(item.amount),
        confirmed,
      );
    }
    void store.commit(item.id + ":amount");
  }
  return (
    <div className="book-amount">
      <span aria-hidden="true">Rp</span>
      <MoneyInput
        aria-label={"Nominal " + item.label}
        value={
          draft?.value ?? (item.amount === null ? "" : String(item.amount))
        }
        onValueChange={(v) => store.edit(item, "amount", v)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        max={MAX_AMOUNT}
        disabled={disabled}
        placeholder="Belum diisi"
        aria-invalid={
          draft?.status === "error" || draft?.status === "conflict" || undefined
        }
      />
      {draft?.status === "saving" && <small role="status">Menyimpan…</small>}
    </div>
  );
}
export function FamilyBook({
  store,
  actor,
  active,
  view,
  onDirty,
  onNavigate,
}: {
  store: FinanceStore;
  actor: Owner;
  active: boolean;
  view: "home" | "evidence";
  onDirty: (dirty: boolean) => void;
  onNavigate: (view: "home" | "evidence") => void;
}) {
  const s = store.snapshot!,
    t = familyBook(s),
    [selected, setSelected] = useState<string | null>(null),
    [add, setAdd] = useState<"income" | "allocation" | null>(null),
    [bundle, setBundle] = useState<string | null>(null),
    [review, setReview] = useState(false),
    [income, setIncome] = useState(false),
    [summary, setSummary] = useState(false),
    [summaryMode, setSummaryMode] = useState<"month" | "year">("month"),
    [receipt, setReceipt] = useState<Attachment | null>(null),
    [filter, setFilter] = useState("all");
  const item = s.items.find((i) => i.id === selected),
    isDialog =
      !!selected ||
      !!add ||
      bundle !== null ||
      review ||
      income ||
      summary ||
      !!receipt;
  useEffect(() => {
    onDirty(isDialog);
    return () => onDirty(false);
  }, [isDialog, onDirty]);
  const live = s.items.filter((i) => !i.deleted_at),
    rows = live.filter((i) => i.kind !== "income");
  async function openItem(i: Item) {
    if (await store.flush()) setSelected(i.id);
  }
  return (
    <div className="family-book" hidden={!active}>
      {view === "home" ? (
        <>
          <div className="book-container">
            <section className="book-balance" aria-label="Ringkasan bulan">
              <span>Sisa belum dibagi</span>
              <strong aria-label={"Sisa belum dibagi " + money(t.remaining)}>
                {money(t.remaining)}
              </strong>
              <dl className="book-stats">
                <div>
                  <dt>Pemasukan</dt>
                  <dd>{compactMoney(t.income)}</dd>
                </div>
                <div>
                  <dt>Sudah dibagi</dt>
                  <dd>{compactMoney(t.distributed)}</dd>
                </div>
              </dl>
              <footer>
                <button onClick={() => setIncome(true)}>
                  Pemasukan <ChevronRight size={16} />
                </button>
                <button onClick={() => setSummary(true)}>
                  Lihat grafik <ChevronRight size={16} />
                </button>
              </footer>
            </section>
            <div className="book-content">
              <div className="book-section-heading">
                <h1>Alokasi keluarga</h1>
                <Button
                  variant="ghost"
                  onClick={() => setAdd("allocation")}
                  disabled={!store.online}
                >
                  <Plus size={17} /> Tambah pos
                </Button>
              </div>
              {(t.legacy.length > 0 || t.extras > 0) && (
                <button className="book-review" onClick={() => setReview(true)}>
                  Tinjau {t.legacy.length + t.extras} catatan lama{" "}
                  <ChevronRight size={18} />
                </button>
              )}
              <div className="book-rows">
                {rows.map((i) => {
                  const used = usageTotal(s, i.id);
                  return (
                    <article className="book-row" key={i.id}>
                      <button
                        className="book-row-name"
                        onClick={() => void openItem(i)}
                      >
                        <span
                          className={
                            "book-check " +
                            (i.amount !== null && !needsReview(i)
                              ? "is-done"
                              : "")
                          }
                          aria-hidden="true"
                        >
                          {i.amount !== null && !needsReview(i) && (
                            <Check size={15} />
                          )}
                        </span>
                        <span>
                          <strong>{i.label}</strong>
                          <small>
                            {needsReview(i)
                              ? "Perlu ditinjau"
                              : i.tracking_enabled
                                ? `Sisa jatah ${money((i.amount ?? 0) - used)}`
                                : i.owner_id === actor
                                  ? ""
                                  : "Dibuat " + ownerName[i.owner_id]}
                          </small>
                        </span>
                      </button>
                      <AmountField item={i} store={store} actor={actor} />
                      <button
                        className="icon-button"
                        aria-label={"Rincian " + i.label}
                        onClick={() => void openItem(i)}
                      >
                        <ChevronRight size={18} />
                      </button>
                      <div className="book-row-error">
                        <FieldError item={i} field="amount" store={store} />
                      </div>
                    </article>
                  );
                })}
                {!rows.length && (
                  <div className="book-empty">
                    <p>Belum ada alokasi.</p>
                    <Button onClick={() => setAdd("allocation")}>
                      Tambah pos pertama
                    </Button>
                  </div>
                )}
              </div>
              <div className="book-bottom-actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (store.online) setBundle("new");
                  }}
                  disabled={!store.online || rows.length === 0}
                >
                  <ImagePlus size={18} /> Bukti bersama
                </Button>
                <ChartInfo title="Cara memakai buku keluarga">
                  <p>
                    Isi nominal setelah uang dibayar atau dibagi. Isi 0 jika pos
                    tidak dipakai.
                  </p>
                  <p>
                    Bukti bersama hanya menautkan foto ke beberapa pos. Aktifkan
                    rincian pemakaian di pengaturan pos jika ingin melacak sisa
                    jatah.
                  </p>
                  <p>Angka ini catatan keluarga, bukan saldo rekening.</p>
                </ChartInfo>
              </div>
              {s.items.some((i) => i.deleted_at && usageTotal(s, i.id) > 0) && (
                <details className="book-history">
                  <summary>Riwayat pos dihapus</summary>
                  {s.items
                    .filter((i) => i.deleted_at && usageTotal(s, i.id) > 0)
                    .map((i) => (
                      <button
                        className="book-usage-row"
                        key={i.id}
                        onClick={() => void openItem(i)}
                      >
                        {i.label}
                        <ChevronRight size={16} />
                      </button>
                    ))}
                </details>
              )}
            </div>
          </div>
        </>
      ) : (
        <section className="book-evidence">
          <div className="book-section-heading">
            <h1>Bukti bulan ini</h1>
            <Button
              onClick={() => setBundle("new")}
              disabled={!store.online || !rows.length}
            >
              <Plus size={17} /> Bukti bersama
            </Button>
          </div>
          <div
            className="evidence-filter"
            role="group"
            aria-label="Jenis bukti"
          >
            {[
              ["all", "Semua"],
              ["income", "Pemasukan"],
              ["allocation", "Alokasi"],
              ["usage", "Pemakaian"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="evidence-gallery">
            {s.attachments
              .filter(
                (f) =>
                  f.status === "ready" &&
                  (filter === "all" ||
                    (filter === "income" && f.income_item_id) ||
                    (filter === "usage" && f.usage_entry_id) ||
                    (filter === "allocation" &&
                      (f.group_id || f.allocation_item_id || f.expense_id))),
              )
              .map((f) => {
                const group = s.groups?.find((g) => g.id === f.group_id),
                  name = attachmentLabel(s, f);
                return (
                  <button
                    className="evidence-tile"
                    key={f.id}
                    onClick={() =>
                      group ? setBundle(group.id) : setReceipt(f)
                    }
                    aria-label={"Lihat bukti " + name}
                  >
                    <img
                      src={imageUrl(f)}
                      alt={"Bukti " + name}
                      loading="lazy"
                    />
                    <span>
                      <strong>{name}</strong>
                      <small>
                        {f.group_id
                          ? `${s.groupItems?.filter((m) => m.group_id === f.group_id).length || 0} pos · Bukti bersama`
                          : f.usage_entry_id
                            ? "Pemakaian"
                            : f.income_item_id
                              ? "Pemasukan"
                              : "Alokasi"}
                      </small>
                    </span>
                  </button>
                );
              })}
          </div>
          {!s.attachments.some((f) => f.status === "ready") && (
            <div className="book-empty">
              <p>Belum ada bukti.</p>
              <Button variant="secondary" onClick={() => onNavigate("home")}>
                Kembali ke alokasi
              </Button>
            </div>
          )}
        </section>
      )}
      {item && (
        <ItemDetails
          key={item.id}
          item={item}
          store={store}
          actor={actor}
          active={active}
          onClose={() => setSelected(null)}
          onBundle={(id) => setBundle(id)}
        />
      )}
      {add && (
        <AddPosition
          key={add}
          kind={add}
          store={store}
          active={active}
          onClose={() => setAdd(null)}
        />
      )}
      {income && (
        <Dialog
          open={active}
          title="Pemasukan keluarga"
          onOpenChange={(v) => {
            if (!v) setIncome(false);
          }}
        >
          <div className="book-rows">
            {live
              .filter((i) => i.kind === "income")
              .map((i) => (
                <div key={i.id} className="book-income-row">
                  <button
                    onClick={() => {
                      setIncome(false);
                      void openItem(i);
                    }}
                  >
                    {i.label}
                    <small>{ownerName[i.owner_id]}</small>
                  </button>
                  <AmountField item={i} store={store} actor={actor} />
                  <FieldError item={i} field="amount" store={store} />
                </div>
              ))}
          </div>
          <div className="dialog-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setIncome(false);
                setAdd("income");
              }}
            >
              Tambah pemasukan
            </Button>
            <Button
              onClick={async () => {
                if (await store.flush()) setIncome(false);
              }}
            >
              Selesai
            </Button>
          </div>
        </Dialog>
      )}
      {bundle !== null && (
        <BundleEditor
          key={bundle}
          store={store}
          actor={actor}
          id={bundle}
          active={active}
          onClose={() => setBundle(null)}
        />
      )}
      {review && (
        <LegacyReview
          store={store}
          actor={actor}
          active={active}
          onClose={() => setReview(false)}
        />
      )}
      {summary && (
        <Dialog
          open={active}
          title="Ringkasan keluarga"
          wide
          onOpenChange={(v) => {
            if (!v) setSummary(false);
          }}
        >
          <div
            className="evidence-filter"
            role="group"
            aria-label="Periode ringkasan"
          >
            {[
              ["month", "Bulan"],
              ["year", "Tahun"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={summaryMode === id}
                onClick={() => setSummaryMode(id as typeof summaryMode)}
              >
                {label}
              </button>
            ))}
          </div>
          {summaryMode === "month" ? (
            <FamilyChart snapshot={s} />
          ) : (
            <YearDashboard
              snapshot={s}
              periods={store.periods}
              active={active}
            />
          )}
        </Dialog>
      )}
      {receipt && (
        <Dialog
          open={active}
          title={attachmentLabel(s, receipt)}
          onOpenChange={(v) => {
            if (!v) setReceipt(null);
          }}
        >
          <img
            className="book-full-image"
            src={imageUrl(receipt)}
            alt={"Bukti " + attachmentLabel(s, receipt)}
          />
          <p className="helper-note">
            Ditambahkan {ownerName[receipt.owner_id]}
          </p>
        </Dialog>
      )}
    </div>
  );
}
function attachmentLabel(s: Snapshot, f: Attachment) {
  return (
    s.groups?.find((g) => g.id === f.group_id)?.label ||
    s.items.find((i) => i.id === (f.income_item_id || f.allocation_item_id))
      ?.label ||
    s.usages?.find((u) => u.id === f.usage_entry_id)?.note ||
    s.expenses.find((e) => e.id === f.expense_id)?.note ||
    "Bukti lama"
  );
}
function AddPosition({
  kind,
  store,
  active,
  onClose,
}: {
  kind: "income" | "allocation";
  store: FinanceStore;
  active: boolean;
  onClose: () => void;
}) {
  const id = useRef(randomId()).current,
    [label, setLabel] = useState(""),
    [tracking, setTracking] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      open={active}
      title={kind === "income" ? "Tambah pemasukan" : "Tambah alokasi"}
      busy={busy}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await store.mutate(`/periods/${store.period}/items`, "POST", {
              id,
              label,
              kind,
              trackingEnabled: tracking,
            });
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="new-label">Nama pos</label>
        <input
          id="new-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          maxLength={100}
        />
        {kind === "allocation" && (
          <label className="book-checkbox">
            <input
              type="checkbox"
              checked={tracking}
              onChange={(e) => setTracking(e.target.checked)}
            />{" "}
            Lacak pemakaian
          </label>
        )}
        <ErrorText value={error} />
        <div className="dialog-actions">
          <Button type="submit" disabled={busy || !store.online}>
            {busy ? "Menyimpan…" : "Tambah pos"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
function ItemDetails({
  item,
  store,
  actor,
  active,
  onClose,
  onBundle,
}: {
  item: Item;
  store: FinanceStore;
  actor: Owner;
  active: boolean;
  onClose: () => void;
  onBundle: (id: string) => void;
}) {
  const s = store.snapshot!,
    own = item.owner_id === actor,
    used = usageTotal(s, item.id),
    [settings, setSettings] = useState(false),
    [usage, setUsage] = useState<Usage | "new" | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [date, setDate] = useState(item.posting_date || "");
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const files = s.attachments.filter(
      (f) => f.income_item_id === item.id || f.allocation_item_id === item.id,
    ),
    groups =
      s.groups?.filter((g) =>
        s.groupItems?.some((m) => m.group_id === g.id && m.item_id === item.id),
      ) || [];
  const history = s.attachments.filter(
    (f) =>
      f.expense_id &&
      s.expenses.some(
        (e) =>
          e.id === f.expense_id &&
          (e.superseded_by_item_id === item.id ||
            (e.converted_to === "allocation" && e.converted_id === item.id)),
      ),
  );
  return (
    <>
      <Dialog
        open={active && !usage}
        title={item.label}
        busy={busy}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
      >
        <p className="book-creator">
          Dibuat {ownerName[item.owner_id]}
          {item.deleted_at ? " · Pos dihapus" : ""}
        </p>
        <AmountField item={item} store={store} actor={actor} />
        <FieldError item={item} field="amount" store={store} />
        {item.kind !== "income" && (!!item.tracking_enabled || used > 0) && (
          <>
            <div className="book-usage-overview">
              <div>
                <span>Terpakai</span>
                <strong>{money(used)}</strong>
              </div>
              <div>
                <span>Sisa jatah</span>
                <strong>{money((item.amount ?? 0) - used)}</strong>
              </div>
            </div>
            {!!item.tracking_enabled && !item.deleted_at && (
              <Button
                onClick={async () => {
                  if (await store.flush()) setUsage("new");
                }}
                disabled={
                  !store.online || item.amount === null || needsReview(item)
                }
              >
                <Plus size={17} /> Catat pemakaian
              </Button>
            )}
            {(s.usages || [])
              .filter((u) => u.item_id === item.id && !u.deleted_at)
              .map((u) => (
                <button
                  className="book-usage-row"
                  key={u.id}
                  onClick={() => setUsage(u)}
                >
                  <span>
                    {u.note}
                    <small>
                      {u.occurred_on} · {ownerName[u.owner_id]}
                    </small>
                  </span>
                  <strong>{money(u.amount)}</strong>
                  <ChevronRight size={15} />
                </button>
              ))}
          </>
        )}
        <div className="book-item-evidence">
          <h3>Bukti</h3>
          <EvidencePanel
            files={files}
            parent={item.id}
            parentRoute={
              item.kind === "income" ? "income-items" : "allocation-items"
            }
            collection={
              item.kind === "income"
                ? "income-attachments"
                : "allocation-attachments"
            }
            store={store}
            canEdit={
              own &&
              !item.deleted_at &&
              !needsReview(item) &&
              (item.kind === "income" || item.amount !== null)
            }
            actor={actor}
          />
          {groups.map((g) => (
            <button
              className="book-linked-proof"
              key={g.id}
              onClick={() => onBundle(g.id)}
            >
              <ImagePlus size={17} />
              {g.label}
              <small>Bukti bersama</small>
              <ChevronRight size={15} />
            </button>
          ))}
          {history.length > 0 && (
            <>
              <h3>Bukti catatan lama</h3>
              <EvidencePanel
                files={history}
                parent={item.id}
                parentRoute="expenses"
                collection="attachments"
                store={store}
                canEdit={false}
                actor={actor}
              />
            </>
          )}
        </div>
        {own && !item.deleted_at && (
          <>
            <button
              className="book-settings"
              aria-expanded={settings}
              onClick={() => setSettings((v) => !v)}
            >
              <Settings2 size={16} /> Pengaturan pos
            </button>
            {settings && (
              <div className="book-settings-body">
                <label htmlFor="edit-item-label">Nama pos</label>
                <input
                  id="edit-item-label"
                  value={
                    store.drafts.get(item.id + ":label")?.value ?? item.label
                  }
                  maxLength={100}
                  onChange={(e) => store.edit(item, "label", e.target.value)}
                  onBlur={() => void store.commit(item.id + ":label")}
                />
                <FieldError item={item} field="label" store={store} />
                {item.kind !== "income" && (
                  <>
                    <label className="book-checkbox">
                      <input
                        type="checkbox"
                        checked={!!item.tracking_enabled}
                        disabled={busy || !store.online}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          void action(() =>
                            store.mutate(
                              `/items/${item.id}/tracking`,
                              "PATCH",
                              { enabled, expectedVersion: item.row_version },
                            ),
                          );
                        }}
                      />{" "}
                      Lacak pemakaian
                    </label>
                    {!needsReview(item) && (
                      <>
                        <label htmlFor="allocation-date">
                          Tanggal dibagi (opsional)
                        </label>
                        <input
                          id="allocation-date"
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          min={item.period_id + "-01"}
                        />
                        <Button
                          variant="secondary"
                          disabled={
                            busy ||
                            !store.online ||
                            date === (item.posting_date || "")
                          }
                          onClick={() =>
                            void action(() =>
                              store.mutate(`/items/${item.id}`, "PATCH", {
                                field: "date",
                                value: date || null,
                                expectedVersion: item.row_version,
                              }),
                            )
                          }
                        >
                          Simpan tanggal
                        </Button>
                      </>
                    )}
                  </>
                )}
                {used > 0 && !item.tracking_enabled && (
                  <p className="helper-note">
                    Riwayat pemakaian tetap tersimpan.
                  </p>
                )}
                <Button
                  variant="ghost"
                  disabled={busy || !store.online}
                  onClick={() => {
                    if (
                      confirm(
                        "Hapus pos ini? Riwayat pemakaian dan bukti bersama tetap disimpan.",
                      )
                    )
                      void action(async () => {
                        const current = await store.itemForDelete(item);
                        await store.mutate(`/items/${item.id}`, "DELETE", {
                          expectedVersion: current.row_version,
                        });
                        onClose();
                      });
                  }}
                >
                  <Trash2 size={16} /> Hapus pos
                </Button>
              </div>
            )}
          </>
        )}
        <ErrorText value={error} />
        <div className="dialog-actions">
          <Button
            disabled={busy}
            onClick={async () => {
              if (await store.flush()) onClose();
            }}
          >
            Selesai
          </Button>
        </div>
      </Dialog>
      {usage && (
        <UsageEditor
          key={usage === "new" ? "new" : usage.id}
          initial={usage === "new" ? null : usage}
          item={item}
          store={store}
          actor={actor}
          active={active}
          onClose={() => setUsage(null)}
        />
      )}
    </>
  );
}
type Collection =
  | "attachments"
  | "income-attachments"
  | "allocation-attachments"
  | "group-attachments"
  | "usage-attachments";
function EvidencePanel({
  files,
  parent,
  parentRoute,
  collection,
  version,
  store,
  canEdit,
  actor,
}: {
  files: Attachment[];
  parent: string;
  parentRoute: string;
  collection: Collection;
  version?: number;
  store: FinanceStore;
  canEdit: boolean;
  actor: Owner;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    pending = useRef<{ id: string; file: File; sha256: string } | null>(null),
    [retry, setRetry] = useState(false),
    [image, setImage] = useState<Attachment | null>(null);
  async function send() {
    const p = pending.current;
    if (!p) return;
    setBusy(true);
    setError("");
    try {
      await api(`/${parentRoute}/${parent}/attachments`, {
        method: "POST",
        body: {
          id: p.id,
          contentType: p.file.type,
          byteSize: p.file.size,
          sha256: p.sha256,
          ...(version ? { expectedVersion: version } : {}),
        },
      });
      await upload(p.id, p.file, collection);
      pending.current = null;
      setRetry(false);
      await store.refresh(true);
    } catch (e) {
      setError((e as Error).message);
      setRetry(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="book-image-list">
        {files.map((f) => (
          <div key={f.id}>
            {f.status === "ready" ? (
              <button aria-label="Perbesar bukti" onClick={() => setImage(f)}>
                <img src={imageUrl(f)} alt="Bukti tersimpan" loading="lazy" />
              </button>
            ) : (
              <small>
                {f.status === "pending"
                  ? "Unggahan belum selesai. Pilih ulang gambar untuk mengunggah dengan ID baru."
                  : "Unggahan gagal"}
              </small>
            )}
            {canEdit && f.owner_id === actor && (
              <button
                className="book-remove-image"
                disabled={busy || !store.online}
                onClick={async () => {
                  if (!confirm("Hapus gambar ini?")) return;
                  setBusy(true);
                  try {
                    await api(`/${collection}/${f.id}`, {
                      method: "DELETE",
                      body: {},
                    });
                    await store.refresh(true);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Hapus gambar
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <>
          <label className="book-upload">
            <ImagePlus size={18} />
            <span>
              Tambah JPG / PNG <small>Opsional · maks. 5 MB per gambar</small>
            </span>
            <input
              aria-label="Pilih bukti JPG atau PNG"
              type="file"
              accept="image/jpeg,image/png"
              disabled={busy || !store.online || retry}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (
                  !["image/png", "image/jpeg"].includes(file.type) ||
                  file.size > 5 * 1024 * 1024 ||
                  file.size === 0
                ) {
                  setError("Pilih JPG/PNG berukuran 1 byte sampai 5 MB.");
                  return;
                }
                const bytes = await file.arrayBuffer(),
                  sha256 = Array.from(
                    new Uint8Array(
                      await crypto.subtle.digest("SHA-256", bytes),
                    ),
                  )
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("");
                pending.current = { id: randomId(), file, sha256 };
                await send();
              }}
            />
          </label>
          {busy && <p role="status">Mengunggah…</p>}
          {retry && (
            <div className="inline-actions">
              <Button
                onClick={() => void send()}
                disabled={busy || !store.online}
              >
                Coba unggah lagi
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  pending.current = null;
                  setRetry(false);
                  setError("");
                }}
              >
                Pilih gambar lain
              </Button>
            </div>
          )}
        </>
      )}
      <ErrorText value={error} />
      {image && (
        <Dialog
          open
          title="Bukti"
          onOpenChange={(v) => {
            if (!v) setImage(null);
          }}
        >
          <img
            className="book-full-image"
            src={imageUrl(image)}
            alt="Bukti diperbesar"
          />
        </Dialog>
      )}
    </>
  );
}
function UsageEditor({
  initial,
  item,
  store,
  actor,
  active,
  onClose,
}: {
  initial: Usage | null;
  item: Item;
  store: FinanceStore;
  actor: Owner;
  active: boolean;
  onClose: () => void;
}) {
  const id = useRef(initial?.id || randomId()).current,
    [saved, setSaved] = useState(initial),
    [note, setNote] = useState(initial?.note || ""),
    [amount, setAmount] = useState(initial ? String(initial.amount) : ""),
    [date, setDate] = useState(initial?.occurred_on || store.period + "-01"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = store.snapshot?.usages?.find((u) => u.id === id) || saved,
    own = !current || current.owner_id === actor,
    editable = own && !item.deleted_at;
  return (
    <Dialog
      open={active}
      title={current ? "Rincian pemakaian" : "Catat pemakaian"}
      busy={busy}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <p className="book-creator">
        {item.label}
        {current ? " · " + ownerName[current.owner_id] : ""}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await store.mutate<{ usage: Usage }>(
              current ? `/usages/${id}` : "/usages",
              current ? "PATCH" : "POST",
              {
                ...(current ? { expectedVersion: current.version } : { id }),
                itemId: item.id,
                date,
                note,
                amount: Number(amount),
              },
            );
            setSaved(result.usage);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="usage-date">Tanggal</label>
        <input
          id="usage-date"
          type="date"
          required
          value={date}
          min={store.period + "-01"}
          max={store.period + "-31"}
          onChange={(e) => setDate(e.target.value)}
          disabled={!editable}
        />
        <label htmlFor="usage-note">Untuk apa?</label>
        <input
          id="usage-note"
          value={note}
          maxLength={150}
          required
          onChange={(e) => setNote(e.target.value)}
          disabled={!editable}
        />
        <label htmlFor="usage-amount">Nominal</label>
        <MoneyInput
          id="usage-amount"
          value={amount}
          onValueChange={setAmount}
          min={1}
          max={MAX_AMOUNT}
          required
          disabled={!editable}
        />
        <ErrorText value={error} />
        <div className="dialog-actions">
          {current && own && (
            <Button
              variant="ghost"
              type="button"
              disabled={busy || !store.online}
              onClick={async () => {
                if (!confirm("Hapus pemakaian ini beserta buktinya?")) return;
                setBusy(true);
                try {
                  await store.mutate(`/usages/${id}`, "DELETE", {
                    expectedVersion: current.version,
                  });
                  onClose();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={16} /> Hapus
            </Button>
          )}
          {editable && (
            <Button type="submit" disabled={busy || !store.online}>
              {busy
                ? "Menyimpan…"
                : current
                  ? "Simpan koreksi"
                  : "Simpan pemakaian"}
            </Button>
          )}
        </div>
      </form>
      {current && (
        <>
          <p className="helper-note" role="status">
            Pemakaian tersimpan. Tidak menambah total pembagian.
          </p>
          <EvidencePanel
            files={store.snapshot!.attachments.filter(
              (f) => f.usage_entry_id === id,
            )}
            parent={id}
            parentRoute="usages"
            collection="usage-attachments"
            store={store}
            canEdit={own}
            actor={actor}
          />
          {store.snapshot!.attachments.some(
            (f) =>
              f.expense_id &&
              store.snapshot!.expenses.some(
                (e) =>
                  e.id === f.expense_id &&
                  e.converted_to === "usage" &&
                  e.converted_id === id,
              ),
          ) && (
            <>
              <h3>Bukti catatan lama</h3>
              <EvidencePanel
                files={store.snapshot!.attachments.filter(
                  (f) =>
                    f.expense_id &&
                    store.snapshot!.expenses.some(
                      (e) =>
                        e.id === f.expense_id &&
                        e.converted_to === "usage" &&
                        e.converted_id === id,
                    ),
                )}
                parent={id}
                parentRoute="expenses"
                collection="attachments"
                store={store}
                canEdit={false}
                actor={actor}
              />
            </>
          )}
        </>
      )}
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Selesai
        </Button>
      </div>
    </Dialog>
  );
}
function BundleEditor({
  store,
  actor,
  id,
  active,
  onClose,
}: {
  store: FinanceStore;
  actor: Owner;
  id: string;
  active: boolean;
  onClose: () => void;
}) {
  const s = store.snapshot!,
    existing = s.groups?.find((g) => g.id === id),
    stableId = useRef(existing?.id || randomId()).current,
    [saved, setSaved] = useState<AllocationGroup | null>(existing || null),
    [label, setLabel] = useState(existing?.label || "Bukti bersama"),
    [selected, setSelected] = useState<string[]>(
      s.groupItems?.filter((m) => m.group_id === id).map((m) => m.item_id) ||
        [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const group = s.groups?.find((g) => g.id === stableId) || saved,
    own = !group || group.owner_id === actor,
    legacy = group?.purpose === "legacy",
    files = s.attachments.filter((f) => f.group_id === stableId),
    members = s.groupItems?.filter((m) => m.group_id === stableId) || [];
  const [photo, setPhoto] = useState<File | null>(null),
    [uploadRetry, setUploadRetry] = useState(false),
    photoId = useRef(randomId()).current;
  const [editing, setEditing] = useState(!existing);
  async function sendPhoto(current: AllocationGroup) {
    if (!photo) return;
    const bytes = await photo.arrayBuffer(),
      sha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    setUploadRetry(true);
    await api(`/allocation-groups/${stableId}/attachments`, {
      method: "POST",
      body: {
        id: photoId,
        contentType: photo.type,
        byteSize: photo.size,
        sha256,
        expectedVersion: current.version,
      },
    });
    await upload(photoId, photo, "group-attachments");
    setUploadRetry(false);
    setPhoto(null);
    await store.refresh(true);
  }
  const rows = s.items.filter(
    (i) =>
      i.kind !== "income" &&
      (!i.deleted_at || members.some((m) => m.item_id === i.id)),
  );
  return (
    <Dialog
      open={active}
      title="Bukti bersama"
      busy={busy}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      {!group && (
        <p className="helper-note">
          Satu bukti untuk beberapa pos. Nominal tetap.
        </p>
      )}
      {group && !editing && (
        <div className="book-bundle-view">
          {legacy && (
            <p className="helper-note">
              Bukti lama. Nominal di bawah adalah catatan terkini; cocokkan
              dengan gambar.
            </p>
          )}
          <EvidencePanel
            files={files}
            parent={stableId}
            parentRoute="allocation-groups"
            collection="group-attachments"
            version={group.version}
            store={store}
            canEdit={false}
            actor={actor}
          />
          <h3>Pos terkait</h3>
          {members.map((m) => {
            const i = s.items.find((i) => i.id === m.item_id),
              changed =
                m.linked_version != null && m.linked_version !== i?.row_version;
            return (
              <div className="book-review-row" key={m.item_id}>
                <span>
                  {m.linked_label || i?.label || "Pos lama"}
                  {changed && (
                    <small>
                      Pos sudah dikoreksi · bukti mengacu nominal saat ditautkan
                    </small>
                  )}
                  {i?.deleted_at && <small>Pos dihapus</small>}
                </span>
                <strong>
                  {money(
                    m.linked_version != null
                      ? (m.linked_amount ?? null)
                      : (i?.amount ?? null),
                  )}
                </strong>
              </div>
            );
          })}
          {own && (
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Kelola bukti
            </Button>
          )}
        </div>
      )}
      {(!group || editing) && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const result = await store.mutate<{ group: AllocationGroup }>(
                `/periods/${s.id}/evidence-bundles`,
                "POST",
                {
                  id: stableId,
                  label,
                  items: selected.map((id) => ({
                    id,
                    expectedVersion: s.items.find((i) => i.id === id)!
                      .row_version,
                  })),
                  ...(group ? { expectedVersion: group.version } : {}),
                },
              );
              setSaved(result.group);
              await sendPhoto(result.group);
              if (!existing) onClose();
              else setEditing(false);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="bundle-label">Nama bukti</label>
          <input
            id="bundle-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            maxLength={100}
            disabled={!own || legacy}
          />
          <fieldset className="book-proof-selection">
            <legend>Pos terkait</legend>
            {rows.map((i) => {
              const member = members.find((m) => m.item_id === i.id),
                changed =
                  member?.linked_version != null &&
                  member.linked_version !== i.row_version;
              return (
                <label className="book-checkbox" key={i.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(i.id)}
                    disabled={!own || legacy || !!i.deleted_at}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, i.id]
                          : old.filter((x) => x !== i.id),
                      )
                    }
                  />
                  <span>
                    {i.label}
                    {i.deleted_at ? " · Dihapus" : ""}
                    <small>
                      {changed
                        ? `Saat bukti ditautkan: ${money(member!.linked_amount ?? null)} · ${member!.linked_label || i.label}`
                        : money(i.amount)}
                      {changed ? " · Pos telah dikoreksi" : ""}
                    </small>
                  </span>
                </label>
              );
            })}
          </fieldset>
          {!group && (
            <label className="book-upload">
              <ImagePlus size={18} />
              <span>
                JPG / PNG opsional <small>Maks. 5 MB</small>
              </span>
              <input
                aria-label="Pilih gambar bukti bersama"
                type="file"
                accept="image/jpeg,image/png"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (
                    file &&
                    (!["image/jpeg", "image/png"].includes(file.type) ||
                      file.size === 0 ||
                      file.size > 5 * 1024 * 1024)
                  ) {
                    setError("Pilih JPG/PNG berukuran sampai 5 MB.");
                    e.target.value = "";
                    return;
                  }
                  setError("");
                  setPhoto(file);
                }}
              />
            </label>
          )}
          <ErrorText value={error} />
          {own && !legacy && (
            <div className="dialog-actions">
              <Button
                type="submit"
                disabled={
                  busy || !store.online || selected.length === 0 || uploadRetry
                }
              >
                {busy
                  ? "Menyimpan…"
                  : group
                    ? "Simpan pilihan pos"
                    : "Simpan bukti"}
              </Button>
            </div>
          )}
        </form>
      )}
      {!editing && <ErrorText value={error} />}
      {uploadRetry && group && (
        <Button
          disabled={busy || !store.online}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await sendPhoto(group);
              if (!existing) onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Coba unggah lagi
        </Button>
      )}
      {group && editing && (
        <EvidencePanel
          files={files}
          parent={stableId}
          parentRoute="allocation-groups"
          collection="group-attachments"
          version={group.version}
          store={store}
          canEdit={own && group.status === "posted"}
          actor={actor}
        />
      )}
      <div className="dialog-actions">
        {group && own && (
          <Button
            variant="ghost"
            disabled={busy || !store.online}
            onClick={async () => {
              if (!confirm("Hapus bukti bersama ini? Nominal alokasi tetap."))
                return;
              setBusy(true);
              try {
                await store.mutate(`/evidence-bundles/${stableId}`, "DELETE", {
                  expectedVersion: group.version,
                });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 size={16} /> Hapus bukti
          </Button>
        )}
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Selesai
        </Button>
      </div>
    </Dialog>
  );
}
function LegacyReview({
  store,
  actor,
  active,
  onClose,
}: {
  store: FinanceStore;
  actor: Owner;
  active: boolean;
  onClose: () => void;
}) {
  const s = store.snapshot!,
    t = familyBook(s),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [extra, setExtra] = useState<string | null>(null),
    [mode, setMode] = useState<"allocation" | "usage">("allocation"),
    [target, setTarget] = useState("");
  const extras = [
    ...s.expenses
      .filter(
        (e) => !e.deleted_at && !e.superseded_by_item_id && !e.converted_to,
      )
      .map((e) => ({ ...e, source: "expense", label: e.note })),
    ...s.transfers
      .filter(
        (e) => !e.deleted_at && !e.superseded_by_item_id && !e.converted_to,
      )
      .map((e) => ({
        ...e,
        owner_id: e.from_owner_id,
        source: "transfer",
        item_id: e.source_item_id,
        label:
          s.items.find((i) => i.id === e.source_item_id)?.label ||
          "Catatan kiriman lama",
      })),
  ];
  const eligible = t.legacy.filter(
      (i) => i.owner_id === actor && !extras.some((e) => e.item_id === i.id),
    ),
    current = extras.find((e) => e.id === extra);
  return (
    <Dialog
      open={active}
      title="Tinjau catatan lama"
      busy={busy}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <p className="helper-note">
        Pastikan nominal ini sudah dibayar atau dibagi. Foto dan catatan lama
        tetap disimpan.
      </p>
      {t.legacy.map((i) => (
        <div className="book-review-row" key={i.id}>
          <span>
            {i.label}
            <small>
              {ownerName[i.owner_id]}
              {extras.some((e) => e.item_id === i.id)
                ? " · Tinjau tambahan dahulu"
                : ""}
            </small>
          </span>
          <strong>{money(i.amount)}</strong>
        </div>
      ))}
      {eligible.length > 0 && (
        <Button
          disabled={busy || !store.online}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await store.mutate(`/periods/${s.id}/review`, "POST", {
                expectedRevision: s.revision,
                items: eligible.map((i) => ({
                  id: i.id,
                  expectedVersion: i.row_version,
                })),
                confirmed: true,
              });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Sudah dibagi · {eligible.length} pos saya
        </Button>
      )}
      {extras.map((e) => (
        <button
          key={e.id}
          className="book-usage-row"
          onClick={() => setExtra(e.id)}
          disabled={e.owner_id !== actor}
        >
          <span>
            {e.label}
            <small>Tambahan lama · {ownerName[e.owner_id]}</small>
          </span>
          <strong>{money(e.amount)}</strong>
        </button>
      ))}
      {current && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await store.mutate(
                `/legacy-extras/${current.id}/convert`,
                "POST",
                {
                  source: current.source,
                  mode,
                  label: current.label,
                  expectedVersion: current.version,
                  confirmed: true,
                  ...(mode === "usage" ? { itemId: target } : {}),
                },
              );
              setExtra(null);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="extra-mode">Catatan ini menjadi</label>
          <select
            id="extra-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="allocation">Alokasi tersendiri</option>
            <option value="usage">Rincian pemakaian suatu pos</option>
          </select>
          {mode === "usage" && (
            <>
              <label htmlFor="extra-target">Pos yang dilacak</label>
              <select
                id="extra-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                required
              >
                <option value="">Pilih pos</option>
                {s.items
                  .filter(
                    (i) =>
                      !i.deleted_at &&
                      i.tracking_enabled &&
                      i.recording_mode === "actual",
                  )
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label}
                    </option>
                  ))}
              </select>
              <p className="helper-note">
                Pemakaian akan mengurangi jatah pos, dan tidak dihitung lagi
                sebagai pembagian tambahan.
              </p>
            </>
          )}
          <div className="dialog-actions">
            <Button type="submit" disabled={busy || !store.online}>
              Konfirmasi pemetaan
            </Button>
          </div>
        </form>
      )}
      <ErrorText value={error} />
      {t.legacy.length === 0 && t.extras === 0 && (
        <p role="status">Seluruh catatan sudah ditinjau.</p>
      )}
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Selesai
        </Button>
      </div>
    </Dialog>
  );
}
function FamilyChart({ snapshot }: { snapshot: Snapshot }) {
  const t = familyBook(snapshot),
    colors = ["#7042b3", "#a38bc9", "#668f45", "#b2c69c"],
    circle = 2 * Math.PI * 52;
  let offset = 0;
  return (
    <>
      <div className="book-chart-status">
        {t.complete
          ? "Seluruh pos terisi"
          : `${t.missing} nominal kosong${t.legacy.length + t.extras ? " · Ada catatan perlu ditinjau" : ""}`}
      </div>
      <div className="book-family-chart">
        <div className="allocation-donut">
          <svg
            viewBox="0 0 132 132"
            role="img"
            aria-label="Komposisi seluruh pembagian"
          >
            <g transform="rotate(-90 66 66)">
              <circle
                cx="66"
                cy="66"
                r="52"
                fill="none"
                stroke="#eeedf2"
                strokeWidth="15"
              />
              {t.slices.map((slice, i) => {
                const size =
                    (slice.amount / Math.max(t.distributed, 1)) * circle,
                  start = offset;
                offset += size;
                return (
                  <circle
                    key={i}
                    cx="66"
                    cy="66"
                    r="52"
                    fill="none"
                    stroke={colors[i]}
                    strokeWidth="15"
                    strokeDasharray={`${size} ${circle - size}`}
                    strokeDashoffset={-start}
                  />
                );
              })}
            </g>
          </svg>
          <div className="allocation-center">
            <span>Sudah dibagi</span>
            <strong>{compactMoney(t.distributed)}</strong>
          </div>
        </div>
        <ul className="allocation-legend">
          {t.slices.map((slice, i) => (
            <li key={i}>
              <i style={{ background: colors[i] }} />
              <span>
                {slice.label}
                <small>{compactMoney(slice.amount)}</small>
              </span>
              <strong>{ratio(slice.amount, t.distributed)}</strong>
            </li>
          ))}
        </ul>
        {!t.slices.length && <p>Belum ada pembagian.</p>}
      </div>
      <div className="book-comparison">
        {[
          ["Pemasukan", t.income],
          ["Sudah dibagi", t.distributed],
        ].map(([name, value]) => (
          <div key={name}>
            <span>
              {name}
              <strong>{compactMoney(Number(value))}</strong>
            </span>
            <div className="book-bar">
              <i
                style={{
                  width:
                    (Number(value) / Math.max(t.income, t.distributed, 1)) *
                      100 +
                    "%",
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <ChartInfo title="Hitungan keluarga">
        <p>
          Sudah dibagi adalah seluruh nominal alokasi aktual, termasuk tabungan.
          Bukti dan rincian pemakaian tidak dijumlahkan lagi. Catatan tambahan
          lama tetap dihitung sampai ditinjau.
        </p>
        <p>
          Persentase tahun memakai jumlah pembagian dibagi jumlah pemasukan dari
          bulan yang lengkap.
        </p>
      </ChartInfo>
    </>
  );
}
