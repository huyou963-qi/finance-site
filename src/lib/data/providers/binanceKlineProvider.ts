import { fetchBinanceSpotKlines } from "@/lib/data/binance";
import type {
  KlineFetchRequest,
  KlineMarketDataProvider,
  KlineProviderCapabilities,
} from "@/lib/data/providers/klineProviderTypes";

const capabilities: KlineProviderCapabilities = {
  label: "Binance 现货",
  supportsExplicitTimeRange: false,
  supportsBeforePagination: true,
  honorsPriceAdjustment: false,
  adjustmentBehaviorNote:
    "（加密货币现货为原始成交价；无拆股/分红类复权。）",
};

export const binanceKlineProvider: KlineMarketDataProvider = {
  id: "binance",
  capabilities,
  isAvailable: () => true,
  async fetch(req: KlineFetchRequest) {
    const w = req.window;
    return fetchBinanceSpotKlines(
      req.symbol,
      req.interval,
      req.limit,
      w.beforeTimeSec != null ? { beforeTimeSec: w.beforeTimeSec } : undefined,
    );
  },
};
