/** 国家统计局月度社会消费品零售额：公开国家数据 JSON。 */
export const NBS_RETAIL_API = "https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData";
export const NBS_RETAIL_ROOT_ID = "fc982599aa684be7969d7b90b1bd0e84";
export const NBS_RETAIL_SYNC_SCRIPT = "scripts/data-worker/sync-nbs-retail.ts";
export const NBS_RETAIL_SOURCE = { id: "nbs-retail", agencyId: "cn-nbs", name: "国家统计局社会消费品零售总额", baseUrl: "https://data.stats.gov.cn/", termsUrl: "https://www.stats.gov.cn/english/nbs/200701/t20070104_59236.html" } as const;
export type RetailMeasure = "current" | "cumulative" | "yoy" | "cumulative_yoy";
export const RETAIL_MEASURES: readonly { key: RetailMeasure; label: string; unit: string }[] = [
  { key: "current", label: "当期值", unit: "亿元" }, { key: "cumulative", label: "累计值", unit: "亿元" },
  { key: "yoy", label: "同比增长", unit: "%" }, { key: "cumulative_yoy", label: "累计增长", unit: "%" },
] as const;
export type RetailComponent = { key: string; label: string; cid: string; ids: Record<RetailMeasure, string> };
export const NBS_RETAIL_COMPONENTS: readonly RetailComponent[] = [
  { key: "headline", label: "社会消费品零售总额", cid: "d0cb882c7f27443ab6b3ef9421901961", ids: { current: "1142a3a03e9045959e606a21822641ac", cumulative: "260a1794443b43dd93a59928b12f38af", yoy: "aaac57d54d2e465d91bc9f3ea1a8618e", cumulative_yoy: "e3ca151b53d347b78d1e179e5ebf1d33" } },
  { key: "above_limit", label: "限上单位消费品零售额", cid: "d0cb882c7f27443ab6b3ef9421901961", ids: { current: "97281ec401c14706a7509672902106af", cumulative: "d09f3a9f472a4c87acd4d67866b6cab7", yoy: "e576b095205e414c8a21e112792492ba", cumulative_yoy: "f83cf22a85664de7b25ab61da994f08d" } },
  { key: "urban", label: "城镇社会消费品零售总额", cid: "d5c7d1062a5742c69a02c39650c7c327", ids: { current: "9ef40e1bd70e4fd1a94005ef9a3b9e6a", cumulative: "00326273e65f4c1e958c7a800fc77933", yoy: "0a131939174d4d21885d3ce53cbe147f", cumulative_yoy: "93758cc2ed3244daae3d040f28ee7278" } },
  { key: "rural", label: "乡村社会消费品零售总额", cid: "d5c7d1062a5742c69a02c39650c7c327", ids: { current: "f32d705cc284404e82849c934011d6b0", cumulative: "d05a22bb2f5f433cbd09a04dbda1f12e", yoy: "dd474a9e7b7745fba458e648f1f013f6", cumulative_yoy: "be68b49a3fe940849299549a2098e02e" } },
  { key: "catering", label: "餐饮收入", cid: "d9821f4ad1ec42ebbbd0554efb3e3772", ids: { current: "446765807521445c8bbe7b7526501dc8", cumulative: "9172bc0eeb3246ebb803dfe803e23602", yoy: "476cfe584e9849c2a2bac63a2fe1dd49", cumulative_yoy: "7a6941829f2b47dfa6ba6d8190d753db" } },
  { key: "goods", label: "商品零售", cid: "d9821f4ad1ec42ebbbd0554efb3e3772", ids: { current: "2d3e611af5214aa480b8a0a4f2c1785d", cumulative: "29b800dd9efc4f499be46fd3d17f4238", yoy: "d76706323b3743da8b198c7f7d8c6a1c", cumulative_yoy: "f005ff68fbd24acebe28820c86857b78" } },
  { key: "above_limit_catering", label: "限上单位餐饮收入", cid: "d9821f4ad1ec42ebbbd0554efb3e3772", ids: { current: "24b382aea8224070a3562d8892e9c6d1", cumulative: "dbc34e7102244f8eb5611306d100f28d", yoy: "4c08c0eb48e0472ab2044c359e0d9a96", cumulative_yoy: "1c3eead8795e45eab19d7a36e17f46e0" } },
  { key: "above_limit_goods", label: "限上单位商品零售", cid: "d9821f4ad1ec42ebbbd0554efb3e3772", ids: { current: "55c1e5ef6a674368b5eb0d322726ff2d", cumulative: "138440036ff1472eb989fb77099edd7d", yoy: "75aa5bd0cba0413b86fdcb377cbba1fc", cumulative_yoy: "a41610ba426c4eedbef574afe181c3d7" } },
] as const;
/** Instrument.code 最大 48 字符；展示名仍使用完整中文分类。 */
const CODE_PART: Record<string, string> = { headline: "h", above_limit: "al", urban: "u", rural: "r", catering: "c", goods: "g", above_limit_catering: "alc", above_limit_goods: "alg" };
export const retailCode = (component: string, measure: RetailMeasure) => `nbs_cn_retail_${CODE_PART[component] ?? component}_${measure}`;
export const NBS_RETAIL_CODES = NBS_RETAIL_COMPONENTS.flatMap(c => RETAIL_MEASURES.map(m => retailCode(c.key, m.key)));
