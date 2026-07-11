/**
 * K 线市场数据 — 可插拔提供者层。
 *
 * 新增数据源步骤概要：
 * 1. 在 `klineProviderTypes.ts` 的 `KlineProviderId` 与 `KlinePayload.source`（types.ts）中增加 id；
 * 2. 实现 `KlineMarketDataProvider`（参考 yahooKlineProvider）；
 * 3. 在 `klineProviderRegistry.ts` 的 `registry` Map 中注册；
 * 4. 在 `GET /api/data/klines` 路由中放行对应 `source` 查询参数（若需对外暴露）。
 */
export type {
  KlineFetchRequest,
  KlineMarketDataProvider,
  KlineProviderCapabilities,
  KlineProviderId,
} from "./klineProviderTypes";
export {
  fetchKlinesWithProvider,
  getRegisteredKlineProvider,
  listRegisteredKlineProviderIds,
  registerOrReplaceKlineProvider,
  validateKlineWindowForProvider,
} from "./klineProviderRegistry";
export { yahooKlineProvider } from "./yahooKlineProvider";
