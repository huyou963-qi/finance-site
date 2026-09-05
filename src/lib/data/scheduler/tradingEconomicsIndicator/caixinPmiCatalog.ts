/**
 * TradingEconomics 中国制造业 PMI（民间口径）指标页
 *
 * 页面历史上冠名 "Caixin"（财新），2025 年起 Caixin Media 与 S&P Global 的
 * 冠名合作结束，TE 页面改为 "RatingDog China Manufacturing PMI"；调查方法论
 * （约 650 家制造业企业月度问卷）与编制方 S&P Global 均未变，属同一序列的延续。
 * 与官方 NBS 制造业 PMI（cn.nbs.pmi 发布包）是两个不同机构、不同样本的独立调查，
 * 互不冲突——`releasePackageCatalog.ts` 的 cn.nbs.pmi 已特意排除 "caixin"/"s&p global"
 * 关键词，避免误并入官方日历。
 */
export const TE_CAIXIN_PMI_PAGE_URL =
  "https://tradingeconomics.com/china/manufacturing-pmi";

export const CAIXIN_PMI_TE_SYNC_SCRIPT = "scripts/data-worker/sync-caixin-pmi-te.ts";

export const CAIXIN_PMI_INSTRUMENT_CODE = "caixin_cn_mfg_pmi";

export const CAIXIN_PMI_SCRAPE_PROVIDER = "tradingeconomics_caixin_mfg_pmi";

export function isCaixinPmiInstrumentCode(code: string): boolean {
  return code === CAIXIN_PMI_INSTRUMENT_CODE;
}
