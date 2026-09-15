import type { FetchIncrementalResult } from "../types";
import { decodeJpCustomsTradeCsv, fetchJpCustomsTradeCsv } from "../jpCustomsTrade/client";
import { JP_CUSTOMS_TRADE_PROVIDER, JP_CUSTOMS_TRADE_SERIES } from "../jpCustomsTrade/catalog";
import { parseJpCustomsTradeCsv } from "../jpCustomsTrade/parser";

export async function fetchJpCustomsTradeIncremental(
  metadata: unknown,
  instrumentCode: string,
  _obsStart: string,
): Promise<FetchIncrementalResult> {
  const scrape = (metadata as { scrape?: { provider?: string; fixturePath?: string } } | null)?.scrape;
  if (
    scrape?.provider !== JP_CUSTOMS_TRADE_PROVIDER ||
    !JP_CUSTOMS_TRADE_SERIES.some((series) => series.instrumentCode === instrumentCode)
  ) {
    throw new Error(`Japan Customs trade invalid routing: ${instrumentCode}`);
  }
  const parsed = parseJpCustomsTradeCsv(
    decodeJpCustomsTradeCsv(await fetchJpCustomsTradeCsv(scrape.fixturePath)),
    new Date(),
    scrape.fixturePath ? 2 : 500,
  );
  const points = parsed[instrumentCode];
  if (!points?.length) throw new Error(`Japan Customs trade empty series: ${instrumentCode}`);
  return { points, sourceLatestObsDate: points.at(-1)!.obsDate, skippedInvalid: 0 };
}
