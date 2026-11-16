import { Suspense } from "react";
import { MetricsSkeleton, MetricsTable } from "@/components/metrics-table";
import { Remember } from "@/components/remember";
import { getFundamentals } from "@/lib/fundamentals";

const TICKER = /^[A-Z0-9.-]{1,10}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Cache Components needs one sample param to build the route. No ticker is known
// at build time, so this one deliberately matches nothing. Real tickers render on
// their first visit and are served from cache after that.
export function generateStaticParams() {
  return [{ ticker: "__placeholder__" }];
}

export default function Page({ params }: PageProps<"/[ticker]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Company params={params} />
    </Suspense>
  );
}

async function Company({ params }: Pick<PageProps<"/[ticker]">, "params">) {
  const ticker = (await params).ticker.toUpperCase().replace(".", "-"); // BRK.B is filed as BRK-B
  const company = TICKER.test(ticker) ? await getFundamentals(ticker) : null;

  if (!company) {
    return (
      <Title ticker={ticker}>
        <Notice>No company trades under this ticker</Notice>
      </Title>
    );
  }

  const fiscalYear = company.fiscalYearEndMonth === 12 ? "" : ` · FY ends ${MONTHS[company.fiscalYearEndMonth - 1]}`;
  return (
    <Title ticker={company.ticker} subtitle={company.name + (company.years.length ? fiscalYear : "")}>
      <title>{`${company.ticker} · ${company.name}`}</title>
      <Remember ticker={company.ticker} name={company.name} />
      {company.years.length ? <MetricsTable data={company} /> : <Notice>No annual financials on file</Notice>}
    </Title>
  );
}

function Title({ ticker, subtitle, children }: { ticker: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <>
      <div className="pt-6 pb-5">
        <h1 className="text-4xl font-semibold tracking-tight break-all">{ticker}</h1>
        <p className="mt-1 min-h-6 text-ink-2">{subtitle}</p>
      </div>
      {children}
    </>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-line bg-surface px-6 py-16 text-center text-ink-2">{children}</p>
  );
}

function Loading() {
  return (
    <>
      <div className="animate-pulse pt-6 pb-5">
        <div className="h-10 w-28 rounded-lg bg-wash" />
        <div className="mt-1 flex h-6 items-center">
          <div className="h-4 w-48 rounded bg-wash" />
        </div>
      </div>
      <MetricsSkeleton />
    </>
  );
}
