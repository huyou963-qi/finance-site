/**
 * 无可靠日历发布时刻的 FRED 序列（日频市场数据等）。
 *
 * 独立成零依赖模块以打破循环：p0SeedCatalog → investingEventMap → teEventMap →
 * releasePackageCatalog → cpi/laborFredSeedCatalog → p0SeedCatalog（TDZ 崩溃）。
 * p0SeedCatalog 从这里 import；teEventMap re-export 保持既有 API 不变。
 */
export const PROBE_ONLY_FRED_SERIES = new Set(["T10Y2Y", "GS10", "T5YIE", "T10YIE"]);
