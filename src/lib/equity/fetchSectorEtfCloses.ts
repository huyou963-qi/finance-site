import { BENCHMARK_ETF, SECTOR_ETF_SYMBOLS } from "@/lib/equity/gicsCatalog";
import { getDailyClosesDbFirst } from "@/lib/equity/equityPriceStore";
import { MACRO_ASSET_SYMBOLS } from "@/lib/equity/macroAssetClasses";
import type { ClosePoint } from "@/lib/equity/sectorReturns";

export type SectorEtfClosesResult = {
  closes: Record<string, ClosePoint[]>;
  /** 实际用到的数据源 */
  source: string | null;
  sourcesBySymbol: Record<string, string | null>;
};

/**
 * 拉取 11 个 Sector ETF + SPY 日线收盘（前复权 = 总收益口径）。
 * db-first，仅缺口回补 Yahoo。
 */
export async function fetchSectorEtfCloses(
  limit = 320,
): Promise<Record<string, ClosePoint[]>> {
  const { closes } = await fetchSectorEtfClosesWithMeta(limit);
  return closes;
}

export async function fetchSectorEtfClosesWithMeta(
  limit = 320,
): Promise<SectorEtfClosesResult> {
  const symbols = [...SECTOR_ETF_SYMBOLS, BENCHMARK_ETF];
  const { closes, source, missing } = await getDailyClosesDbFirst(symbols, limit);

  const sourcesBySymbol: Record<string, string | null> = {};
  for (const sym of symbols) {
    sourcesBySymbol[sym] = missing.includes(sym) ? null : source;
    closes[sym] ??= [];
  }

  return { closes, source, sourcesBySymbol };
}

/**
 * 拉取大类资产代理的日线收盘（同一 db-first 管线，前复权 = 总收益口径）。
 * 与行业 ETF 分开调用只是为了让「不请求大类资产」的旧参数保持零额外成本。
 */
export async function fetchMacroAssetCloses(
  limit = 320,
): Promise<SectorEtfClosesResult> {
  const symbols = [...MACRO_ASSET_SYMBOLS];
  const { closes, source, missing } = await getDailyClosesDbFirst(symbols, limit);

  const sourcesBySymbol: Record<string, string | null> = {};
  for (const sym of symbols) {
    sourcesBySymbol[sym] = missing.includes(sym) ? null : source;
    closes[sym] ??= [];
  }

  return { closes, source, sourcesBySymbol };
}
