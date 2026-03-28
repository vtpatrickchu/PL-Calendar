"use client";

import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import html2canvas from "html2canvas";
import {
  Upload,
  BarChart3,
  Download,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Sparkles,
  FileUp,
} from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"];

type PLMode = "tax" | "true";

type DailyEntry = {
  date: Date;
  taxPl: number;
  truePl: number;
  trades: number;
};

function parseMoney(value: unknown): number {
  if (value == null) return NaN;
  const raw = String(value).trim();
  if (raw === "" || raw === "--") return NaN;

  const cleaned = raw
    .replace(/[$,\s]/g, "")
    .replace(/^\((.*)\)$/, "-$1");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const str = String(value).trim();

  const mmddyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const [, mm, dd, yyyy] = mmddyyyy;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getBusinessCalendarWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const firstWeekday = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - firstWeekday);

  const lastWeekday = (last.getDay() + 6) % 7;
  const end = new Date(last);
  end.setDate(last.getDate() + Math.max(0, 4 - lastWeekday));

  const weeks: Date[][] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const week: Date[] = [];
    for (let i = 0; i < 5; i += 1) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    cursor.setDate(cursor.getDate() + 2);
    weeks.push(week);
  }

  return weeks;
}

function inferHeaders(rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] || {});
  const lowerMap = new Map(headers.map((h) => [h.toLowerCase().trim(), h]));

  const dateHeader =
    lowerMap.get("date sold") ||
    lowerMap.get("run date") ||
    lowerMap.get("date");

  const gainHeader =
    lowerMap.get("gain") ||
    lowerMap.get("short term gain/loss") ||
    lowerMap.get("st") ||
    lowerMap.get("realized") ||
    lowerMap.get("amount");

  const proceedsHeader = lowerMap.get("proceeds");
  const costHeader =
    lowerMap.get("cost") ||
    lowerMap.get("cost basis") ||
    lowerMap.get("basis");

  const disallowedHeader =
    lowerMap.get("disallowed loss") ||
    lowerMap.get("wash sale adjustment");

  return {
    dateHeader,
    gainHeader,
    proceedsHeader,
    costHeader,
    disallowedHeader,
  };
}

function buildDailyData(rows: Record<string, unknown>[]) {
  if (!rows.length) {
    return {
      dailyMap: new Map<string, DailyEntry>(),
      months: [] as string[],
      hasDisallowedLossColumn: false,
    };
  }

  const {
    dateHeader,
    gainHeader,
    proceedsHeader,
    costHeader,
    disallowedHeader,
  } = inferHeaders(rows);

  const dailyMap = new Map<string, DailyEntry>();
  let hasDisallowedLossColumn = false;

  rows.forEach((row) => {
    const date = parseDate(dateHeader ? row[dateHeader] : null);
    if (!date) return;

    const day = date.getDay();
    if (day === 0 || day === 6) return;

    let taxPl = NaN;

    if (gainHeader) {
      taxPl = parseMoney(row[gainHeader]);
    }

    if (Number.isNaN(taxPl) && proceedsHeader && costHeader) {
      const proceeds = parseMoney(row[proceedsHeader]);
      const cost = parseMoney(row[costHeader]);
      if (!Number.isNaN(proceeds) && !Number.isNaN(cost)) {
        taxPl = proceeds - cost;
      }
    }

    if (Number.isNaN(taxPl)) return;

    const rawDisallowed = disallowedHeader ? parseMoney(row[disallowedHeader]) : 0;
    const disallowed = Number.isNaN(rawDisallowed) ? 0 : rawDisallowed;

    if (disallowedHeader) {
      hasDisallowedLossColumn = true;
    }

    const truePl = taxPl - disallowed;

    const key = date.toISOString().slice(0, 10);
    const current = dailyMap.get(key) || {
      date,
      taxPl: 0,
      truePl: 0,
      trades: 0,
    };

    current.taxPl += taxPl;
    current.truePl += truePl;
    current.trades += 1;
    dailyMap.set(key, current);
  });

  const months = [...new Set([...dailyMap.values()].map((d) => monthKey(d.date)))].sort();

  return { dailyMap, months, hasDisallowedLossColumn };
}

function getActivePl(entry: DailyEntry, mode: PLMode): number {
  return mode === "tax" ? entry.taxPl : entry.truePl;
}

function tileClasses(value: number, muted: boolean) {
  if (muted) return "bg-slate-900/30 border-slate-800 text-slate-600";
  if (value > 10000) return "bg-emerald-900/90 border-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
  if (value > 0) return "bg-teal-800/90 border-teal-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
  if (value < -10000) return "bg-red-950 border-red-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
  if (value < 0) return "bg-red-900/90 border-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
  return "bg-slate-800 border-slate-700";
}

function StatCard({
  icon,
  label,
  value,
  subtext,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl backdrop-blur">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      {subtext ? <div className="mt-1 text-xs text-slate-500">{subtext}</div> : null}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/60 p-10 text-center shadow-xl">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-slate-200">
        <FileUp className="h-7 w-7" />
      </div>
      <h3 className="text-xl font-semibold">Upload a trading CSV</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400">
        Supports realized gain/loss and account-history style exports. Your file stays in your browser in this version.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
        <span className="rounded-full bg-slate-800 px-3 py-1">Monthly calendar view</span>
        <span className="rounded-full bg-slate-800 px-3 py-1">PNG export</span>
        <span className="rounded-full bg-slate-800 px-3 py-1">Tax vs true P/L</span>
      </div>
    </div>
  );
}

function MonthCalendar({
  month,
  dailyMap,
  plMode,
}: {
  month: string;
  dailyMap: Map<string, DailyEntry>;
  plMode: PLMode;
}) {
  const [year, monthNum] = month.split("-").map(Number);
  const label = `${MONTH_NAMES[monthNum - 1]} ${year}`;
  const weeks = getBusinessCalendarWeeks(year, monthNum - 1);

  const monthEntries = [...dailyMap.values()].filter((d) => monthKey(d.date) === month);
  const total = monthEntries.reduce((sum, d) => sum + getActivePl(d, plMode), 0);
  const wins = monthEntries.filter((d) => getActivePl(d, plMode) > 0).length;
  const winRate = monthEntries.length ? (wins / monthEntries.length) * 100 : 0;
  const avg = monthEntries.length ? total / monthEntries.length : 0;

  const exportPng = async () => {
    const node = document.getElementById(`calendar-${month}`);
    if (!node) return;
    const canvas = await html2canvas(node, { backgroundColor: "#0f172a", scale: 2 });
    const link = document.createElement("a");
    link.download = `${month}-trading-calendar.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/90 p-5 shadow-2xl">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{label}</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-100">
              Total {formatCurrency(total)}
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-100">
              Win rate {winRate.toFixed(0)}%
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-100">
              Avg day {formatCurrency(avg)}
            </span>
          </div>
        </div>
        <button
          onClick={exportPng}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          Export PNG
        </button>
      </div>

      <div id={`calendar-${month}`} className="rounded-3xl bg-slate-900 p-4">
        <div className="mb-2 grid grid-cols-[repeat(5,minmax(0,1fr))_120px] gap-2">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-2 py-1 text-xs font-semibold tracking-[0.22em] text-slate-400">
              {day}
            </div>
          ))}
          <div className="px-2 py-1 text-right text-xs font-semibold tracking-[0.22em] text-slate-400">
            WEEK
          </div>
        </div>

        <div className="space-y-2">
          {weeks.map((week, idx) => {
            const weekTotal = week.reduce((sum, date) => {
              const key = date.toISOString().slice(0, 10);
              const entry = dailyMap.get(key);
              return sum + (entry ? getActivePl(entry, plMode) : 0);
            }, 0);

            return (
              <div key={idx} className="grid grid-cols-[repeat(5,minmax(0,1fr))_120px] gap-2">
                {week.map((date) => {
                  const inMonth = date.getMonth() === monthNum - 1;
                  const key = date.toISOString().slice(0, 10);
                  const entry = dailyMap.get(key);
                  const pl = entry ? getActivePl(entry, plMode) : 0;
                  const trades = entry?.trades ?? 0;

                  return (
                    <div
                      key={key}
                      title={`${date.toDateString()} | ${formatCurrency(pl)} | ${trades} trades`}
                      className={`min-h-[108px] rounded-2xl border p-3 transition-all hover:scale-[1.01] ${tileClasses(pl, !inMonth)}`}
                    >
                      <div className="text-xs font-medium text-slate-200">{date.getDate()}</div>
                      {inMonth && (
                        <div className="mt-3 space-y-1">
                          <div className="text-sm font-semibold leading-tight">{formatCurrency(pl)}</div>
                          <div className="text-xs text-slate-200/85">{trades} trades</div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center justify-end pr-2 text-sm font-semibold text-slate-300">
                  {formatCurrency(weekTotal)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function Page() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [plMode, setPlMode] = useState<PLMode>("tax");

  const { dailyMap, months, hasDisallowedLossColumn } = useMemo(() => buildDailyData(rows), [rows]);
  const entries = useMemo(() => [...dailyMap.values()], [dailyMap]);

  const totalYtd = useMemo(
    () => entries.reduce((sum, d) => sum + getActivePl(d, plMode), 0),
    [entries, plMode]
  );

  const bestDay = useMemo(
    () =>
      entries.reduce(
        (best, d) => (best == null || getActivePl(d, plMode) > getActivePl(best, plMode) ? d : best),
        null as DailyEntry | null
      ),
    [entries, plMode]
  );

  const worstDay = useMemo(
    () =>
      entries.reduce(
        (worst, d) => (worst == null || getActivePl(d, plMode) < getActivePl(worst, plMode) ? d : worst),
        null as DailyEntry | null
      ),
    [entries, plMode]
  );

  const overallWinRate = useMemo(
    () =>
      entries.length
        ? (entries.filter((d) => getActivePl(d, plMode) > 0).length / entries.length) * 100
        : 0,
    [entries, plMode]
  );

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError("");

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedRows = results.data || [];
        if (!parsedRows.length) {
          setRows([]);
          setError("Could not read any rows from that CSV.");
          return;
        }
        setRows(parsedRows);
      },
      error: () => {
        setRows([]);
        setError("There was a problem reading that CSV.");
      },
    });
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.10),transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] px-6 py-8 text-white md:px-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[32px] border border-slate-800 bg-slate-950/80 p-6 shadow-2xl backdrop-blur md:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-800/70 bg-teal-900/30 px-3 py-1 text-xs font-medium text-teal-200">
                <Sparkles className="h-3.5 w-3.5" />
                TradeCalendar
              </div>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
                Turn your trading CSV into a clean monthly P/L calendar.
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
                Upload a realized gain/loss or account-history CSV and instantly generate polished trading calendar views, weekly totals, and high-level performance stats.
              </p>

              <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-300">
                <div className="rounded-full bg-slate-800 px-3 py-1">Client-side CSV parsing</div>
                <div className="rounded-full bg-slate-800 px-3 py-1">Monthly calendar exports</div>
                <div className="rounded-full bg-slate-800 px-3 py-1">Tax + true P/L modes</div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl">
              <label className="mb-2 block text-sm font-medium text-slate-300">Upload trading CSV</label>
              <input
                type="file"
                accept=".csv"
                onChange={onFileChange}
                className="block w-full rounded-2xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
              />

              <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
                <Upload className="h-4 w-4" />
                <span>{fileName || "No file selected"}</span>
              </div>

              <div className="mt-4 inline-flex rounded-2xl border border-slate-700 bg-slate-950 p-1">
                <button
                  onClick={() => setPlMode("tax")}
                  className={`rounded-xl px-4 py-2 text-sm ${
                    plMode === "tax"
                      ? "bg-teal-700 text-white"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  Tax P/L
                </button>
                <button
                  onClick={() => setPlMode("true")}
                  className={`rounded-xl px-4 py-2 text-sm ${
                    plMode === "true"
                      ? "bg-teal-700 text-white"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  True P/L
                </button>
              </div>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                Tax P/L matches broker/1099 reporting. True P/L backs out disallowed losses when present.
              </p>

              {!hasDisallowedLossColumn && rows.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                  This CSV does not appear to include a disallowed-loss or wash-sale column, so both modes may show the same values.
                </div>
              )}

              {error && (
                <div className="mt-3 rounded-xl border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<BarChart3 className="h-4 w-4" />}
            label={plMode === "tax" ? "YTD Tax P/L" : "YTD True P/L"}
            value={formatCurrency(totalYtd)}
            subtext="Across all parsed trading days"
          />
          <StatCard
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Overall Win Rate"
            value={`${overallWinRate.toFixed(0)}%`}
            subtext="Winning trading days"
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Best Day"
            value={bestDay ? formatCurrency(getActivePl(bestDay, plMode)) : "$0"}
            subtext={bestDay ? bestDay.date.toLocaleDateString() : "—"}
          />
          <StatCard
            icon={<TrendingDown className="h-4 w-4" />}
            label="Worst Day"
            value={worstDay ? formatCurrency(getActivePl(worstDay, plMode)) : "$0"}
            subtext={worstDay ? worstDay.date.toLocaleDateString() : "—"}
          />
        </section>

        {months.length === 0 ? (
          <EmptyState />
        ) : (
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Monthly Performance</h2>
              <p className="mt-1 text-sm text-slate-400">
                Review daily gains, losses, trade counts, and weekly totals by month.
              </p>
            </div>

            {months.map((month) => (
              <MonthCalendar
                key={month}
                month={month}
                dailyMap={dailyMap}
                plMode={plMode}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
