import type { FetchIncrementalResult } from "../types";
import { cboeIndexSeriesByProvider } from "../cboeIndices/catalog";
import { fetchCboeIndexCsv, clearCboeIndexCache } from "../cboeIndices/client";
import { parseCboeIndexCsv } from "../cboeIndices/parseCboeIndexCsv";

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

/** worker 增量：抓取 CBOE VIX9D/VVIX CSV，过滤到 obsStart 之后 */
export async function fetchCboeIndicesIncremental(
  metadata: unknown,
  _instrumentCode: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const { provider, url, fixturePath } = readScrapeConfig(metadata);
  const config = cboeIndexSeriesByProvider(provider ?? "");
  if (!config) {
    throw new Error(`CBOE 指数：未识别 scrape.provider=${provider ?? "无"}`);
  }
  const text = await fetchCboeIndexCsv(config.seriesKey, {
    url: url ?? config.csvUrl,
    fixturePath,
  });
  const { points, latestObsDate, skippedInvalid } = parseCboeIndexCsv(text, config);
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const filtered = points.filter((p) => p.obsDate >= start);
  return { points: filtered, sourceLatestObsDate: latestObsDate, skippedInvalid };
}

export { clearCboeIndexCache };
