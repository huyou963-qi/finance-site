import { fetchHhdcWorkbook } from "../consumerPressure/client";
import { parseHhdcWorkbook } from "../consumerPressure/parser";
import type { FetchIncrementalResult } from "../types";

/** Full history is intentional: HHDC republishes revised historical quarters. */
export async function fetchNyFedHhdcIncremental(code: string): Promise<FetchIncrementalResult> {
  const { workbook, url } = await fetchHhdcWorkbook();
  const points = parseHhdcWorkbook(workbook, code);
  return { points, sourceLatestObsDate: points.at(-1)!.obsDate, skippedInvalid: 0, sourceMetadata: { officialUrl: url } };
}
