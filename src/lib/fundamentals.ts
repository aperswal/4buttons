import { cacheLife } from "next/cache";
import { compute, type Financials } from "./compute";
import { getPrices } from "./prices";
import { getCompanies, getCompanyFacts } from "./sec";
import { getYahooYears } from "./yahoo-years";

export type Fundamentals = Financials & { ticker: string; name: string };

const PRICE_HISTORY_MS = 6.5 * 365 * 86_400_000; // reaches the oldest fiscal year shown

/** Five fiscal years of metrics for a ticker, or null if the SEC lists no such ticker. */
export async function getFundamentals(ticker: string): Promise<Fundamentals | null> {
  "use cache";

  const company = (await getCompanies()).find((c) => c.ticker === ticker);
  if (!company) {
    cacheLife("days");
    return null;
  }

  const since = Date.now() - PRICE_HISTORY_MS;
  const [facts, prices, yahooYears] = await Promise.all([
    getCompanyFacts(company.cik),
    getPrices(company.ticker, since),
    getYahooYears(company.ticker, since),
  ]);
  // Annual figures change once a year. Anything missing from Yahoo is worth retrying soon.
  if (prices && yahooYears) cacheLife("days");
  else cacheLife("minutes");

  const financials = compute(facts ?? { facts: {} }, prices, yahooYears ?? []);
  // A company that reports in another currency than its shares trade in needs that currency's exchange rate
  // for its P/E. Only then is it known which one, so only those companies wait for this second request.
  const fx =
    prices && financials.currency !== prices.currency ? await getPrices(`${financials.currency}=X`, since) : null;

  return {
    ticker: company.ticker,
    name: company.name,
    ...(fx ? compute(facts ?? { facts: {} }, prices, yahooYears ?? [], fx) : financials),
  };
}
