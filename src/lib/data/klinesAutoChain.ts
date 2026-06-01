import type { PriceAdjustmentMode } from "@/lib/data/klineAdjustment";
import {
  fetchKlinesWithProvider,
  getRegisteredKlineProvider,
} from "@/lib/data/providers/klineProviderRegistry";
import type { KlineFetchWindowOptions, KlinePayload } from "@/lib/data/types";

type AutoOpts = {
  beforeTimeSec?: number;
  fromTimeSec?: number;
  toTimeSec?: number;
  adjustment: PriceAdjustmentMode;
};

/**
 * source=auto：当前策略为仅 IBKR（通过注册表中的 ibkr 提供者）。
 */
export async function fetchKlinesAutoChain(
  sym: string,
  interval: string,
  limit: number,
  opts: AutoOpts,
): Promise<KlinePayload> {
  const window: KlineFetchWindowOptions = {
    beforeTimeSec: opts.beforeTimeSec,
    fromTimeSec: opts.fromTimeSec,
    toTimeSec: opts.toTimeSec,
  };

  const ibkr = getRegisteredKlineProvider("ibkr");
  if (!ibkr?.isAvailable()) {
    throw new Error(
      "当前「自动」数据源仅 IBKR：请登录 IB Client Portal Gateway 并保存 Cookie，或配置 IBKR_BRIDGE_URL。",
    );
  }

  const p = await fetchKlinesWithProvider("ibkr", {
    symbol: sym,
    interval,
    limit,
    adjustment: opts.adjustment,
    window,
  });
  return {
    ...p,
    attribution: `${p.attribution ?? ""}（行情源：自动→IBKR）`,
  };
}
