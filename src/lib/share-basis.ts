import type { Fact } from "./compute";

// A change in what one share is, between one annual report and the next: 4 for a 4-for-1 split.
export type Restatement = { from: string; to: string; factor: number }; // the two reports' filing dates

/**
 * Finds stock splits and stock dividends in a company's own annual reports.
 *
 * After a split, the next annual report restates the earlier years it shows. So the same year's share count
 * appears in two successive reports with different values, and the ratio between them is the size of the split.
 * This needs no price data, and it is the company's own statement of what it restated.
 *
 * `shareCounts` and `eps` are full fiscal years as filed in every annual report. Share counts are exact where
 * they exist. Companies with several share classes often tag none, so EPS stands in for those reports.
 */
export function restatements(shareCounts: Fact[], eps: Fact[]): Restatement[] {
  const counts = byReport(shareCounts);
  const earnings = byReport(eps);
  const filings = [...new Set([...counts.keys(), ...earnings.keys()])].sort();

  return filings.slice(1).map((to, i) => {
    const from = filings[i];
    const countRatios = ratios(counts.get(from), counts.get(to));
    if (countRatios.length) return { from, to, factor: tidy(nearestOne(countRatios), 0.005) ?? nearestOne(countRatios) };
    // EPS is rounded to the cent and is restated for many reasons, so it is trusted only for a whole-number split.
    const epsRatios = ratios(earnings.get(to), earnings.get(from));
    return { from, to, factor: tidy(nearestOne(epsRatios), 0.03) ?? 1 };
  });
}

/** How many shares of the latest annual report one share of the report filed on `filed` has become. */
export const sharesSince = (steps: Restatement[], filed: string) =>
  steps.reduce((shares, step) => (step.to > filed ? shares * step.factor : shares), 1);

/**
 * The split, if any, between a fiscal year's end and the day its annual report was filed. That report counts
 * shares the new way, while the year-end price was paid for a share the old way.
 *
 * Yahoo gives the day and size of every rescaling of its prices, but not whether it was a split or a spin-off.
 * The reports say by how much shares were restated, but not on which day. A rescaling in the gap counts as a
 * split when the report's restatement matches it. Null when the two cannot be reconciled.
 */
export function splitBeforeFiling(
  steps: Restatement[],
  rescalings: [date: string, factor: number][],
  yearEnd: string,
  filed: string,
): number | null {
  const rescaled = (after: string, upTo: string) =>
    rescalings.reduce((product, [on, factor]) => (on > after && on <= upTo ? product * factor : product), 1);
  const inGap = rescaled(yearEnd, filed);
  if (inGap === 1) return 1;

  const step = steps.find((s) => s.to === filed);
  if (!step) return null;
  const earlier = rescaled(step.from, yearEnd); // since the previous report, up to the year end
  const restatedBy = (factor: number) => same(step.factor, factor);
  if (restatedBy(earlier * inGap) || restatedBy(inGap)) return inGap;
  if (restatedBy(earlier) || restatedBy(1)) return 1;
  return null;
}

export const same = (a: number, b: number) => Math.abs(a / b - 1) < 0.005;

/** A ratio within `tolerance` of a whole number (or one over a whole number) is that number; otherwise null. */
export function tidy(ratio: number, tolerance: number): number | null {
  const whole = ratio >= 1 ? Math.round(ratio) : 1 / Math.round(1 / ratio);
  if (Math.abs(ratio / whole - 1) >= tolerance) return null;
  // No split is a thousand for one. That is a report switching between counting shares and thousands of shares.
  return whole >= 1000 || whole <= 1 / 1000 ? 1 : whole;
}

// Filing date → fiscal year end → value.
function byReport(facts: Fact[]) {
  const reports = new Map<string, Map<string, number>>();
  for (const { filed, end, val } of facts) {
    if (!reports.has(filed)) reports.set(filed, new Map());
    reports.get(filed)!.set(end, val);
  }
  return reports;
}

// For each year both reports show, how many times larger it is in the later one.
function ratios(earlier: Map<string, number> | undefined, later: Map<string, number> | undefined): number[] {
  return [...(later ?? [])].flatMap(([end, value]) => {
    const ratio = value / (earlier?.get(end) ?? NaN);
    return ratio > 0 && Number.isFinite(ratio) ? [ratio] : [];
  });
}

// A split moves every year two reports share by the same ratio. A figure corrected for another reason moves
// one year only, so of the ratios the one nearest 1 is the split.
const nearestOne = (values: number[]) =>
  values.reduce((best, r) => (Math.abs(Math.log(r)) < Math.abs(Math.log(best)) ? r : best), values[0] ?? 1);
