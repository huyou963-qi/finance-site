import type { FetchIncrementalResult } from "../types";
import { US_TRADE_PROVIDER } from "../usTradeDetail/catalog";
import { fetchUsTradeDetail } from "../usTradeDetail/client";
import { CENSUS_TRADE_API, fetchCensusPartnerApi } from "../usTradeDetail/api";

export async function fetchUsTradeDetailIncremental(metadata: unknown, instrumentCode: string): Promise<FetchIncrementalResult> {
  const scrape = (metadata as { scrape?: { provider?: string } } | null)?.scrape;
  if (scrape?.provider !== US_TRADE_PROVIDER) throw new Error(`Invalid Census trade routing: ${instrumentCode}`);
  if (/^census_us_trade_(exports|imports)_country_nsa_\d{4}$/.test(instrumentCode) && process.env.CENSUS_API_KEY?.trim()) {
    const points = await fetchCensusPartnerApi(instrumentCode);
    return { points, sourceLatestObsDate: points.at(-1)!.obsDate, skippedInvalid: 0,
      sourceMetadata: { acquisition: "census_authenticated_partner_api", sourceUrl: `${CENSUS_TRADE_API}/${instrumentCode.includes("_exports_") ? "exports" : "imports"}/hs`,
        seasonalAdjustment: "NSA", sourceUnit: "USD", storedUnit: "USD million", revisionWindow: "six calendar months; older revisions require official workbook" } };
  }
  const series = (await fetchUsTradeDetail()).find((row) => row.code === instrumentCode);
  if (!series?.points.length) throw new Error(`Census trade source omitted ${instrumentCode}`);
  return { points: series.points, sourceLatestObsDate: series.points.at(-1)!.obsDate, skippedInvalid: 0 };
}
