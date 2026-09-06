import type { FetchIncrementalResult } from "../types";
import { ritterIpoSeriesByProvider } from "../ritterIpo/catalog";
import { fetchRitterIpoWorkbook, clearRitterIpoCache } from "../ritterIpo/client";
import { parseRitterIpoAll } from "../ritterIpo/parseIpoAll";

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
 * worker 增量：四条分项共享同一份 Ritter IPOALL.xlsx（client 内 60s 缓存，
 * 同轮不会重复请求源站），按 scrape.provider 取各自列。
 */
export async function fetchRitterIpoIncremental(
  metadata: unknown,
  _instrumentCode: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const { provider, url, fixturePath } = readScrapeConfig(metadata);
  const config = ritterIpoSeriesByProvider(provider ?? "");
  if (!config) {
    throw new Error(`Ritter IPOALL：未识别 scrape.provider=${provider ?? "无"}`);
  }
  const wb = await fetchRitterIpoWorkbook({ url, fixturePath });
  const { pointsBySeries, latestObsDateBySeries, skippedInvalid } = parseRitterIpoAll(wb);
  const points = pointsBySeries.get(config.seriesKey) ?? [];
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const filtered = points.filter((p) => p.obsDate >= start);
  return {
    points: filtered,
    sourceLatestObsDate: latestObsDateBySeries.get(config.seriesKey) ?? null,
    skippedInvalid,
  };
}

export { clearRitterIpoCache };
