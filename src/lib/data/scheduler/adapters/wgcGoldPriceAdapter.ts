import { WGC_GOLD_PRICE_EARLIEST } from "../wgcGoldPrice/catalog";
import { fetchWgcGoldPrice } from "../wgcGoldPrice/client";
import type { FetchIncrementalResult } from "../types";

/**
 * 世界黄金协会金价接口 → 宏观日频现货金价。
 *
 * metadata.scrape = { provider: "wgc_gold_price", currency: "usd", unit: "oz" }。
 */
function readScrape(metadata: unknown): { currency: string; unit: string } {
  const scrape =
    metadata && typeof metadata === "object"
      ? ((metadata as Record<string, unknown>).scrape as Record<string, unknown> | undefined)
      : undefined;
  const currency = typeof scrape?.currency === "string" ? scrape.currency.trim().toLowerCase() : "";
  const unit = typeof scrape?.unit === "string" ? scrape.unit.trim().toLowerCase() : "";
  if (!/^[a-z]{3}$/.test(currency) || !unit) throw new Error("wgc_gold_price：metadata.scrape.currency/unit 缺失");
  return { currency, unit };
}

export async function fetchWgcGoldPriceIncremental(
  metadata: unknown,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const { currency, unit } = readScrape(metadata);
  const startDate = obsStart < WGC_GOLD_PRICE_EARLIEST ? WGC_GOLD_PRICE_EARLIEST : obsStart;
  const rows = await fetchWgcGoldPrice({ currency, unit, startDate });
  const points = rows
    .filter(({ date }) => date >= obsStart)
    .map(({ date, value }) => ({
      obsDate: new Date(`${date}T00:00:00.000Z`),
      value: Math.round(value * 100) / 100,
    }));
  return {
    points,
    sourceLatestObsDate: points.length > 0 ? points[points.length - 1]!.obsDate : null,
    skippedInvalid: 0,
  };
}
