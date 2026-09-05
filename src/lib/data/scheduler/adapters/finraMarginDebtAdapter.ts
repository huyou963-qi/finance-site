import type { FetchIncrementalResult } from "../types";
import { finraMarginSeriesByProvider } from "../finraMarginDebt/catalog";
import {
  fetchFinraMarginStatisticsWorkbook,
  clearFinraMarginStatisticsCache,
} from "../finraMarginDebt/client";
import { parseFinraMarginStatistics } from "../finraMarginDebt/parseMarginStatistics";

function readScrapeConfig(metadata: unknown): {
  provider?: string;
  url?: string;
  fixturePath?: string;
} {
  if (!metadata || typeof metadata !== "object") return {};
  const scrape = (metadata as Record<string, unknown>).scrape;
  if (!scrape || typeof scrape !== "object") return {};
  const s = scrape as Record<string, unknown>;
  return {
    provider: typeof s.provider === "string" ? s.provider : undefined,
    url: typeof s.url === "string" ? s.url : undefined,
    fixturePath: typeof s.fixturePath === "string" ? s.fixturePath : undefined,
  };
}

/**
 * worker 增量：三条分项共享同一份 FINRA margin-statistics.xlsx（client 内 60s 缓存，
 * 同轮不会重复请求源站），按 scrape.provider 取各自分项列。
 */
export async function fetchFinraMarginDebtIncremental(
  metadata: unknown,
  _instrumentCode: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const { provider, url, fixturePath } = readScrapeConfig(metadata);
  const config = finraMarginSeriesByProvider(provider ?? "");
  if (!config) {
    throw new Error(`FINRA Margin Statistics：未识别 scrape.provider=${provider ?? "无"}`);
  }
  const wb = await fetchFinraMarginStatisticsWorkbook({ url, fixturePath });
  const { pointsBySeries, latestObsDateBySeries, skippedInvalid } =
    parseFinraMarginStatistics(wb);
  const points = pointsBySeries.get(config.seriesKey) ?? [];
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const filtered = points.filter((p) => p.obsDate >= start);
  return {
    points: filtered,
    sourceLatestObsDate: latestObsDateBySeries.get(config.seriesKey) ?? null,
    skippedInvalid,
  };
}

export { clearFinraMarginStatisticsCache };
