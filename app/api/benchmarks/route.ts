import { NextResponse } from "next/server";

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
};

async function fetchYahooHistory(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${symbol}: ${res.status}`);
  }

  const data = (await res.json()) as YahooChartResponse;
  const result = data.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];

  if (!timestamps.length || !closes.length) {
    throw new Error(`Invalid ${symbol} response`);
  }

  return timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      close: closes[i],
    }))
    .filter((row): row is { date: string; close: number } => row.close != null);
}

export async function GET() {
  try {
    const [spy, qqq] = await Promise.all([
      fetchYahooHistory("SPY"),
      fetchYahooHistory("QQQ"),
    ]);

    return NextResponse.json({ spy, qqq });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load benchmark data",
        spy: [],
        qqq: [],
      },
      { status: 500 }
    );
  }
}
