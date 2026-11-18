import { useState, useEffect, useRef, useCallback } from "react";
import {
  House,
  Images,
  Plus,
  KeyRound,
  LogOut,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { MonthForm } from "./components/Forms";
import { ChangePassword } from "./components/ChangePassword";
import { FamilyBook } from "./components/FamilyBook";
import { useFinance } from "./lib/use-finance";
import { api, setExpiredHandler } from "./lib/api";
import { monthName, type User } from "../shared/domain";
function Login({
  onLogin,
  message,
  resume,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  message: string;
  resume?: string;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="login-page">
      <main className="login-layout">
        <section className="login-intro">
          <span className="brand">Financée</span>
          <h1>
            Keuangan keluarga,
            <br />
            dikelola berdua.
          </h1>
          <p>
            Rencanakan anggaran, catat pengeluaran, dan lihat bukti dalam satu
            tempat.
          </p>
          <div className="login-card-sample" aria-hidden="true">
            <span>Anggaran keluarga</span>
            <div className="sample-lines">
              <span />
              <span />
            </div>
            <span>Suami & istri</span>
          </div>
        </section>
        <section className="login-form-panel">
          <h2>{resume ? "Masuk kembali" : "Selamat datang"}</h2>
          <p>
            {resume
              ? `Masuk sebagai ${resume} untuk melanjutkan isian yang belum selesai.`
              : "Gunakan akun yang sudah disiapkan untuk Anda."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await onLogin(email, password);
                setPassword("");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="login-email">Identitas login</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label htmlFor="login-password">Sandi</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {(error || message) && (
              <p className="error" role="alert">
                {error || message}
              </p>
            )}
            <Button className="login-submit" type="submit" disabled={busy}>
              {busy ? "Memeriksa…" : "Masuk"}
            </Button>
          </form>
          <p className="helper-note">
            Belum punya akses? Hubungi pemilik aplikasi untuk mendapatkan akun.
          </p>
        </section>
      </main>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [lastUser, setLastUser] = useState<User | null>(null),
    [initial, setInitial] = useState(true),
    [view, setView] = useState<"home" | "evidence">("home"),
    [monthOpen, setMonthOpen] = useState(false),
    [passwordOpen, setPasswordOpen] = useState(false),
    [updateReady, setUpdateReady] = useState(false);
  const store = useFinance(user),
    registration = useRef<ServiceWorkerRegistration | null>(null),
    dialogDirty = useRef(false),
    userRef = useRef(user);
  userRef.current = user;
  const dirty = useCallback((value: boolean) => {
    dialogDirty.current = value;
  }, []);
  useEffect(() => {
    setExpiredHandler(() => {
      setUser(null);
      setPasswordOpen(false);
    });
    api<{ user: User }>("/me")
      .then(({ user }) => {
        setUser(user);
        setLastUser(user);
      })
      .catch((e) => {
        if (e.status !== 401) store.setMessage(e.message);
      })
      .finally(() => setInitial(false));
    return () => setExpiredHandler(() => {});
  }, []);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (store.hasDrafts || dialogDirty.current || monthOpen) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [store.hasDrafts, monthOpen]);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let active = true;
    const controlled = !!navigator.serviceWorker.controller;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (!active) return;
        registration.current = reg;
        if (reg.waiting) setUpdateReady(true);
        reg.addEventListener("updatefound", () =>
          reg.installing?.addEventListener("statechange", () => {
            if (reg.waiting && navigator.serviceWorker.controller)
              setUpdateReady(true);
          }),
        );
      })
      .catch(() => {});
    const controller = () => {
      if (controlled) setUpdateReady(true);
    };
    navigator.serviceWorker.addEventListener("controllerchange", controller);
    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        controller,
      );
    };
  }, []);
  async function navigate(next: "home" | "evidence") {
    if (await store.flush()) {
      setView(next);
      window.scrollTo(0, 0);
    }
  }
  async function signOut() {
    if (!(await store.flush())) return;
    if (
      dialogDirty.current &&
      !confirm("Tutup isian yang masih terbuka dan keluar?")
    )
      return;
    try {
      await api("/logout", { method: "POST", body: {} });
      store.clear();
      setUser(null);
      setLastUser(null);
      setMonthOpen(false);
      setView("home");
    } catch (e) {
      store.setMessage((e as Error).message);
    }
  }
  async function refreshApp() {
    if (dialogDirty.current || monthOpen || passwordOpen) {
      store.setMessage(
        "Tutup rincian dan selesaikan isian sebelum memperbarui.",
      );
      return;
    }
    if (!(await store.flush())) return;
    registration.current?.waiting?.postMessage("SKIP_WAITING");
    if (registration.current?.waiting)
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        );
        setTimeout(resolve, 1500);
      });
    window.location.reload();
  }
  if (initial)
    return (
      <main className="book-loading" role="status">
        Memuat Financée…
      </main>
    );
  return (
    <>
      {!user && (
        <Login
          message={store.message}
          resume={lastUser?.name}
          onLogin={async (email, password) => {
            const result = await api<{ user: User }>("/login", {
              method: "POST",
              body: { email, password },
            });
            if (lastUser && lastUser.id !== result.user.id) {
              store.clear();
              setMonthOpen(false);
              setView("home");
            }
            setUser(result.user);
            setLastUser(result.user);
          }}
        />
      )}
      {lastUser && (
        <div className="book-shell" hidden={!user}>
          <header className="book-header">
            <a
              className="brand"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                void navigate("home");
              }}
            >
              Financée
            </a>
            <div className="book-account">
              <span>{user?.name || lastUser.name}</span>
              <Button
                variant="ghost"
                aria-label="Ganti sandi"
                onClick={() => setPasswordOpen(true)}
              >
                <KeyRound size={18} />
              </Button>
              <Button
                variant="ghost"
                aria-label="Keluar"
                onClick={() => void signOut()}
              >
                <LogOut size={18} />
              </Button>
            </div>
          </header>
          <main className="book-main">
            <div className="book-period">
              <label className="sr-only" htmlFor="book-month">
                Bulan keluarga
              </label>
              <select
                id="book-month"
                value={store.period}
                onChange={(e) => void store.choose(e.target.value)}
                disabled={store.loading || store.busy}
              >
                {!store.period && <option value="">Pilih bulan</option>}
                {store.periods.map((p) => (
                  <option value={p.id} key={p.id}>
                    {monthName(p.id)}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                aria-label="Buat bulan baru"
                disabled={!store.online || store.busy}
                onClick={async () => {
                  if (await store.flush()) setMonthOpen(true);
                }}
              >
                <Plus size={20} />
              </Button>
              <Button
                variant="ghost"
                aria-label="Muat data terbaru"
                disabled={!store.online || store.loading}
                onClick={() => void store.refresh(true)}
              >
                <RefreshCw size={17} />
              </Button>
            </div>
            {!store.online && (
              <p className="book-notice" role="status">
                <WifiOff size={16} /> Sedang offline. Sambungkan internet untuk
                menyimpan.
              </p>
            )}
            {updateReady && (
              <div className="book-notice">
                <span>Pembaruan tersedia.</span>
                <Button variant="secondary" onClick={() => void refreshApp()}>
                  Perbarui
                </Button>
              </div>
            )}
            {store.message && (
              <div className="book-notice" role="status">
                <span>{store.message}</span>
                <Button variant="ghost" onClick={() => store.setMessage("")}>
                  Tutup
                </Button>
              </div>
            )}
            {store.loading && !store.snapshot && (
              <p role="status">Memuat buku keluarga…</p>
            )}
            {store.snapshot && (
              <FamilyBook
                key={lastUser.id + ":" + store.snapshot.id}
                store={store}
                actor={lastUser.id}
                active={!!user}
                view={view}
                onDirty={dirty}
                onNavigate={(v) => void navigate(v)}
              />
            )}
            {!store.loading && !store.snapshot && (
              <section className="book-empty">
                <h1>Mulai buku keluarga</h1>
                <Button
                  onClick={() => setMonthOpen(true)}
                  disabled={!store.online}
                >
                  Buat bulan pertama
                </Button>
              </section>
            )}
          </main>
          <nav className="book-nav" aria-label="Menu utama">
            <button
              aria-current={view === "home" ? "page" : undefined}
              onClick={() => void navigate("home")}
            >
              <House size={22} />
              Beranda
            </button>
            <button
              aria-current={view === "evidence" ? "page" : undefined}
              onClick={() => void navigate("evidence")}
            >
              <Images size={22} />
              Bukti
            </button>
          </nav>
        </div>
      )}
      {user && monthOpen && (
        <MonthForm
          store={store}
          actor={user.id}
          onClose={() => setMonthOpen(false)}
        />
      )}
      {user && passwordOpen && (
        <ChangePassword
          onClose={() => setPasswordOpen(false)}
          onChanged={() => {
            setPasswordOpen(false);
            setUser(null);
            store.setMessage(
              "Sandi berhasil diganti. Masuk kembali dengan sandi baru.",
            );
          }}
        />
      )}
    </>
  );
}
