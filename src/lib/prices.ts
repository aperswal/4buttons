import type { Prices } from "./compute";
import { yahooJson } from "./yahoo.ts";

type Split = { date: number; numerator: number; denominator: number };
type Chart = {
  meta?: { currency?: string; longName?: string; shortName?: string };
  timestamp?: number[];
  indicators: { quote: [{ close: (number | null)[] }] };
  events?: { splits?: Record<string, Split> };
};

const isoDate = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

// Which rescalings are splits matters for one thing only: restating EPS for a split too recent for any annual
// report to show. Yahoo records a spin-off as a "split" too: the value that left, written over 100 or 1000
// (GE Vernova is 1253:1000). Real splits are quoted in small whole numbers (4:1, 3:2, 1:8). Two other things are
// quoted the long way: a share consolidation (Unilever's 8-for-9 is 888:1000), which is below one as no spin-off
// can be, and a spin-off with a reverse split on the same day (Honeywell's 1-for-2 is 1907:2000: a 1907:1000
// spin-off and a 1000:2000 split).
function splitPart({ numerator, denominator }: Split): number {
  const base = denominator >= 1000 ? 1000 : 100;
  const isSpinOff = denominator >= 100 && numerator > base;
  return isSpinOff ? base / denominator : numerator / denominator;
}

/**
 * A Yahoo chart as the prices that traded, or null if it has no price history.
 *
 * Yahoo scales old closes down for every split, stock dividend and spin-off that followed, to make its charts
 * continuous. That is undone here, because whether EPS was restated for each of those is the company's to say,
 * not Yahoo's: compute() matches the price that traded against the EPS for a share as it then was.
 */
export function parseChart(chart: Chart | undefined): Prices | null {
  if (!chart?.timestamp) return null;

  const events = Object.values(chart.events?.splits ?? {})
    .map((s) => ({ on: isoDate(s.date), factor: s.numerator / s.denominator, split: splitPart(s) }))
    .sort((a, b) => a.on.localeCompare(b.on));
  const rescaledAfter = (date: string) => events.reduce((factor, e) => (e.on > date ? factor * e.factor : factor), 1);

  const close = chart.indicators.quote[0].close;
  const name = chart.meta?.longName ?? chart.meta?.shortName;
  return {
    currency: chart.meta?.currency ?? "USD",
    ...(name && { name }),
    closes: chart.timestamp.flatMap((t, i) => {
      const value = close[i];
      const date = isoDate(t);
      return value === null ? [] : [[date, value * rescaledAfter(date)] as [string, number]];
    }),
    rescalings: events.map((e) => [e.on, e.factor]),
    splits: events.filter((e) => e.split !== 1).map((e) => [e.on, e.split]),
  };
}

/** Daily closes and splits from Yahoo. Null when unavailable: prices are optional, financials are not. */
export async function getPrices(ticker: string, since: number): Promise<Prices | null> {
  const json = (await yahooJson(`/v8/finance/chart/${encodeURIComponent(ticker)}`, {
    period1: String(Math.floor(since / 1000)),
    period2: String(Math.floor(Date.now() / 1000)),
    interval: "1d",
    events: "split",
  })) as { chart?: { result?: Chart[] } } | null;
  return parseChart(json?.chart?.result?.[0]);
}
