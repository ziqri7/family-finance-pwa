import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ImagePlus, Users, ReceiptText } from "lucide-react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { MoneyInput } from "./MoneyInput";
import { FieldError } from "./Budget";
import { EvidenceImages, ExpenseList } from "./Dashboard";
import { validateFile } from "./Forms";
import { api, upload, ApiError } from "../lib/api";
import type { FinanceStore } from "../lib/use-finance";
import { ledgerTotals, safeSum } from "../../shared/ledger";
import {
  ownerName,
  other,
  randomId,
  rupiah,
  type Owner,
  type Item,
  type Attachment,
  type AllocationGroup,
  type Expense,
} from "../../shared/domain";

const actionName = {
  internal: "Serahkan",
  external: "Sudah dibayar",
  reserve: "Sudah ditabung",
};
const statusName = {
  internal: "Sudah diserahkan",
  external: "Sudah dibayar",
  reserve: "Sudah ditabung",
};
export function CompactHome({
  store,
  owner,
  actor,
  onGroup,
  onSetup,
  onManage,
  onItem,
  managing,
  active,
  onExpense,
  onDelete,
  onEvidence,
}: {
  store: FinanceStore;
  owner: Owner;
  actor: Owner;
  onGroup: (id: string) => void;
  onSetup: (item?: Item) => void;
  onManage: () => void;
  onItem: (i: Item) => void;
  managing: boolean;
  active: boolean;
  onExpense: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  onEvidence: (e: Expense) => void;
}) {
  const s = store.snapshot!,
    totals = ledgerTotals(s, owner),
    own = owner === actor;
  const [incomeOpen, setIncomeOpen] = useState(false),
    [incomeBusy, setIncomeBusy] = useState(false);
  const closeIncome = async () => {
    setIncomeBusy(true);
    try {
      if (await store.flush()) setIncomeOpen(false);
    } finally {
      setIncomeBusy(false);
    }
  };
  const groups = (s.groups ?? []).filter(
    (g) => g.owner_id === owner || g.recipient_owner_id === owner,
  );
  const grouped = new Set((s.groupItems ?? []).map((m) => m.item_id));
  const items = s.items.filter(
    (i) => i.owner_id === owner && i.kind !== "income" && !grouped.has(i.id),
  );
  const incomplete =
    !s.budgets.some((b) => b.owner_id === owner) ||
    s.items.some(
      (i) => i.owner_id === owner && i.kind === "income" && i.amount === null,
    ) ||
    (s.items.some(
      (i) =>
        i.owner_id === other(owner) && i.kind === "income" && i.amount === null,
    ) &&
      totals.incoming > 0);
  const complete =
    totals.remaining === 0 &&
    !incomplete &&
    !s.items.some(
      (i) => i.owner_id === owner && i.kind !== "income" && i.amount === null,
    );
  return (
    <section className="compact-home">
      <div
        className={
          "compact-balance " + (owner === "partner-b" ? "is-wife" : "")
        }
      >
        <span>Sisa dibagi</span>
        <strong>{incomplete ? "—" : rupiah.format(totals.remaining)}</strong>
        <div>
          <span>
            {complete
              ? "Semua uang sudah dibagi"
              : "Dana bulan ini " + rupiah.format(totals.income)}
          </span>
          {own && (
            <Button variant="ghost" onClick={() => setIncomeOpen(true)}>
              Pemasukan
            </Button>
          )}
        </div>
      </div>
      <div className="compact-work">
        <div className="section-heading">
          <h2>
            {own ? "Bagian saya" : "Bagian " + ownerName[owner].toLowerCase()}
          </h2>
          {own && (
            <Button
              variant="ghost"
              disabled={!store.online || store.busy}
              onClick={() => onSetup()}
            >
              Atur kelompok
            </Button>
          )}
        </div>
        <div className="compact-list">
          {groups.map((g) => {
            const members = (s.groupItems ?? []).filter(
              (m) => m.group_id === g.id && m.posted === 1,
            );
            const amount = safeSum(
              members.map(
                (m) => s.items.find((i) => i.id === m.item_id)?.amount ?? 0,
              ),
            );
            return (
              <button
                key={g.id}
                className="compact-row"
                onClick={() => onGroup(g.id)}
              >
                <span className="compact-symbol">
                  {g.status === "posted" ? <Check /> : <Users />}
                </span>
                <span>
                  <strong>
                    {g.owner_id === owner
                      ? g.label
                      : "Dari " + ownerName[g.owner_id].toLowerCase()}
                  </strong>
                  <small>
                    {g.status === "posted"
                      ? (g.posting_kind
                          ? statusName[g.posting_kind]
                          : "Bukti bersama") +
                        " · " +
                        members.length +
                        " pos"
                      : g.status === "cancelled"
                        ? "Dibatalkan"
                        : "Belum dicatat"}
                  </small>
                </span>
                <b>
                  {g.status === "posted"
                    ? rupiah.format(amount)
                    : "Isi nominal"}
                </b>
                <ArrowRight size={16} />
              </button>
            );
          })}
          {items.map((i) => (
            <button
              key={i.id}
              className="compact-row"
              onClick={() => (own ? onSetup(i) : onItem(i))}
            >
              <span className="compact-symbol">
                <ReceiptText />
              </span>
              <span>
                <strong>{i.label}</strong>
                <small>
                  {i.recording_mode === "actual" && i.amount !== null
                    ? statusName[i.posting_kind ?? "external"]
                    : "Belum dikelompokkan"}
                </small>
              </span>
              <b>
                {i.amount === null ? "Isi nominal" : rupiah.format(i.amount)}
              </b>
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
        {!groups.length && !items.length && (
          <p className="empty-note">
            Buat bulan atau tambahkan pos untuk mulai membagi uang.
          </p>
        )}
        <Button variant="secondary" onClick={onManage}>
          {managing ? "Tutup pengaturan pos" : "Kelola pos"}
        </Button>
        <section className="compact-expenses">
          <h2>
            {own ? "Belanja saya" : "Belanja " + ownerName[owner].toLowerCase()}
          </h2>
          <ExpenseList
            snapshot={s}
            owner={owner}
            actor={actor}
            onEdit={onExpense}
            onDelete={onDelete}
            onEvidence={onEvidence}
          />
        </section>
      </div>
      {incomeOpen && own && (
        <Dialog
          open={active}
          title="Pemasukan bulan ini"
          busy={incomeBusy}
          onOpenChange={(v) => {
            if (!v) void closeIncome();
          }}
        >
          {s.items
            .filter((i) => i.owner_id === owner && i.kind === "income")
            .map((i) => (
              <div key={i.id}>
                <label>
                  {i.label}
                  <MoneyInput
                    aria-label={"Pemasukan " + i.label}
                    value={
                      store.drafts.get(i.id + ":amount")?.value ??
                      (i.amount === null ? "" : String(i.amount))
                    }
                    disabled={!store.online || incomeBusy}
                    max="1000000000000"
                    onValueChange={(amount) => store.edit(i, "amount", amount)}
                    onBlur={() => void store.commit(i.id + ":amount")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                  />
                </label>
                <FieldError item={i} field="amount" store={store} />
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (await store.flush()) {
                      setIncomeOpen(false);
                      onItem(i);
                    }
                  }}
                >
                  Bukti pemasukan
                </Button>
              </div>
            ))}
          <div className="dialog-actions">
            <Button
              variant="secondary"
              onClick={async () => {
                if (await store.flush()) {
                  setIncomeOpen(false);
                  onManage();
                }
              }}
            >
              Kelola pos pemasukan
            </Button>
            <Button disabled={incomeBusy} onClick={() => void closeIncome()}>
              Selesai
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
export function ConfigureGroup({
  store,
  actor,
  item,
  group,
  active = true,
  onClose,
  onCreated,
}: {
  store: FinanceStore;
  actor: Owner;
  item?: Item;
  group?: AllocationGroup;
  active?: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const id = useRef(group?.id ?? randomId()),
    [label, setLabel] = useState(group?.label ?? item?.label ?? ""),
    [kind, setKind] = useState(group?.posting_kind ?? item?.posting_kind ?? ""),
    [selected, setSelected] = useState<string[]>(
      group
        ? (store.snapshot!.groupItems ?? [])
            .filter((m) => m.group_id === group.id)
            .map((m) => m.item_id)
        : item
          ? [item.id]
          : [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const grouped = new Set(
    (store.snapshot!.groupItems ?? [])
      .filter((m) => m.group_id !== group?.id)
      .map((m) => m.item_id),
  );
  const items = store.snapshot!.items.filter(
    (i) => i.owner_id === actor && i.kind !== "income" && !grouped.has(i.id),
  );
  return (
    <Dialog
      open={active}
      title={item ? item.label : "Atur kelompok"}
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
            if (!selected.length)
              throw Error("Pilih pos yang diserahkan atau dibayar bersama.");
            await store.mutate(
              group
                ? "/allocation-groups/" + group.id
                : "/periods/" + store.period + "/allocation-groups",
              group ? "PATCH" : "POST",
              {
                id: id.current,
                label,
                postingKind: kind,
                itemIds: selected,
                ...(group ? { expectedVersion: group.version } : {}),
              },
            );
            onCreated(id.current);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nama kelompok
          <input
            value={label}
            required
            maxLength={100}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          Tujuan
          <select
            value={kind}
            required
            disabled={Boolean(group)}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="" disabled>
              Pilih sekali untuk kelompok ini
            </option>
            <option value="internal">
              Ke {ownerName[other(actor)].toLowerCase()}
            </option>
            <option value="external">Pembayaran</option>
            <option value="reserve">Tabungan sendiri</option>
          </select>
        </label>
        <div className="group-picks">
          {items.map((i) => (
            <label key={i.id}>
              <input
                type="checkbox"
                disabled={group?.status === "posted"}
                checked={selected.includes(i.id)}
                onChange={(e) =>
                  setSelected((old) =>
                    e.target.checked
                      ? [...old, i.id]
                      : old.filter((id) => id !== i.id),
                  )
                }
              />
              {i.label}
            </label>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !store.online}>
          Lanjutkan
        </Button>
      </form>
    </Dialog>
  );
}
interface Review {
  group: AllocationGroup & { expected_revision: number };
  items: (Item & {
    posted: number;
    related_total: number;
    related_count: number;
  })[];
  attachments: Attachment[];
}
type Row = { id: string; selected: boolean; amount: string };
export function GroupEditor({
  id,
  store,
  actor,
  active,
  onClose,
  onExtra,
  readOnly = false,
}: {
  id: string;
  store: FinanceStore;
  actor: Owner;
  active: boolean;
  onClose: () => void;
  onExtra: () => void;
  readOnly?: boolean;
}) {
  const [review, setReview] = useState<Review | null>(null),
    [rows, setRows] = useState<Row[]>([]),
    [date, setDate] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [dirty, setDirty] = useState(false),
    [decision, setDecision] = useState<"" | "keep" | "history">("");
  const [configure, setConfigure] = useState(false);
  const [files, setFiles] = useState<
      { id: string; file: File; done: boolean }[]
    >([]),
    [conflict, setConflict] = useState(false);
  const operation = useRef<{ action: string; body: unknown } | null>(null),
    enabled = useRef(active);
  enabled.current = active;
  const own = review?.group.owner_id === actor && !readOnly,
    canEdit = own && active && (review?.group.status !== "posted" || editing);
  async function load(reset = true) {
    const data = await api<Review>("/allocation-groups/" + id);
    setReview(data);
    if (reset) {
      setRows(
        data.items.map((i) => ({
          id: i.id,
          selected:
            i.posted === 1 ||
            (data.group.status !== "posted" && i.amount !== null),
          amount:
            i.recording_mode === "legacy" && i.related_count
              ? String(i.related_total)
              : i.amount === null
                ? ""
                : String(i.amount),
        })),
      );
      setDate(data.group.posting_date ?? "");
      setDirty(false);
      setEditing(false);
      setDecision("");
      setConflict(false);
      operation.current = null;
    }
    return data;
  }
  useEffect(() => {
    let alive = true;
    void api<Review>("/allocation-groups/" + id)
      .then((data) => {
        if (!alive) return;
        setReview(data);
        setRows(
          data.items.map((i) => ({
            id: i.id,
            selected:
              i.posted === 1 ||
              (data.group.status !== "posted" && i.amount !== null),
            amount:
              i.recording_mode === "legacy" && i.related_count
                ? String(i.related_total)
                : i.amount === null
                  ? ""
                  : String(i.amount),
          })),
        );
        setDate(data.group.posting_date ?? "");
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id]);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (dirty || files.some((f) => !f.done)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, files]);
  const invalidAmount = rows.some(
    (r) =>
      r.selected &&
      r.amount !== "" &&
      (!/^\d+$/.test(r.amount) ||
        !Number.isSafeInteger(Number(r.amount)) ||
        Number(r.amount) > 1e12),
  );
  const total = invalidAmount
    ? null
    : safeSum(rows.filter((r) => r.selected).map((r) => Number(r.amount) || 0));
  const totalLabel = total === null ? "—" : rupiah.format(total);
  function changeRow(id: string, patch: Partial<Row>) {
    setRows((old) => old.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
    operation.current = null;
  }
  async function uploadFiles(version: number) {
    for (const entry of files) {
      if (entry.done) continue;
      if (!enabled.current) throw Error("Masuk kembali untuk mengirim bukti.");
      const sha256 = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await entry.file.arrayBuffer()),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      await api("/allocation-groups/" + id + "/attachments", {
        method: "POST",
        body: {
          id: entry.id,
          contentType: entry.file.type,
          byteSize: entry.file.size,
          sha256,
          expectedVersion: version,
        },
      });
      await upload(entry.id, entry.file, "group-attachments");
      entry.done = true;
      setFiles([...files]);
    }
    setFiles([]);
  }
  async function save(action: "commit" | "cancel") {
    if (!review || !enabled.current) return;
    setBusy(true);
    setError("");
    try {
      if (!(await store.flush()))
        throw Error("Selesaikan isian yang belum tersimpan.");
      if (
        action === "commit" &&
        (!rows.some((r) => r.selected) ||
          rows.some(
            (r) =>
              r.selected &&
              (!/^\d+$/.test(r.amount) || Number(r.amount) > 1e12),
          ))
      )
        throw Error("Isi nominal pada pos yang dipilih.");
      if (
        action === "commit" &&
        review.group.status === "posted" &&
        review.attachments.length &&
        !decision
      )
        throw Error("Tentukan apakah bukti sebelumnya masih sesuai.");
      if (!operation.current || operation.current.action !== action)
        operation.current = {
          action,
          body: {
            operationId: randomId(),
            expectedVersion: review.group.version,
            expectedRevision: review.group.expected_revision,
            date: date || null,
            ...(decision ? { evidenceDecision: decision } : {}),
            items: rows.map((r) => ({
              id: r.id,
              expectedVersion: review.items.find((i) => i.id === r.id)!
                .row_version,
              selected: r.selected,
              amount: r.amount === "" ? null : Number(r.amount),
            })),
          },
        };
      const result = await api<{ receipt: { version: number } }>(
        "/allocation-groups/" + id + "/" + action,
        { method: "POST", body: operation.current.body },
      );
      setDirty(false);
      setEditing(false);
      await store.refresh(true);
      const updated = await load();
      if (action === "commit" && files.length) {
        try {
          await uploadFiles(result.receipt.version);
        } catch (err) {
          setError(
            "Penyerahan tercatat. Bukti belum terkirim. " +
              (err as Error).message,
          );
        }
        await load(false);
        await store.refresh(true);
      }
      if (action === "cancel") setFiles([]);
      if (updated.group.status === "posted")
        store.setMessage(
          (updated.group.posting_kind
            ? statusName[updated.group.posting_kind]
            : "Bukti bersama") + ".",
        );
      if (
        enabled.current &&
        (action === "cancel" || files.every((file) => file.done))
      )
        onClose();
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError && err.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  async function removeEvidence(file: Attachment) {
    if (!confirm("Hapus bukti bersama dari seluruh pos terkait?")) return;
    setBusy(true);
    try {
      await api("/group-attachments/" + file.id, { method: "DELETE" });
      setFiles((old) => old.filter((entry) => entry.id !== file.id));
      await load(false);
      await store.refresh(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const close = () => {
    if (
      (dirty || files.some((f) => !f.done)) &&
      !confirm("Tutup dan buang isian atau bukti yang belum tersimpan?")
    )
      return;
    onClose();
  };
  if (configure && review)
    return (
      <ConfigureGroup
        store={store}
        actor={actor}
        group={review.group}
        active={active}
        onClose={() => setConfigure(false)}
        onCreated={async () => {
          setConfigure(false);
          try {
            await load();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      />
    );
  return (
    <Dialog
      open={active}
      title={review?.group.label ?? "Penyerahan"}
      description={
        review
          ? store.period +
            " · " +
            (review.group.posting_kind === "internal"
              ? "Ke " + ownerName[other(review.group.owner_id)].toLowerCase()
              : review.group.posting_kind === "reserve"
                ? "Tabungan sendiri"
                : "Pembayaran")
          : undefined
      }
      busy={busy}
      wide
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      {!review ? (
        <p role="status">{error || "Memuat penyerahan…"}</p>
      ) : (
        <>
          <form
            className="group-editor"
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
            onSubmit={(e) => {
              e.preventDefault();
              void save("commit");
            }}
          >
            {!canEdit && review.group.status === "posted" && (
              <p className="group-success">
                <Check size={18} />
                {review.group.posting_kind
                  ? statusName[review.group.posting_kind]
                  : "Bukti bersama"}
              </p>
            )}
            {rows.map((row) => {
              const item = review.items.find((i) => i.id === row.id)!;
              return (
                <div className="group-money-row" key={row.id}>
                  <label>
                    {canEdit && (
                      <input
                        type="checkbox"
                        checked={row.selected}
                        disabled={busy}
                        onChange={(e) =>
                          changeRow(row.id, { selected: e.target.checked })
                        }
                      />
                    )}
                    <strong>{item.label}</strong>
                  </label>
                  {canEdit ? (
                    <MoneyInput
                      aria-label={"Nominal " + item.label}
                      value={row.amount}
                      required={row.selected}
                      disabled={busy || !row.selected}
                      max="1000000000000"
                      onValueChange={(amount) => changeRow(row.id, { amount })}
                    />
                  ) : (
                    <strong>
                      {item.posted
                        ? rupiah.format(item.amount ?? 0)
                        : "Belum dicatat"}
                    </strong>
                  )}
                  {canEdit &&
                    item.recording_mode === "legacy" &&
                    item.related_count > 0 && (
                      <small>
                        {item.related_count} catatan lama ·{" "}
                        {rupiah.format(item.related_total)}
                      </small>
                    )}
                </div>
              );
            })}
            <details className="group-details">
              <summary>Tanggal & rincian</summary>
              <label>
                Tanggal (opsional)
                <input
                  type="date"
                  value={date}
                  disabled={!canEdit || busy}
                  min={store.period + "-01"}
                  max={new Date(
                    Number(store.period.slice(0, 4)),
                    Number(store.period.slice(5)),
                    0,
                  ).toLocaleDateString("sv-SE")}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setDirty(true);
                    operation.current = null;
                  }}
                />
              </label>
              <p className="helper-note">
                Catatan lama yang ditinjau terwakili oleh nominal ini.
              </p>
            </details>
            {review.attachments
              .filter((f) => f.status === "ready")
              .map((f) => (
                <div key={f.id}>
                  <small>
                    {f.confirmed_group_version === review.group.version
                      ? "Bukti bersama"
                      : "Bukti sebelum koreksi"}
                  </small>
                  <EvidenceImages files={[f]} />
                  {own && (
                    <Button
                      variant="ghost"
                      disabled={busy || !active}
                      onClick={() => void removeEvidence(f)}
                    >
                      Hapus bukti
                    </Button>
                  )}
                </div>
              ))}
            {review.attachments
              .filter((f) => f.status !== "ready")
              .map((f) => (
                <div key={f.id}>
                  <p className="helper-note">
                    Bukti belum terkirim
                    {f.confirmed_group_version !== review.group.version
                      ? " · penyerahan telah berubah"
                      : ""}
                    .
                  </p>
                  {own && (
                    <Button
                      variant="ghost"
                      disabled={busy || !active}
                      onClick={() => void removeEvidence(f)}
                    >
                      Hapus unggahan tertunda
                    </Button>
                  )}
                </div>
              ))}
            {canEdit &&
              review.group.status === "posted" &&
              review.attachments.length > 0 && (
                <label>
                  Bukti sebelumnya
                  <select
                    value={decision}
                    required
                    disabled={busy}
                    onChange={(e) => {
                      setDecision(e.target.value as typeof decision);
                      operation.current = null;
                      setDirty(true);
                    }}
                  >
                    <option value="">Pilih kesesuaian bukti</option>
                    <option value="keep">Masih sesuai</option>
                    <option value="history">
                      Simpan sebagai bukti sebelum koreksi
                    </option>
                  </select>
                </label>
              )}
            {own && active && (
              <label className="group-upload">
                <ImagePlus size={20} />
                Tambah bukti (opsional)
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  multiple
                  disabled={busy}
                  onChange={async (e) => {
                    const input = e.currentTarget;
                    try {
                      const picked = Array.from(input.files ?? []);
                      if (
                        picked.length +
                          files.filter(
                            (entry) =>
                              !entry.done &&
                              !review.attachments.some(
                                (f) => f.id === entry.id,
                              ),
                          ).length +
                          review.attachments.filter((f) =>
                            ["ready", "pending"].includes(f.status),
                          ).length >
                        10
                      )
                        throw Error("Maksimal 10 gambar per penyerahan.");
                      for (const file of picked) await validateFile(file);
                      setFiles((old) => [
                        ...old,
                        ...picked.map((file) => ({
                          id: randomId(),
                          file,
                          done: false,
                        })),
                      ]);
                    } catch (err) {
                      setError((err as Error).message);
                    }
                    input.value = "";
                  }}
                />
              </label>
            )}
            {files.map((f) => (
              <p className="helper-note" key={f.id}>
                {f.file.name} · {f.done ? "Terkirim" : "Siap dikirim"}
              </p>
            ))}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {conflict && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  if (
                    dirty &&
                    !confirm(
                      "Muat data terbaru? Isian koreksi akan diganti dengan data tersimpan.",
                    )
                  )
                    return;
                  try {
                    await load();
                    setError("");
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                Periksa data terbaru
              </Button>
            )}
            <div className="group-confirm">
              <span>
                Total{" "}
                {review.group.posting_kind === "internal"
                  ? "penyerahan"
                  : "pembagian"}
                <strong>
                  {canEdit
                    ? totalLabel
                    : rupiah.format(
                        safeSum(
                          review.items
                            .filter((i) => i.posted)
                            .map((i) => i.amount ?? 0),
                        ),
                      )}
                </strong>
              </span>
              {canEdit && (
                <Button
                  type="submit"
                  disabled={busy || !store.online || conflict || invalidAmount}
                >
                  {busy
                    ? "Menyimpan…"
                    : (review.group.posting_kind
                        ? actionName[review.group.posting_kind]
                        : "Simpan bukti") +
                      " " +
                      totalLabel}
                </Button>
              )}
            </div>
          </form>
          {own && review.group.status === "posted" && !editing && (
            <div className="dialog-actions">
              <Button
                variant="secondary"
                disabled={busy || !active}
                onClick={() => {
                  setEditing(true);
                  setDecision("");
                }}
              >
                Koreksi nominal
              </Button>
              <Button
                variant="ghost"
                disabled={busy || !active}
                onClick={() => {
                  if (
                    confirm(
                      "Batalkan seluruh penyerahan ini dan akses bukti bersamanya?",
                    )
                  )
                    void save("cancel");
                }}
              >
                Batalkan
              </Button>
              {review.group.posting_kind === "internal" && (
                <Button
                  variant="ghost"
                  disabled={busy || !active || files.some((f) => !f.done)}
                  onClick={onExtra}
                >
                  Kiriman tambahan
                </Button>
              )}
            </div>
          )}
          {own && (
            <div className="dialog-actions">
              <Button
                variant="ghost"
                disabled={busy || !active || files.some((f) => !f.done)}
                onClick={() => {
                  if (
                    dirty &&
                    !confirm(
                      "Buka pengaturan dan buang isian yang belum tersimpan?",
                    )
                  )
                    return;
                  setConfigure(true);
                }}
              >
                Pengaturan kelompok
              </Button>
              {review.group.status !== "posted" && (
                <Button
                  variant="ghost"
                  disabled={busy || !active}
                  onClick={async () => {
                    if (
                      !confirm(
                        "Lepaskan kelompok ini? Pos dan catatan sebelumnya tetap dapat dibuka dari Beranda.",
                      )
                    )
                      return;
                    setBusy(true);
                    try {
                      await store.mutate("/allocation-groups/" + id, "DELETE", {
                        expectedVersion: review.group.version,
                      });
                      onClose();
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Hapus kelompok
                </Button>
              )}
            </div>
          )}
          {own &&
            review.group.status === "posted" &&
            !editing &&
            files.some((f) => !f.done) && (
              <Button
                disabled={busy || !active}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await uploadFiles(review.group.version);
                    await load(false);
                    await store.refresh(true);
                    setError("");
                  } catch (err) {
                    setError("Bukti belum terkirim. " + (err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Kirim bukti
              </Button>
            )}
        </>
      )}
    </Dialog>
  );
}
