import { connection } from "next/server";
import { getCompanies } from "@/lib/sec";

/** [ticker, name] pairs for the search box, largest companies first. */
export async function GET() {
  await connection(); // Fetch on request rather than at build, so a deploy never depends on the SEC being up.
  const companies = await getCompanies();
  return Response.json(
    companies.map((c) => [c.ticker, c.name]),
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
