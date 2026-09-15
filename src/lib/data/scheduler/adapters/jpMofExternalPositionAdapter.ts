import type { FetchIncrementalResult } from "../types";
import {
  JP_MOF_EXTERNAL_POSITION_PROVIDER,
  JP_MOF_EXTERNAL_POSITION_SERIES,
} from "../jpMofExternalPosition/catalog";
import { fetchJpMofExternalPositionFiles } from "../jpMofExternalPosition/client";
import { parseJpMofExternalPositionFiles } from "../jpMofExternalPosition/parser";

export async function fetchJpMofExternalPositionIncremental(
  metadata: unknown,
  instrumentCode: string,
  _obsStart: string,
): Promise<FetchIncrementalResult> {
  const scrape = (metadata as {
    scrape?: { provider?: string; iipFixturePath?: string; debtFixturePath?: string };
  } | null)?.scrape;
  if (
    scrape?.provider !== JP_MOF_EXTERNAL_POSITION_PROVIDER ||
    !JP_MOF_EXTERNAL_POSITION_SERIES.some((series) => series.instrumentCode === instrumentCode)
  ) {
    throw new Error(`MOF external position invalid routing: ${instrumentCode}`);
  }
  const fixtures = scrape.iipFixturePath || scrape.debtFixturePath
    ? { iipPath: scrape.iipFixturePath, debtPath: scrape.debtFixturePath }
    : undefined;
  const parsed = parseJpMofExternalPositionFiles(
    await fetchJpMofExternalPositionFiles(fixtures),
    fixtures ? 2 : 40,
  );
  const points = parsed[instrumentCode];
  if (!points?.length) throw new Error(`MOF external position empty series: ${instrumentCode}`);
  return { points, sourceLatestObsDate: points.at(-1)!.obsDate, skippedInvalid: 0 };
}
