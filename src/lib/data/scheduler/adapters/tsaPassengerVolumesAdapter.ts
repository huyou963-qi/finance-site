import type { FetchIncrementalResult, ObservationPoint } from "../types";
import {
  fetchTsaPassengerVolumesPage,
  clearTsaPassengerVolumesCache,
} from "../tsaPassengerVolumes/client";
import { parseTsaPassengerVolumesPage } from "../tsaPassengerVolumes/parsePassengerVolumes";

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

/**
 * worker 增量：抓取 TSA 当年滚动窗口页面（+跨年时补抓上一年归档页），
 * 过滤到 obsStart 之后。
 */
export async function fetchTsaPassengerVolumesIncremental(
  metadata: unknown,
  _instrumentCode: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const { url, fixturePath } = readScrapeConfig(metadata);
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const startYear = Number(obsStart.slice(0, 4)) || currentYear;

  const allPoints: ObservationPoint[] = [];
  let latestObsDate: Date | null = null;
  let skippedInvalid = 0;

  // 通常增量只需当年页面；跨年边界（obsStart 落在去年）时补抓上一年归档页。
  const years = Array.from(
    { length: Math.max(1, currentYear - startYear + 1) },
    (_, i) => startYear + i,
  );

  for (const year of years) {
    const html = await fetchTsaPassengerVolumesPage(year, currentYear, {
      url: year === currentYear ? url : undefined,
      fixturePath,
    });
    const parsed = parseTsaPassengerVolumesPage(html);
    allPoints.push(...parsed.points);
    if (parsed.latestObsDate && (!latestObsDate || parsed.latestObsDate > latestObsDate)) {
      latestObsDate = parsed.latestObsDate;
    }
    skippedInvalid += parsed.skippedInvalid;
  }

  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const filtered = allPoints.filter((p) => p.obsDate >= start);
  return { points: filtered, sourceLatestObsDate: latestObsDate, skippedInvalid };
}

export { clearTsaPassengerVolumesCache };
