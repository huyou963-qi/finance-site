import type { PriceAdjustmentMode } from "@/lib/data/klineAdjustment";
import type { KlineFetchWindowOptions, KlinePayload } from "@/lib/data/types";

/** 与 GET /api/data/klines?source= 及 KlinePayload.source 对齐的可插拔数据源 id */
export type KlineProviderId = "binance" | "ibkr";

export type KlineFetchRequest = {
  symbol: string;
  interval: string;
  limit: number;
  adjustment: PriceAdjustmentMode;
  window: KlineFetchWindowOptions;
};

export type KlineProviderCapabilities = {
  /** 展示用 */
  label: string;
  /** 是否支持 fromSec/toSec（与 before 互斥） */
  supportsExplicitTimeRange: boolean;
  /** 是否支持 before= 向左分页 */
  supportsBeforePagination: boolean;
  /**
   * 服务端是否按 adjustment 改写 OHLC；为 false 时路由仍可在 attribution 上提示。
   */
  honorsPriceAdjustment: boolean;
  /** adjust≠none 时附加到响应 attribution（可选） */
  adjustmentBehaviorNote?: string;
};

/**
 * K 线市场数据提供者：实现类只做「拉数 + 返回 KlinePayload」，路由负责参数校验与 HTTP。
 */
export interface KlineMarketDataProvider {
  readonly id: KlineProviderId;
  readonly capabilities: KlineProviderCapabilities;
  /** 当前进程环境下是否可发起请求（如 IB 需 Cookie 或桥） */
  isAvailable(): boolean;
  fetch(req: KlineFetchRequest): Promise<KlinePayload>;
}
