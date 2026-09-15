import type { FetchIncrementalResult } from "../types";
import {
  JP_MOF_SECURITIES_PROVIDER,
  JP_MOF_SECURITIES_SERIES,
} from "../jpMofSecuritiesTransactions/catalog";
import {
  decodeJpMofSecuritiesCsv,
  fetchJpMofSecuritiesCsv,
} from "../jpMofSecuritiesTransactions/client";
import { parseJpMofSecuritiesCsv } from "../jpMofSecuritiesTransactions/parser";

export async function fetchJpMofSecuritiesTransactionsIncremental(
  metadata: unknown,
  instrumentCode: string,
  _obsStart: string,
): Promise<FetchIncrementalResult> {
  const scrape = (metadata as { scrape?: { provider?: string; fixturePath?: string } } | null)?.scrape;
  if (
    scrape?.provider !== JP_MOF_SECURITIES_PROVIDER ||
    !JP_MOF_SECURITIES_SERIES.some((series) => series.instrumentCode === instrumentCode)
  ) {
    throw new Error(`MOF securities invalid routing: ${instrumentCode}`);
  }
  const parsed = parseJpMofSecuritiesCsv(
    decodeJpMofSecuritiesCsv(await fetchJpMofSecuritiesCsv(scrape.fixturePath)),
    scrape.fixturePath ? 2 : 250,
  );
  const points = parsed[instrumentCode];
  if (!points?.length) throw new Error(`MOF securities empty series: ${instrumentCode}`);
  return { points, sourceLatestObsDate: points.at(-1)!.obsDate, skippedInvalid: 0 };
}
