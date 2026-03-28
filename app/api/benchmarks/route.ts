import { NextResponse } from "next/server";

type PricePoint = {
  date: string;
  close: number;
};

async function fetchStooqSeries(symbol: "spy" | "qqq"): Promise<PricePoint[]> {
  const url = `https://stooq.com/q/d/l/?s=${symbol}.us&i=d`;

  const res = await fetch(url, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${symbol}`);
  }

  const csv = await res.text();
  const lines = csv.trim().split("\n");

  const rows = lines.slice(1);

  return rows
    .map((line) => {
      const [date, , , , close] = line.split(",");
      return {
        date,
        close: Number(close),
      };
    })
    .filter((r) => r.date && Number.isFinite(r.close));
}

export async function GET() {
  try {
    const [spy, qqq] = await Promise.all([
      fetchStooqSeries("spy"),
      fetchStooqSeries("qqq"),
    ]);

    return NextResponse.json({ spy, qqq });
  } catch {
    return NextResponse.json(
      { error: "Failed to load benchmarks" },
      { status: 500 }
    );
  }
}
