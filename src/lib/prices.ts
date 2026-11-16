import type { Prices } from "./compute";

type Split = { date: number; numerator: number; denominator: number };
type Chart = {
  timestamp?: number[];
  indicators: { quote: [{ close: (number | null)[] }] };
  events?: { splits?: Record<string, Split> };
};

const isoDate = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

// Yahoo also records a spin-off as a "split": the value that left, written over 100 or 1000 (GE Vernova is
// 1253:1000). Real splits are quoted in small whole numbers (4:1, 3:2, 1:8). Two other things are quoted the
// long way: a share consolidation (Unilever's 8-for-9 is 888:1000), which is below one as no spin-off can be,
// and a spin-off with a reverse split on the same day (Honeywell's 1-for-2 is 1907:2000, a 1907:1000 spin-off).
function splitAndSpinOff({ numerator, denominator }: Split): { split: number; spinOff: number } {
  const base = denominator >= 1000 ? 1000 : 100;
  const spinOff = numerator / base;
  if (denominator < 100 || spinOff <= 1) return { split: numerator / denominator, spinOff: 1 };
  return { split: base / denominator, spinOff };
}

/**
 * Closes and splits from a Yahoo chart, or null if it has no price history.
 *
 * Yahoo scales old closes down for spin-offs as well as for splits. Companies restate EPS for a split but not
 * for a spin-off, so spin-offs are left out of `splits` and their scaling is undone: each close is the price
 * that traded, on today's share count.
 */
export function parseChart(chart: Chart | undefined): Prices | null {
  if (!chart?.timestamp) return null;

  const events = Object.values(chart.events?.splits ?? {}).map((s) => ({ on: isoDate(s.date), ...splitAndSpinOff(s) }));
  const spinOffFactorAfter = (date: string) => events.reduce((factor, e) => (e.on > date ? factor * e.spinOff : factor), 1);

  const close = chart.indicators.quote[0].close;
  return {
    closes: chart.timestamp.flatMap((t, i) => {
      const value = close[i];
      const date = isoDate(t);
      return value === null ? [] : [[date, value * spinOffFactorAfter(date)] as [string, number]];
    }),
    splits: events.filter((e) => e.split !== 1).map((e) => [e.on, e.split]),
  };
}

/** Daily closes and splits from Yahoo. Null when unavailable: prices are optional, financials are not. */
export async function getPrices(ticker: string, since: number): Promise<Prices | null> {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`);
  url.search = new URLSearchParams({
    period1: String(Math.floor(since / 1000)),
    period2: String(Math.floor(Date.now() / 1000)),
    interval: "1d",
    events: "split",
  }).toString();

  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    return parseChart((await res.json()).chart?.result?.[0]);
  } catch {
    return null;
  }
}
