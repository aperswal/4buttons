// The names companies file each line item under.
//
// Companies tag the same line item differently, so each one is a list of candidates in order of preference:
// US GAAP names first, then IFRS. When a company shows a dash where it plainly reports a figure, the fix is
// usually one more name here.

export const TAGS = {
  // "Revenues" is the total when a company reports it. The contract-revenue tags can be a part of it
  // (Walmart's excludes membership fees) or a gross figure before rebates (Mastercard's).
  revenue: [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    "RevenuesNetOfInterestExpense",
    "Revenue",
  ],
  // IFRS filers that tag no total. For a bank this is only its fees, so it is not used beside net interest income.
  revenueFromCustomers: ["RevenueFromSaleOfGoods", "RevenueFromContractsWithCustomers"],
  netInterestIncome: ["InterestRevenueExpense"],
  // Everything between revenue and operating income, as one line.
  totalCosts: ["CostsAndExpenses"],
  costOfRevenue: [
    "CostOfRevenue",
    "CostOfGoodsAndServicesSold",
    "CostOfGoodsSold",
    "CostOfSales",
    "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization",
  ],
  // An insurer's main cost is claims, which it does not tag as cost of revenue, so it has no gross margin.
  insuranceClaims: ["PolicyholderBenefitsAndClaimsIncurredNet", "PolicyholderBenefitsAndClaimsIncurredHealthCare"],
  grossProfit: ["GrossProfit"],
  netIncome: [
    "NetIncomeLoss",
    "ProfitLossAttributableToOwnersOfParent",
    "ProfitLoss",
    "NetIncomeLossAvailableToCommonStockholdersBasic",
  ],
  eps: [
    "EarningsPerShareDiluted",
    "IncomeLossFromContinuingOperationsPerDilutedShare",
    "DilutedEarningsLossPerShare",
    "EarningsPerShareBasicAndDiluted",
    "EarningsPerShareBasic",
    "BasicEarningsLossPerShare",
    "DilutedEarningsLossPerShareFromContinuingOperations",
    "BasicAndDilutedEarningsLossPerShare",
    "BasicEarningsLossPerShareFromContinuingOperations",
    // Partnerships report per unit.
    "NetIncomeLossNetOfTaxPerOutstandingLimitedPartnershipUnitDiluted",
    "IncomeLossFromContinuingOperationsNetOfTaxPerOutstandingLimitedPartnershipUnitDiluted",
  ],
  // Basic before diluted: a diluted count is also restated when the accounting for convertibles changes.
  shareCount: [
    "WeightedAverageNumberOfSharesOutstandingBasic",
    "WeightedAverageShares",
    "WeightedAverageNumberOfDilutedSharesOutstanding",
    "AdjustedWeightedAverageShares",
    "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
    "WeightedAverageLimitedPartnershipUnitsOutstandingDiluted",
  ],
  operatingIncome: ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
  pretaxIncome: [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    "ProfitLossBeforeTax",
  ],
  // Some companies give pre-tax income only in the tax note, split into what was earned at home and abroad.
  pretaxIncomeDomestic: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic"],
  pretaxIncomeForeign: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesForeign"],
  incomeTax: ["IncomeTaxExpenseBenefit", "IncomeTaxExpenseContinuingOperations"],
  interestExpense: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "FinanceCosts"],
  equity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    "EquityAttributableToOwnersOfParent",
    "Equity",
    "PartnersCapital",
  ],
  // Long-term debt as a single balance-sheet line.
  debtNoncurrent: ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations", "LongtermBorrowings"],
  // Long-term debt listed kind by kind. These are added together.
  debtNoncurrentKinds: [
    "LongTermNotesPayable",
    "SeniorLongTermNotes",
    "ConvertibleDebtNoncurrent",
    "ConvertibleNotesPayableNoncurrent",
    "LongTermLoansFromBank",
    "NoncurrentPortionOfNoncurrentBondsIssued",
  ],
  debtCurrentPortion: [
    "LongTermDebtCurrent",
    "LongTermDebtAndCapitalLeaseObligationsCurrent",
    "ConvertibleDebtCurrent",
    "SeniorNotesCurrent",
  ],
  debtShortTerm: ["ShortTermBorrowings", "OtherShortTermBorrowings", "CommercialPaper", "ShorttermBorrowings"],
  // Everything due within a year: short-term borrowings plus the current portion of long-term debt.
  debtDueWithinYear: ["DebtCurrent", "CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings"],
  // Long-term debt including its current portion.
  debtLongTermTotal: ["LongTermDebt", "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities", "Borrowings"],
} satisfies Record<string, string[]>;
