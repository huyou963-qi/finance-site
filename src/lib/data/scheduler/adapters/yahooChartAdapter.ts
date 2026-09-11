import { fetchYahooChart } from "../../../equity/yahooChart";
import type { FetchIncrementalResult } from "../types";

/**
 * 行情接口（Yahoo v8 chart，与 /markets 行情页同一数据源）→ 宏观日频收盘价。
 *
 * metadata.scrape = { provider: "yahoo_chart", symbol: "GC=F" }。
 * 取日线 close；fetchYahooChart 已丢弃期货/外汇节假日的全 0 占位行。
 * 当日 bar 盘中会变，后续轮次按 revisionLookback 覆盖为收盘值。
 */
function readScrape(metadata: unknown): { symbol: string; continueAfter: string | null } {
  const scrape =
    metadata && typeof metadata === "object"
      ? ((metadata as Record<string, unknown>).scrape as Record<string, unknown> | undefined)
      : undefined;
  const symbol = typeof scrape?.symbol === "string" ? scrape.symbol.trim() : "";
  if (!symbol) throw new Error("yahoo_chart：metadata.scrape.symbol 缺失");
  const continueAfter =
    typeof scrape?.continueAfter === "string" && /^\d{4}-\d{2}-\d{2}$/.test(scrape.continueAfter)
      ? scrape.continueAfter
      : null;
  return { symbol, continueAfter };
}

export async function fetchYahooChartIncremental(
  metadata: unknown,
  _instrumentCode: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const { symbol, continueAfter } = readScrape(metadata);
  const startSec = Math.max(0, Date.parse(`${obsStart}T00:00:00.000Z`) / 1000 - 7 * 86_400);
  const { bars } = await fetchYahooChart(symbol, {
    period1: startSec,
    period2: Math.floor(Date.now() / 1000) + 86_400,
    interval: "1d",
  });

  const byDate = new Map<string, number>();
  for (const bar of bars) {
    byDate.set(new Date(bar.time * 1000).toISOString().slice(0, 10), bar.close);
  }
  const points = [...byDate]
    .filter(([date]) => date >= obsStart && (!continueAfter || date > continueAfter))
    .map(([date, close]) => ({
      obsDate: new Date(`${date}T00:00:00.000Z`),
      value: Math.round(close * 100) / 100,
    }));
  return {
    points,
    sourceLatestObsDate: points.length > 0 ? points[points.length - 1]!.obsDate : null,
    skippedInvalid: 0,
  };
}
