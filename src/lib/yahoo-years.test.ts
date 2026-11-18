import assert from "node:assert/strict";
import { test } from "node:test";
import { parseYahooYears } from "./yahoo-years.ts";

const series = (name: string, points: [asOfDate: string, raw: number][], currencyCode = "JPY") => ({
  meta: { type: [name] },
  [name]: points.map(([asOfDate, raw]) => ({ asOfDate, currencyCode, reportedValue: { raw } })),
});
const response = (...result: ReturnType<typeof series>[]) => ({ timeseries: { result } });

test("each fiscal year gathers its figures from Yahoo's separate series, oldest first", () => {
  const years = parseYahooYears(
    response(
      series("annualNetIncome", [["2025-03-31", 4765], ["2026-03-31", 3848]]),
      series("annualDilutedEPS", [["2026-03-31", 2952.5]]),
      series("annualTotalRevenue", [["2026-03-31", 50000]]),
    ),
  );
  assert.deepEqual(years.map((y) => [y.end, y.currency, y.netIncome, y.eps, y.revenue, y.equity]), [
    ["2025-03-31", "JPY", 4765, null, null, null],
    ["2026-03-31", "JPY", 3848, 2952.5, 50000, null],
  ]);
});

test("debt is borrowings due within a year plus those due later", () => {
  const [year] = parseYahooYears(
    response(series("annualCurrentDebt", [["2025-12-31", 30]]), series("annualLongTermDebt", [["2025-12-31", 70]])),
  );
  assert.equal(year.debt, 100);
});

test("where Yahoo gives no breakdown of the debt, its total stands in; where it does, the total is ignored", () => {
  const [onlyTotal] = parseYahooYears(
    response(series("annualNetIncome", [["2025-12-31", 9]]), series("annualTotalDebt", [["2025-12-31", 60]])),
  );
  assert.equal(onlyTotal.debt, 60);

  const [both] = parseYahooYears(
    response(series("annualLongTermDebt", [["2025-12-31", 70]]), series("annualTotalDebt", [["2025-12-31", 95]])),
  );
  assert.equal(both.debt, 70);
});

test("trailing twelve months to a quarter end, which Yahoo mixes in for some companies, are dropped", () => {
  // Toyota's "annual" EPS as Yahoo serves it.
  const years = parseYahooYears(
    response(
      series("annualDilutedEPS", [["2025-03-31", 3595.6], ["2025-06-30", 3251.3], ["2025-09-30", 3534.8], ["2026-03-31", 2952.5]]),
    ),
  );
  assert.deepEqual(years.map((y) => y.end), ["2025-03-31", "2026-03-31"]);
});

test("gaps in a series and an empty or missing response give no years", () => {
  const withGap = { timeseries: { result: [{ meta: { type: ["annualNetIncome"] }, annualNetIncome: [null] }] } };
  assert.deepEqual(parseYahooYears(withGap), []);
  assert.deepEqual(parseYahooYears({ timeseries: { result: [{ meta: { type: ["annualNetIncome"] } }] } }), []);
  assert.deepEqual(parseYahooYears(null), []);
});
