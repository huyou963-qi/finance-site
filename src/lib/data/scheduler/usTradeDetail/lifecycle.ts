/** Reviewed Census identities; evidence: foreign-trade/balance/cNNNN.html.
 * Missing current API rows alone are NEVER grounds for adding a cutoff. */
export const US_TRADE_COUNTRY_END_PERIODS: Readonly<Record<string, string>> = {
  "2771": "2011-04-01", // Netherlands Antilles
  "4350": "1992-12-01", // Czechoslovakia
  "4610": "1992-12-01", // USSR
  "4790": "1992-06-01", // Former Yugoslavia
  "4799": "2006-12-01", // Serbia and Montenegro
  "4802": "2008-12-01", // Historic Serbia, not current4801
  "7320": "2011-07-01", // Historic Sudan, not current7321
};

export function isHistoricalCensusSeries(code: string | null): boolean {
  const id = code && /^census_us_trade_(?:exports|imports)_country_nsa_(\d{4})$/.exec(code)?.[1];
  return Boolean(id && US_TRADE_COUNTRY_END_PERIODS[id]);
}
