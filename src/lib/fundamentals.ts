import { cacheLife } from "next/cache";
import { compute, type Financials } from "./compute";
import { getPrices } from "./prices";
import { getCompanies, getCompanyFacts } from "./sec";
import { getYahooYears } from "./yahoo-years";

export type Fundamentals = Financials & { ticker: string; name: string };

const PRICE_HISTORY_MS = 6.5 * 365 * 86_400_000; // reaches the oldest fiscal year shown

/** Five fiscal years of metrics for a ticker, or null if neither the SEC nor Yahoo knows it. */
export async function getFundamentals(ticker: string): Promise<Fundamentals | null> {
  "use cache";

  const company = (await getCompanies()).find((c) => c.ticker === ticker);
  const since = Date.now() - PRICE_HISTORY_MS;
  const [facts, prices, yahooYears] = await Promise.all([
    company ? getCompanyFacts(company.cik) : null,
    getPrices(ticker, since),
    getYahooYears(ticker, since),
  ]);
  // Annual figures change once a year. Anything missing from Yahoo is worth retrying soon.
  if (prices && yahooYears) cacheLife("days");
  else cacheLife("minutes");

  // The SEC lists only companies registered with it. Most foreign companies traded over the counter in the US
  // (Nestlé's NSRGY) are not, and are shown from Yahoo's figures alone.
  if (!company && !yahooYears?.length) return null;

  const financials = compute(facts ?? { facts: {} }, prices, yahooYears ?? []);
  // A company that reports in another currency than its shares trade in needs that currency's exchange rate
  // for its P/E. Only then is it known which one, so only those companies wait for this second request.
  const fx =
    prices && financials.currency !== prices.currency ? await getPrices(`${financials.currency}=X`, since) : null;

  return {
    ticker,
    name: company?.name ?? prices?.name ?? ticker,
    ...(fx ? compute(facts ?? { facts: {} }, prices, yahooYears ?? [], fx) : financials),
  };
}
