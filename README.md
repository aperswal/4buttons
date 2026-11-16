# Fundamentals

Type a ticker or company name and get five fiscal years of:

| Metric | How it is calculated |
| --- | --- |
| ROIC | Operating income after tax ÷ average of opening and closing (debt + equity) |
| Net income | As reported |
| EPS | Diluted, restated for any later stock splits |
| Debt to equity | Total debt ÷ shareholders' equity |
| Gross margin | Gross profit ÷ revenue |
| Net margin | Net income ÷ revenue |
| P/E | Closing price on the last day of the fiscal year ÷ that year's EPS |

A dash means the figure does not exist or has no meaning for that year (a P/E on a loss, debt to equity on negative equity, gross margin for a bank).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # metric calculations
npm run typecheck
npm run lint
```

Set `SEC_USER_AGENT` to a name and contact email (`"Jane Doe jane@example.com"`). The SEC asks every client to identify itself and may throttle ones that do not.

## Where things are

```
src/lib/compute.ts        raw SEC facts + prices → the seven metrics (pure, tested)
src/lib/fixtures/         real filings (AAPL, NVDA, TSLA) the tests check against
src/lib/sec.ts            SEC EDGAR: ticker list and each company's reported facts
src/lib/tidy-name.ts      company names as people write them, not as the SEC lists them
src/lib/prices.ts         Yahoo: daily closes and splits
src/lib/fundamentals.ts   ties the three together, cached per ticker
src/lib/format.ts         the metric list and how each value is written
src/components/           search box, metrics table
src/app/[ticker]/         the company page
```

## Data

Financials come from the SEC's XBRL company facts, the figures companies file in their annual reports (10-K, 20-F, 40-F). Anything listed in the US is covered. Companies tag the same line item under different names, so `compute.ts` keeps an ordered list of candidates for each; when a company shows a dash where a number should be, the fix is usually one more tag in that list.

Prices come from Yahoo's chart endpoint and are only used for P/E and for restating EPS across splits. If Yahoo is unreachable the page still renders, with P/E blank. P/E is also blank for companies that report in a currency other than the one their US listing trades in.

## Speed

A company page is built on its first visit and served as static HTML for a day after that. The first visitor sees the page frame immediately and the numbers as soon as the SEC responds. The search box downloads the ticker list once and filters it in the browser, so results appear as you type.
