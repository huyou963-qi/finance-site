import type { FetchIncrementalResult } from "../types";
import {
  JP_ESRI_MACHINERY_ORDERS_PROVIDER,
  jpEsriMachineryOrdersSeriesByCode,
} from "../jpEsriMachineryOrders/catalog";
import { fetchJpEsriMachineryOrdersWorkbook } from "../jpEsriMachineryOrders/client";
import { parseJpEsriMachineryOrdersWorkbook } from "../jpEsriMachineryOrders/parser";

export async function fetchJpEsriMachineryOrdersIncremental(
  metadata: unknown,
  instrumentCode: string,
  _obsStart: string,
): Promise<FetchIncrementalResult> {
  const scrape =
    metadata && typeof metadata === "object"
      ? (metadata as { scrape?: { provider?: string; fixturePath?: string } }).scrape
      : undefined;
  const series = jpEsriMachineryOrdersSeriesByCode(instrumentCode);
  if (scrape?.provider !== JP_ESRI_MACHINERY_ORDERS_PROVIDER || !series) {
    throw new Error(`ESRI machinery orders invalid routing: ${instrumentCode}`);
  }
  // Return the complete official workbook on every run. ESRI revises the full
  // seasonally adjusted history each January, so an append-only fetch would
  // silently miss revisions.
  const points = parseJpEsriMachineryOrdersWorkbook(
    await fetchJpEsriMachineryOrdersWorkbook(scrape.fixturePath),
    series,
  );
  return {
    points,
    sourceLatestObsDate: points.at(-1)?.obsDate ?? null,
    skippedInvalid: 0,
  };
}
