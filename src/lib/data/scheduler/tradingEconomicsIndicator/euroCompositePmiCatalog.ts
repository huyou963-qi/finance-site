/**
 * TradingEconomics 欧元区综合 PMI（S&P Global HCOB Composite PMI）指标页
 *
 * 制造业 + 服务业综合，是欧元区月度核心先行指标；本项目只接入综合读数
 * （Final，非 Flash 初值），不拆分制造业/服务业分项（页面 Components 表已单独
 * 提供，非本次接入范围）。
 */
export const TE_EURO_COMPOSITE_PMI_PAGE_URL =
  "https://tradingeconomics.com/euro-area/composite-pmi";

export const EURO_COMPOSITE_PMI_TE_SYNC_SCRIPT =
  "scripts/data-worker/sync-euro-composite-pmi-te.ts";

export const EURO_COMPOSITE_PMI_INSTRUMENT_CODE = "spgi_ea_composite_pmi";

export const EURO_COMPOSITE_PMI_SCRAPE_PROVIDER =
  "tradingeconomics_eurozone_composite_pmi";

export function isEuroCompositePmiInstrumentCode(code: string): boolean {
  return code === EURO_COMPOSITE_PMI_INSTRUMENT_CODE;
}
