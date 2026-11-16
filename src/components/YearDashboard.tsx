import { useEffect, useState, useRef } from "react";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { ChartInfo, ChartNumbers, compactMoney } from "./FinanceCharts";
import {
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
        ? m.missingAmounts + " nominal belum diisi"
        : m.income === 0
          ? "Pemasukan anggaran nol"
          : "Masuk ringkasan";
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

  const graph = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = graph.current,
      button = el?.querySelector("[aria-pressed=true]");
    if (el && button) {
      const a = button.getBoundingClientRect(),
        b = el.getBoundingClientRect();
      el.scrollLeft += a.left - b.left - el.clientWidth / 2 + a.width / 2;
    }
  }, [selected, report]);
  const data = report?.year === year && !error ? report : null,
    chosen = data?.months.find((m) => m.id === selected),
    peak = Math.max(
      1,
      ...(data?.months
        .filter((m) => m.complete)
        .flatMap((m) => [m.income, m.spent]) || []),
    );
  return (
    <section
      className="finance-panel year-report"
      aria-label="Ringkasan tahunan"
    >
      <div className="finance-heading">
        <h2>Pengeluaran tahun {year}</h2>
        <div className="year-controls">
          <label className="sr-only" htmlFor="report-year">
            Tahun
          </label>
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
      {loading && <p role="status">Memuat ringkasan…</p>}
      {error && (
        <p className="error" role="alert">
          {error} Tekan Muat ulang untuk mencoba lagi.
        </p>
      )}
      {data && (
        <>
          <div className="finance-year-overview">
            <div>
              <strong
                className={
                  "year-rate " + (data.spent > data.income ? "negative" : "")
                }
              >
                {data.included ? ratio(data.spent, data.income) : "—"}
              </strong>
              <p>dari pemasukan anggaran</p>
            </div>
            <span className="finance-badge">
              {data.included} bulan terisi
              {data.excluded ? " · " + data.excluded + " belum lengkap" : ""}
            </span>
          </div>
          <ChartNumbers
            values={[
              ["Pemasukan anggaran", data.included ? data.income : null],
              ["Pengeluaran", data.included ? data.spent : null],
            ]}
          />
          {!data.included && (
            <p className="chart-status">
              Belum ada bulan dengan anggaran lengkap. Isi nominal kedua akun,
              termasuk 0 untuk pos yang tidak dipakai.
            </p>
          )}
          <div className="finance-heading">
            <h3>Perjalanan tiap bulan</h3>
            <ChartInfo title="Ringkasan tahun">
              <p>
                Persentase = total pengeluaran dibagi total pemasukan anggaran
                dari bulan yang disertakan. Bukan rata-rata persentase bulan.
              </p>
              <p>
                Bulan disertakan jika kedua akun membuat anggaran dan seluruh
                nominal pemasukan serta alokasi aktif terisi. Anggaran lengkap
                bukan berarti bulan selesai. Bulan tanpa data tidak dihitung
                sebagai nol.
              </p>
              <p>
                Pengeluaran yang belum dicatat tidak terwakili. Kiriman internal
                tidak ikut. Persentase boleh melebihi 100%; pemasukan nol
                menghasilkan —.
              </p>
              <p>
                Pembayaran:{" "}
                {data.included ? rupiah.format(data.allocation) : "—"} · sisa
                belum dibagi:{" "}
                {data.included ? rupiah.format(data.remaining) : "—"}. Sisa
                bukan saldo rekening. Disisihkan:{" "}
                {rupiah.format(data.reserved ?? 0)}.
              </p>
            </ChartInfo>
          </div>
          <div className="finance-chart-legend">
            <span>
              <i />
              Pemasukan anggaran
            </span>
            <span>
              <i className="spent" />
              Pengeluaran
            </span>
          </div>
          <div
            className="finance-year-scroll"
            tabIndex={0}
            ref={graph}
            aria-label="Grafik bulanan; geser untuk bulan lainnya"
          >
            <ol className="finance-year-chart">
              {data.months.map((m, i) => (
                <li key={m.id}>
                  <button
                    aria-pressed={selected === m.id}
                    aria-label={
                      monthName(m.id) +
                      ": " +
                      (m.complete && m.income > 0
                        ? ratio(m.spent, m.income)
                        : status(m))
                    }
                    onClick={() => setSelected(m.id)}
                  >
                    <span className="finance-pair" aria-hidden="true">
                      {m.complete ? (
                        <>
                          <i
                            style={{ height: (m.income / peak) * 100 + "%" }}
                          />
                          <i
                            className="spent"
                            style={{ height: (m.spent / peak) * 100 + "%" }}
                          />
                        </>
                      ) : (
                        <span>—</span>
                      )}
                    </span>
                    <span>{names[i]}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          {chosen && (
            <div className="finance-month-detail" aria-live="polite">
              <div>
                <strong>{monthName(chosen.id)}</strong>
                <p>
                  {chosen.complete
                    ? compactMoney(chosen.income) +
                      " masuk · " +
                      compactMoney(chosen.spent) +
                      " pengeluaran"
                    : status(chosen)}
                </p>
              </div>
              <strong>
                {chosen.complete ? ratio(chosen.spent, chosen.income) : "—"}
              </strong>
            </div>
          )}
          <p className="chart-caption">
            Geser grafik untuk melihat bulan lainnya.
          </p>
        </>
      )}
    </section>
  );
}
