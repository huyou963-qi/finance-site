import { fetchKlinesWithProvider } from "@/lib/data/providers/klineProviderRegistry";
import { BENCHMARK_ETF, SECTOR_ETF_SYMBOLS } from "@/lib/equity/gicsCatalog";
import type { ClosePoint } from "@/lib/equity/sectorReturns";

async function fetchEtfCloses(symbol: string, limit = 320): Promise<ClosePoint[]> {
  try {
    const payload = await fetchKlinesWithProvider("ibkr", {
      symbol,
      interval: "1d",
      limit,
      adjustment: "forward",
      window: {},
    });
    return (payload.candles ?? []).map((c) => ({
      time: typeof c.time === "number" ? c.time : Number(c.time),
      close: c.close,
    }));
  } catch {
    return [];
  }
}

/** 拉取 11 个 Sector ETF + SPY 日线收盘（IBKR；失败则该标的为空） */
export async function fetchSectorEtfCloses(
  limit = 320,
): Promise<Record<string, ClosePoint[]>> {
  const symbols = [...SECTOR_ETF_SYMBOLS, BENCHMARK_ETF];
  const out: Record<string, ClosePoint[]> = {};
  for (const sym of symbols) {
    out[sym] = await fetchEtfCloses(sym, limit);
  }
  return out;
}
