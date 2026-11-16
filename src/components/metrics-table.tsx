import type { Fundamentals } from "@/lib/fundamentals";
import { METRICS } from "@/lib/format";

// One column per year; from md up, a leading column for the metric names.
const GRID =
  "grid grid-cols-[repeat(var(--years),minmax(0,1fr))] md:grid-cols-[10rem_repeat(var(--years),minmax(0,1fr))]";
const ROW = `${GRID} border-t border-line px-2 py-2.5 md:px-4`;
const LABEL = "col-span-full px-2 pb-2 text-sm font-medium md:col-span-1 md:self-center md:pb-0";

const years = (count: number) => ({ "--years": count }) as React.CSSProperties;

export function MetricsTable({ data }: { data: Fundamentals }) {
  const latest = data.years.length - 1;

  return (
    <div role="table" aria-label="Annual metrics" style={years(data.years.length)} className="rounded-2xl border border-line bg-surface">
      <div role="row" className={`${GRID} sticky top-0 z-10 rounded-t-2xl bg-surface px-2 py-2.5 md:px-4`}>
        <span className="max-md:hidden" />
        {data.years.map((year, i) => (
          <span
            key={year}
            role="columnheader"
            className={`text-center text-xs tabular-nums ${i === latest ? "font-medium text-ink" : "text-ink-2"}`}
          >
            {year}
          </span>
        ))}
      </div>

      {METRICS.map(({ key, label, format }) => {
        const values = data.metrics[key];
        const present = values.filter((value) => value !== null);
        const top = Math.max(0, ...present);
        const bottom = Math.min(0, ...present);
        const span = top - bottom;
        const zero = span ? (top / span) * 100 : 100; // baseline, % from the top of the plot

        return (
          <div key={key} role="row" className={ROW}>
            <span role="rowheader" className={LABEL}>
              {label}
            </span>
            {values.map((value, i) => (
              <div key={data.years[i]} role="cell">
                <div
                  className={`text-center text-[13px] tabular-nums sm:text-sm ${i === latest ? "font-medium text-ink" : "text-ink-2"}`}
                >
                  {value === null ? "—" : format(value, data.currency)}
                </div>
                <div aria-hidden className="relative mt-1.5 h-9">
                  {value !== null && value !== 0 && (
                    <span
                      className={`absolute left-1/2 w-6 -translate-x-1/2 ${value > 0 ? "rounded-t bg-bar" : "rounded-b bg-bar-loss"}`}
                      style={{
                        [value > 0 ? "bottom" : "top"]: `${value > 0 ? 100 - zero : zero}%`,
                        height: `max(2px, ${(Math.abs(value) / span) * 100}%)`,
                      }}
                    />
                  )}
                  <span className="absolute inset-x-0 h-px bg-axis" style={{ top: `${zero}%` }} />
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

const SKELETON_YEARS = 5;
const SKELETON_BARS = ["40%", "55%", "50%", "75%", "90%"];

/** The table's shape while a company loads: real metric names, placeholder numbers. */
export function MetricsSkeleton() {
  return (
    <div style={years(SKELETON_YEARS)} className="animate-pulse rounded-2xl border border-line bg-surface">
      <div className={`${GRID} px-2 py-2.5 md:px-4`}>
        <span className="max-md:hidden" />
        {SKELETON_BARS.map((_, i) => (
          <span key={i} className="mx-auto h-4 w-8 rounded bg-wash" />
        ))}
      </div>
      {METRICS.map(({ key, label }) => (
        <div key={key} className={ROW}>
          <span className={LABEL}>{label}</span>
          {SKELETON_BARS.map((height, i) => (
            <div key={i}>
              <span className="mx-auto block h-5 w-10 rounded bg-wash" />
              <div className="relative mt-1.5 h-9 border-b border-axis">
                <span className="absolute bottom-0 left-1/2 w-6 -translate-x-1/2 rounded-t bg-wash" style={{ height }} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
