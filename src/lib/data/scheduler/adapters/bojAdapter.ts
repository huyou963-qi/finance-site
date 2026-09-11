import { BOJ_SERIES } from "../boj/catalog";
import { fetchBojSeries } from "../boj/client";
import { parseBojResponse } from "../boj/parser";
import type { FetchIncrementalResult } from "../types";

export async function fetchBojIncremental(instrumentCode: string): Promise<FetchIncrementalResult> {
  const row = BOJ_SERIES.find((r) => r.instrumentCode === instrumentCode);
  if (!row) throw new Error(`Unknown BOJ instrument: ${instrumentCode}`);
  return parseBojResponse(await fetchBojSeries(row), row);
}
