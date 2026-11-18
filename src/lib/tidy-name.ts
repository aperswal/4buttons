const KEEP_UPPERCASE = new Set([
  ...["PLC", "LLC", "LP", "NV", "SA", "AG", "SE", "AB", "ADR", "ETF", "USA", "US", "II", "III", "IV"],
  ...["ASML", "HSBC", "SAP", "UBS", "UFJ", "CVS", "BP", "HP", "KKR", "RTX", "TJX", "CSX", "PNC", "BHP", "ING", "KLA", "SPDR"],
]);
const LOWERCASE = new Set(["OF", "AND", "THE", "FOR", "DE"]);
const SPELLING: Record<string, string> = {
  JPMORGAN: "JPMorgan",
  UNITEDHEALTH: "UnitedHealth",
  ASTRAZENECA: "AstraZeneca",
};

// The SEC lists many names in capitals, some with a registration suffix ("COSTCO WHOLESALE CORP /NEW").
export function tidyName(raw: string): string {
  const name = raw.replace(/\s*[/\\]\s*[A-Za-z]{0,3}\s*[/\\]?\s*$/, "");
  // In a name already written normally, a short run of capitals is an acronym or a brand (GE Vernova, MSCI Inc.);
  // a long one is a word the SEC left in capitals ("PROCTER & GAMBLE Co").
  const writtenNormally = /[a-z]/.test(name);
  return name.replace(/[A-Z][A-Z']*/g, (word, offset: number) => {
    const partOfAbbreviation =
      word.length <= 2 && (name[offset - 1] === "&" || name[offset + word.length] === "&");
    if (KEEP_UPPERCASE.has(word) || partOfAbbreviation) return word;
    if (writtenNormally && word.length < 6) return word;
    if (LOWERCASE.has(word) && offset > 0) return word.toLowerCase();
    return SPELLING[word] ?? word[0] + word.slice(1).toLowerCase();
  });
}
