import type { YahooYear } from "./compute";
import { yahooJson } from "./yahoo.ts";

// Yahoo's names for each annual figure, added together where there are two. It reports them in the company's
// reporting currency. Debt is the two borrowing lines rather than Yahoo's own total, which adds lease
// liabilities that compute() does not count for the SEC's years.
const SERIES: Record<Exclude<keyof YahooYear, "end" | "currency">, string[]> = {
  eps: ["annualDilutedEPS"],
  netIncome: ["annualNetIncome"],
  revenue: ["annualTotalRevenue"],
  grossProfit: ["annualGrossProfit"],
  operatingIncome: ["annualOperatingIncome"],
  pretaxIncome: ["annualPretaxIncome"],
  incomeTax: ["annualTaxProvision"],
  debt: ["annualCurrentDebt", "annualLongTermDebt"],
  equity: ["annualStockholdersEquity"],
};

// Yahoo does not split every company's borrowings into those two lines (Nestlé's are not). Its own total, which
// also counts lease liabilities, is then the nearest figure, and far nearer than treating the debt as nil.
const TOTAL_DEBT = "annualTotalDebt";

type Point = { asOfDate: string; currencyCode?: string; reportedValue: { raw: number } } | null;
type Timeseries = { timeseries?: { result?: ({ meta: { type: string[] } } & Record<string, unknown>)[] } };

const DAY = 86_400_000;

/** Yahoo's annual figures as fiscal years, oldest first. It keeps about four. */
export function parseYahooYears(json: Timeseries | null): YahooYear[] {
  const years = new Map<string, YahooYear>();
  for (const [field, names] of Object.entries(SERIES) as [keyof typeof SERIES, string[]][]) {
    for (const name of names) {
      const points = (json?.timeseries?.result?.find((r) => r.meta.type[0] === name)?.[name] ?? []) as Point[];
      for (const point of points) {
        if (!point) continue;
        const year = years.get(point.asOfDate) ?? { ...EMPTY, end: point.asOfDate, currency: point.currencyCode ?? "USD" };
        years.set(point.asOfDate, { ...year, [field]: (year[field] ?? 0) + point.reportedValue.raw });
      }
    }
  }
  for (const point of (json?.timeseries?.result?.find((r) => r.meta.type[0] === TOTAL_DEBT)?.[TOTAL_DEBT] ?? []) as Point[]) {
    const year = point && years.get(point.asOfDate);
    if (year && year.debt === null) years.set(point.asOfDate, { ...year, debt: point.reportedValue.raw });
  }
  // For some companies Yahoo mixes trailing twelve months to a quarter end in among the fiscal years.
  // Fiscal years are whole years apart; counting back from the newest keeps them and drops the rest.
  const sorted = [...years.values()].sort((a, b) => a.end.localeCompare(b.end));
  const newest = sorted[sorted.length - 1];
  return sorted.filter((y) => {
    const days = (Date.parse(newest.end) - Date.parse(y.end)) / DAY;
    return Math.abs(days - Math.round(days / 365.25) * 365.25) < 20;
  });
}

const EMPTY = {
  eps: null,
  netIncome: null,
  revenue: null,
  grossProfit: null,
  operatingIncome: null,
  pretaxIncome: null,
  incomeTax: null,
  debt: null,
  equity: null,
};

/** A company's recent fiscal years from Yahoo. Null when Yahoo cannot be reached, empty when it has none. */
export async function getYahooYears(ticker: string, since: number): Promise<YahooYear[] | null> {
  const json = await yahooJson(`/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(ticker)}`, {
    type: [...Object.values(SERIES).flat(), TOTAL_DEBT].join(","),
    period1: String(Math.floor(since / 1000)),
    period2: String(Math.floor(Date.now() / 1000)),
  });
  return json ? parseYahooYears(json as Timeseries) : null;
}
