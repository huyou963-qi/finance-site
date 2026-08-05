/** 国家统计局中国 CPI：官方月报 Excel 首发 + 国家数据 UUID 接口历史回填。 */

export const NBS_CPI_INDEX_URL = "https://www.stats.gov.cn/sj/zxfbhjd/";
export const NBS_CPI_SYNC_SCRIPT = "scripts/data-worker/sync-nbs-cpi.ts";
export const NBS_DATA_API_BASE =
  "https://data.stats.gov.cn/dg/website/publicrelease/web/external";
export const NBS_MONTHLY_ROOT_ID = "fc982599aa684be7969d7b90b1bd0e84";

export type NbsCpiMeasure = "index" | "yoy" | "mom";
export type NbsCpiComponent = {
  key: string;
  displayName: string;
  /** 国家数据 i_showname 的稳定前缀；月报中的 sourceLabel 允许略有排版差异。 */
  nbsLabel: string;
  workbookLabel: string;
};

/** 国家统计局月报的总项、核心项和八大类；细项仅在单月月报出现，暂无可回填全历史。 */
export const NBS_CPI_COMPONENTS: readonly NbsCpiComponent[] = [
  { key: "headline", displayName: "居民消费价格", nbsLabel: "居民消费价格指数", workbookLabel: "居民消费价格" },
  { key: "food_tobacco", displayName: "食品烟酒及在外餐饮", nbsLabel: "食品烟酒及在外餐饮类居民消费价格指数", workbookLabel: "食品烟酒及在外餐饮" },
  { key: "clothing", displayName: "衣着", nbsLabel: "衣着类居民消费价格指数", workbookLabel: "衣着" },
  { key: "residence", displayName: "居住", nbsLabel: "居住类居民消费价格指数", workbookLabel: "居住" },
  { key: "household", displayName: "生活用品及服务", nbsLabel: "生活用品及服务类居民消费价格指数", workbookLabel: "生活用品及服务" },
  { key: "transport", displayName: "交通通信", nbsLabel: "交通通信类居民消费价格指数", workbookLabel: "交通通信" },
  { key: "education", displayName: "教育文化娱乐", nbsLabel: "教育文化娱乐类居民消费价格指数", workbookLabel: "教育文化娱乐" },
  { key: "healthcare", displayName: "医疗保健", nbsLabel: "医疗保健类居民消费价格指数", workbookLabel: "医疗保健" },
  { key: "other", displayName: "其他用品及服务", nbsLabel: "其他用品及服务类居民消费价格指数", workbookLabel: "其他用品及服务" },
  { key: "non_food", displayName: "非食品", nbsLabel: "非食品居民消费价格指数", workbookLabel: "非食品" },
  { key: "consumer_goods", displayName: "消费品", nbsLabel: "消费品居民消费价格指数", workbookLabel: "消费品" },
  { key: "services", displayName: "服务", nbsLabel: "服务居民消费价格指数", workbookLabel: "服务" },
  { key: "core", displayName: "不包括食品和能源", nbsLabel: "不包括食品和能源居民消费价格指数", workbookLabel: "不包括食品和能源" },
] as const;

export const NBS_CPI_MEASURES: readonly { key: NbsCpiMeasure; label: string; unit: string }[] = [
  { key: "index", label: "指数（上年同月=100）", unit: "指数" },
  { key: "yoy", label: "同比", unit: "%" },
  { key: "mom", label: "环比", unit: "%" },
] as const;

export function nbsCpiCode(component: string, measure: NbsCpiMeasure): string {
  return `nbs_cn_cpi_${component}_${measure}`;
}

export function nbsCpiDefinition(code: string) {
  for (const component of NBS_CPI_COMPONENTS) {
    for (const measure of NBS_CPI_MEASURES) {
      if (nbsCpiCode(component.key, measure.key) === code) return { component, measure };
    }
  }
  return null;
}

export const NBS_CPI_INSTRUMENT_CODES = NBS_CPI_COMPONENTS.flatMap((component) =>
  NBS_CPI_MEASURES.map((measure) => nbsCpiCode(component.key, measure.key)),
);

export const NBS_CPI_SOURCE = {
  id: "nbs-cpi",
  agencyId: "cn-nbs",
  name: "国家统计局中国居民消费价格发布包",
  baseUrl: NBS_CPI_INDEX_URL,
  termsUrl: "https://www.stats.gov.cn/english/nbs/200701/t20070104_59236.html",
} as const;
