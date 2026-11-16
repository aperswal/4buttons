import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChart } from "./prices.ts";

const seconds = (date: string) => Date.parse(`${date}T14:30:00Z`) / 1000;

const chart = (closes: [string, number | null][], splits: [string, number, number][]) => ({
  timestamp: closes.map(([date]) => seconds(date)),
  indicators: { quote: [{ close: closes.map(([, close]) => close) }] as [{ close: (number | null)[] }] },
  events: {
    splits: Object.fromEntries(
      splits.map(([date, numerator, denominator]) => [seconds(date), { date: seconds(date), numerator, denominator }]),
    ),
  },
});

test("splits and reverse splits are kept as ratios, and days with no close are dropped", () => {
  const prices = parseChart(
    chart(
      [
        ["2021-07-30", 100],
        ["2021-08-02", null],
        ["2024-06-10", 120],
      ],
      [
        ["2021-08-02", 1, 8],
        ["2024-06-10", 10, 1],
      ],
    ),
  );
  assert.deepEqual(prices, {
    closes: [
      ["2021-07-30", 100],
      ["2024-06-10", 120],
    ],
    splits: [
      ["2021-08-02", 1 / 8],
      ["2024-06-10", 10],
    ],
  });
});

test("a spin-off is not a split, and closes before it are restored to the price that traded", () => {
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
  const [end2022, end2023, onTheDay] = prices!.closes.map(([, close]) => close);
  assert.ok(Math.abs(end2022 - 52.2 * 1.281 * 1.253) < 1e-9); // $83.79
  assert.ok(Math.abs(end2023 - 101.86 * 1.253) < 1e-9);
  assert.equal(onTheDay, 136);
});

test("a share consolidation quoted over 1000 is still a split", () => {
  const prices = parseChart(chart([["2025-12-08", 60]], [["2025-12-09", 888, 1000]]));
  assert.deepEqual(prices, { closes: [["2025-12-08", 60]], splits: [["2025-12-09", 0.888]] });
});

test("a spin-off with a reverse split on the same day is taken apart", () => {
  // Honeywell, 2026-06-29: a 1-for-2 reverse split and the aerospace spin-off, which Yahoo records as 1907:2000.
  const prices = parseChart(chart([["2026-06-26", 243.53]], [["2026-06-29", 1907, 2000]]));
  assert.deepEqual(prices?.splits, [["2026-06-29", 0.5]]);
  // $232.21 traded that day, which is $464.41 a share after the reverse split.
  assert.ok(Math.abs(prices!.closes[0][1] - 243.53 * 1.907) < 1e-9);
});

test("a chart with no price history is null", () => {
  assert.equal(parseChart(undefined), null);
  assert.equal(parseChart({ indicators: { quote: [{ close: [] }] } }), null);
});
