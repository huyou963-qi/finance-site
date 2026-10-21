import type { FetchIncrementalResult } from "../types";
import { CENSUS_TRADE_API, fetchCensusPartnerApi } from "./api";
import { fetchUsTradeDetailSeries } from "./client";
import { US_TRADE_FILES } from "./catalog";
import { isHistoricalCensusSeries } from "./lifecycle";

/** Reuse the same NSA adapter/parser/writer. Only transport failure permits a
 * file fallback; missing partners, authentication and schema errors stay errors. */
export function createCensusPartnerAcquirer(deps = {
  api: fetchCensusPartnerApi, workbook: fetchUsTradeDetailSeries, now: Date.now,
}) {
  const networkCooldown = new Map<string, number>();
  return async (code: string): Promise<FetchIncrementalResult> => {
    const match = /^census_us_trade_(exports|imports)_country_nsa_\d{4}$/.exec(code);
    if (!match || isHistoricalCensusSeries(code) || Number(code.slice(-4)) < 1000 || Number(code.slice(-4)) >= 8000) {
      throw new Error("Census partner acquisition requires active NSA partner identity");
    }
    const side = match[1]!;
    const until = networkCooldown.get(side) ?? 0;
    if (deps.now() >= until) {
      try {
        const points = await deps.api(code);
        networkCooldown.delete(side);
        return { points, sourceLatestObsDate: points.at(-1)!.obsDate, skippedInvalid: 0,
          sourceMetadata: { acquisition: "census_authenticated_partner_api",
            sourceUrl: `${CENSUS_TRADE_API}/${side}/hs`, seasonalAdjustment: "NSA",
            sourceUnit: "USD", storedUnit: "USD million", revisionWindow: "six calendar months; older revisions require official workbook" } };
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "Census partner API network request failed after 2 attempts") throw error;
        // A package shares one API request per side. Do not repeat two 30s
        // timeouts for every partner while the official workbook is available.
        networkCooldown.set(side, deps.now() + 120_000);
      }
    }
    const series = await deps.workbook(code);
    if (!series?.points.length || series.seasonalAdjustment !== "NSA" || series.code !== code) {
      throw new Error(`Census NSA workbook fallback missing or mismatched identity: ${code}`);
    }
    return { points: series.points, sourceLatestObsDate: series.points.at(-1)!.obsDate, skippedInvalid: 0,
      sourceMetadata: { acquisition: "census_official_nsa_workbook_after_api_network_failure",
        sourceUrl: US_TRADE_FILES.countriesNsa, seasonalAdjustment: "NSA",
        sourceUnit: "USD million", storedUnit: "USD million",
        fallbackReason: "Census partner API network request failed after 2 attempts",
        apiRetryCooldownSeconds: 120 } };
  };
}

export const acquireCensusPartner = createCensusPartnerAcquirer();
