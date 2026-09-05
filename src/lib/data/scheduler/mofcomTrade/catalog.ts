/** 商务部公共商务信息服务转载的海关货物贸易统计。 */
export const MOFCOM_TRADE_SYNC_SCRIPT = "scripts/data-worker/sync-mofcom-trade.ts";
export const MOFCOM_TRADE_BASE_URL = "https://data.mofcom.gov.cn/datamofcom/front";
export const MOFCOM_TRADE_SOURCE = {
  id: "mofcom-trade",
  agencyId: "cn-mofcom",
  name: "商务部货物贸易（海关统计）",
  baseUrl: MOFCOM_TRADE_BASE_URL,
  termsUrl: "https://data.mofcom.gov.cn/",
} as const;

export const MOFCOM_TRADE_CATEGORY = "外贸与外部部门";
export const MOFCOM_TRADE_SOURCE_NOTE =
  "商务部公共商务信息服务公开接口转载海关总署货物贸易统计（进出口总额、贸易方式、国别地区三个维度）。" +
  "保存接口直接披露的美元计价当月值、累计值和同比；不从累计值推算环比或单月值。" +
  "分商品维度改用海关总署主要商品量值表（gacc-commodity），因为该接口只有金额没有数量、算不出单价。";
