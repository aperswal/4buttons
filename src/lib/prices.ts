import type { Prices } from "./compute";

type Chart = {
  timestamp?: number[];
  indicators: { quote: [{ close: (number | null)[] }] };
  events?: { splits?: Record<string, { date: number; numerator: number; denominator: number }> };
};

const isoDate = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

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
    const chart: Chart | undefined = (await res.json()).chart?.result?.[0];
    if (!chart?.timestamp) return null;

    const close = chart.indicators.quote[0].close;
    return {
      closes: chart.timestamp.flatMap((t, i) => {
        const value = close[i];
        return value === null ? [] : [[isoDate(t), value] as [string, number]];
      }),
      splits: Object.values(chart.events?.splits ?? {}).map((s) => [isoDate(s.date), s.numerator / s.denominator]),
    };
  } catch {
    return null;
  }
}
