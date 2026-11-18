import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChart } from "./prices.ts";

const seconds = (date: string) => Date.parse(`${date}T14:30:00Z`) / 1000;

const chart = (closes: [string, number | null][], splits: [string, number, number][]) => ({
  meta: { currency: "USD" },
  timestamp: closes.map(([date]) => seconds(date)),
  indicators: { quote: [{ close: closes.map(([, close]) => close) }] as [{ close: (number | null)[] }] },
  events: {
    splits: Object.fromEntries(
      splits.map(([date, numerator, denominator]) => [seconds(date), { date: seconds(date), numerator, denominator }]),
    ),
  },
});

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("closes are restored to the price that traded, and days with no close are dropped", () => {
  // Yahoo divides every close before a 10-for-1 split by ten.
  const prices = parseChart(
    chart(
      [
        ["2024-06-07", 120.9],
        ["2024-06-08", null],
        ["2024-06-10", 121.8],
      ],
      [["2024-06-10", 10, 1]],
    ),
  );
  assert.deepEqual(prices, {
    currency: "USD",
    closes: [
      ["2024-06-07", 1209],
      ["2024-06-10", 121.8],
    ],
    rescalings: [["2024-06-10", 10]],
    splits: [["2024-06-10", 10]],
  });
});

test("splits and reverse splits are both rescalings and splits, oldest first", () => {
  const prices = parseChart(
    chart(
      [["2021-07-30", 100]],
      [
        ["2024-06-10", 10, 1],
        ["2021-08-02", 1, 8],
      ],
    ),
  );
  assert.deepEqual(prices?.splits, [
    ["2021-08-02", 1 / 8],
    ["2024-06-10", 10],
  ]);
  assert.deepEqual(prices?.rescalings, prices?.splits);
  near(prices!.closes[0][1], 125); // 100 × ⅛ × 10
});

test("a spin-off is a rescaling but not a split", () => {
  // GE: Yahoo scales closes down for the GE HealthCare (1281:1000) and GE Vernova (1253:1000) spin-offs.
  const prices = parseChart(
    chart(
      [
        ["2022-12-30", 52.2],
        ["2023-12-29", 101.86],
        ["2024-04-02", 136],
      ],
      [
        ["2023-01-04", 1281, 1000],
        ["2024-04-02", 1253, 1000],
      ],
    ),
  );
  assert.deepEqual(prices?.splits, []);
  assert.deepEqual(prices?.rescalings, [
    ["2023-01-04", 1.281],
    ["2024-04-02", 1.253],
  ]);
  const [end2022, end2023, onTheDay] = prices!.closes.map(([, close]) => close);
  near(end2022, 52.2 * 1.281 * 1.253); // $83.79
  near(end2023, 101.86 * 1.253);
  assert.equal(onTheDay, 136);
});

test("a share consolidation quoted over 1000 is still a split", () => {
  const prices = parseChart(chart([["2025-12-08", 60]], [["2025-12-09", 888, 1000]]));
  assert.deepEqual(prices?.splits, [["2025-12-09", 0.888]]);
});

test("a spin-off with a reverse split on the same day: only the reverse split is a split", () => {
  // Honeywell, 2026-06-29: a 1-for-2 reverse split and the aerospace spin-off, which Yahoo records as 1907:2000.
  const prices = parseChart(chart([["2026-06-26", 243.53]], [["2026-06-29", 1907, 2000]]));
  assert.deepEqual(prices?.splits, [["2026-06-29", 0.5]]);
  assert.deepEqual(prices?.rescalings, [["2026-06-29", 0.9535]]);
  near(prices!.closes[0][1], 243.53 * 0.9535); // $232.21 traded that day
});

test("the currency is the chart's", () => {
  const twdPerDollar = { ...chart([["2025-12-31", 31.24]], []), meta: { currency: "TWD" } };
  assert.equal(parseChart(twdPerDollar)?.currency, "TWD");
});

test("the company's name comes with its prices, for tickers the SEC does not list", () => {
  const named = { ...chart([["2025-12-31", 90]], []), meta: { currency: "USD", longName: "Nestlé S.A.", shortName: "NESTLE SA" } };
  assert.equal(parseChart(named)?.name, "Nestlé S.A.");
  assert.equal(parseChart(chart([["2025-12-31", 90]], []))?.name, undefined);
});

test("a chart with no price history is null", () => {
  assert.equal(parseChart(undefined), null);
  assert.equal(parseChart({ indicators: { quote: [{ close: [] }] } }), null);
});
