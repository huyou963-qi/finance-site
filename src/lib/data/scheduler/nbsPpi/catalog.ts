/** 国家统计局中国 PPI：官方国家数据 JSON（全国、月频）。 */

export const NBS_DATA_API_BASE =
  "https://data.stats.gov.cn/dg/website/publicrelease/web/external";
export const NBS_MONTHLY_ROOT_ID = "fc982599aa684be7969d7b90b1bd0e84";
export const NBS_PPI_INDEX_URL = "https://data.stats.gov.cn/easyquery.htm?cn=A01";
export const NBS_PPI_SYNC_SCRIPT = "scripts/data-worker/sync-nbs-ppi.ts";

export type NbsPpiMeasure = "index" | "yoy" | "mom";
export type NbsPpiComponent = { key: string; displayName: string; nbsLabel: string; group: "aggregate" | "industry" };

const aggregate: NbsPpiComponent[] = [
  { key: "headline", displayName: "工业生产者出厂价格", nbsLabel: "工业生产者出厂价格指数", group: "aggregate" },
  { key: "production_materials", displayName: "生产资料", nbsLabel: "生产资料工业生产者出厂价格指数", group: "aggregate" },
  { key: "consumer_materials", displayName: "生活资料", nbsLabel: "生活资料工业生产者出厂价格指数", group: "aggregate" },
];

const industries: readonly [string, string][] = [
  ["coal_mining", "煤炭开采和洗选业"], ["oil_gas_mining", "石油和天然气开采业"], ["ferrous_mining", "黑色金属矿采选业"],
  ["nonferrous_mining", "有色金属矿采选业"], ["nonmetal_mining", "非金属矿采选业"], ["mining_support", "开采专业及辅助性活动"],
  ["other_mining", "其他采矿业"], ["agri_food", "农副食品加工业"], ["food", "食品制造业"], ["beverage", "酒、饮料及精制茶制造业"],
  ["tobacco", "烟草制品业"], ["textile", "纺织业"], ["apparel", "纺织服装、服饰业"], ["leather", "皮革、毛皮、羽毛及其制品和制鞋业"],
  ["wood", "木材加工和木、竹、藤、棕、草制品业"], ["furniture", "家具制造业"], ["paper", "造纸和纸制品业"],
  ["printing", "印刷和记录媒介复制业"], ["culture_goods", "文教、工美、体育和娱乐用品制造业"], ["petroleum_coal", "石油、煤炭及其他燃料加工业"],
  ["chemicals", "化学原料和化学制品制造业"], ["pharma", "医药制造业"], ["chemical_fiber", "化学纤维制造业"],
  ["rubber_plastic", "橡胶和塑料制品业"], ["nonmetal_products", "非金属矿物制品业"], ["ferrous_smelting", "黑色金属冶炼和压延加工业"],
  ["nonferrous_smelting", "有色金属冶炼和压延加工业"], ["metal_products", "金属制品业"], ["general_equipment", "通用设备制造业"],
  ["special_equipment", "专用设备制造业"], ["automobile", "汽车制造业"], ["transport_equipment", "铁路、船舶、航空航天和其他运输设备制造业"],
  ["electrical_equipment", "电气机械和器材制造业"], ["electronics", "计算机、通信和其他电子设备制造业"], ["instruments", "仪器仪表制造业"],
  ["other_manufacturing", "其他制造业"], ["resource_recycling", "废弃资源综合利用业"], ["repair", "金属制品、机械和设备修理业"],
  ["power_heat", "电力、热力生产和供应业"], ["gas", "燃气生产和供应业"], ["water", "水的生产和供应业"],
];

export const NBS_PPI_COMPONENTS: readonly NbsPpiComponent[] = [
  ...aggregate,
  ...industries.map(([key, displayName]) => ({ key, displayName, nbsLabel: `${displayName}工业生产者出厂价格指数`, group: "industry" as const })),
];

export const NBS_PPI_MEASURES: readonly { key: NbsPpiMeasure; label: string; unit: string }[] = [
  { key: "index", label: "指数（上年同月=100）", unit: "指数" },
  { key: "yoy", label: "同比", unit: "%" },
  { key: "mom", label: "环比", unit: "%" },
];

export const NBS_PPI_CIDS = {
  yoyIndexAggregate: "60e8b361f11c4a878c652a6487a25561",
  momAggregate: "677cfbb4f06941af8c1761c4804e58cf",
  yoyIndexIndustries: ["8c707b6da5df4703abd7278835e8e668", "8c1e3ad3a3a449559f9447918450e193", "a9a6bab463334e6c8dc2c66cf114a25e", "8bc27b5fd28e46df9b8fda8a5d336306"],
  momIndustries: ["03d0e12f03c74b29a24a6775ce18a494", "b69b3df625af46f49dc6898b070d7f43"],
} as const;

export function nbsPpiCode(component: string, measure: NbsPpiMeasure): string {
  return `nbs_cn_ppi_${component}_${measure}`;
}

export function nbsPpiDefinition(code: string) {
  for (const component of NBS_PPI_COMPONENTS) for (const measure of NBS_PPI_MEASURES) {
    if (nbsPpiCode(component.key, measure.key) === code) return { component, measure };
  }
  return null;
}

export const NBS_PPI_INSTRUMENT_CODES = NBS_PPI_COMPONENTS.flatMap((component) =>
  NBS_PPI_MEASURES.map((measure) => nbsPpiCode(component.key, measure.key)),
);

export const NBS_PPI_SOURCE = {
  id: "nbs-ppi", agencyId: "cn-nbs", name: "国家统计局中国工业生产者价格发布", baseUrl: NBS_PPI_INDEX_URL,
  termsUrl: "https://www.stats.gov.cn/english/nbs/200701/t20070104_59236.html",
} as const;
