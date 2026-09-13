import type { FetchIncrementalResult } from "../types";
import {
  JP_JNTO_VISITOR_ARRIVALS_PROVIDER,
  JP_JNTO_VISITOR_ARRIVALS_SERIES,
} from "../jpJntoVisitorArrivals/catalog";
import { fetchJpJntoVisitorArrivalsWorkbook } from "../jpJntoVisitorArrivals/client";
import { parseJpJntoVisitorArrivalsWorkbook } from "../jpJntoVisitorArrivals/parser";

export async function fetchJpJntoVisitorArrivalsIncremental(
  metadata: unknown,
  instrumentCode: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const scrape = (metadata as { scrape?: { provider?: string; fixturePath?: string } } | null)?.scrape;
  if (
    scrape?.provider !== JP_JNTO_VISITOR_ARRIVALS_PROVIDER ||
    !JP_JNTO_VISITOR_ARRIVALS_SERIES.some((series) => series.instrumentCode === instrumentCode)
  ) {
    throw new Error(`JNTO visitor arrivals invalid routing: ${instrumentCode}`);
  }
  const parsed = parseJpJntoVisitorArrivalsWorkbook(
    await fetchJpJntoVisitorArrivalsWorkbook(scrape.fixturePath),
  );
  const start = new Date(`${obsStart}T00:00:00Z`).getTime();
  const points = parsed.series[instrumentCode].filter((point) => point.obsDate.getTime() >= start);
  return { points, sourceLatestObsDate: parsed.sourceLatestObsDate, skippedInvalid: 0 };
}

