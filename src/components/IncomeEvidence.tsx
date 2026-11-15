import { useState } from "react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { EvidenceImages } from "./Dashboard";
import { validateFile } from "./Forms";
import { api, upload } from "../lib/api";
import type { FinanceStore } from "../lib/use-finance";
import { randomId, type Item } from "../../shared/domain";

export function IncomeEvidence({
  item,
  store,
  canEdit,
  onClose,
}: {
  item: Item;
  store: FinanceStore;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [picked, setPicked] = useState<
    { id: string; file: File; done: boolean }[]
  >([]);
  const files = store.snapshot!.attachments.filter(
    (f) => f.income_item_id === item.id && f.status !== "deleting",
  );
  async function save() {
    setBusy(true);
    setError("");
    try {
      for (const entry of picked) {
        if (entry.done) continue;
        const sha256 = Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              await entry.file.arrayBuffer(),
            ),
          ),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        await api("/income-items/" + item.id + "/attachments", {
          method: "POST",
          body: {
            id: entry.id,
            contentType: entry.file.type,
            byteSize: entry.file.size,
            sha256,
          },
        });
        await upload(entry.id, entry.file, "income-attachments");
        entry.done = true;
        setPicked([...picked]);
      }
      setPicked([]);
    } catch (e) {
      setError(
        (e as Error).message +
          " Bukti yang sudah berhasil tetap tersimpan. Tekan Unggah bukti untuk mencoba sisanya lagi.",
      );
    } finally {
      try {
        await store.refresh(true);
      } catch (e) {
        setError((e as Error).message);
      }
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title="Bukti pemasukan"
      description={item.label + " · " + store.snapshot!.id}
      busy={busy}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      wide
    >
      <p className="helper-note">
        Bukti bulan ini · tidak mengubah nominal atau ikut salin bulan.
      </p>
      <EvidenceImages files={files.filter((f) => f.status === "ready")} />
      {files.length === 0 && (
        <p className="empty-note">Belum ada bukti pemasukan.</p>
      )}
      {files.map((file, i) => (
        <div className="inline-actions" key={file.id}>
          <span>
            Bukti {i + 1}
            {file.status !== "ready" ? " · belum selesai diunggah" : ""}
          </span>
          {canEdit && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/income-attachments/" + file.id, {
                    method: "DELETE",
                  });
                  await store.refresh(true);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Hapus bukti {i + 1}
            </Button>
          )}
        </div>
      ))}
      {canEdit && (
        <>
          <label htmlFor={"income-files-" + item.id}>
            Tambah bukti JPG/PNG (opsional)
          </label>
          <input
            id={"income-files-" + item.id}
            type="file"
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            multiple
            disabled={busy}
            onChange={async (e) => {
              const input = e.currentTarget,
                list = [...(input.files || [])];
              setBusy(true);
              setError("");
              try {
                if (
                  files.length +
                    picked.filter(
                      (p) => !p.done && !files.some((f) => f.id === p.id),
                    ).length +
                    list.length >
                  10
                )
                  throw Error("Maksimal 10 gambar per pos pemasukan.");
                for (const file of list) await validateFile(file);
                setPicked((old) => [
                  ...old,
                  ...list.map((file) => ({
                    id: randomId(),
                    file,
                    done: false,
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
          <p className="helper-note">
            Maksimal 10 gambar × 5 MB. Pasangan dapat melihatnya.
          </p>
          {picked.map((p) => (
            <p className="helper-note" key={p.id}>
              {p.file.name} ·{" "}
              {p.done ? "tersimpan" : "siap diunggah / coba lagi"}
            </p>
          ))}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Tutup
        </Button>
        {canEdit && picked.some((p) => !p.done) && (
          <Button disabled={busy || !store.online} onClick={() => void save()}>
            {busy ? "Mengunggah…" : "Unggah bukti"}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
