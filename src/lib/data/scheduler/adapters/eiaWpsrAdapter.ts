import type { FetchIncrementalResult } from "../types";
import {
  EIA_WPSR_PROVIDER,
  findEiaWpsrSeriesByCode,
} from "../eiaWpsr/catalog";
import { fetchEiaWpsrWorkbook, clearEiaWpsrCache } from "../eiaWpsr/client";
import { parseEiaWpsrWorkbook } from "../eiaWpsr/parseWorkbook";

function scrapeConfig(metadata: unknown): {
  provider?: string;
  seriesId?: string;
  url?: string;
  fixturePath?: string;
} {
  if (!metadata || typeof metadata !== "object") return {};
  const scrape = (metadata as Record<string, unknown>).scrape;
  if (!scrape || typeof scrape !== "object") return {};
  const row = scrape as Record<string, unknown>;
  return {
    provider: typeof row.provider === "string" ? row.provider : undefined,
    seriesId: typeof row.seriesId === "string" ? row.seriesId : undefined,
    url: typeof row.url === "string" ? row.url : undefined,
    fixturePath: typeof row.fixturePath === "string" ? row.fixturePath : undefined,
  };
}

export async function fetchEiaWpsrIncremental(
  metadata: unknown,
  instrumentCode: string,
  _obsStart: string,
): Promise<FetchIncrementalResult> {
  const series = findEiaWpsrSeriesByCode(instrumentCode);
  const config = scrapeConfig(metadata);
  if (
    !series ||
    config.provider !== EIA_WPSR_PROVIDER ||
    config.seriesId !== series.sourceSeriesKey
  ) {
    throw new Error(`EIA WPSR worker 分发配置不匹配：${instrumentCode}`);
  }

  const workbook = await fetchEiaWpsrWorkbook(series.sourceSeriesKey, {
    url: config.url,
    fixturePath: config.fixturePath,
  });
  const parsed = parseEiaWpsrWorkbook(workbook, series);
  return {
    // EIA 的历史工作簿会回写修订；每次返回整表，交给统一 upsert 比较 changed，
    // 避免只抓最近窗口而漏掉较早的官方修订。
    points: parsed.points,
    sourceLatestObsDate: parsed.latestObsDate,
    skippedInvalid: parsed.skippedInvalid,
  };
}

export { clearEiaWpsrCache };
