import type { FetchIncrementalResult } from "../types";
import { fetchShillerCapePage, clearShillerCapeCache } from "../shillerCape/client";
import { parseShillerCapePage } from "../shillerCape/parseCapePage";

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

/** worker 增量：抓取 multpl.com Shiller CAPE 月度历史表，过滤到 obsStart 之后 */
export async function fetchShillerCapeIncremental(
  metadata: unknown,
  _instrumentCode: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const { url, fixturePath } = readScrapeConfig(metadata);
  const html = await fetchShillerCapePage({ url, fixturePath });
  const { points, latestObsDate, skippedInvalid } = parseShillerCapePage(html);
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const filtered = points.filter((p) => p.obsDate >= start);
  return { points: filtered, sourceLatestObsDate: latestObsDate, skippedInvalid };
}

export { clearShillerCapeCache };
