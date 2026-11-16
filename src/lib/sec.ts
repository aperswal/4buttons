import { cacheLife } from "next/cache";
import type { CompanyFacts } from "./compute";

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

const KEEP_UPPERCASE = new Set(["PLC", "LLC", "LP", "NV", "SA", "AG", "SE", "ADR", "ETF", "USA", "US", "II", "III", "IV"]);

// The SEC lists many names in capitals, some with a registration suffix ("COSTCO WHOLESALE CORP /NEW").
function tidyName(raw: string): string {
  const name = raw.replace(/\s*[/\\]\s*[A-Za-z]{2,3}\s*[/\\]?\s*$/, "");
  if (/[a-z]/.test(name)) return name;
  return name.replace(/[A-Z][A-Z']*/g, (word, offset: number) => {
    const partOfAbbreviation = name[offset - 1] === "&" || name[offset + word.length] === "&";
    return KEEP_UPPERCASE.has(word) || partOfAbbreviation ? word : word[0] + word.slice(1).toLowerCase();
  });
}
