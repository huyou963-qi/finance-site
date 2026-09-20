import type { FetchIncrementalResult } from "../types";
import { JP_CYCLE_LABOR_SERIES } from "../jpCycleLabor/catalog";
import { fetchJpCycleLaborWorkbook } from "../jpCycleLabor/client";
import { parseJpCycleLaborWorkbook } from "../jpCycleLabor/parser";

export async function fetchJpCycleLaborIncremental(metadata: unknown, instrumentCode: string): Promise<FetchIncrementalResult> {
  const scrape = metadata && typeof metadata === "object" ? (metadata as { scrape?: { provider?: string; fixturePath?: string } }).scrape : undefined;
  const series = JP_CYCLE_LABOR_SERIES.find((candidate) => candidate.instrumentCode === instrumentCode);
  if (!series || scrape?.provider !== "jp_cycle_labor") throw new Error(`Japan cycle/labor invalid routing: ${instrumentCode}`);
  const points = parseJpCycleLaborWorkbook(await fetchJpCycleLaborWorkbook(series.source, scrape.fixturePath), series);
  return { points, sourceLatestObsDate: points.at(-1)?.obsDate ?? null, skippedInvalid: 0 };
}
