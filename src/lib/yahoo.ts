// Yahoo serves the same data from two hosts. One is sometimes rate-limited while the other answers.
const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

/** JSON from a Yahoo Finance path, or null if neither host gives any. Yahoo data is optional everywhere. */
export async function yahooJson(path: string, search: Record<string, string>): Promise<unknown> {
  for (const host of HOSTS) {
    try {
      const res = await fetch(`https://${host}${path}?${new URLSearchParams(search)}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (res.ok) return await res.json();
    } catch {
      // try the other host
    }
  }
  return null;
}
