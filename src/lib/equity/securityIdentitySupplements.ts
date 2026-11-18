/** Verified additions to the dated SEC universe snapshot; never infer issuer identity from a former parent's ticker. */
export const SECURITY_IDENTITY_SUPPLEMENTS = [
  { symbol: "VMRK", name: "Vivmark Residential", cik: "0000906107", exchange: "NYSE", verifiedAt: "2026-11-18",
    sourceUrl: "https://www.sec.gov/edgar/browse/index.html?cik=906107" },
  { symbol: "SKYD", name: "Skydance Corporation", cik: "0002041610", exchange: "NYSE", verifiedAt: "2026-11-18",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/2041610/000204161026000067/R1.htm" },
  { symbol: "VYLR", name: "Vylor Inc.", cik: "0002128626", exchange: "NYSE", verifiedAt: "2026-11-18",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/2128626/000119312526458647/d182384ds3asr.htm" },
] as const;

/** ETF holdings files contain non-stock positions too; retain their snapshots, exclude them from company fundamentals. */
export const NON_STOCK_HOLDINGS = [
  { symbol: "2602335D", kind: "contingent-value-right", cusip: "436CVR021", name: "TPG Inc. (CVR)", verifiedAt: "2026-11-18",
    sourceUrl: "https://www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Print=Y&Ticker=MDEV" },
] as const;
export function isNonStockHolding(symbol: string): boolean {
  return NON_STOCK_HOLDINGS.some(row => row.symbol === symbol.toUpperCase());
}
