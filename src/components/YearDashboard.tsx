import { useEffect, useState } from "react";
import "./year-dashboard.css";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import {
  familyTotals,
  monthName,
  ratio,
  rupiah,
  type Snapshot,
  type Period,
} from "../../shared/domain";
import type { YearReport, ReportMonth } from "../../shared/year-report";
const names = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];
const status = (m: ReportMonth) =>
  !m.exists
    ? "Belum dibuat"
    : m.missingOwners
      ? "Anggaran kedua akun belum lengkap"
      : m.missingAmounts
        ? `${m.missingAmounts} nominal belum diisi`
        : m.income === 0
          ? "Pemasukan anggaran nol"
          : "Masuk ringkasan";
function Metrics({
  values,
  money = false,
}: {
  values: [string, number | null][];
  money?: boolean;
}) {
  return (
    <dl className={money ? "year-totals" : "year-ratios"}>
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={value !== null && value < 0 ? "negative" : undefined}>
            {value === null
              ? "—"
              : money
                ? rupiah.format(value)
                : ratio(value, 1)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function YearDashboard({
  snapshot,
  periods,
  active = true,
}: {
  snapshot: Snapshot;
  periods: Period[];
  active?: boolean;
}) {
  const [year, setYear] = useState(snapshot.id.slice(0, 4)),
    [report, setReport] = useState<YearReport | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [selected, setSelected] = useState(snapshot.id);
  const signature = periods
    .filter((p) => p.id.startsWith(year + "-"))
    .map((p) => p.id + ":" + p.revision)
    .join("|");
  useEffect(() => {
    if (!active) {
      setReport(null);
      return;
    }
    const controller = new AbortController();
    let alive = true;
    setLoading(true);
    setError("");
    setReport(null);
    api<YearReport>("/reports/year/" + year, { signal: controller.signal })
      .then((data) => {
        if (
          !data ||
          data.year !== year ||
          !Array.isArray(data.months) ||
          data.months.length !== 12
        )
          throw Error("Ringkasan belum dapat dibaca. Silakan muat ulang.");
        if (alive) setReport(data);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [year, signature, snapshot.revision, retry, active]);
  const years = [
    ...new Set([
      snapshot.id.slice(0, 4),
      ...periods.map((p) => p.id.slice(0, 4)),
    ]),
  ]
    .sort()
    .reverse();
  const totals = familyTotals(snapshot),
    complete =
      new Set(snapshot.budgets.map((b) => b.owner_id)).size === 2 &&
      !snapshot.items.some(
        (i) =>
          !i.deleted_at &&
          ["income", "allocation"].includes(i.kind) &&
          i.amount === null,
      );
  const monthly = (n: number) =>
    complete && totals.income > 0 ? n / totals.income : null;
  const data = report?.year === year && !error ? report : null;
  const yearly = (n: number) =>
    data && data.included && data.income > 0 ? n / data.income : null;
  const peak = Math.max(
      100,
      ...(data?.months
        .filter((m) => m.complete && m.income > 0)
        .map((m) => (100 * m.spent) / m.income) || []),
    ),
    chosen = data?.months.find((m) => m.id === selected);
  return (
    <>
      <section
        className="month-percentages"
        aria-label="Persentase bulan aktif"
      >
        <h2>Persentase bulan ini</h2>
        <p>{monthName(snapshot.id)} · dibandingkan pemasukan anggaran</p>
        <Metrics
          values={[
            ["Alokasi", monthly(totals.allocation)],
            ["Sisa anggaran", monthly(totals.remaining)],
            ["Pengeluaran tercatat", monthly(totals.spent)],
          ]}
        />
        {!complete && (
          <p>
            Lengkapi anggaran kedua akun untuk melihat persentase. Isi 0 untuk
            pos yang tidak dipakai.
          </p>
        )}
        {complete && totals.income === 0 && (
          <p>Pemasukan anggaran nol; persentase belum dapat dihitung.</p>
        )}
      </section>
      <section className="year-report" aria-label="Ringkasan tahunan">
        <div className="section-heading">
          <div>
            <h2>Ringkasan tahun</h2>
            <p>Gabungan suami dan istri, tanpa kiriman internal.</p>
          </div>
          <div className="year-controls">
            <label htmlFor="report-year">Tahun</label>
            <select
              id="report-year"
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setSelected(e.target.value + "-01");
              }}
            >
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <Button
              variant="ghost"
              onClick={() => setRetry((n) => n + 1)}
              disabled={loading}
            >
              Muat ulang
            </Button>
          </div>
        </div>
        {loading && <p role="status">Memuat ringkasan {year}…</p>}
        {error && (
          <p role="alert" className="error">
            {error} Tekan Muat ulang untuk mencoba lagi.
          </p>
        )}
        {data && (
          <>
            <p className="year-coverage">
              <strong>{data.included} bulan terisi</strong> masuk ringkasan
              {data.excluded > 0
                ? ` · ${data.excluded} bulan belum lengkap tidak disertakan`
                : ""}
              .
            </p>
            <p className="helper-note">
              Kedua akun sudah membuat anggaran dan semua nominal pemasukan
              serta alokasi terisi. Ini bukan penanda bulan sudah selesai. Tidak
              ada catatan pengeluaran berarti belum ada pengeluaran yang
              dicatat.
            </p>
            <Metrics
              money
              values={[
                ["Pemasukan anggaran", data.included ? data.income : null],
                ["Alokasi", data.included ? data.allocation : null],
                ["Sisa anggaran", data.included ? data.remaining : null],
                ["Pengeluaran tercatat", data.included ? data.spent : null],
              ]}
            />
            <Metrics
              values={[
                ["Alokasi / pemasukan", yearly(data.allocation)],
                ["Sisa / pemasukan", yearly(data.remaining)],
                ["Pengeluaran / pemasukan", yearly(data.spent)],
              ]}
            />
            {!data.included && (
              <p className="empty-note">
                Belum ada bulan dengan anggaran lengkap pada {year}. Lengkapi
                nominal di bagian Suami dan Istri; isi 0 jika tidak dipakai.
              </p>
            )}
            <h3>Tren pengeluaran terhadap pemasukan anggaran</h3>
            <p className="helper-note">
              Ketuk bulan untuk melihat rincian. Geser ke samping untuk bulan
              lainnya. Persentase bisa melebihi 100%. Tanda — berarti belum
              dapat dihitung. Skala grafik 0–
              {ratio(peak, 100)}.
            </p>
            <div
              className="trend-scroll"
              tabIndex={0}
              aria-label="Grafik bulanan; geser ke samping untuk bulan lainnya"
            >
              <ol className="month-trend">
                {data.months.map((m, i) => {
                  const valid = m.complete && m.income > 0,
                    pct = valid ? (100 * m.spent) / m.income : 0;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        aria-pressed={m.id === selected}
                        aria-label={
                          monthName(m.id) +
                          ": " +
                          (valid ? ratio(m.spent, m.income) : status(m))
                        }
                        onClick={() => setSelected(m.id)}
                      >
                        <span className="trend-value">
                          {valid ? ratio(m.spent, m.income) : "—"}
                        </span>
                        <span className="trend-track" aria-hidden="true">
                          <span
                            className={
                              pct > 100 ? "trend-bar over-budget" : "trend-bar"
                            }
                            style={{
                              height: valid ? `${(pct / peak) * 100}%` : "0%",
                            }}
                          />
                        </span>
                        <span>{names[i]}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
            {chosen && (
              <div className="month-report-detail" aria-live="polite">
                <strong>{monthName(chosen.id)}</strong>
                <p>{status(chosen)}</p>
                {chosen.complete && (
                  <p>
                    Pemasukan {rupiah.format(chosen.income)} · pengeluaran{" "}
                    {rupiah.format(chosen.spent)} ·{" "}
                    {ratio(chosen.spent, chosen.income)}
                  </p>
                )}
              </div>
            )}
            <p className="helper-note">
              Persentase gabungan = total nominal ÷ total pemasukan anggaran
              dari bulan yang disertakan. Bukan rata-rata persentase bulanan.
              Pengeluaran yang belum dicatat tidak terwakili; sisa bukan saldo
              rekening.
            </p>
          </>
        )}
      </section>
    </>
  );
}
