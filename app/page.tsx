"use client";

import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import html2canvas from "html2canvas";

// --- TYPES ---
type PLMode = "tax" | "true";

// --- HELPERS ---
function parseMoney(v: any) {
  if (!v) return NaN;
  return Number(String(v).replace(/[$,]/g, "").replace("(", "-").replace(")", ""));
}

// --- MAIN ---
export default function Page() {
  const [rows, setRows] = useState<any[]>([]);
  const [plMode, setPlMode] = useState<PLMode>("tax");
  const [showTickerBreakdown, setShowTickerBreakdown] = useState(true);

  // --- FILE UPLOAD ---
  const onFileChange = (e: any) => {
    const file = e.target.files[0];
    Papa.parse(file, {
      header: true,
      complete: (res) => setRows(res.data),
    });
  };

  // --- PARSING LOGIC ---
  const parsed = useMemo(() => {
    let total = 0;
    const tickerMap: any = {};

    rows.forEach((r) => {
      const gain = parseMoney(r["Short Term Gain/Loss"]);
      const proceeds = parseMoney(r["Proceeds"]);
      const cost = parseMoney(r["Cost Basis"]);

      let taxPl = gain;
      let truePl = proceeds - cost;

      const active = plMode === "tax" ? taxPl : truePl;

      if (!isNaN(active)) {
        total += active;

        const sym = (r["Symbol"] || "UNK").split(" ")[0];

        if (!tickerMap[sym]) {
          tickerMap[sym] = { pl: 0, trades: 0 };
        }

        tickerMap[sym].pl += active;
        tickerMap[sym].trades += 1;
      }
    });

    const tickerRows = Object.entries(tickerMap)
      .map(([symbol, data]: any) => ({
        symbol,
        ...data,
      }))
      .sort((a: any, b: any) => b.pl - a.pl);

    return { total, tickerRows };
  }, [rows, plMode]);

  return (
    <div className="p-8 text-white bg-black min-h-screen space-y-6">
      <h1 className="text-3xl font-bold">Trading Dashboard</h1>

      {/* Upload */}
      <input type="file" onChange={onFileChange} />

      {/* Toggle */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setPlMode("tax")}
          className={`px-4 py-2 rounded ${
            plMode === "tax" ? "bg-green-600" : "bg-gray-700"
          }`}
        >
          Tax P/L
        </button>
        <button
          onClick={() => setPlMode("true")}
          className={`px-4 py-2 rounded ${
            plMode === "true" ? "bg-green-600" : "bg-gray-700"
          }`}
        >
          True P/L
        </button>
      </div>

      {/* Explanation */}
      <div className="text-sm text-gray-400 border p-3 rounded">
        <b>Tax P/L</b> uses broker-reported gain/loss.{" "}
        <b>True P/L</b> = proceeds - cost basis (before wash sales).
      </div>

      {/* Total */}
      <div className="text-2xl font-bold">
        Total: ${parsed.total.toLocaleString()}
      </div>

      {/* Ticker Toggle */}
      {parsed.tickerRows.length > 0 && (
        <div className="space-y-3">
          <div className="flex justify-between items-center border p-3 rounded">
            <span>Per-Ticker Breakdown</span>
            <button
              onClick={() => setShowTickerBreakdown(!showTickerBreakdown)}
              className="px-3 py-1 bg-gray-700 rounded"
            >
              {showTickerBreakdown ? "Hide" : "Show"}
            </button>
          </div>

          {showTickerBreakdown && (
            <table className="w-full border">
              <thead>
                <tr className="bg-gray-800">
                  <th className="p-2 text-left">Symbol</th>
                  <th className="p-2 text-right">P/L</th>
                  <th className="p-2 text-right">Trades</th>
                </tr>
              </thead>
              <tbody>
                {parsed.tickerRows.map((t: any) => (
                  <tr key={t.symbol}>
                    <td className="p-2">{t.symbol}</td>
                    <td className="p-2 text-right">${t.pl.toFixed(0)}</td>
                    <td className="p-2 text-right">{t.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
