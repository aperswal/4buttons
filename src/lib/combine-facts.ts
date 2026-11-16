import type { CompanyFacts } from "./compute";

/**
 * One company's facts filed under two SEC numbers, as a single history.
 * Every fact from both is kept; compute() already takes the newest filing for each period.
 */
export function combineFacts(a: CompanyFacts, b: CompanyFacts): CompanyFacts {
  const facts: CompanyFacts["facts"] = {};
  for (const source of [a, b]) {
    for (const [taxonomy, concepts] of Object.entries(source.facts)) {
      for (const [tag, concept] of Object.entries(concepts)) {
        const units = ((facts[taxonomy] ??= {})[tag] ??= { units: {} }).units;
        for (const [unit, reported] of Object.entries(concept.units)) {
          units[unit] = [...(units[unit] ?? []), ...reported];
        }
      }
    }
  }
  return { facts };
}
