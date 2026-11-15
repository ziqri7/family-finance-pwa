import { useState, useEffect, useRef } from "react";
import {
  House,
  UserRound,
  ReceiptText,
  Images,
  LogOut,
  WifiOff,
  X,
  Plus,
  KeyRound,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Dialog } from "./components/ui/dialog";
import { ChangePassword } from "./components/ChangePassword";
import { EvidenceGallery } from "./components/EvidenceGallery";
import { IncomeEvidence } from "./components/IncomeEvidence";
import { Budget } from "./components/Budget";
import { Dashboard, ExpenseList, EvidenceImages } from "./components/Dashboard";
import {
  MonthForm,
  AddItemForm,
  ExpenseForm,
  TransferForm,
} from "./components/Forms";
import { api, setExpiredHandler } from "./lib/api";
import { useFinance } from "./lib/use-finance";
import {
  ownerName,
  monthName,
  rupiah,
  type User,
  type Owner,
  type Expense,
  type Kind,
  type Item,
} from "../shared/domain";
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
  const [incomeEvidence, setIncomeEvidence] = useState<Item | null>(null);
  const [dashboardMode, setDashboardMode] = useState<"bulan" | "tahun">(
    "bulan",
  );
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null),
    [lastUser, setLastUser] = useState<User | null>(null),
    [initial, setInitial] = useState(true),
    [view, setView] = useState<"dashboard" | "evidence" | Owner>("dashboard");
  const [monthOpen, setMonthOpen] = useState(false),
    [addKind, setAddKind] = useState<Kind | null>(null),
    [expense, setExpense] = useState<{
      initial: Expense | null;
      key: string;
    } | null>(null),
    [transferOpen, setTransferOpen] = useState(false),
    [evidence, setEvidence] = useState<Expense | null>(null),
    [updateReady, setUpdateReady] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null),
    store = useFinance(user),
    userRef = useRef(user);
  userRef.current = user;
  useEffect(() => {
    setExpiredHandler(() => {
      setUser(null);
      setEvidence(null);
      setIncomeEvidence(null);
      setPasswordOpen(false);
    });
    api<{ user: User }>("/me")
      .then((v) => {
        setUser(v.user);
        setLastUser(v.user);
      })
      .catch((e) => {
        if (e.status !== 401) store.setMessage(e.message);
      })
      .finally(() => setInitial(false));
    return () => setExpiredHandler(() => {});
  }, []);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (store.hasDrafts || expense || transferOpen) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [store.hasDrafts, expense, transferOpen]);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let active = true;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (!active) return;
        registration.current = reg;
        if (reg.waiting) setUpdateReady(true);
        reg.addEventListener("updatefound", () => {
          reg.installing?.addEventListener("statechange", () => {
            if (reg.waiting && navigator.serviceWorker.controller)
              setUpdateReady(true);
          });
        });
      })
      .catch(() => {});
    const controller = () => {
      if (hadController) setUpdateReady(true);
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
  async function navigate(next: typeof view) {
    if (!(await store.flush())) {
      store.setMessage("Simpan atau perbaiki isian sebelum pindah halaman.");
      return false;
    }
    setView(next);
    window.scrollTo(0, 0);
    return true;
  }
  async function openMonth() {
    if (await navigate(user?.id || "dashboard")) setMonthOpen(true);
  }
  async function openExpense(initial: Expense | null = null) {
    if (!user || !(await store.flush())) return;
    if (
      !store.snapshot?.items.some(
        (i) =>
          i.owner_id === user.id && i.kind === "allocation" && !i.deleted_at,
      )
    ) {
      await navigate(user.id);
      store.setMessage(
        "Buat anggaran dan tambahkan pos alokasi Anda terlebih dahulu.",
      );
      return;
    }
    setExpense({ initial, key: initial?.id || crypto.randomUUID() });
  }
  async function openTransfer() {
    if (!user || !(await store.flush())) return;
    if (
      !store.snapshot?.items.some(
        (i) =>
          i.owner_id === user.id && i.kind === "transfer_out" && !i.deleted_at,
      )
    ) {
      await navigate(user.id);
      store.setMessage(
        "Tambahkan rencana kiriman pada bagian Anda terlebih dahulu.",
      );
      return;
    }
    setTransferOpen(true);
  }
  async function removeExpense(e: Expense) {
    if (confirm(`Hapus pengeluaran “${e.note}” beserta akses buktinya?`))
      try {
        await store.mutate("/expenses/" + e.id, "DELETE", {
          expectedVersion: e.version,
        });
      } catch (err) {
        store.setMessage((err as Error).message);
      }
  }
  async function signOut() {
    if (!(await store.flush())) {
      store.setMessage("Simpan atau selesaikan isian sebelum keluar.");
      return;
    }
    try {
      await api("/logout", { method: "POST", body: {} });
      store.clear();
      setUser(null);
      setLastUser(null);
      setView("dashboard");
      setExpense(null);
      setTransferOpen(false);
      setEvidence(null);
      setIncomeEvidence(null);
      setMonthOpen(false);
      setAddKind(null);
    } catch (e) {
      store.setMessage((e as Error).message);
    }
  }
  async function signIn(email: string, password: string) {
    const result = await api<{ user: User }>("/login", {
      method: "POST",
      body: { email, password },
    });
    if (
      lastUser &&
      result.user.id !== lastUser.id &&
      (store.hasDrafts || expense || transferOpen)
    ) {
      await api("/logout", { method: "POST", body: {} });
      throw Error(
        "Masuk kembali sebagai " +
          lastUser.name +
          " untuk menjaga isian yang belum selesai.",
      );
    }
    setUser(result.user);
    setLastUser(result.user);
    store.setMessage("");
  }
  async function update() {
    if (
      expense ||
      transferOpen ||
      monthOpen ||
      addKind ||
      !(await store.flush())
    )
      return;
    const waiting = registration.current?.waiting;
    if (waiting) {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => location.reload(),
        { once: true },
      );
      waiting.postMessage("SKIP_WAITING");
    } else location.reload();
  }
  if (initial)
    return (
      <main className="loading-panel" role="status">
        Membuka Financée…
      </main>
    );
  const actor = lastUser?.id,
    s = store.snapshot;
  return (
    <>
      {!user && (
        <Login
          onLogin={signIn}
          message={store.message}
          resume={lastUser?.name}
        />
      )}
      <div hidden={!user} className="app">
        <header className="app-header">
          <div className="header-inner">
            <span className="brand">Financée</span>
            <div className="account-pill">
              <UserRound size={16} />
              <span>{user?.name}</span>
            </div>
            <Button
              variant="ghost"
              aria-label="Ganti sandi"
              disabled={store.busy}
              onClick={async () => {
                if (
                  expense ||
                  transferOpen ||
                  monthOpen ||
                  addKind ||
                  !(await store.flush())
                ) {
                  store.setMessage(
                    "Simpan atau selesaikan isian sebelum mengganti sandi.",
                  );
                  return;
                }
                setPasswordOpen(true);
              }}
            >
              <KeyRound size={18} />
              <span className="sr-only">Ganti sandi</span>
            </Button>
            <Button
              variant="ghost"
              className="logout"
              aria-label="Keluar"
              disabled={store.busy}
              onClick={() => void signOut()}
            >
              <LogOut size={16} />
              <span>Keluar</span>
            </Button>
          </div>
        </header>
        {user && passwordOpen && (
          <ChangePassword
            onClose={() => setPasswordOpen(false)}
            onChanged={() => {
              setPasswordOpen(false);
              store.clear();
              setUser(null);
              setLastUser(null);
              setView("dashboard");
              setEvidence(null);
              setIncomeEvidence(null);
              setExpense(null);
              setTransferOpen(false);
              setMonthOpen(false);
              setAddKind(null);
              store.setMessage(
                "Sandi berhasil diganti. Silakan masuk kembali dengan sandi baru.",
              );
            }}
          />
        )}
        <main className="main-shell">
          <div className="page-heading">
            <div>
              <h1>
                {view === "dashboard"
                  ? "Keuangan keluarga"
                  : view === "evidence"
                    ? "Bukti"
                    : "Anggaran " + ownerName[view].toLowerCase()}
              </h1>
            </div>
            <div className="period-controls">
              <label htmlFor="period" className="sr-only">
                Bulan anggaran
              </label>
              <select
                style={{
                  display:
                    view === "dashboard" && dashboardMode === "tahun"
                      ? "none"
                      : undefined,
                }}
                id="period"
                disabled={store.busy}
                value={store.period}
                onChange={(e) => void store.choose(e.target.value)}
              >
                {!store.periods.length && (
                  <option value="">Belum ada anggaran</option>
                )}
                {store.periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {monthName(p.id)}
                  </option>
                ))}
              </select>
              <Button
                disabled={!store.online || store.busy}
                onClick={() => void openMonth()}
              >
                <Plus size={15} />
                Buat bulan
              </Button>
            </div>
          </div>
          {incomeEvidence && user && (
            <IncomeEvidence
              item={incomeEvidence}
              store={store}
              canEdit={incomeEvidence.owner_id === user.id}
              onClose={() => setIncomeEvidence(null)}
            />
          )}
          <nav className="app-nav" aria-label="Bagian aplikasi">
            <button
              aria-label="Dashboard keluarga"
              aria-pressed={view === "dashboard"}
              onClick={() => void navigate("dashboard")}
            >
              <House />
              <span>Beranda</span>
            </button>
            <button
              aria-label="Bagian suami"
              aria-pressed={view === "partner-a"}
              onClick={() => void navigate("partner-a")}
            >
              <UserRound />
              <span>Suami</span>
            </button>
            <button
              className="compose-nav"
              aria-label="Catat pengeluaran"
              disabled={!store.online || store.busy}
              onClick={() => void openExpense()}
            >
              <ReceiptText />
              <span>Catat</span>
            </button>
            <button
              aria-label="Bagian istri"
              aria-pressed={view === "partner-b"}
              onClick={() => void navigate("partner-b")}
            >
              <UserRound />
              <span>Istri</span>
            </button>
            <button
              aria-label="Galeri bukti"
              aria-pressed={view === "evidence"}
              onClick={() => void navigate("evidence")}
            >
              <Images />
              <span>Bukti</span>
            </button>
          </nav>
          {!store.online && (
            <p className="offline-note" role="status">
              <WifiOff size={16} />
              Koneksi terputus. Anda bisa mengisi lagi setelah tersambung.
            </p>
          )}
          {store.message && (
            <div className="message" role="status">
              <p>{store.message}</p>
              <button
                className="icon-button"
                aria-label="Tutup pesan"
                onClick={() => store.setMessage("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {updateReady && (
            <div className="message">
              <p>Versi baru tersedia. Selesaikan isian sebelum memperbarui.</p>
              <Button
                variant="secondary"
                disabled={Boolean(expense || transferOpen || store.busy)}
                onClick={() => void update()}
              >
                Perbarui aplikasi
              </Button>
            </div>
          )}
          {store.loading && !s ? (
            <p className="loading-panel" role="status">
              Memuat anggaran…
            </p>
          ) : !s ? (
            <section className="empty-panel">
              <h2>Mulai anggaran keluarga</h2>
              <p>
                Siapkan bulan pertama. Pos bawaan tersedia dengan nominal
                kosong.
              </p>
              <Button disabled={!store.online} onClick={() => void openMonth()}>
                Buat anggaran saya
              </Button>
            </section>
          ) : (
            actor && (
              <div className="view-content" key={view + ":" + s.id}>
                {view === "dashboard" ? (
                  <Dashboard
                    mode={dashboardMode}
                    onMode={(mode) => setDashboardMode(mode)}
                    snapshot={s}
                    periods={store.periods}
                    active={Boolean(user)}
                    actor={actor}
                    onView={(v) => void navigate(v)}
                    onExpense={() => void openExpense()}
                    onTransfer={() => void openTransfer()}
                    onEdit={(e) => void openExpense(e)}
                    onDelete={(e) => void removeExpense(e)}
                    onEvidence={setEvidence}
                  />
                ) : view === "evidence" ? (
                  <EvidenceGallery
                    snapshot={s}
                    onExpense={setEvidence}
                    onIncome={setIncomeEvidence}
                  />
                ) : (
                  <>
                    <Budget
                      active={Boolean(user)}
                      store={store}
                      owner={view}
                      actor={actor}
                      onCreate={() => void openMonth()}
                      onAdd={setAddKind}
                    />
                    {s.budgets.some((b) => b.owner_id === view) && (
                      <>
                        <section className="records-panel">
                          <div className="section-heading">
                            <div>
                              <h2>Pengeluaran nyata</h2>
                              <p>Bukti opsional.</p>
                            </div>
                            {view === actor && (
                              <Button
                                disabled={!store.online || store.busy}
                                onClick={() => void openExpense()}
                              >
                                + Catat
                              </Button>
                            )}
                          </div>
                          <ExpenseList
                            snapshot={s}
                            owner={view}
                            actor={actor}
                            onEdit={(e) => void openExpense(e)}
                            onDelete={(e) => void removeExpense(e)}
                            onEvidence={setEvidence}
                          />
                        </section>
                        <section className="records-panel">
                          <div className="section-heading">
                            <div>
                              <h2>Kiriman antar pasangan</h2>
                              <p>Hanya pencatatan, bukan transfer uang.</p>
                            </div>
                            {view === actor && (
                              <Button
                                variant="secondary"
                                disabled={!store.online || store.busy}
                                onClick={() => void openTransfer()}
                              >
                                + Kiriman
                              </Button>
                            )}
                          </div>
                          {!s.transfers.some(
                            (t) =>
                              t.from_owner_id === view ||
                              t.to_owner_id === view,
                          ) && (
                            <p className="empty-note">
                              Belum ada kiriman yang dicatat.
                            </p>
                          )}
                          {s.transfers
                            .filter(
                              (t) =>
                                t.from_owner_id === view ||
                                t.to_owner_id === view,
                            )
                            .map((t) => (
                              <article className="transfer-record" key={t.id}>
                                <div>
                                  <strong>
                                    {ownerName[t.from_owner_id]} →{" "}
                                    {ownerName[t.to_owner_id]}
                                  </strong>
                                  <small>
                                    {t.occurred_on} ·{" "}
                                    {t.from_owner_id === view
                                      ? "Keluar"
                                      : "Masuk · otomatis"}
                                  </small>
                                </div>
                                <strong>{rupiah.format(t.amount)}</strong>
                                {view === actor &&
                                  t.from_owner_id === actor && (
                                    <Button
                                      variant="ghost"
                                      disabled={!store.online || store.busy}
                                      onClick={() => {
                                        if (
                                          confirm(
                                            "Hapus catatan kiriman dari kedua tampilan?",
                                          )
                                        )
                                          void store
                                            .mutate(
                                              "/transfers/" + t.id,
                                              "DELETE",
                                              { expectedVersion: t.version },
                                            )
                                            .catch((e) =>
                                              store.setMessage(e.message),
                                            );
                                      }}
                                    >
                                      Hapus
                                    </Button>
                                  )}
                              </article>
                            ))}
                        </section>
                      </>
                    )}
                  </>
                )}
              </div>
            )
          )}
        </main>
      </div>
      {user && actor && monthOpen && (
        <MonthForm
          store={store}
          actor={actor}
          onClose={() => setMonthOpen(false)}
        />
      )}{" "}
      {user && addKind && (
        <AddItemForm
          kind={addKind}
          store={store}
          onClose={() => setAddKind(null)}
        />
      )}{" "}
      {actor && s && expense && (
        <ExpenseForm
          key={expense.key}
          open={Boolean(user)}
          store={store}
          actor={actor}
          initial={expense.initial}
          onClose={() => setExpense(null)}
        />
      )}{" "}
      {actor && s && transferOpen && (
        <TransferForm
          open={Boolean(user)}
          store={store}
          actor={actor}
          onClose={() => setTransferOpen(false)}
        />
      )}
      <Dialog
        open={Boolean(user && evidence)}
        title="Bukti pengeluaran"
        description={
          evidence
            ? ownerName[evidence.owner_id] +
              " · " +
              evidence.note +
              " · " +
              rupiah.format(evidence.amount)
            : undefined
        }
        wide
        onOpenChange={(v) => {
          if (!v) setEvidence(null);
          setIncomeEvidence(null);
        }}
      >
        <EvidenceImages
          files={
            s?.attachments.filter(
              (a) => a.expense_id === evidence?.id && a.status === "ready",
            ) || []
          }
        />
      </Dialog>
    </>
  );
}
