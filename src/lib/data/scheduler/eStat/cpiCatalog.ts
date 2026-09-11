/** Verified against e-Stat getMetaInfo 0004052037 on 2026-09-10.
 * Index levels only; legacy jpov CPI YoY/MoM are different measures.
 * Never splice 2020-base values into this 2025-base official linked history.
 */
export const JP_ESTAT_CPI_TABLE = "0004052037";
export const JP_ESTAT_CPI_SOURCE_ID = "estat-jp";
export const JP_ESTAT_CPI_URL = "https://www.e-stat.go.jp/dbview?sid=0004052037";
const ITEMS = [
  ["all", "0001", "总项"], ["ex_fresh", "0161", "除生鲜食品"],
  ["ex_fresh_energy", "0178", "除生鲜食品及能源"],
  ["food", "0002", "食品"], ["housing", "0045", "居住"],
  ["utilities", "0054", "水电燃气"], ["furnishings", "0060", "家具及家务用品"],
  ["clothing", "0082", "服装及鞋类"], ["health", "0107", "医疗保健"],
  ["transport", "0111", "交通通信"], ["education", "0118", "教育"],
  ["recreation", "0122", "文化娱乐"], ["misc", "0145", "其他杂项"],
] as const;
export const JP_ESTAT_CPI_SERIES = ([
  ["national", "00000", "全国", "jp.sbj.cpi"],
  ["tokyo", "13100", "东京区部", "jp.sbj.tokyo_cpi"],
] as const).flatMap(([region, area, regionLabel, releasePackageId]) => ITEMS.map(([slug, item, label]) => ({
  instrumentCode: `jp_estat_cpi_2025_${region}_${slug}`,
  label: `CPI：${regionLabel}：${label}（2025=100）`, region, releasePackageId,
  unit: "指数（2025=100）", category: "通胀与价格",
  eStat: { statsDataId: JP_ESTAT_CPI_TABLE, filters: { cdTab: "1", cdCat01: item, cdArea: area }, frequency: "M" as const },
})));

