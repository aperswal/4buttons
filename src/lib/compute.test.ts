import assert from "node:assert/strict";
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

test("gross profit falls back to revenue less cost of revenue, and revenue to its largest line", () => {
  const { metrics } = compute(
    company({
      NetIncomeLoss: [year("2025-12-31", 10 * B)],
      RevenueFromContractWithCustomerExcludingAssessedTax: [year("2025-12-31", 90 * B)],
      Revenues: [year("2025-12-31", 100 * B)],
      CostOfRevenue: [year("2025-12-31", 70 * B)],
    }),
    null,
  );
  close(metrics.grossMargin[0], 0.3);
  close(metrics.netMargin[0], 0.1);
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

test("a company with no financial statements has no years", () => {
  assert.deepEqual(compute({ facts: {} }, null).years, []);
});
