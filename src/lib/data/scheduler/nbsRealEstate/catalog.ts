/** 国家统计局房地产开发、销售和 70 城住宅价格公开月报。 */
export const NBS_REAL_ESTATE_SYNC_SCRIPT = "scripts/data-worker/sync-nbs-realestate.ts";
export const NBS_REAL_ESTATE_INDEX_URL = "https://www.stats.gov.cn/sj/zxfb/";
export const NBS_REAL_ESTATE_SOURCE = {
  id: "nbs-realestate",
  agencyId: "cn-nbs",
  name: "国家统计局房地产开发与70城住宅价格",
  baseUrl: NBS_REAL_ESTATE_INDEX_URL,
  termsUrl: "https://www.stats.gov.cn/",
} as const;

export const NBS_REAL_ESTATE_PROPERTY_CATEGORY = "房地产开发与销售";
export const NBS_REAL_ESTATE_PRICE_CATEGORY = "70城住房价格";
export const NBS_REAL_ESTATE_SOURCE_NOTE =
  "国家统计局公开月报及其相关数据表。房地产开发和销售保留原表累计/期末绝对值及同比；70城价格保留上月=100、上年同月=100和年内平均指数，不推算非官方月度流量或涨跌幅。";
