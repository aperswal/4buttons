import assert from "node:assert/strict";
import { test } from "node:test";
import { combineFacts } from "./combine-facts.ts";
import { compute, type CompanyFacts, type Fact } from "./compute.ts";

const year = (y: number, val: number): Fact => ({
  start: `${y}-01-01`,
  end: `${y}-12-31`,
  val,
  filed: `${y + 1}-02-15`,
  form: "10-K",
});
const usGaap = (concepts: Record<string, Fact[]>): CompanyFacts => ({
  facts: { "us-gaap": Object.fromEntries(Object.entries(concepts).map(([tag, facts]) => [tag, { units: { USD: facts } }])) },
});

test("a company that moved to a new SEC number keeps the years filed under the old one", () => {
  const predecessor = usGaap({ NetIncomeLoss: [year(2024, 4), year(2025, 5)], Revenues: [year(2025, 50)] });
  const successor = usGaap({ NetIncomeLoss: [year(2026, 6)], GrossProfit: [year(2026, 20)] });
  const combined = combineFacts(successor, predecessor);

  assert.deepEqual(combined.facts["us-gaap"].NetIncomeLoss.units.USD, [year(2026, 6), year(2024, 4), year(2025, 5)]);
  assert.deepEqual(combined.facts["us-gaap"].Revenues.units.USD, [year(2025, 50)]);
  assert.deepEqual(combined.facts["us-gaap"].GrossProfit.units.USD, [year(2026, 20)]);

  const result = compute(combined, null);
  assert.deepEqual(result.years, [2024, 2025, 2026]);
  assert.deepEqual(result.metrics.netIncome, [4, 5, 6]);
});

test("combining leaves both inputs as they were", () => {
  const a = usGaap({ NetIncomeLoss: [year(2025, 5)] });
  const b = usGaap({ NetIncomeLoss: [year(2024, 4)] });
  combineFacts(a, b);
  assert.deepEqual(a, usGaap({ NetIncomeLoss: [year(2025, 5)] }));
  assert.deepEqual(b, usGaap({ NetIncomeLoss: [year(2024, 4)] }));
});
