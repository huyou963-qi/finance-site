import { fetchBojSeries } from "../boj/client";
import { parseBojResponse } from "../boj/parser";
import { findJpBojCoreSeries } from "../bojCore/catalog";
import type { FetchIncrementalResult } from "../types";

export async function fetchJpBojCoreIncremental(
  instrumentCode: string,
): Promise<FetchIncrementalResult> {
  const row = findJpBojCoreSeries(instrumentCode);
  if (!row) throw new Error(`Unknown Japan BOJ core instrument: ${instrumentCode}`);
  return parseBojResponse(await fetchBojSeries(row), row);
}
