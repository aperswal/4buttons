import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compute, type CompanyFacts, type Fact, type Prices, type YahooYear } from "./compute.ts";

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

/** Prices as parseChart() gives them: what traded each day, and every rescaling Yahoo has applied since. */
const traded = (closes: Prices["closes"], rescalings: Prices["rescalings"] = [], splits = rescalings): Prices => ({
  currency: "USD",
  closes,
  rescalings,
  splits,
});

const yahooYear = (end: string, figures: Partial<YahooYear>): YahooYear => ({
  end,
  currency: "USD",
  eps: null,
  netIncome: null,
  revenue: null,
  grossProfit: null,
  operatingIncome: null,
  pretaxIncome: null,
  incomeTax: null,
  debt: null,
  equity: null,
  ...figures,
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

// A company that split 10-for-1 in June 2024. Its 2024 report restates 2023, the one year both reports show.
const splitTenForOne = company({
  NetIncomeLoss: [year("2022-12-31", 1 * B), year("2023-12-31", 2 * B), year("2024-12-31", 4 * B)],
  WeightedAverageNumberOfSharesOutstandingBasic: [
    year("2022-12-31", 100e6, "2024-02-09"),
    year("2023-12-31", 100e6),
    year("2023-12-31", 1000e6, "2025-02-09"),
    year("2024-12-31", 1000e6),
  ],
  EarningsPerShareDiluted: [
    year("2022-12-31", 10, "2024-02-09"),
    year("2023-12-31", 20),
    year("2023-12-31", 2, "2025-02-09"),
    year("2024-12-31", 4),
  ],
});

test("EPS last filed before a split is restated from the company's own share counts, with no prices at all", () => {
  // 2022 was never reported again after the split: $10 a share then is $1 a share now.
  assert.deepEqual(compute(splitTenForOne, null).metrics.eps, [1, 2, 4]);
});

test("P/E is the price that traded over the EPS for a share as it was that day", () => {
  const prices = traded(
    [
      ["2022-12-30", 250],
      ["2023-12-29", 500],
      ["2024-12-31", 120],
      ["2025-01-02", 999],
    ],
    [["2024-06-10", 10]],
  );
  const { metrics } = compute(splitTenForOne, prices);
  assert.deepEqual(metrics.eps, [1, 2, 4]);
  close(metrics.pe[0], 25); // $250 on $10
  close(metrics.pe[1], 25); // $500 on $20, though the restated $2 is what is shown. 2023-12-31 was a Sunday.
  close(metrics.pe[2], 30);
});

test("a stock dividend is restated like any other split", () => {
  const { metrics } = compute(
    company({
      NetIncomeLoss: [year("2023-12-31", 1 * B), year("2024-12-31", 2 * B), year("2025-12-31", 2 * B)],
      WeightedAverageNumberOfSharesOutstandingBasic: [
        year("2024-12-31", 100e6),
        year("2024-12-31", 103e6, "2026-02-09"),
        year("2025-12-31", 104e6),
      ],
      EarningsPerShareDiluted: [
        year("2023-12-31", 10.3, "2025-02-09"),
        year("2024-12-31", 20),
        year("2024-12-31", 19.42, "2026-02-09"),
        year("2025-12-31", 19.23),
      ],
    }),
    null,
  );
  close(metrics.eps[0], 10);
  assert.deepEqual(metrics.eps.slice(1), [19.42, 19.23]);
});

// One year, reported once, with something Yahoo rescaled prices for between the year end and the filing.
const withRescalingBeforeFiling = (shareCountRestatedBy: number, rescaling: number) =>
  compute(
    company({
      NetIncomeLoss: [year("2024-01-31", 9 * B), year("2025-01-31", 9 * B)],
      WeightedAverageNumberOfSharesOutstandingBasic: [
        year("2024-01-31", 1000e6),
        year("2024-01-31", 1000e6 * shareCountRestatedBy, "2025-03-12"),
        year("2025-01-31", 1000e6 * shareCountRestatedBy),
      ],
      EarningsPerShareDiluted: [year("2024-01-31", 9), year("2025-01-31", 3)],
    }),
    traded([["2025-01-31", 150]], [["2025-02-24", rescaling]]),
  ).metrics.pe[1];

test("a split between the year end and the filing: the report is per new share, the year-end price per old", () => {
  // Walmart, 2024: fiscal year ended in January, 3-for-1 in February, report in March. $150 on $9 a share.
  close(withRescalingBeforeFiling(3, 3), 150 / 9);
});

test("a spin-off between the year end and the filing changes nothing: no shares were restated", () => {
  close(withRescalingBeforeFiling(1, 1.25), 150 / 3);
});

test("P/E is blank when a rescaling before the filing cannot be squared with the report", () => {
  assert.equal(withRescalingBeforeFiling(2, 1.25), null);
});

test("a split too recent for any annual report comes from Yahoo's list, and leaves P/E alone", () => {
  const facts = company({ NetIncomeLoss: [year("2025-12-31", 8 * B)], EarningsPerShareDiluted: [year("2025-12-31", 8)] });
  const prices = (rescalings: Prices["rescalings"], splits: Prices["splits"]) =>
    compute(facts, traded([["2025-12-31", 200]], rescalings, splits)).metrics;

  const split = prices([["2026-06-29", 0.5]], [["2026-06-29", 0.5]]);
  assert.deepEqual([split.eps[0], split.pe[0]], [16, 25]);
  // A spin-off rescales Yahoo's prices too, but is not in its list of splits.
  const spinOff = prices([["2026-06-29", 1.25]], []);
  assert.deepEqual([spinOff.eps[0], spinOff.pe[0]], [8, 25]);
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

test("when Revenues is not the income statement's line, revenue is the figure that reconciles to operating income", () => {
  const netMargin = (extra: Record<string, Fact[]>) =>
    compute(
      company({
        NetIncomeLoss: [year("2025-12-31", 9 * B)],
        Revenues: [year("2025-12-31", 100 * B)], // segment sales, including those to other segments
        RevenueFromContractWithCustomerExcludingAssessedTax: [year("2025-12-31", 90 * B)],
        OperatingIncomeLoss: [year("2025-12-31", 20 * B)],
        ...extra,
      }),
      null,
    ).metrics.netMargin[0];
  close(netMargin({ CostsAndExpenses: [year("2025-12-31", 70 * B)] }), 0.1);
  // Costs that reconcile to neither, or no total of costs at all, leave the Revenues line in place.
  close(netMargin({ CostsAndExpenses: [year("2025-12-31", 60 * B)] }), 0.09);
  close(netMargin({}), 0.09);
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
    traded([["2025-12-31", 40]]),
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
    traded([["2025-12-31", 300]]),
  );
  assert.equal(result.currency, "TWD");
  assert.equal(result.metrics.pe[0], null);
});

test("with the reporting currency's exchange rate, EPS is turned into the currency the shares trade in", () => {
  const facts = company(
    { NetIncomeLoss: [year("2025-12-31", 900 * B)], EarningsPerShareDiluted: [year("2025-12-31", 60)] },
    "TWD",
  );
  const fx: Prices = { currency: "TWD", closes: [["2025-12-31", 30]], rescalings: [], splits: [] };
  // NT$60 a share is $2 at 30 to the dollar.
  close(compute(facts, traded([["2025-12-31", 50]]), [], fx).metrics.pe[0], 25);
  // The wrong currency's rate is no use.
  assert.equal(compute(facts, traded([["2025-12-31", 50]]), [], { ...fx, currency: "JPY" }).metrics.pe[0], null);
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
  const { metrics } = compute(partnership, traded([["2025-12-31", 30]]));
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

test("Yahoo's EPS fills in where the SEC has none, and never replaces the SEC's", () => {
  // Visa and Berkshire report EPS per share class only, which the SEC's data leaves out.
  const perClassOnly = company({ NetIncomeLoss: [year("2024-12-31", 8 * B), year("2025-12-31", 9 * B)] });
  const yahoo = [yahooYear("2024-12-31", { eps: 4 }), yahooYear("2025-12-31", { eps: 5 })];
  const prices = traded([
    ["2024-12-31", 100],
    ["2025-12-31", 150],
  ]);
  const filled = compute(perClassOnly, prices, yahoo).metrics;
  assert.deepEqual(filled.eps, [4, 5]);
  assert.deepEqual(filled.pe, [25, 30]);

  const reported = company({
    NetIncomeLoss: [year("2024-12-31", 8 * B), year("2025-12-31", 9 * B)],
    EarningsPerShareDiluted: [year("2025-12-31", 5.1)],
  });
  assert.deepEqual(compute(reported, prices, yahoo).metrics.eps, [4, 5.1]);
});

test("Yahoo's EPS is per share as it is today, so it gives no P/E for a year before a rescaling", () => {
  const perClassOnly = company({ NetIncomeLoss: [year("2024-12-31", 8 * B), year("2025-12-31", 9 * B)] });
  const yahoo = [yahooYear("2024-12-31", { eps: 4 }), yahooYear("2025-12-31", { eps: 5 })];
  const rescaledIn2025 = traded(
    [
      ["2024-12-31", 100],
      ["2025-12-31", 150],
    ],
    [["2025-07-01", 1.3]],
  );
  assert.deepEqual(compute(perClassOnly, rescaledIn2025, yahoo).metrics.pe, [null, 30]);
});

test("a fiscal year the SEC does not have yet is taken from Yahoo", () => {
  const facts = company({
    Revenues: [year("2024-12-31", 100 * B)],
    NetIncomeLoss: [year("2023-12-31", 8 * B), year("2024-12-31", 10 * B)],
    EarningsPerShareDiluted: [year("2024-12-31", 5)],
    StockholdersEquity: [balance("2024-12-31", 50 * B)],
    LongTermDebtNoncurrent: [balance("2024-12-31", 10 * B)],
  });
  const yahoo = [
    yahooYear("2024-12-31", { netIncome: 11 * B, eps: 5.5 }), // the SEC has this year: ignored
    yahooYear("2025-12-31", {
      netIncome: 15 * B,
      eps: 7.5,
      revenue: 120 * B,
      grossProfit: 60 * B,
      operatingIncome: 20 * B,
      pretaxIncome: 20 * B,
      incomeTax: 5 * B,
      debt: 30 * B,
      equity: 60 * B,
    }),
  ];
  const { years, metrics } = compute(facts, traded([["2025-12-31", 150]]), yahoo);

  assert.deepEqual(years, [2023, 2024, 2025]);
  assert.deepEqual(metrics.netIncome, [8 * B, 10 * B, 15 * B]);
  assert.deepEqual(metrics.eps, [null, 5, 7.5]);
  close(metrics.netMargin[2], 0.125);
  close(metrics.debtToEquity[2], 0.5);
  close(metrics.roic[2], 15 / 75); // 20 at 25% tax, on the average of 60 and 90 invested
  close(metrics.pe[2], 20);
  // The SEC years have no gross margin, so Yahoo's own idea of one is not shown beside them.
  assert.equal(metrics.grossMargin[2], null);
});

test("years long out of date at the SEC give way to Yahoo's unbroken run", () => {
  const stale = company({ NetIncomeLoss: [year("2014-12-31", 1 * B), year("2015-12-31", 2 * B)] });
  const yahoo = [yahooYear("2024-12-31", { netIncome: 5 * B }), yahooYear("2025-12-31", { netIncome: 6 * B })];
  const result = compute(stale, null, yahoo);
  assert.deepEqual(result.years, [2024, 2025]);
  assert.deepEqual(result.metrics.netIncome, [5 * B, 6 * B]);
});

// A foreign company (annual report on Form 20-F) whose US-listed share stands for five ordinary shares.
const foreign = (extra: Record<string, Fact[]> = {}) => {
  const facts = company({
    NetIncomeLoss: [year("2024-12-31", 20 * B), year("2025-12-31", 24 * B)],
    EarningsPerShareDiluted: [year("2024-12-31", 1), year("2025-12-31", 1.2)],
    ...extra,
  });
  for (const concept of Object.values(facts.facts["us-gaap"])) {
    for (const fact of concept.units["USD"] ?? concept.units["USD/shares"]) fact.form = "20-F";
  }
  return facts;
};
const fiveToOne = [yahooYear("2024-12-31", { eps: 5.05 }), yahooYear("2025-12-31", { eps: 6 })];
const adsPrices = (rescalings: Prices["rescalings"] = []) =>
  traded(
    [
      ["2024-12-31", 50],
      ["2025-12-31", 60],
    ],
    rescalings,
  );

test("a depositary share's P/E counts how many ordinary shares it stands for", () => {
  // HSBC: EPS per ordinary share, price per five. Yahoo's EPS is per listed share, which gives the five away.
  const { metrics } = compute(foreign(), adsPrices(), fiveToOne);
  assert.deepEqual(metrics.eps, [1, 1.2]);
  close(metrics.pe[0], 10);
  close(metrics.pe[1], 10);
});

test("a depositary share has no P/E unless two years agree on what it stands for", () => {
  const disagree = [yahooYear("2024-12-31", { eps: 4.3 }), yahooYear("2025-12-31", { eps: 6 })];
  assert.deepEqual(compute(foreign(), adsPrices(), disagree).metrics.pe, [null, null]);
  assert.deepEqual(compute(foreign(), adsPrices(), []).metrics.pe, [null, null]);
});

test("a depositary share has no P/E for years before a rescaling its company did not restate for", () => {
  // AstraZeneca, 2026: each listed share went from half an ordinary share to a whole one. To Yahoo that is a
  // 1-for-2 reverse split; to the company nothing happened. What the share stood for before is not known.
  assert.deepEqual(compute(foreign(), adsPrices([["2025-06-02", 0.5]]), fiveToOne).metrics.pe, [null, 10]);
});

test("a depositary share keeps its P/E through a split of the ordinary shares", () => {
  const split = foreign({
    WeightedAverageNumberOfSharesOutstandingBasic: [
      year("2024-12-31", 10e9),
      year("2024-12-31", 20e9, "2026-02-09"),
      year("2025-12-31", 20e9),
    ],
    EarningsPerShareDiluted: [year("2024-12-31", 2), year("2024-12-31", 1, "2026-02-09"), year("2025-12-31", 1.2)],
  });
  // $100 traded on five old shares earning $2 each; then 2-for-1 for both kinds of share.
  const prices = traded(
    [
      ["2024-12-31", 100],
      ["2025-12-31", 60],
    ],
    [["2025-06-02", 2]],
  );
  const { metrics } = compute(split, prices, fiveToOne);
  close(metrics.pe[0], 10);
  close(metrics.pe[1], 10);
});

test("a new year from Yahoo is per listed share; beside SEC years it is turned into ordinary shares", () => {
  const yahoo = [...fiveToOne, yahooYear("2026-12-31", { netIncome: 30 * B, eps: 7.5 })];
  const { years, metrics } = compute(foreign(), traded([["2026-12-31", 75]]), yahoo);
  assert.deepEqual(years, [2024, 2025, 2026]);
  assert.deepEqual(metrics.eps, [1, 1.2, 1.5]);
  close(metrics.pe[2], 10);
});

// Real filings, trimmed to the annual facts compute() reads, with the closes at each year end and, where a test
// uses them, Yahoo's fiscal years and the reporting currency's exchange rate. Expected values are the ones the
// companies reported.
const fixture = (name: string) => {
  const { facts, prices, yahoo, fx } = JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"),
  ) as { facts: CompanyFacts["facts"]; prices: Prices; yahoo?: YahooYear[]; fx?: Prices };
  return { facts, prices, yahoo: yahoo ?? [], fx: fx ?? null };
};
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
  // $610.31 traded at the end of fiscal 2024, on the $11.93 reported before the 10-for-1 split.
  near(at(result, 2024).pe, 610.31 / 11.93, 0.2);

  // The restatement is in the filings themselves: without prices, EPS is the same.
  assert.deepEqual(compute({ facts }, null).metrics.eps, result.metrics.eps);
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

test("Southern Copper: stock dividends, which the company restates for and Yahoo cannot tell from spin-offs", () => {
  const { facts, prices } = fixture("scco");
  const result = compute({ facts }, prices);

  // The 2025 report restated 2023 and 2024 by 2.9% ($3.14 → $3.05, $4.34 → $4.21). Older years get the same.
  assert.equal(at(result, 2024).eps, 4.21);
  assert.equal(at(result, 2023).eps, 3.05);
  near(at(result, 2022).eps, 3.41 / 1.0287, 0.001);
  near(at(result, 2021).eps, 4.39 / 1.0287, 0.001);
  assert.deepEqual(compute({ facts }, null).metrics.eps, result.metrics.eps);

  // P/E is on each year's own footing: $61.33 traded at the end of 2021 on the $4.39 reported then.
  near(at(result, 2021).pe, 61.33 / 4.39, 0.1);
  // A dividend paid in shares after the year end but before the report (February 2026) is not in the report.
  near(at(result, 2025).pe, 143.47 / 5.24, 0.01);
});

test("Procter & Gamble: a June year end, as reported", () => {
  const { facts, prices } = fixture("pg");
  const result = compute({ facts }, prices);
  assert.equal(result.fiscalYearEndMonth, 6);
  assert.deepEqual(result.years, [2022, 2023, 2024, 2025, 2026]);
  assert.deepEqual(result.metrics.netIncome, [14_742e6, 14_653e6, 14_879e6, 15_974e6, 16_046e6]);
  assert.deepEqual(result.metrics.eps, [5.81, 5.9, 6.02, 6.51, 6.62]);

  const fy2024 = at(result, 2024);
  // $84,039M of net sales, $40,848M of cost of products sold.
  near(fy2024.grossMargin, 0.514, 0.0005);
  near(fy2024.netMargin, 0.177, 0.0005);
  // $7,191M due within a year plus $25,269M of long-term debt, against $50,559M of total shareholders' equity.
  near(fy2024.debtToEquity, 32_460 / 50_559, 1e-9);
  near(fy2024.pe, 164.92 / 6.02, 0.01);
});

test("Hasbro: revenue is net revenues, not the segment total, and the loss years have no P/E", () => {
  const { facts, prices } = fixture("has");
  const result = compute({ facts }, prices);
  assert.equal(result.fiscalYearEndMonth, 12);
  assert.deepEqual(result.years, [2021, 2022, 2023, 2024, 2025]);
  assert.deepEqual(result.metrics.netIncome, [428.7e6, 203.5e6, -1_489.3e6, 385.6e6, -322.4e6]);
  assert.deepEqual(result.metrics.eps, [3.1, 1.46, -10.73, 2.75, -2.3]);
  assert.deepEqual(
    result.metrics.pe.map((pe) => pe !== null),
    [true, true, false, true, false],
  );

  const fy2023 = at(result, 2023);
  // A $1,489.3M loss on $5,003.3M of net revenues. The Revenues tag holds $5,710.6M, which counts sales between segments.
  near(fy2023.netMargin, -1_489.3 / 5_003.3, 1e-9);
  // Cost of sales was $1,706.0M. Royalties and program amortization are separate lines.
  near(fy2023.grossMargin, 1 - 1_706 / 5_003.3, 1e-9);
  // $500.0M current portion plus $2,965.8M of long-term debt, against $1,087.0M of total shareholders' equity.
  near(fy2023.debtToEquity, 3_465.8 / 1_087, 1e-9);
  near(at(result, 2024).netMargin, 385.6 / 4_135.5, 1e-9);
  near(at(result, 2024).pe, 56.7 / 2.75, 0.01);
});

test("Visa: EPS is reported per share class only, so it and P/E come from Yahoo", () => {
  const { facts, prices, yahoo } = fixture("v");
  assert.deepEqual(compute({ facts }, prices).metrics.eps, [null, null, null, null, null]);

  const result = compute({ facts }, prices, yahoo);
  assert.deepEqual(result.years, [2022, 2023, 2024, 2025, 2026]);
  assert.equal(at(result, 2024).netIncome, 19_743_000_000); // still the SEC's
  assert.deepEqual(result.metrics.eps, [null, 8.28, 9.73, 10.2, 12.32]); // Yahoo keeps four years
  near(at(result, 2023).pe, 230.01 / 8.28, 0.01);
});

test("TSMC: the newest year comes from Yahoo, and P/E is per depositary share in dollars", () => {
  const { facts, prices, yahoo, fx } = fixture("tsm");
  // The SEC's data stops at 2024, though the 2025 report was filed long ago.
  assert.deepEqual(compute({ facts }, prices).years, [2020, 2021, 2022, 2023, 2024]);

  const result = compute({ facts }, prices, yahoo, fx);
  assert.deepEqual(result.years, [2021, 2022, 2023, 2024, 2025]);
  assert.equal(result.currency, "TWD");
  assert.equal(at(result, 2024).netIncome, 1_158_380_200_000);
  assert.equal(at(result, 2024).eps, 44.67);
  assert.equal(at(result, 2025).netIncome, 1_697_604_000_000);
  // Yahoo's NT$331.25 is per depositary share of five ordinary shares.
  near(at(result, 2025).eps, 66.25, 1e-9);
  near(at(result, 2025).netMargin, 0.446, 0.0005);
  // $197.49 at the end of 2024, on 5 × NT$44.67 at 32.76 to the dollar.
  near(at(result, 2024).pe, 197.49 / ((5 * 44.67) / 32.76), 0.05);
  near(at(result, 2025).pe, 28.7, 0.1);
  // Without the exchange rate there is nothing to compare the price with.
  assert.equal(at(compute({ facts }, prices, yahoo), 2024).pe, null);
});
