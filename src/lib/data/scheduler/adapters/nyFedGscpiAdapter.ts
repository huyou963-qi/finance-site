import type { FetchIncrementalResult } from "../types";
import {
  fetchNyFedGscpiWorkbook,
  clearNyFedGscpiCache,
} from "../nyFedGscpi/client";
import { parseGscpiWorkbook } from "../nyFedGscpi/parseGscpiWorkbook";

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

/** worker 增量：抓取 NY Fed gscpi_data.xlsx → GSCPI 月度序列，过滤到 obsStart 之后 */
export async function fetchNyFedGscpiIncremental(
  metadata: unknown,
  _instrumentCode: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const { url, fixturePath } = readScrapeConfig(metadata);
  const wb = await fetchNyFedGscpiWorkbook({ url, fixturePath });
  const { points, latestObsDate, skippedInvalid } = parseGscpiWorkbook(wb);
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const filtered = points.filter((p) => p.obsDate >= start);
  return { points: filtered, sourceLatestObsDate: latestObsDate, skippedInvalid };
}

export { clearNyFedGscpiCache };
