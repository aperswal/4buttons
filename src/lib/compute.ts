// Turns raw SEC XBRL facts (plus price history) into five fiscal years of metrics.
// Pure: no I/O, no framework imports.

export type Fact = { start?: string; end: string; val: number; filed: string; form: string };
type Concept = { units: Record<string, Fact[]> };
export type CompanyFacts = { facts: Record<string, Record<string, Concept>> };

export type Prices = {
  closes: [date: string, close: number][]; // ascending, split-adjusted
  splits: [date: string, ratio: number][]; // 4-for-1 → 4
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
  ],
  operatingIncome: ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
  pretaxIncome: [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    "ProfitLossBeforeTax",
  ],
  incomeTax: ["IncomeTaxExpenseBenefit", "IncomeTaxExpenseContinuingOperations"],
  interestExpense: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "FinanceCosts"],
  equity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    "EquityAttributableToOwnersOfParent",
    "Equity",
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

function series(company: CompanyFacts, tag: string): Series | null {
  const concept = company.facts["us-gaap"]?.[tag] ?? company.facts["ifrs-full"]?.[tag];
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
    const fact = s && latestFiled(s.facts.filter((f) => f.end === end && matches(f)));
    if (fact) return { fact, unit: s.unit };
  }
  return null;
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

const splitFactorSince = (prices: Prices | null, date: string) =>
  (prices?.splits ?? []).reduce((factor, [on, ratio]) => (on > date ? factor * ratio : factor), 1);

const ratio = (a: number | null, b: number | null) => (a !== null && b !== null && b > 0 ? a / b : null);

export function compute(company: CompanyFacts, prices: Prices | null): Financials {
  const ends = fiscalYearEnds(company);

  const rows = ends.map((end) => {
    const flow = (tags: string[]) => find(company, tags, end, coversFullYear)?.fact.val ?? null;
    const balance = (tags: string[]) => find(company, tags, end, isBalance)?.fact.val ?? null;

    const revenue = flow(TAGS.revenue);
    const costOfRevenue = flow(TAGS.insuranceClaims) === null ? flow(TAGS.costOfRevenue) : null;
    const grossProfit =
      flow(TAGS.grossProfit) ?? (revenue !== null && costOfRevenue !== null ? revenue - costOfRevenue : null);

    const netIncome = find(company, TAGS.netIncome, end, coversFullYear);

    // Older filings predate later splits; restate their EPS onto today's share count.
    const reportedEps = find(company, TAGS.eps, end, coversFullYear);
    const eps = reportedEps && reportedEps.fact.val / splitFactorSince(prices, reportedEps.fact.filed);

    const pretax = flow(TAGS.pretaxIncome);
    const tax = flow(TAGS.incomeTax);
    const interest = flow(TAGS.interestExpense);
    const ebit = flow(TAGS.operatingIncome) ?? (pretax !== null ? pretax + (interest ?? 0) : null);
    const taxRate =
      pretax !== null && tax !== null && pretax > 0 ? Math.min(Math.max(tax / pretax, 0), 0.5) : DEFAULT_TAX_RATE;

    const equity = balance(TAGS.equity);
    const debt = totalDebt(balance);

    return {
      end,
      currency: netIncome?.unit ?? null,
      netIncome: netIncome?.fact.val ?? null,
      revenue,
      grossProfit,
      eps,
      epsInUsd: reportedEps?.unit === "USD/shares",
      nopat: ebit !== null ? ebit * (1 - taxRate) : null,
      equity,
      debt,
      investedCapital: equity !== null ? equity + debt : null,
    };
  });

  const shown = rows.slice(-YEARS);
  const metric = (value: (row: (typeof rows)[number], previous?: (typeof rows)[number]) => number | null) =>
    shown.map((row) => value(row, rows[rows.indexOf(row) - 1]));

  const last = ends[ends.length - 1];
  return {
    currency: shown.findLast((r) => r.currency)?.currency ?? "USD",
    fiscalYearEndMonth: last ? labelDate(last).getUTCMonth() + 1 : 12,
    years: shown.map((r) => labelDate(r.end).getUTCFullYear()),
    metrics: {
      roic: metric((r, previous) => {
        const opening = previous?.investedCapital ?? r.investedCapital;
        const average = r.investedCapital !== null && opening !== null ? (r.investedCapital + opening) / 2 : null;
        return ratio(r.nopat, average);
      }),
      netIncome: metric((r) => r.netIncome),
      eps: metric((r) => r.eps),
      debtToEquity: metric((r) => ratio(r.debt, r.equity)),
      grossMargin: metric((r) => ratio(r.grossProfit, r.revenue)),
      netMargin: metric((r) => ratio(r.netIncome, r.revenue)),
      pe: metric((r) => {
        const price = prices && r.epsInUsd ? closeOn(prices, r.end) : null;
        return ratio(price, r.eps);
      }),
    },
  };
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
