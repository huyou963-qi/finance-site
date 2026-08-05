import type { FetchIncrementalResult } from "../types";
import { fetchNbsPpiSeries, type NbsPpiSourceSeries } from "../nbsPpi/client";
import { nbsPpiDefinition, type NbsPpiMeasure } from "../nbsPpi/catalog";

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
  const points = await fetchNbsPpiSeries(sourceSeries(metadata), definition.measure.key as NbsPpiMeasure, new Date(`${obsStart}T00:00:00.000Z`).getUTCFullYear());
  return { points: points.filter((point) => point.obsDate >= new Date(`${obsStart}T00:00:00.000Z`)), sourceLatestObsDate: points.at(-1)?.obsDate ?? null, skippedInvalid: 0 };
}
