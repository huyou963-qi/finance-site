import type { FetchIncrementalResult } from "../types";
import { JP_MOF_RESERVES_PROVIDER, JP_MOF_RESERVES_SERIES } from "../jpMofReserves/catalog";
import { decodeJpMofReservesCsv, fetchJpMofReservesCsv } from "../jpMofReserves/client";
import { parseJpMofReservesCsv } from "../jpMofReserves/parser";

export async function fetchJpMofReservesIncremental(
  metadata: unknown,
  instrumentCode: string,
  _obsStart: string,
): Promise<FetchIncrementalResult> {
  const scrape = (metadata as { scrape?: { provider?: string; fixturePath?: string } } | null)?.scrape;
  if (
    scrape?.provider !== JP_MOF_RESERVES_PROVIDER ||
    !JP_MOF_RESERVES_SERIES.some((series) => series.instrumentCode === instrumentCode)
  ) {
    throw new Error(`MOF reserves invalid routing: ${instrumentCode}`);
  }
  const parsed = parseJpMofReservesCsv(
    decodeJpMofReservesCsv(await fetchJpMofReservesCsv(scrape.fixturePath)),
  );
  const points = parsed[instrumentCode];
  if (!points?.length) throw new Error(`MOF reserves empty series: ${instrumentCode}`);
  return { points, sourceLatestObsDate: points.at(-1)!.obsDate, skippedInvalid: 0 };
}
