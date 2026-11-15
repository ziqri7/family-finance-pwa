import { useState } from "react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { api, ApiError } from "../lib/api";
export function ChangePassword({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [currentPassword, setCurrent] = useState(""),
    [newPassword, setNew] = useState(""),
    [confirmPassword, setConfirm] = useState(""),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="Ganti sandi"
      description="Gunakan sandi yang hanya Anda pakai untuk Financée."
      busy={busy}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (
            Array.from(newPassword).length < 15 ||
            Array.from(newPassword).length > 128 ||
            newPassword !== confirmPassword ||
            newPassword === currentPassword
          ) {
            setError(
              "Gunakan sandi baru 15–128 karakter yang berbeda dari sandi lama, lalu ulangi dengan tepat.",
            );
            return;
          }
          setBusy(true);
          try {
            const result = await api<{ ok?: boolean; loginRequired?: boolean }>(
              "/account/password",
              {
                method: "POST",
                body: { currentPassword, newPassword, confirmPassword },
              },
            );
            if (result.ok !== true || result.loginRequired !== true)
              throw new ApiError(
                0,
                "UNCONFIRMED",
                "Hasil perubahan belum terkonfirmasi.",
              );
            setCurrent("");
            setNew("");
            setConfirm("");
            onChanged();
          } catch (err) {
            setError(
              err instanceof ApiError && err.status === 0
                ? "Hasil perubahan belum terkonfirmasi. Jika sesi berakhir, coba masuk dengan sandi baru; jika belum berhasil, coba sandi sebelumnya."
                : (err as Error).message,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="password-current">Sandi saat ini</label>
        <input
          id="password-current"
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          required
          maxLength={256}
          disabled={busy}
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <label htmlFor="password-new">Sandi baru</label>
        <input
          id="password-new"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={15}
          maxLength={256}
          disabled={busy}
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          aria-describedby="password-guidance"
        />
        <p id="password-guidance" className="helper-note">
          Minimal 15 karakter, maksimal 128 karakter. Boleh memakai beberapa
          kata dan spasi.
        </p>
        <label htmlFor="password-confirm">Ulangi sandi baru</label>
        <input
          id="password-confirm"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          required
          maxLength={256}
          disabled={busy}
          value={confirmPassword}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
        >
          {visible ? "Sembunyikan sandi" : "Tampilkan sandi"}
        </Button>
        <p className="helper-note">
          Setelah sandi diganti, Anda perlu masuk kembali di semua perangkat.
          Akun pasangan tetap bisa digunakan.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Batal
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan sandi"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
