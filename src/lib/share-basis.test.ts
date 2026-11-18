import assert from "node:assert/strict";
import { test } from "node:test";
import type { Fact } from "./compute.ts";
import { restatements, sharesSince, splitBeforeFiling } from "./share-basis.ts";

/** Fiscal year `y` as shown in the annual report for fiscal year `report` (filed the following February). */
const shown = (y: number, report: number, val: number): Fact => ({
  start: `${y}-01-01`,
  end: `${y}-12-31`,
  val,
  filed: `${report + 1}-02-15`,
  form: "10-K",
});
const factors = (shareCounts: Fact[], eps: Fact[] = []) => restatements(shareCounts, eps).map((step) => step.factor);

test("a split is the ratio between one year's share count in two successive reports", () => {
  // Nvidia's 4-for-1 in 2021 and 10-for-1 in 2024, in millions of shares.
  const steps = restatements(
    [
      shown(2020, 2020, 617), shown(2020, 2021, 2467),
      shown(2021, 2021, 2496), shown(2021, 2022, 2496),
      shown(2022, 2022, 2487), shown(2022, 2023, 2487),
      shown(2023, 2023, 2469), shown(2023, 2024, 24690),
      shown(2024, 2024, 24555),
    ],
    [],
  );
  assert.deepEqual(steps.map((s) => s.factor), [4, 1, 1, 10]); // 2467 ÷ 617 is 3.998: counts are rounded
  assert.deepEqual(steps[3], { from: "2024-02-15", to: "2025-02-15", factor: 10 });

  assert.equal(sharesSince(steps, "2021-02-15"), 40);
  assert.equal(sharesSince(steps, "2023-02-15"), 10);
  assert.equal(sharesSince(steps, "2025-02-15"), 1);
});

test("a stock dividend or a consolidation keeps its exact ratio", () => {
  assert.deepEqual(factors([shown(2024, 2024, 780.4), shown(2024, 2025, 802.9)]), [802.9 / 780.4]);
  assert.deepEqual(factors([shown(2024, 2024, 900), shown(2024, 2025, 800)]), [8 / 9]);
});

test("one year's count corrected is not a split: a split moves every year the two reports share", () => {
  // General Electric restated 2022 from 1,101 to 1,096 million and left 2021 alone.
  const counts = [shown(2021, 2022, 1098), shown(2021, 2023, 1098), shown(2022, 2022, 1101), shown(2022, 2023, 1096)];
  assert.deepEqual(factors(counts), [1]);
});

test("a count restated by a fraction of a percent is not a split", () => {
  assert.deepEqual(factors([shown(2024, 2024, 1000), shown(2024, 2025, 1003)]), [1]);
});

test("a report that goes from counting shares to counting thousands of shares has not split", () => {
  assert.deepEqual(factors([shown(2024, 2024, 1_400_000), shown(2024, 2025, 1_400)]), [1]);
  assert.deepEqual(factors([shown(2024, 2024, 1_400), shown(2024, 2025, 1_400_000)]), [1]);
});

test("without share counts, restated EPS shows a whole-number split and nothing subtler", () => {
  // Alphabet tagged no share counts before 2025; its 20-for-1 split shows as $112.20 becoming $5.61.
  const split = [shown(2021, 2021, 112.2), shown(2021, 2022, 5.61), shown(2022, 2022, 4.56)];
  assert.deepEqual(factors([], split), [20]);
  // EPS that moved 3% may be a stock dividend or an accounting change. It is left alone.
  assert.deepEqual(factors([], [shown(2021, 2021, 6.16), shown(2021, 2022, 6.0)]), [1]);
  // A loss restated into a profit is no ratio at all.
  assert.deepEqual(factors([], [shown(2021, 2021, -0.05), shown(2021, 2022, 0.05)]), [1]);
});

test("share counts are believed over EPS when a pair of reports has both", () => {
  const counts = [shown(2023, 2023, 2507), shown(2023, 2024, 25070)];
  const eps = [shown(2023, 2023, 1.74), shown(2023, 2024, 0.17)]; // 10.2, by rounding
  assert.deepEqual(factors(counts, eps), [10]);
});

// Southern Copper's 2025 report, filed 2026-02-27, restated shares by 2.87%. Yahoo rescaled its prices four
// times between that report and the one before, the last time after the year had ended.
const report2025 = [{ from: "2025-03-03", to: "2026-02-27", factor: 1.0287 }];
const stockDividends: [string, number][] = [
  ["2025-05-02", 1.009],
  ["2025-08-15", 1.01],
  ["2025-11-12", 1.008],
  ["2026-02-10", 1.008],
];

test("a rescaling after the year end that the report's restatement does not include was not a split by then", () => {
  // 2.87% is the three rescalings during 2025 (2.72%), not all four (3.55%).
  assert.equal(splitBeforeFiling(report2025, stockDividends, "2025-12-31", "2026-02-27"), 1);
});

test("a rescaling after the year end that the report's restatement includes is a split", () => {
  const walmart = [{ from: "2023-03-17", to: "2024-03-15", factor: 3 }];
  assert.equal(splitBeforeFiling(walmart, [["2024-02-26", 3]], "2024-01-31", "2024-03-15"), 3);
  // With an earlier spin-off in the same year, which no report restates for.
  const both: [string, number][] = [["2023-06-01", 1.2], ["2024-02-26", 3]];
  assert.equal(splitBeforeFiling(walmart, both, "2024-01-31", "2024-03-15"), 3);
});

test("no rescaling between the year end and the filing means no split, whatever the reports say", () => {
  assert.equal(splitBeforeFiling(report2025, stockDividends.slice(0, 3), "2025-12-31", "2026-02-27"), 1);
  assert.equal(splitBeforeFiling([], [], "2025-12-31", "2026-02-27"), 1);
});

test("a rescaling before the filing is unexplained when the restatement fits neither reading, or there is none", () => {
  const halved = [{ from: "2025-02-14", to: "2026-02-13", factor: 0.5 }];
  assert.equal(splitBeforeFiling(halved, [["2026-01-20", 0.9535]], "2025-12-31", "2026-02-13"), null);
  assert.equal(splitBeforeFiling([], [["2026-01-20", 2]], "2025-12-31", "2026-02-13"), null);
});
