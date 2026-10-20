import type { FetchIncrementalResult } from "../types";
import { fetchNbsPpiSeries, type NbsPpiSourceSeries } from "../nbsPpi/client";
import { nbsPpiDefinition, type NbsPpiMeasure } from "../nbsPpi/catalog";
import { fetchNbsPriceWorkbook } from "../nbsPriceRelease/client";
import { parseNbsPpiWorkbook } from "../nbsPpi/parseWorkbook";

function sourceSeries(metadata: unknown): NbsPpiSourceSeries {
  const scrape = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).scrape : null;
  if (!scrape || typeof scrape !== "object") throw new Error("国家数据 PPI：缺少 scrape 配置");
  const row = scrape as Record<string, unknown>;
  if (typeof row.cid !== "string" || typeof row.indicatorId !== "string" || (row.sourceMeasure !== "index" && row.sourceMeasure !== "mom")) throw new Error("国家数据 PPI：scrape 配置不完整");
  return { cid: row.cid, indicatorId: row.indicatorId, sourceMeasure: row.sourceMeasure };
}

export async function fetchNbsPpiIncremental(metadata: unknown, instrumentCode: string, obsStart: string): Promise<FetchIncrementalResult> {
  const definition = nbsPpiDefinition(instrumentCode);
  if (!definition) throw new Error(`国家数据 PPI：未登记仪器 ${instrumentCode}`);
  const release = parseNbsPpiWorkbook((await fetchNbsPriceWorkbook("PPI")).workbook);
  const published = release.pointsByInstrument.get(instrumentCode)?.[0];
  const points = await fetchNbsPpiSeries(sourceSeries(metadata), definition.measure.key as NbsPpiMeasure, new Date(`${obsStart}T00:00:00.000Z`).getUTCFullYear());
  const latest = points.at(-1)?.obsDate;
  if (published && (!latest || published.obsDate > latest)) points.push(published);
  else if (!published && (!latest || latest < release.sourceLatestObsDate)) {
    throw new Error(`国家统计局 PPI：已发布 ${release.sourceLatestObsDate.toISOString().slice(0, 7)}，但 ${instrumentCode} 未列入月报且国家数据尚未补齐；不能报告无变化`);
  }
  // Same-period JSON is the revision source: do not overwrite it with the first-release file.
  return { points: points.filter((point) => point.obsDate >= new Date(`${obsStart}T00:00:00.000Z`)), sourceLatestObsDate: points.at(-1)?.obsDate ?? null, skippedInvalid: 0 };
}
