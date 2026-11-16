// Turns raw SEC XBRL facts (plus price history) into five fiscal years of metrics.
// Pure: no I/O, no framework imports.

import { restatements, same, sharesSince, splitBeforeFiling, tidy } from "./share-basis.ts";

export type Fact = { start?: string; end: string; val: number; filed: string; form: string };
type Concept = { units: Record<string, Fact[]> };
export type CompanyFacts = { facts: Record<string, Record<string, Concept>> };

export type Prices = {
  currency: string;
  closes: [date: string, close: number][]; // ascending; the price that traded that day
  // Every time Yahoo rescaled its price history, and by how much. It does so for a split or a stock dividend,
  // but also for a spin-off or when a depositary share changes how many shares it stands for. It does not say which.
  rescalings: [date: string, factor: number][];
  splits: [date: string, ratio: number][]; // the rescalings written the way a split is: 4-for-1 → 4
};

/** One fiscal year as Yahoo has it. Used only for what the SEC's data lacks. */
export type YahooYear = {
  end: string; // the last day of the month the year ended in
  currency: string;
  eps: number | null; // diluted, per US-listed share, on today's share count
  netIncome: number | null;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  pretaxIncome: number | null;
  incomeTax: number | null;
  debt: number | null;
  equity: number | null;
};

export type MetricKey =
  | "roic"
  | "netIncome"
  | "eps"
  | "debtToEquity"
  | "grossMargin"
  | "netMargin"
  | "pe";

export type Financials = {
  currency: string;
  fiscalYearEndMonth: number; // 1–12
  years: number[]; // oldest first, at most 5
  metrics: Record<MetricKey, (number | null)[]>; // aligned with `years`; ratios are fractions
};

const YEARS = 5;
const DAY = 86_400_000;
const ANNUAL_REPORT = /^(10-K|20-F|40-F)/;
// A foreign company's annual report. Its US-listed share is usually a depositary share standing for several
// ordinary shares (or a fraction of one), while its EPS is per ordinary share.
const FOREIGN_REPORT = /^20-F/;
const DEFAULT_TAX_RATE = 0.21;

// Companies tag the same line item differently, so each one is a list of
// candidates in order of preference. US GAAP names first, then IFRS.
const TAGS = {
  // "Revenues" is the total when a company reports it. The contract-revenue tags can be a part of it
  // (Walmart's excludes membership fees) or a gross figure before rebates (Mastercard's).
  revenue: [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    "RevenuesNetOfInterestExpense",
    "Revenue",
  ],
  // IFRS filers that tag no total. For a bank this is only its fees, so it is not used beside net interest income.
  revenueFromCustomers: ["RevenueFromSaleOfGoods", "RevenueFromContractsWithCustomers"],
  netInterestIncome: ["InterestRevenueExpense"],
  costOfRevenue: [
    "CostOfRevenue",
    "CostOfGoodsAndServicesSold",
    "CostOfGoodsSold",
    "CostOfSales",
    "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization",
  ],
  // An insurer's main cost is claims, which it does not tag as cost of revenue, so it has no gross margin.
  insuranceClaims: ["PolicyholderBenefitsAndClaimsIncurredNet", "PolicyholderBenefitsAndClaimsIncurredHealthCare"],
  grossProfit: ["GrossProfit"],
  netIncome: [
    "NetIncomeLoss",
    "ProfitLossAttributableToOwnersOfParent",
    "ProfitLoss",
    "NetIncomeLossAvailableToCommonStockholdersBasic",
  ],
  eps: [
    "EarningsPerShareDiluted",
    "IncomeLossFromContinuingOperationsPerDilutedShare",
    "DilutedEarningsLossPerShare",
    "EarningsPerShareBasicAndDiluted",
    "EarningsPerShareBasic",
    "BasicEarningsLossPerShare",
    "DilutedEarningsLossPerShareFromContinuingOperations",
    "BasicAndDilutedEarningsLossPerShare",
    "BasicEarningsLossPerShareFromContinuingOperations",
    // Partnerships report per unit.
    "NetIncomeLossNetOfTaxPerOutstandingLimitedPartnershipUnitDiluted",
    "IncomeLossFromContinuingOperationsNetOfTaxPerOutstandingLimitedPartnershipUnitDiluted",
  ],
  // Basic before diluted: a diluted count is also restated when the accounting for convertibles changes.
  shareCount: [
    "WeightedAverageNumberOfSharesOutstandingBasic",
    "WeightedAverageShares",
    "WeightedAverageNumberOfDilutedSharesOutstanding",
    "AdjustedWeightedAverageShares",
    "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
    "WeightedAverageLimitedPartnershipUnitsOutstandingDiluted",
  ],
  operatingIncome: ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
  pretaxIncome: [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    "ProfitLossBeforeTax",
  ],
  // Some companies give pre-tax income only in the tax note, split into what was earned at home and abroad.
  pretaxIncomeDomestic: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic"],
  pretaxIncomeForeign: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesForeign"],
  incomeTax: ["IncomeTaxExpenseBenefit", "IncomeTaxExpenseContinuingOperations"],
  interestExpense: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "FinanceCosts"],
  equity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    "EquityAttributableToOwnersOfParent",
    "Equity",
    "PartnersCapital",
  ],
  // Long-term debt as a single balance-sheet line.
  debtNoncurrent: ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations", "LongtermBorrowings"],
  // Long-term debt listed kind by kind. These are added together.
  debtNoncurrentKinds: [
    "LongTermNotesPayable",
    "SeniorLongTermNotes",
    "ConvertibleDebtNoncurrent",
    "ConvertibleNotesPayableNoncurrent",
    "LongTermLoansFromBank",
    "NoncurrentPortionOfNoncurrentBondsIssued",
  ],
  debtCurrentPortion: [
    "LongTermDebtCurrent",
    "LongTermDebtAndCapitalLeaseObligationsCurrent",
    "ConvertibleDebtCurrent",
    "SeniorNotesCurrent",
  ],
  debtShortTerm: ["ShortTermBorrowings", "OtherShortTermBorrowings", "CommercialPaper", "ShorttermBorrowings"],
  // Everything due within a year: short-term borrowings plus the current portion of long-term debt.
  debtDueWithinYear: ["DebtCurrent", "CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings"],
  // Long-term debt including its current portion.
  debtLongTermTotal: ["LongTermDebt", "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities", "Borrowings"],
} satisfies Record<string, string[]>;

type Series = { unit: string; facts: Fact[] };

const newestEnd = (concept: Concept) =>
  Object.values(concept.units).reduce((newest, facts) => facts.reduce((n, f) => (f.end > n ? f.end : n), newest), "");

function series(company: CompanyFacts, tag: string): Series | null {
  // A company that moved from US GAAP to IFRS has the same tag name under both; the one still in use is wanted.
  const concept = [company.facts["us-gaap"]?.[tag], company.facts["ifrs-full"]?.[tag]]
    .filter((c) => c !== undefined)
    .sort((a, b) => newestEnd(b).localeCompare(newestEnd(a)))[0];
  if (!concept) return null;
  // Foreign filers sometimes add a sparse USD convenience translation; the real series is the longest.
  const [unit, facts] = Object.entries(concept.units).sort((a, b) => b[1].length - a[1].length)[0];
  return { unit, facts };
}

const daysBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY;

const coversFullYear = (f: Fact) =>
  f.start !== undefined && ANNUAL_REPORT.test(f.form) && Math.abs(daysBetween(f.start, f.end) - 365) < 20;

const isBalance = (f: Fact) => f.start === undefined && ANNUAL_REPORT.test(f.form);

// Later filings restate earlier years (splits, reclassifications), so the newest filing wins.
const latestFiled = (facts: Fact[]) =>
  facts.reduce<Fact | null>((best, f) => (!best || f.filed > best.filed ? f : best), null);

function find(company: CompanyFacts, tags: string[], end: string, matches: (f: Fact) => boolean) {
  for (const tag of tags) {
    const s = series(company, tag);
    const facts = s?.facts.filter((f) => f.end === end && matches(f)) ?? [];
    const fact = latestFiled(facts);
    const firstFiled = facts.reduce((first, f) => (f.filed < first ? f.filed : first), fact?.filed ?? "");
    if (s && fact) return { fact, unit: s.unit, firstFiled };
  }
  return null;
}

/** Every full-year fact under the one of `tags` the company used most recently (the earliest listed, if several). */
function fullYears(company: CompanyFacts, tags: string[]): Fact[] {
  const newest = (facts: Fact[]) => facts.reduce((end, f) => (f.end > end ? f.end : end), "");
  return tags
    .map((tag) => series(company, tag)?.facts.filter(coversFullYear) ?? [])
    .reduce((best, facts) => (newest(facts) > newest(best) ? facts : best), []);
}

/** Fiscal year-end dates, oldest first. One more than displayed, so averages have an opening balance. */
function fiscalYearEnds(company: CompanyFacts): string[] {
  const ends = new Set<string>();
  for (const tag of TAGS.netIncome) {
    for (const f of series(company, tag)?.facts ?? []) if (coversFullYear(f)) ends.add(f.end);
  }
  const kept: string[] = [];
  for (const end of [...ends].sort().reverse()) {
    if (!kept.length || daysBetween(end, kept[kept.length - 1]) > 300) kept.push(end);
  }
  return kept.slice(0, YEARS + 1).reverse();
}

// A 52/53-week year can end a few days into the next month; label it by where it mostly sits.
const labelDate = (end: string) => new Date(Date.parse(end) - 10 * DAY);

function closeOn(prices: Prices, date: string): number | null {
  let close: [string, number] | null = null;
  for (const row of prices.closes) {
    if (row[0] > date) break;
    close = row;
  }
  return close && daysBetween(close[0], date) <= 7 ? close[1] : null;
}

const productAfter = (events: [date: string, factor: number][] | undefined, date: string) =>
  (events ?? []).reduce((product, [on, factor]) => (on > date ? product * factor : product), 1);

const ratio = (a: number | null, b: number | null) => (a !== null && b !== null && b > 0 ? a / b : null);

const taxRate = (pretax: number | null, tax: number | null) =>
  pretax !== null && tax !== null && pretax > 0 ? Math.min(Math.max(tax / pretax, 0), 0.5) : DEFAULT_TAX_RATE;

type Row = {
  end: string;
  currency: string | null;
  netIncome: number | null;
  revenue: number | null;
  grossProfit: number | null;
  nopat: number | null;
  equity: number | null;
  debt: number | null;
  // EPS as the SEC has it, per share of the latest annual report.
  eps: { value: number; currency: string; sharesSinceYearEnd: number | null } | null;
  yahoo: YahooYear | null;
};

/**
 * `yahoo` fills what the SEC's data lacks: EPS for companies that report it per share class only, and fiscal
 * years the SEC has not published yet. It never replaces an SEC figure.
 * `fx` is the price history of the reporting currency, for a company that does not report in the currency its
 * shares trade in: how many units of it one unit of the trading currency bought each day.
 */
export function compute(
  company: CompanyFacts,
  prices: Prices | null,
  yahoo: YahooYear[] = [],
  fx: Prices | null = null,
): Financials {
  const ends = fiscalYearEnds(company);
  const epsFacts = fullYears(company, TAGS.eps);
  const steps = restatements(fullYears(company, TAGS.shareCount), epsFacts);

  const secRows = ends.map((end): Row => {
    const flow = (tags: string[]) => find(company, tags, end, coversFullYear)?.fact.val ?? null;
    const balance = (tags: string[]) => find(company, tags, end, isBalance)?.fact.val ?? null;

    const revenue =
      flow(TAGS.revenue) ?? (flow(TAGS.netInterestIncome) === null ? flow(TAGS.revenueFromCustomers) : null);
    const costOfRevenue = flow(TAGS.insuranceClaims) === null ? flow(TAGS.costOfRevenue) : null;
    const grossProfit =
      flow(TAGS.grossProfit) ?? (revenue !== null && costOfRevenue !== null ? revenue - costOfRevenue : null);

    const netIncome = find(company, TAGS.netIncome, end, coversFullYear);

    // A year last reported before a split is still per old share; bring it onto the latest report's shares.
    // The year-end price, though, was paid for a share as it was that day, so P/E needs to know how many of
    // the latest report's shares that was: every split since the year's first report, and any just before it.
    const reported = find(company, TAGS.eps, end, coversFullYear);
    const splitBeforeFirstReport =
      reported && splitBeforeFiling(steps, prices?.rescalings ?? [], end, reported.firstFiled);
    const eps = reported && {
      value: reported.fact.val / sharesSince(steps, reported.fact.filed),
      currency: reported.unit.split("/")[0],
      sharesSinceYearEnd: splitBeforeFirstReport && sharesSince(steps, reported.firstFiled) * splitBeforeFirstReport,
    };

    const pretaxDomestic = flow(TAGS.pretaxIncomeDomestic);
    const pretaxForeign = flow(TAGS.pretaxIncomeForeign);
    const pretax =
      flow(TAGS.pretaxIncome) ??
      (pretaxDomestic !== null && pretaxForeign !== null ? pretaxDomestic + pretaxForeign : null);
    const interest = flow(TAGS.interestExpense);
    const ebit = flow(TAGS.operatingIncome) ?? (pretax !== null ? pretax + (interest ?? 0) : null);

    return {
      end,
      currency: netIncome?.unit ?? null,
      netIncome: netIncome?.fact.val ?? null,
      revenue,
      grossProfit,
      nopat: ebit !== null ? ebit * (1 - taxRate(pretax, flow(TAGS.incomeTax))) : null,
      equity: balance(TAGS.equity),
      debt: totalDebt(balance),
      eps,
      yahoo: yahoo.find((y) => Math.abs(daysBetween(y.end, end)) < 16) ?? null,
    };
  });

  // Fiscal years Yahoo has and the SEC does not yet: some foreign companies' newest annual reports take a year
  // or more to appear in the SEC's data, and a few never do.
  const lastSec = secRows[secRows.length - 1];
  const yahooRows = yahoo
    .filter((y) => y.netIncome !== null && (!lastSec || daysBetween(lastSec.end, y.end) > 300))
    .map((y): Row => {
      const ebit = y.operatingIncome ?? y.pretaxIncome;
      return {
        ...y,
        // Yahoo works out a gross profit for miners, utilities and others that report none. Keep the row consistent.
        grossProfit: !lastSec || lastSec.grossProfit !== null ? y.grossProfit : null,
        nopat: ebit !== null ? ebit * (1 - taxRate(y.pretaxIncome, y.incomeTax)) : null,
        eps: null,
        yahoo: y,
      };
    });

  const all = [...secRows, ...yahooRows];
  // Only an unbroken run of years: a company that stopped filing with the SEC long ago starts again at Yahoo's.
  const gap = all.findLastIndex((row, i) => i > 0 && daysBetween(all[i - 1].end, row.end) > 400);
  const rows = all.slice(Math.max(gap, 0)).slice(-(YEARS + 1)); // one more than shown: the opening balance
  const shown = rows.slice(-YEARS);

  // Yahoo's list of splits is needed only for one the latest annual report is too old to know about.
  const latestReport = epsFacts.reduce((latest, f) => (f.filed > latest ? f.filed : latest), "");
  const splitSinceLatestReport = productAfter(prices?.splits, latestReport);
  const secEps = (row: Row) => (row.eps ? row.eps.value / splitSinceLatestReport : null);

  const depositary = FOREIGN_REPORT.test(latestFiled(epsFacts)?.form ?? "");
  const perListedShare = depositary
    ? ordinarySharesPerListedShare(
        rows.map((r) => [secEps(r), r.yahoo && r.yahoo.currency === r.eps?.currency ? r.yahoo.eps : null]),
      )
    : 1;
  const secHasEps = rows.some((r) => r.eps);

  /** What one US-listed share earned, counted in the shares that existed at the year end, in the price's currency. */
  const earningsBehindPrice = (row: Row): number | null => {
    if (!prices) return null;
    const rescaledSince = productAfter(prices.rescalings, row.end);
    let earnings: number | null = null;
    if (row.eps) {
      const { value, sharesSinceYearEnd } = row.eps;
      if (sharesSinceYearEnd === null || perListedShare === null) return null;
      // If Yahoo has rescaled a depositary share's prices by anything the company did not restate its shares
      // for, the depositary share may stand for a different number of shares now than it did then.
      if (depositary && !same(rescaledSince, sharesSinceYearEnd)) return null;
      earnings = value * sharesSinceYearEnd * perListedShare;
    } else if (row.yahoo?.eps != null && rescaledSince === 1) {
      earnings = row.yahoo.eps; // per share as it is today, which nothing has changed since the year end
    }
    const currency = row.eps?.currency ?? row.yahoo?.currency;
    if (earnings === null || currency === prices.currency) return earnings;
    const rate = fx && fx.currency === currency ? closeOn(fx, row.end) : null;
    return rate && earnings / rate;
  };

  const metric = (value: (row: Row, previous?: Row) => number | null) =>
    shown.map((row) => value(row, rows[rows.indexOf(row) - 1]));
  const investedCapital = (row: Row | undefined) => (row && row.equity !== null ? row.equity + (row.debt ?? 0) : null);

  const last = rows[rows.length - 1]?.end;
  return {
    currency: shown.findLast((r) => r.currency)?.currency ?? "USD",
    fiscalYearEndMonth: last ? labelDate(last).getUTCMonth() + 1 : 12,
    years: shown.map((r) => labelDate(r.end).getUTCFullYear()),
    metrics: {
      roic: metric((r, previous) => {
        const closing = investedCapital(r);
        const opening = investedCapital(previous) ?? closing;
        const average = closing !== null && opening !== null ? (closing + opening) / 2 : null;
        return ratio(r.nopat, average);
      }),
      netIncome: metric((r) => r.netIncome),
      eps: metric((r) => {
        if (r.eps || r.yahoo?.eps == null) return secEps(r);
        // Yahoo's EPS is per listed share. Beside SEC years it is turned into the SEC's kind of share;
        // where the SEC has no EPS at all, the whole row is per listed share.
        const divisor = secHasEps ? perListedShare : 1;
        return divisor && r.yahoo.eps / divisor;
      }),
      debtToEquity: metric((r) => ratio(r.debt, r.equity)),
      grossMargin: metric((r) => ratio(r.grossProfit, r.revenue)),
      netMargin: metric((r) => ratio(r.netIncome, r.revenue)),
      pe: metric((r) => ratio(prices && closeOn(prices, r.end), earningsBehindPrice(r))),
    },
  };
}

/**
 * How many of the shares a foreign company reports EPS for one US-listed share stands for: 5 for HSBC, 1 for
 * ASML, a half for Sanofi. Nothing the SEC publishes says, but Yahoo's EPS is per listed share, so the ratio of
 * the two is the answer. It is believed only when the two latest years give the same whole number.
 */
function ordinarySharesPerListedShare(years: [secEps: number | null, yahooEps: number | null][]): number | null {
  const [latest, previous] = years
    .filter((pair): pair is [number, number] => pair[0] !== null && pair[1] !== null && pair[0] !== 0)
    .slice(-2)
    .map(([sec, yahoo]) => tidy(yahoo / sec, 0.04));
  return latest && latest === previous ? latest : null;
}

function totalDebt(balance: (tags: string[]) => number | null): number {
  // Some companies report long-term debt as one line and some list each kind of note.
  // A few do both (the line being one of the kinds), so take whichever is larger.
  const kinds = TAGS.debtNoncurrentKinds.reduce((sum, tag) => sum + (balance([tag]) ?? 0), 0);
  const noncurrent = Math.max(balance(TAGS.debtNoncurrent) ?? 0, kinds);
  const dueWithinYear =
    balance(TAGS.debtDueWithinYear) ??
    (balance(TAGS.debtCurrentPortion) ?? 0) + (balance(TAGS.debtShortTerm) ?? 0);
  if (noncurrent > 0) return noncurrent + dueWithinYear;
  // "LongTermDebt" should include its current portion, so only short-term borrowings are added to it.
  // Companies that report it next to "DebtCurrent" (Tesla) mean the part due after a year.
  const longTermTotal = balance(TAGS.debtLongTermTotal);
  if (longTermTotal !== null) {
    return longTermTotal + (balance(TAGS.debtDueWithinYear) ?? balance(TAGS.debtShortTerm) ?? 0);
  }
  return dueWithinYear;
}
