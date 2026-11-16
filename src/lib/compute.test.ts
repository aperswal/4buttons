import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compute, type CompanyFacts, type Fact, type Prices } from "./compute.ts";

const B = 1e9;

/** One full fiscal year ending `end`, reported in a 10-K filed 40 days later. */
const year = (end: string, val: number, filed = shift(end, 40)): Fact => ({
  start: shift(end, -364),
  end,
  val,
  filed,
  form: "10-K",
});
const balance = (end: string, val: number): Fact => ({ end, val, filed: shift(end, 40), form: "10-K" });
const shift = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

const company = (concepts: Record<string, Fact[]>, unit = "USD"): CompanyFacts => ({
  facts: {
    "us-gaap": Object.fromEntries(
      Object.entries(concepts).map(([tag, facts]) => [
        tag,
        { units: { [tag.includes("PerShare") ? `${unit}/shares` : unit]: facts } },
      ]),
    ),
  },
});

const close = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("margins, leverage and return on invested capital", () => {
  const { years, metrics } = compute(
    company({
      Revenues: [year("2024-12-31", 80 * B), year("2025-12-31", 100 * B)],
      GrossProfit: [year("2025-12-31", 40 * B)],
      NetIncomeLoss: [year("2024-12-31", 8 * B), year("2025-12-31", 15 * B)],
      OperatingIncomeLoss: [year("2025-12-31", 20 * B)],
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: [
        year("2025-12-31", 20 * B),
      ],
      IncomeTaxExpenseBenefit: [year("2025-12-31", 5 * B)],
      StockholdersEquity: [balance("2024-12-31", 30 * B), balance("2025-12-31", 50 * B)],
      LongTermDebtNoncurrent: [balance("2024-12-31", 10 * B), balance("2025-12-31", 20 * B)],
      LongTermDebtCurrent: [balance("2025-12-31", 3 * B)],
      CommercialPaper: [balance("2025-12-31", 2 * B)],
    }),
    null,
  );

  assert.deepEqual(years, [2024, 2025]);
  close(metrics.grossMargin[1], 0.4);
  close(metrics.netMargin[1], 0.15);
  close(metrics.debtToEquity[1], 25 / 50);
  // NOPAT 20 × (1 − 25%) = 15, over the average of 40 and 75 invested.
  close(metrics.roic[1], 15 / 57.5);
  assert.equal(metrics.pe[1], null);
});

test("EPS from filings that predate a split is restated, and P/E uses the year-end close", () => {
  const prices: Prices = {
    closes: [
      ["2023-12-29", 50],
      ["2024-12-31", 120],
      ["2025-01-02", 999],
    ],
    splits: [["2024-06-10", 10]],
  };
  const { metrics } = compute(
    company({
      NetIncomeLoss: [year("2023-12-31", 1 * B), year("2024-12-31", 2 * B)],
      // 2023 was filed before the 10-for-1 split; 2024 after it.
      EarningsPerShareDiluted: [year("2023-12-31", 20), year("2024-12-31", 4)],
    }),
    prices,
  );

  assert.deepEqual(metrics.eps, [2, 4]);
  close(metrics.pe[0], 25); // 2023-12-31 was a Sunday: the last close before it
  close(metrics.pe[1], 30);
});

test("a later filing's restated figure replaces the original", () => {
  const { metrics } = compute(
    company({ NetIncomeLoss: [year("2024-12-31", 5 * B), year("2024-12-31", 4 * B, "2026-02-01")] }),
    null,
  );
  assert.deepEqual(metrics.netIncome, [4 * B]);
});

test("gross profit falls back to revenue less cost of revenue", () => {
  const { metrics } = compute(
    company({
      NetIncomeLoss: [year("2025-12-31", 10 * B)],
      Revenues: [year("2025-12-31", 100 * B)],
      CostOfRevenue: [year("2025-12-31", 70 * B)],
    }),
    null,
  );
  close(metrics.grossMargin[0], 0.3);
});

test("total revenue is the Revenues line, whether contract revenue is a part of it or a gross figure", () => {
  const netMargin = (contractRevenue: number) =>
    compute(
      company({
        NetIncomeLoss: [year("2025-12-31", 10 * B)],
        Revenues: [year("2025-12-31", 100 * B)],
        RevenueFromContractWithCustomerExcludingAssessedTax: [year("2025-12-31", contractRevenue)],
      }),
      null,
    ).metrics.netMargin[0];
  close(netMargin(90 * B), 0.1);
  close(netMargin(150 * B), 0.1);
});

test("revenue from customers stands in for a missing total, but not for a bank", () => {
  const netMargin = (extra: Record<string, Fact[]>) =>
    compute(
      {
        facts: {
          "ifrs-full": Object.fromEntries(
            Object.entries({
              ProfitLoss: [year("2025-12-31", 10 * B)],
              RevenueFromContractsWithCustomers: [year("2025-12-31", 100 * B)],
              ...extra,
            }).map(([tag, facts]) => [tag, { units: { EUR: facts } }]),
          ),
        },
      },
      null,
    ).metrics.netMargin[0];
  close(netMargin({}), 0.1);
  // A bank's contracts with customers are its fees; most of its income is interest.
  assert.equal(netMargin({ InterestRevenueExpense: [year("2025-12-31", 300 * B)] }), null);
});

test("an insurer has no gross margin", () => {
  const { metrics } = compute(
    company({
      NetIncomeLoss: [year("2025-12-31", 10 * B)],
      Revenues: [year("2025-12-31", 400 * B)],
      CostOfGoodsAndServicesSold: [year("2025-12-31", 50 * B)], // only the products it sells
      PolicyholderBenefitsAndClaimsIncurredNet: [year("2025-12-31", 300 * B)],
    }),
    null,
  );
  assert.equal(metrics.grossMargin[0], null);
});

const debtToEquity = (debt: Record<string, number>) =>
  compute(
    company({
      NetIncomeLoss: [year("2025-12-31", 1 * B)],
      StockholdersEquity: [balance("2025-12-31", 100 * B)],
      ...Object.fromEntries(Object.entries(debt).map(([tag, val]) => [tag, [balance("2025-12-31", val * B)]])),
    }),
    null,
  ).metrics.debtToEquity[0];

test("long-term debt listed as separate kinds of notes is added up", () => {
  close(debtToEquity({ SeniorLongTermNotes: 20, ConvertibleDebtNoncurrent: 10, LongTermLoansFromBank: 5 }), 0.35);
});

test("a single long-term debt line is not double counted with a kind it already includes", () => {
  close(debtToEquity({ LongTermDebtNoncurrent: 30, ConvertibleNotesPayableNoncurrent: 10, LongTermDebtCurrent: 2 }), 0.32);
});

test("LongTermDebt includes its current portion, unless it is reported beside DebtCurrent", () => {
  close(debtToEquity({ LongTermDebt: 30, ShortTermBorrowings: 4 }), 0.34);
  close(debtToEquity({ LongTermDebt: 30, DebtCurrent: 6 }), 0.36);
});

test("ratios with no meaning are left blank", () => {
  const { metrics } = compute(
    company({
      NetIncomeLoss: [year("2025-12-31", -2 * B)],
      EarningsPerShareDiluted: [year("2025-12-31", -1.5)],
      StockholdersEquity: [balance("2025-12-31", -4 * B)],
      LongTermDebtNoncurrent: [balance("2025-12-31", 3 * B)],
    }),
    { closes: [["2025-12-31", 40]], splits: [] },
  );
  assert.equal(metrics.pe[0], null); // losses
  assert.equal(metrics.debtToEquity[0], null); // negative equity
  assert.equal(metrics.grossMargin[0], null); // no revenue reported
});

test("shows the five most recent fiscal years and ignores quarters", () => {
  const ends = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y) => `${y}-06-30`);
  const quarter: Fact = { start: "2025-07-01", end: "2025-09-30", val: 1, filed: "2025-10-30", form: "10-Q" };
  const result = compute(company({ NetIncomeLoss: [...ends.map((end, i) => year(end, i * B)), quarter] }), null);

  assert.deepEqual(result.years, [2021, 2022, 2023, 2024, 2025]);
  assert.deepEqual(result.metrics.netIncome, [2 * B, 3 * B, 4 * B, 5 * B, 6 * B]);
  assert.equal(result.fiscalYearEndMonth, 6);
});

test("a 52-week year that ends in early January belongs to the year before", () => {
  const result = compute(company({ NetIncomeLoss: [year("2026-01-03", 1 * B)] }), null);
  assert.deepEqual(result.years, [2025]);
  assert.equal(result.fiscalYearEndMonth, 12);
});

test("reports in the filer's own currency, and skips P/E when that is not the price's", () => {
  const result = compute(
    company({ NetIncomeLoss: [year("2025-12-31", 900 * B)], EarningsPerShareDiluted: [year("2025-12-31", 60)] }, "TWD"),
    { closes: [["2025-12-31", 300]], splits: [] },
  );
  assert.equal(result.currency, "TWD");
  assert.equal(result.metrics.pe[0], null);
});

test("a partnership's capital is its equity and its earnings per unit are its EPS", () => {
  const partnership = company({
    NetIncomeLoss: [year("2025-12-31", 6 * B)],
    PartnersCapital: [balance("2025-12-31", 30 * B)],
    LongTermDebtNoncurrent: [balance("2025-12-31", 33 * B)],
  });
  partnership.facts["us-gaap"].NetIncomeLossNetOfTaxPerOutstandingLimitedPartnershipUnitDiluted = {
    units: { "USD/shares": [year("2025-12-31", 2.5)] },
  };
  const { metrics } = compute(partnership, { closes: [["2025-12-31", 30]], splits: [] });
  assert.equal(metrics.eps[0], 2.5);
  close(metrics.pe[0], 12);
  close(metrics.debtToEquity[0], 1.1);
});

test("pre-tax income given only as domestic and foreign parts is their sum", () => {
  const { metrics } = compute(
    company({
      NetIncomeLoss: [year("2025-12-31", 6 * B)],
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic: [year("2025-12-31", 6 * B)],
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesForeign: [year("2025-12-31", 4 * B)],
      IncomeTaxExpenseBenefit: [year("2025-12-31", 3 * B)],
      StockholdersEquity: [balance("2025-12-31", 70 * B)],
    }),
    null,
  );
  // No operating income line, so 10 before tax at the 30% actually paid, on 70 invested.
  close(metrics.roic[0], 0.1);
});

test("a company that changed from US GAAP to IFRS is read from the standard it uses now", () => {
  const result = compute(
    {
      facts: {
        "us-gaap": { ProfitLoss: { units: { USD: [year("2013-12-31", 1 * B)] } } },
        "ifrs-full": { ProfitLoss: { units: { USD: [year("2024-12-31", 4 * B), year("2025-12-31", 5 * B)] } } },
      },
    },
    null,
  );
  assert.deepEqual(result.years, [2024, 2025]);
  assert.deepEqual(result.metrics.netIncome, [4 * B, 5 * B]);
});

test("a company with no financial statements has no years", () => {
  assert.deepEqual(compute({ facts: {} }, null).years, []);
});

// Real filings, trimmed to the annual facts compute() reads. Expected values are the ones the companies reported.
const fixture = (name: string): { facts: CompanyFacts["facts"]; prices: Prices } =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const at = (result: ReturnType<typeof compute>, fiscalYear: number) => {
  const i = result.years.indexOf(fiscalYear);
  assert.notEqual(i, -1, `no fiscal ${fiscalYear}`);
  return Object.fromEntries(Object.entries(result.metrics).map(([key, values]) => [key, values[i]]));
};
const near = (a: number | null, b: number, tolerance: number) =>
  assert.ok(a !== null && Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);

test("Apple: a September year end, as reported", () => {
  const { facts, prices } = fixture("aapl");
  const result = compute({ facts }, prices);
  assert.equal(result.fiscalYearEndMonth, 9);
  assert.deepEqual(result.years, [2022, 2023, 2024, 2025, 2026]);

  const fy2024 = at(result, 2024);
  assert.equal(fy2024.netIncome, 93_736_000_000);
  assert.equal(fy2024.eps, 6.08);
  near(fy2024.grossMargin, 0.462, 0.0005);
  near(fy2024.netMargin, 0.24, 0.0005);
  // $106.6B of term debt and commercial paper against $57.0B of equity.
  near(fy2024.debtToEquity, 1.87, 0.005);
  near(fy2024.pe, 37.5, 0.5);

  assert.equal(at(result, 2025).netIncome, 112_010_000_000);
  assert.equal(at(result, 2025).eps, 7.46);
});

test("Nvidia: a January year end, with EPS continuous across the 4-for-1 and 10-for-1 splits", () => {
  const { facts, prices } = fixture("nvda");
  const result = compute({ facts }, prices);
  assert.equal(result.fiscalYearEndMonth, 1);
  assert.deepEqual(result.years, [2022, 2023, 2024, 2025, 2026]);

  // Fiscal 2022 ($3.85 as filed) was last reported before the 10-for-1 split; later years were restated by Nvidia.
  assert.equal(at(result, 2025).netIncome, 72_880_000_000);
  assert.equal(at(result, 2025).eps, 2.94);
  near(at(result, 2022).eps, 0.385, 1e-9);
  assert.equal(at(result, 2023).eps, 0.17);
  assert.equal(at(result, 2024).eps, 1.19);
  near(at(result, 2025).grossMargin, 0.75, 0.0005);
  near(at(result, 2025).pe, 48.5, 0.5);
});

test("Tesla: debt is the current and long-term lines together, and EPS spans the 3-for-1 split", () => {
  const { facts, prices } = fixture("tsla");
  const result = compute({ facts }, prices);

  assert.equal(at(result, 2024).netIncome, 7_091_000_000);
  assert.equal(at(result, 2024).eps, 2.04);
  assert.equal(at(result, 2021).eps, 1.63); // $4.90 before the split
  // $2.3B due within a year plus $5.5B after it, against $72.9B of equity.
  near(at(result, 2024).debtToEquity, 0.108, 0.001);
});
