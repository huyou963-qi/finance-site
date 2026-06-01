import { isIbkrCpMode, isIbkrTwsMode } from "@/lib/data/ibkrApiConfig";
import { fetchIbkrKlines } from "@/lib/data/ibkrKlines";
import { readIbkrCpCookie } from "@/lib/data/ibkrCpSession";
import type {
  KlineFetchRequest,
  KlineMarketDataProvider,
  KlineProviderCapabilities,
} from "@/lib/data/providers/klineProviderTypes";

const capabilitiesCp: KlineProviderCapabilities = {
  label: "Interactive Brokers",
  supportsExplicitTimeRange: false,
  supportsBeforePagination: true,
  honorsPriceAdjustment: true,
  adjustmentBehaviorNote:
    "（IB Trades 为前复权；后复权按拆股日历整体放大；不复权=还原名义价；前复权≈API 原价。）",
};

const capabilitiesTws: KlineProviderCapabilities = {
  label: "Interactive Brokers (TWS)",
  supportsExplicitTimeRange: false,
  supportsBeforePagination: true,
  honorsPriceAdjustment: true,
  adjustmentBehaviorNote:
    "（TWS Trades 为前复权；后复权在图表端按美股拆股日历整体放大，如 AAPL×224；期货 CONTFUT 为 IB 服务端拼接。）",
};

function ibkrEnvReady(): boolean {
  if (isIbkrTwsMode()) return true;
  if (isIbkrCpMode()) {
    if (readIbkrCpCookie()) return true;
    if (process.env.IBKR_BRIDGE_URL?.trim()) return true;
  }
  return false;
}

/** 与 {@link isIbkrCpMode} / {@link isIbkrTwsMode} 一致，供 UI 提示 */
export function ibkrApiModeLabel(): "cp" | "tws" {
  return isIbkrTwsMode() ? "tws" : "cp";
}

export const ibkrKlineProvider: KlineMarketDataProvider = {
  id: "ibkr",
  get capabilities() {
    return isIbkrTwsMode() ? capabilitiesTws : capabilitiesCp;
  },
  isAvailable: () => ibkrEnvReady(),
  async fetch(req: KlineFetchRequest) {
    const w = req.window;
    return fetchIbkrKlines(
      req.symbol,
      req.interval,
      req.limit,
      w.beforeTimeSec != null ? { beforeTimeSec: w.beforeTimeSec } : undefined,
    );
  },
};
