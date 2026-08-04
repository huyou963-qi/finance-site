import type { FetchIncrementalResult } from "../types";
import { fetchNbsPmiWorkbook, clearNbsPmiCache } from "../nbsPmi/client";
import { nbsPmiInstrument } from "../nbsPmi/catalog";
import { fetchNbsPmiHistory, mergeNbsPmiPoints } from "../nbsPmi/historyClient";
import { parseNbsPmiWorkbook } from "../nbsPmi/parseWorkbook";

function readScrapeConfig(metadata: unknown): {
  fixturePath?: string;
  indexUrl?: string;
  articleUrl?: string;
  workbookUrl?: string;
} {
  if (!metadata || typeof metadata !== "object") return {};
  const scrape = (metadata as Record<string, unknown>).scrape;
  if (!scrape || typeof scrape !== "object") return {};
  const value = scrape as Record<string, unknown>;
  const text = (key: string) =>
    typeof value[key] === "string" ? (value[key] as string) : undefined;
  return {
    fixturePath: text("fixturePath"),
    indexUrl: text("indexUrl"),
    articleUrl: text("articleUrl"),
    workbookUrl: text("workbookUrl"),
  };
}

/** worker 增量：整份官方发布包只抓一次，再按仪器代码取对应列。 */
export async function fetchNbsPmiIncremental(
  metadata: unknown,
  instrumentCode: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  if (!nbsPmiInstrument(instrumentCode)) {
    throw new Error(`国家统计局 PMI：未登记仪器 ${instrumentCode}`);
  }
  const config = readScrapeConfig(metadata);
  const result = await fetchNbsPmiWorkbook(config);
  const parsed = parseNbsPmiWorkbook(result.workbook);
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const needsHistory = !config.fixturePath && start.getUTCFullYear() < 2015;
  const pointsByInstrument = needsHistory
    ? mergeNbsPmiPoints(
        (await fetchNbsPmiHistory()).pointsByInstrument,
        parsed.pointsByInstrument,
      )
    : parsed.pointsByInstrument;
  const points = pointsByInstrument.get(instrumentCode);
  if (!points) throw new Error(`国家统计局 PMI：发布包缺仪器 ${instrumentCode}`);
  return {
    points: points.filter((point) => point.obsDate >= start),
    sourceLatestObsDate: parsed.sourceLatestObsDate,
    skippedInvalid: 0,
  };
}

export { clearNbsPmiCache };
