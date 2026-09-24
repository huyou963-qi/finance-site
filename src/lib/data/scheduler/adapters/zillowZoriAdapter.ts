import type { FetchIncrementalResult } from "../types";
import { clearZillowZoriCache, fetchZillowZoriCsv } from "../zillowZori/client";
import { parseZoriCsv } from "../zillowZori/parseZoriCsv";

function readScrapeConfig(metadata: unknown): { url?: string; fixturePath?: string } {
  if (!metadata || typeof metadata !== "object") return {};
  const scrape = (metadata as Record<string, unknown>).scrape;
  if (!scrape || typeof scrape !== "object") return {};
  const s = scrape as Record<string, unknown>;
  return {
    url: typeof s.url === "string" ? s.url : undefined,
    fixturePath: typeof s.fixturePath === "string" ? s.fixturePath : undefined,
  };
}

/** worker 增量：抓取 ZORI CSV → 全美月度序列，过滤到 obsStart 之后 */
export async function fetchZillowZoriIncremental(
  metadata: unknown,
  _instrumentCode: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const { url, fixturePath } = readScrapeConfig(metadata);
  const text = await fetchZillowZoriCsv({ url, fixturePath });
  const { points, latestObsDate, skippedInvalid } = parseZoriCsv(text);
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  return {
    points: points.filter((p) => p.obsDate >= start),
    sourceLatestObsDate: latestObsDate,
    skippedInvalid,
  };
}

export { clearZillowZoriCache };
