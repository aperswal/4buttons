import type { MetricKey } from "./compute";

type Format = (value: number, currency: string) => string;

// Typographic minus, so negatives line up with the digits beside them.
const minus = (text: string) => text.replace("-", "−");

const money = (options: Intl.NumberFormatOptions): Format => (value, currency) =>
  minus(
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD",
      ...options,
    }).format(value),
  );

const compactMoney = money({ notation: "compact", minimumSignificantDigits: 3, maximumSignificantDigits: 3 });
const wholeMoney = money({ maximumFractionDigits: 0 });
const perShare = money({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent: Format = (value) => minus(`${(value * 100).toFixed(Math.abs(value) < 1 ? 1 : 0)}%`);
const ratio: Format = (value) => minus(value.toFixed(2));
const multiple: Format = (value) => minus(value.toFixed(Math.abs(value) < 100 ? 1 : 0));

/** `exact` is the unrounded figure, shown on hover where `format` abbreviates. */
export type Metric = { key: MetricKey; label: string; format: Format; exact?: Format };

/** The metrics, in display order. */
export const METRICS: Metric[] = [
  { key: "roic", label: "ROIC", format: percent },
  { key: "netIncome", label: "Net income", format: compactMoney, exact: wholeMoney },
  { key: "eps", label: "EPS", format: perShare },
  { key: "debtToEquity", label: "Debt to equity", format: ratio },
  { key: "grossMargin", label: "Gross margin", format: percent },
  { key: "netMargin", label: "Net margin", format: percent },
  { key: "pe", label: "P/E", format: multiple },
];
