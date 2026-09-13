import type { FetchIncrementalResult } from "../types";
import {
  JP_ESRI_CONSUMER_CONFIDENCE_PROVIDER,
  jpEsriConsumerConfidenceSeriesByCode,
} from "../jpEsriConsumerConfidence/catalog";
import { fetchJpEsriConsumerConfidenceWorkbook } from "../jpEsriConsumerConfidence/client";
import { parseJpEsriConsumerConfidenceWorkbook } from "../jpEsriConsumerConfidence/parser";

export async function fetchJpEsriConsumerConfidenceIncremental(
  metadata: unknown,
  instrumentCode: string,
  _obsStart: string,
): Promise<FetchIncrementalResult> {
  const scrape =
    metadata && typeof metadata === "object"
      ? (metadata as { scrape?: { provider?: string; fixturePath?: string } }).scrape
      : undefined;
  const series = jpEsriConsumerConfidenceSeriesByCode(instrumentCode);
  if (scrape?.provider !== JP_ESRI_CONSUMER_CONFIDENCE_PROVIDER || !series) {
    throw new Error(`ESRI consumer confidence invalid routing: ${instrumentCode}`);
  }
  const points = parseJpEsriConsumerConfidenceWorkbook(
    await fetchJpEsriConsumerConfidenceWorkbook(scrape.fixturePath),
    series,
  );
  return {
    points,
    sourceLatestObsDate: points.at(-1)?.obsDate ?? null,
    skippedInvalid: 0,
  };
}
