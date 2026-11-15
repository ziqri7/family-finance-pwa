import { useState, useRef } from "react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { MoneyInput } from "./MoneyInput";
import { api, upload } from "../lib/api";
import type { FinanceStore } from "../lib/use-finance";
import {
  randomId,
  ownerName,
  other,
  rupiah,
  monthName,
  type Expense,
  type Owner,
  type Kind,
} from "../../shared/domain";
export function MonthForm({
  store,
  actor,
  onClose,
}: {
  store: FinanceStore;
  actor: Owner;
  onClose: () => void;
}) {
  const [id, setId] = useState(
      store.period ||
        new Date().getFullYear() +
          "-" +
          String(new Date().getMonth() + 1).padStart(2, "0"),
    ),
    [source, setSource] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      title="Buat anggaran bulan"
      description="Buat anggaran untuk bulan ini. Jika menyalin bulan lain, hanya rencananya yang disalin; pengeluaran dan bukti tetap di bulan asal."
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
            await store.createMonth(id, source || undefined);
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="month-id">Bulan dan tahun</label>
        <input
          id="month-id"
          type="month"
          min="2000-01"
          max="2100-12"
          required
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <label htmlFor="month-source">Isi awal anggaran</label>
        <select
          id="month-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="">Pos bawaan saya, nominal belum diisi</option>
          {store.periods
            .filter((p) => p.owners.includes(actor))
            .map((p) => (
              <option key={p.id} value={p.id}>
                Salin bagian saya · {monthName(p.id)}
              </option>
            ))}
        </select>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Membuat…" : "Buat anggaran"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
export function AddItemForm({
  kind,
  store,
  onClose,
}: {
  kind: Kind;
  store: FinanceStore;
  onClose: () => void;
}) {
  const id = useRef(randomId()).current,
    [label, setLabel] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      title={
        kind === "income"
          ? "Tambah pemasukan"
          : kind === "allocation"
            ? "Tambah alokasi"
            : "Tambah rencana kiriman"
      }
      busy={busy}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await store.addItem(label, kind, id);
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="item-label">Nama pos</label>
        <input
          id="item-label"
          required
          maxLength={100}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={busy}>
            Tambah pos
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
function dayFor(period: string) {
  const today = new Date();
  return today.getFullYear() +
    "-" +
    String(today.getMonth() + 1).padStart(2, "0") ===
    period
    ? period + "-" + String(today.getDate()).padStart(2, "0")
    : period + "-01";
}
const lastDay = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return period + "-" + new Date(y, m, 0).getDate();
};
type Picked = { id: string; file: File; status: "waiting" | "done" | "failed" };
async function validateFile(file: File) {
  if (
    !["image/jpeg", "image/png"].includes(file.type) ||
    !file.size ||
    file.size > 5 * 1024 * 1024
  )
    throw Error("Pilih JPG/PNG maksimal 5 MB per gambar.");
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer()),
    png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v),
    jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (file.type === "image/png" ? !png : !jpg)
    throw Error("Isi berkas bukan JPG/PNG yang sesuai.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw Error("Gambar tidak dapat dibaca.");
  }
  const valid =
    bitmap.width <= 10000 &&
    bitmap.height <= 10000 &&
    bitmap.width * bitmap.height <= 16000000;
  bitmap.close();
  if (!valid)
    throw Error("Gambar maksimal 16 megapiksel dan 10.000 piksel per sisi.");
}
export function ExpenseForm({
  store,
  actor,
  initial,
  onClose,
  open,
}: {
  store: FinanceStore;
  actor: Owner;
  initial: Expense | null;
  onClose: () => void;
  open: boolean;
}) {
  const snapshot = store.snapshot!,
    items = snapshot.items.filter(
      (i) => i.owner_id === actor && i.kind === "allocation" && !i.deleted_at,
    ),
    id = useRef(initial?.id || randomId()).current;
  const [date, setDate] = useState(initial?.occurred_on || dayFor(snapshot.id)),
    [itemId, setItemId] = useState(initial?.item_id || items[0]?.id || ""),
    [note, setNote] = useState(initial?.note || ""),
    [amount, setAmount] = useState(initial ? String(initial.amount) : ""),
    [picked, setPicked] = useState<Picked[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState<Expense | null>(null);
  const files = snapshot.attachments.filter(
    (a) => a.expense_id === id && a.status !== "deleting",
  );
  async function save() {
    setError("");
    setBusy(true);
    try {
      let record = saved;
      if (!record) {
        const body = { date, itemId, note, amount: Number(amount) };
        const result = initial
          ? await store.mutate<{ expense: Expense }>(
              "/expenses/" + id,
              "PATCH",
              { ...body, expectedVersion: initial.version },
            )
          : await store.mutate<{ expense: Expense }>("/expenses", "POST", {
              id,
              ...body,
            });
        record = result.expense;
        setSaved(record);
      }
      const next = picked.slice();
      let failed = false;
      for (const file of next) {
        if (file.status === "done") continue;
        try {
          const checksum = Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                await file.file.arrayBuffer(),
              ),
            ),
            (b) => b.toString(16).padStart(2, "0"),
          ).join("");
          await api("/expenses/" + id + "/attachments", {
            method: "POST",
            body: {
              id: file.id,
              contentType: file.file.type,
              byteSize: file.file.size,
              sha256: checksum,
            },
          });
          await upload(file.id, file.file);
          file.status = "done";
        } catch (err) {
          file.status = "failed";
          failed = true;
          setError(
            "Pengeluaran sudah tersimpan. " +
              (err as Error).message +
              " Anda dapat mengulangi unggahan atau menutup form.",
          );
        }
        setPicked([...next]);
      }
      await store.refresh(true);
      if (!failed) onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      title={initial ? "Ubah pengeluaran" : "Catat pengeluaran"}
      description={ownerName[actor] + " · " + monthName(snapshot.id)}
      busy={busy}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy || Boolean(saved)}>
          <label htmlFor="expense-date">Tanggal</label>
          <input
            id="expense-date"
            type="date"
            min={snapshot.id + "-01"}
            max={lastDay(snapshot.id)}
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <label htmlFor="expense-item">Pos alokasi</label>
          <select
            id="expense-item"
            required
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          >
            {items.map((i) => (
              <option value={i.id} key={i.id}>
                {i.label}
              </option>
            ))}
          </select>
          <label htmlFor="expense-note">Keterangan</label>
          <input
            id="expense-note"
            required
            maxLength={150}
            placeholder="Misalnya belanja sayur"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <label htmlFor="expense-amount">Nominal (Rp)</label>
          <MoneyInput
            id="expense-amount"
            inputMode="numeric"
            min="1"
            max="1000000000000"
            step="1"
            required
            value={amount}
            onValueChange={setAmount}
          />
          <label htmlFor="expense-files">
            Bukti JPG/PNG (opsional, boleh beberapa)
          </label>
          <input
            id="expense-files"
            type="file"
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            multiple
            onChange={async (e) => {
              const input = e.currentTarget,
                list = [...(input.files || [])];
              setBusy(true);
              setError("");
              try {
                if (files.length + picked.length + list.length > 10)
                  throw Error("Maksimal 10 gambar per pengeluaran.");
                for (const file of list) await validateFile(file);
                setPicked((old) => [
                  ...old,
                  ...list.map((file) => ({
                    id: randomId(),
                    file,
                    status: "waiting" as const,
                  })),
                ]);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                input.value = "";
                setBusy(false);
              }
            }}
          />
          <small className="helper-note">
            Maksimal 10 gambar, masing-masing 5 MB. Pengeluaran boleh tanpa
            bukti.
          </small>
        </fieldset>
        {files.length > 0 && (
          <div className="existing-files">
            {files
              .filter((f) => !picked.some((p) => p.id === f.id))
              .map((f, i) => (
                <div key={f.id}>
                  <span>
                    Bukti {i + 1} ·{" "}
                    {f.status === "ready" ? "Tersimpan" : "Belum selesai"}
                  </span>
                  <Button
                    variant="ghost"
                    disabled={busy || !store.online}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api("/attachments/" + f.id, { method: "DELETE" });
                        await store.refresh(true);
                      } catch (err) {
                        setError((err as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Hapus bukti
                  </Button>
                </div>
              ))}
          </div>
        )}
        {picked.length > 0 && (
          <ul className="picked-files">
            {picked.map((p) => (
              <li key={p.id}>
                {p.file.name} ·{" "}
                {p.status === "done"
                  ? "Tersimpan"
                  : p.status === "failed"
                    ? "Belum terunggah"
                    : "Siap diunggah"}
                {!busy && !saved && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setPicked((old) => old.filter((f) => f.id !== p.id))
                    }
                  >
                    Lepas
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {saved ? "Tutup" : "Batal"}
          </Button>
          <Button type="submit" disabled={busy || !store.online}>
            {busy
              ? "Menyimpan…"
              : saved
                ? "Ulangi unggahan"
                : "Simpan pengeluaran"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
export function TransferForm({
  store,
  actor,
  onClose,
  open,
}: {
  store: FinanceStore;
  actor: Owner;
  onClose: () => void;
  open: boolean;
}) {
  const s = store.snapshot!,
    items = s.items.filter(
      (i) => i.owner_id === actor && i.kind === "transfer_out" && !i.deleted_at,
    ),
    id = useRef(randomId()).current,
    [itemId, setItemId] = useState(items[0]?.id || ""),
    [date, setDate] = useState(dayFor(s.id)),
    [amount, setAmount] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      title="Catat kiriman"
      description={
        ownerName[actor] +
        " → " +
        ownerName[other(actor)] +
        " · " +
        monthName(s.id)
      }
      busy={busy}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await store.mutate("/transfers", "POST", {
              id,
              date,
              sourceItemId: itemId,
              amount: Number(amount),
            });
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="transfer-item">Pos rencana kiriman</label>
        <select
          id="transfer-item"
          required
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
        >
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
        <label htmlFor="transfer-date">Tanggal kirim</label>
        <input
          id="transfer-date"
          type="date"
          required
          min={s.id + "-01"}
          max={lastDay(s.id)}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <label htmlFor="transfer-amount">Nominal yang dikirim (Rp)</label>
        <MoneyInput
          id="transfer-amount"
          inputMode="numeric"
          required
          min="1"
          max="1000000000000"
          step="1"
          value={amount}
          onValueChange={setAmount}
        />
        <p className="helper-note">
          Catat uang yang sudah Anda kirim ke pasangan. Transfer tetap dilakukan
          melalui bank atau dompet digital Anda; catatan ini tidak menambah
          belanja keluarga.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={busy || !store.online}>
            {busy ? "Menyimpan…" : "Simpan kiriman"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
