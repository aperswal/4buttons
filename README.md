# Fundamentals

Type a ticker or company name and get five fiscal years of:

| Metric | How it is calculated |
| --- | --- |
| ROIC | Operating income after tax ÷ average of opening and closing (debt + equity) |
| Net income | As reported |
| EPS | Diluted, restated for any later stock splits and stock dividends |
| Debt to equity | Total debt ÷ shareholders' equity |
| Gross margin | Gross profit ÷ revenue |
| Net margin | Net income ÷ revenue |
| P/E | The price that traded on the last day of the fiscal year ÷ that year's EPS |

A dash means the figure does not exist or has no meaning for that year (a P/E on a loss, debt to equity on negative equity, gross margin for a bank).

Years are labelled by the calendar year the fiscal year ends in.

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
src/lib/tags.ts           the names companies file each line item under
src/lib/share-basis.ts    finds splits and stock dividends in a company's own reports
src/lib/sec.ts            SEC EDGAR: ticker list and each company's reported facts
src/lib/prices.ts         Yahoo: the price that traded each day, and exchange rates
src/lib/yahoo-years.ts    Yahoo's annual figures, used only where the SEC has none
src/lib/fundamentals.ts   ties them together, cached per ticker
src/lib/fixtures/         real filings the tests check against
src/lib/format.ts         the metric list and how each value is written
src/components/           search box, metrics table
src/app/[ticker]/         the company page
```

## Data

Financials come from the SEC's XBRL company facts, the figures companies file in their annual reports (10-K, 20-F, 40-F). Anything listed in the US is covered. Companies tag the same line item under different names, so `tags.ts` keeps an ordered list of candidates for each; when a company shows a dash where a number should be, the fix is usually one more name in that list.

EPS is restated from the filings themselves. After a split, a company's next annual report restates the share counts of the earlier years it shows, and the ratio between the two reports is the size of the split. No price data is involved.

Yahoo supplies three things, and the page renders without any of them:

- **Prices**, for P/E. P/E uses the price that actually traded at the fiscal year end and the EPS for a share as it was that day, so later splits and spin-offs cancel out.
- **Exchange rates**, for the P/E of a company that reports in a currency other than the one its US shares trade in.
- **Annual figures the SEC's data lacks**: EPS for companies that report it per share class only (Visa, Berkshire Hathaway), and fiscal years the SEC has not published yet (some foreign filers run a year behind). Yahoo never replaces an SEC figure. Its EPS also shows how many ordinary shares a foreign company's US-listed share stands for, which P/E needs.

Where a P/E cannot be put on a known basis it is left blank, not guessed.

## Speed

A company page is built on its first visit and served as static HTML for a day after that. The first visitor sees the page frame immediately and the numbers as soon as the SEC responds. The search box downloads the ticker list once and filters it in the browser, so results appear as you type, and the highlighted result is fetched before it is opened.
