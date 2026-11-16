import { effectiveFamilyTotals as familyTotals } from "../../shared/ledger";
import { allocationChart } from "../../shared/chart-data";
import { useState } from "react";
import { Info } from "lucide-react";
import { Dialog } from "./ui/dialog";
import { ratio, rupiah, type Snapshot } from "../../shared/domain";
import "./visual-finance.css";
export function ChartInfo({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="chart-info"
        aria-label={"Cara hitung " + title}
        onClick={() => setOpen(true)}
      >
        <Info size={17} />
      </button>
      <Dialog open={open} onOpenChange={setOpen} title={title}>
        <div className="chart-explanation">{children}</div>
      </Dialog>
    </>
  );
}
export const compactMoney = (n: number) =>
  Math.abs(n) >= 1e9
    ? "Rp" +
      new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(
        n / 1e9,
      ) +
      " M"
    : Math.abs(n) >= 1e6
      ? "Rp" +
        new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(
          n / 1e6,
        ) +
        " jt"
      : rupiah.format(n);
export function ChartNumbers({
  values,
}: {
  values: [string, number | null][];
}) {
  return (
    <dl className="chart-numbers">
      {values.map(([name, n]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd
            className={n !== null && n < 0 ? "negative" : undefined}
            title={n === null ? "Belum lengkap" : rupiah.format(n)}
            aria-label={
              name + " " + (n === null ? "belum lengkap" : rupiah.format(n))
            }
          >
            {n === null ? "—" : compactMoney(n)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function MonthCharts({ snapshot }: { snapshot: Snapshot }) {
  const t = familyTotals(snapshot),
    {
      slices: top,
      missing,
      ownersComplete,
      incomeComplete,
    } = allocationChart(snapshot);
  const colors = ["#7042b3", "#a38bc9", "#668f45", "#b2c69c"],
    circle = 2 * Math.PI * 52;
  let offset = 0;
  const peak = Math.max(t.income, t.spent, 1),
    pct = incomeComplete && t.income > 0 ? ratio(t.spent, t.income) : "—";
  return (
    <>
      <ChartNumbers
        values={[
          ["Pemasukan anggaran", incomeComplete ? t.income : null],
          ["Pengeluaran", t.spent],
          [
            "Sisa belum dibagi",
            ownersComplete && missing === 0 ? t.remaining : null,
          ],
        ]}
      />
      {(!ownersComplete || missing > 0) && (
        <p className="chart-status">
          Anggaran belum lengkap
          {missing ? ` · ${missing} nominal belum diisi` : ""}.
        </p>
      )}
      {t.reserved > 0 && (
        <p className="chart-status">
          Disisihkan: {rupiah.format(t.reserved)} · terpisah dari pembayaran ke
          luar keluarga.
        </p>
      )}
      <div className="finance-chart-grid">
        <section className="finance-panel">
          <div className="finance-heading">
            <h2>Pembagian uang</h2>
            <ChartInfo title="Pembagian alokasi">
              <p>
                Donut membagi pembayaran dan uang disisihkan yang sudah tercatat
                menurut nama pos. Pos bernama sama digabung; tiga terbesar
                ditampilkan tersendiri, sisanya menjadi Pos lainnya.
              </p>
              <p>
                Persentase terhadap pembayaran dan uang disisihkan yang
                tercatat. Sisa belum dibagi = pemasukan dikurangi pembayaran dan
                uang disisihkan; kiriman internal tidak dihitung dua kali.
              </p>
              <p>Nominal kosong belum diisi. Isi 0 jika pos tidak dipakai.</p>
            </ChartInfo>
          </div>
          <div className="allocation-layout">
            <div className="allocation-donut">
              <svg
                viewBox="0 0 132 132"
                role="img"
                aria-label={
                  top.length
                    ? "Komposisi alokasi: " +
                      top
                        .map(
                          (r) =>
                            r.label +
                            " " +
                            ratio(r.amount, t.allocation + t.reserved),
                        )
                        .join(", ")
                    : "Belum ada alokasi terisi"
                }
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
                  {top.map((r, i) => {
                    const size =
                        (r.amount / (t.allocation + t.reserved)) * circle,
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
              <div className="allocation-center" aria-hidden="true">
                <span>Sudah dicatat</span>
                <strong title={rupiah.format(t.allocation + t.reserved)}>
                  {compactMoney(t.allocation + t.reserved)}
                </strong>
              </div>
            </div>
            <ul className="allocation-legend">
              {top.map((r, i) => (
                <li key={i}>
                  <i style={{ background: colors[i] }} />
                  <span>
                    {r.label}
                    <small title={rupiah.format(r.amount)}>
                      {compactMoney(r.amount)}
                    </small>
                  </span>
                  <strong>{ratio(r.amount, t.allocation + t.reserved)}</strong>
                </li>
              ))}
              {!top.length && <li>Belum ada alokasi.</li>}
            </ul>
          </div>
          <p className="chart-caption">
            Persentase dari pembayaran dan uang disisihkan yang sudah tercatat.
          </p>
        </section>
        <section className="finance-panel">
          <div className="finance-heading">
            <h2>Pemasukan & pengeluaran</h2>
            <ChartInfo title="Pemasukan dan pengeluaran">
              <p>
                Pengeluaran tercatat dibandingkan pemasukan anggaran bulan
                aktif. Persentase hanya ditampilkan jika pemasukan kedua akun
                sudah terisi dan totalnya lebih dari 0.
              </p>
              <p>
                Kiriman antar pasangan tidak ikut pengeluaran keluarga.
                Pengeluaran yang belum dicatat tidak terwakili; angka ini bukan
                saldo rekening.
              </p>
            </ChartInfo>
          </div>
          {(
            [
              ["Pemasukan anggaran", t.income, false],
              ["Pengeluaran tercatat", t.spent, true],
            ] as const
          ).map(([label, n, spent]) => (
            <div className="finance-comparison" key={label}>
              <div>
                <span>{label}</span>
                <strong title={rupiah.format(n)}>{compactMoney(n)}</strong>
              </div>
              <div className="finance-track">
                <span
                  className={
                    spent ? (t.spent > t.income ? "over" : "spent") : ""
                  }
                  style={{ width: `${(n / peak) * 100}%` }}
                />
              </div>
            </div>
          ))}
          <div className="finance-spending">
            <div>
              <strong className={t.spent > t.income ? "negative" : undefined}>
                {pct}
              </strong>
              <p>dari pemasukan anggaran</p>
            </div>
            <span className="finance-badge">
              {!incomeComplete
                ? "Pemasukan belum lengkap"
                : t.income === 0
                  ? "Pemasukan nol"
                  : t.spent > t.income
                    ? "Melebihi pemasukan"
                    : "Pengeluaran tercatat"}
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
