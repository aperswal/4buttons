import { cacheLife } from "next/cache";
import type { CompanyFacts } from "./compute";
import { tidyName } from "./tidy-name";

// SEC EDGAR asks every client to identify itself: https://www.sec.gov/os/accessing-edgar-data
const headers = { "User-Agent": process.env.SEC_USER_AGENT ?? "fundamentals admin@example.com" };

export type Company = { ticker: string; name: string; cik: number };

/** Every SEC-registered ticker, largest companies first. */
export async function getCompanies(): Promise<Company[]> {
  "use cache";
  cacheLife("days");

  const res = await fetch("https://www.sec.gov/files/company_tickers.json", { headers });
  if (!res.ok) throw new Error(`SEC company list responded ${res.status}`);
  const rows: { cik_str: number; ticker: string; title: string }[] = Object.values(await res.json());
  return rows.map((row) => ({ ticker: row.ticker.toUpperCase(), name: tidyName(row.title), cik: row.cik_str }));
}

/** Everything a company has reported in XBRL, or null if it has never filed any. */
export async function getCompanyFacts(cik: number): Promise<CompanyFacts | null> {
  const id = String(cik).padStart(10, "0");
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${id}.json`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`SEC company facts responded ${res.status}`);
  return res.json();
}
