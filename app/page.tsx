
"use client";

import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import html2canvas from "html2canvas";
import { Upload, Calendar as CalendarIcon, BarChart3, Download } from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"];

function parseMoney(value: unknown): number {
  if (value == null) return NaN;
  const raw = String(value).trim();
  if (raw === "" || raw === "--") return NaN;
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
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

  const firstWeekday = (first.getDay() + 6) % 7; // Monday=0
  const start = new Date(first);
  start.setDate(first.getDate() - firstWeekday);

  const lastWeekday = (last.getDay() + 6) % 7; // Monday=0
  const end = new Date(last);
  end.setDate(last.getDate() + Math.max(0, 4 - lastWeekday)); // extend to Friday

  const weeks: Date[][] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const week: Date[] = [];
    for (let i = 0; i < 5; i += 1) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    cursor.setDate(cursor.getDate() + 2); // skip weekend
    weeks.push(week);
  }

  return weeks;
}

type DailyEntry = { date: Date; pl: number; trades: number };

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
  const costHeader = lowerMap.get("cost") || lowerMap.get("basis");

  return { dateHeader, gainHeader, proceedsHeader, costHeader };
}

function buildDailyData(rows: Record<string, unknown>[]) {
  if (!rows.length) return { dailyMap: new Map<string, DailyEntry>(), months: [] as string[] };

  const { dateHeader, gainHeader, proceedsHeader, costHeader } = inferHeaders(rows);
  const dailyMap = new Map<string, DailyEntry>();

  rows.forEach((row) => {
    const date = parseDate(dateHeader ? row[dateHeader] : null);
    if (!date) return;
    const day = date.getDay();
    if (day === 0 || day === 6) return;

    let pl = NaN;

    if (gainHeader) {
      pl = parseMoney(row[gainHeader]);
    }

    if (Number.isNaN(pl) && proceedsHeader && costHeader) {
      const proceeds = parseMoney(row[proceedsHeader]);
      const cost = parseMoney(row[costHeader]);
      if (!Number.isNaN(proceeds) && !Number.isNaN(cost)) pl = proceeds - cost;
    }

    if (Number.isNaN(pl)) return;

    const key = date.toISOString().slice(0, 10);
    const current = dailyMap.get(key) || { date, pl: 0, trades: 0 };
    current.pl += pl;
    current.trades += 1;
    dailyMap.set(key, current);
  });

  const months = [...new Set([...dailyMap.values()].map((d) => monthKey(d.date)))].sort();
  return { dailyMap, months };
}

function tileClasses(value: number, muted: boolean) {
  if (muted) return "bg-slate-900/40 border-slate-800 text-slate-500";
  if (value > 10000) return "bg-emerald-900 border-emerald-700";
  if (value > 0) return "bg-teal-800 border-teal-700";
  if (value < -10000) return "bg-red-950 border-red-800";
  if (value < 0) return "bg-red-900 border-red-700";
  return "bg-slate-800 border-slate-700";
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
      <div className="flex items-center gap-2 text-sm text-slate-400">{icon}{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function MonthCalendar({ month, dailyMap }: { month: string; dailyMap: Map<string, DailyEntry> }) {
  const [year, monthNum] = month.split("-").map(Number);
  const label = `${MONTH_NAMES[monthNum - 1]} ${year}`;
  const weeks = getBusinessCalendarWeeks(year, monthNum - 1);

  const monthEntries = [...dailyMap.values()].filter((d) => monthKey(d.date) === month);
  const total = monthEntries.reduce((sum, d) => sum + d.pl, 0);
  const wins = monthEntries.filter((d) => d.pl > 0).length;
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
    <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{label}</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-100">Total {formatCurrency(total)}</span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-100">Win rate {winRate.toFixed(0)}%</span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-100">Avg day {formatCurrency(avg)}</span>
          </div>
        </div>
        <button
          onClick={exportPng}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          Export PNG
        </button>
      </div>

      <div id={`calendar-${month}`} className="rounded-2xl bg-slate-900 p-4">
        <div className="mb-2 grid grid-cols-[repeat(5,minmax(0,1fr))_120px] gap-2">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-2 py-1 text-xs font-semibold tracking-[0.2em] text-slate-400">{day}</div>
          ))}
          <div className="px-2 py-1 text-right text-xs font-semibold tracking-[0.2em] text-slate-400">WEEK</div>
        </div>

        <div className="space-y-2">
          {weeks.map((week, idx) => {
            const weekTotal = week.reduce((sum, date) => {
              const key = date.toISOString().slice(0, 10);
              return sum + (dailyMap.get(key)?.pl || 0);
            }, 0);

            return (
              <div key={idx} className="grid grid-cols-[repeat(5,minmax(0,1fr))_120px] gap-2">
                {week.map((date) => {
                  const inMonth = date.getMonth() === monthNum - 1;
                  const key = date.toISOString().slice(0, 10);
                  const entry = dailyMap.get(key);
                  const pl = entry?.pl ?? 0;
                  const trades = entry?.trades ?? 0;

                  return (
                    <div
                      key={key}
                      title={`${date.toDateString()} | ${formatCurrency(pl)} | ${trades} trades`}
                      className={`min-h-[106px] rounded-xl border p-3 ${tileClasses(pl, !inMonth)}`}
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
    </div>
  );
}

export default function Page() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  const { dailyMap, months } = useMemo(() => buildDailyData(rows), [rows]);
  const totalYtd = useMemo(() => [...dailyMap.values()].reduce((sum, d) => sum + d.pl, 0), [dailyMap]);

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
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white md:px-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Trading Calendar Dashboard</h1>
            <p className="mt-2 max-w-2xl text-slate-400">
              Upload a CSV and generate monthly trading calendar charts automatically.
            </p>
          </div>

          <div className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-4 md:w-[380px]">
            <label className="mb-2 block text-sm font-medium text-slate-300">Upload CSV</label>
            <input
              type="file"
              accept=".csv"
              onChange={onFileChange}
              className="block w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-sm text-white"
            />
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              <Upload className="h-3.5 w-3.5" />
              {fileName || "No file selected"}
            </div>
            {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard icon={<BarChart3 className="h-4 w-4" />} label="YTD P/L" value={formatCurrency(totalYtd)} />
          <StatCard icon={<CalendarIcon className="h-4 w-4" />} label="Months" value={months.length} />
          <StatCard icon={<Upload className="h-4 w-4" />} label="Parsed Days" value={dailyMap.size} />
        </div>

        {months.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">
            Upload your CSV to generate the monthly calendar charts.
          </div>
        ) : (
          <div className="space-y-6">
            {months.map((month) => (
              <MonthCalendar key={month} month={month} dailyMap={dailyMap} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
