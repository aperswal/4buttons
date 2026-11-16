import { cacheLife } from "next/cache";
import { compute, type Financials } from "./compute";
import { getPrices } from "./prices";
import { getCompanies, getCompanyFacts } from "./sec";

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

  const [facts, prices] = await Promise.all([
    getCompanyFacts(company.cik),
    getPrices(company.ticker, Date.now() - PRICE_HISTORY_MS),
  ]);
  // Annual figures change once a year. Missing prices are worth retrying soon.
  if (prices) cacheLife("days");
  else cacheLife("minutes");

  return { ticker: company.ticker, name: company.name, ...compute(facts ?? { facts: {} }, prices) };
}
