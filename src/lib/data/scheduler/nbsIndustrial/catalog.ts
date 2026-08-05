/** 国家统计局：规模以上工业增加值。官方只发布总项环比，分项发布当月/累计同比。 */
import { NBS_PPI_COMPONENTS } from "../nbsPpi/catalog";

export const NBS_DATA_API_BASE = "https://data.stats.gov.cn/dg/website/publicrelease/web/external";
export const NBS_MONTHLY_ROOT_ID = "fc982599aa684be7969d7b90b1bd0e84";
export const NBS_INDUSTRIAL_INDEX_URL = "https://www.stats.gov.cn/sj/zxfb/";
export const NBS_INDUSTRIAL_SYNC_SCRIPT = "scripts/data-worker/sync-nbs-industrial.ts";
export type IndustrialMeasure = "yoy" | "cumulative_yoy" | "mom";
export type IndustrialComponent = { key: string; displayName: string; nbsLabel: string; group: "headline" | "ownership" | "sector" | "industry" };

export const NBS_INDUSTRIAL_COMPONENTS: readonly IndustrialComponent[] = [
  { key: "headline", displayName: "规模以上工业增加值", nbsLabel: "规上工业增加值", group: "headline" },
  ...[["state_owned", "国有控股企业"], ["private", "私营企业"], ["collective", "集体企业"], ["cooperative", "股份合作企业"], ["joint_stock", "股份制企业"], ["foreign_hkmt", "外商及港澳台投资企业"]].map(([key, displayName]) => ({ key, displayName, nbsLabel: displayName, group: "ownership" as const })),
  ...[["mining", "采矿业"], ["manufacturing", "制造业"], ["utilities", "电力、热力、燃气及水生产和供应业"]].map(([key, displayName]) => ({ key, displayName, nbsLabel: displayName, group: "sector" as const })),
  ...NBS_PPI_COMPONENTS.filter((item) => item.group === "industry").map((item) => ({ key: item.key, displayName: item.displayName, nbsLabel: item.displayName, group: "industry" as const })),
];

export const NBS_INDUSTRIAL_CIDS = {
  headline: "3f2e14f0542348ed9fe02476eca3450b",
  ownership: "b1d8cee1b413494bab668fbae92d80ac",
  sector: "2b06ed9af69a441684ef906a27d0faf8",
  industries: ["240338c22ce6470d80754833eae62a73", "41f883ee51194da893cb6b8d4186f32b", "f581720fd0f04d81a77bccebb429b913"],
} as const;

/** Instrument.code 上限为 48；累计同比以 cyoy 保持稳定且不截断行业代码。 */
export function nbsIndustrialCode(component: string, measure: IndustrialMeasure) {
  const suffix: Record<IndustrialMeasure, string> = { yoy: "yoy", cumulative_yoy: "cyoy", mom: "mom" };
  return `nbs_cn_industrial_${component}_${suffix[measure]}`;
}
export const NBS_INDUSTRIAL_CODES = NBS_INDUSTRIAL_COMPONENTS.flatMap((component) =>
  (["yoy", "cumulative_yoy"] as const).map((measure) => nbsIndustrialCode(component.key, measure)).concat(component.group === "headline" ? [nbsIndustrialCode(component.key, "mom")] : []),
);
export const NBS_INDUSTRIAL_SOURCE = { id: "nbs-industrial", agencyId: "cn-nbs", name: "国家统计局中国规模以上工业增加值发布", baseUrl: NBS_INDUSTRIAL_INDEX_URL, termsUrl: "https://www.stats.gov.cn/english/nbs/200701/t20070104_59236.html" } as const;
