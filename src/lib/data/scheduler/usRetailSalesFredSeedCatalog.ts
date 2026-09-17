import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import { defaultEconomicCalendarRule } from "./releaseRule";

/**
 * 美国零售销售分项（Census Advance Monthly Retail Trade Survey，by kind of business）
 *
 * 全部与 RSAFS/RSXFS 同源同刻发布（Census 每月中旬 Advance 报告），
 * 归入既有发布包 `us.bls.retail_sales`（releasePackageCatalog.ts），
 * 更新方式：经济日历型（economic_calendar），FRED 增量拉取。
 */

export type UsRetailSalesFredSeedRow = {
  fredId: string;
  code: string;
  name: string;
  displayName: string;
  freqLabel: string;
  granularity: DataGranularity;
  unit: string;
  category: string;
  countryCode: "US";
  source: string;
  sourceUpdateNote: string;
  releasePackageId: string;
};

function usRetailSalesFredRow(
  fredId: string,
  displayName: string,
  unit = "百万美元",
): UsRetailSalesFredSeedRow {
  return {
    fredId,
    code: `sched_fred_${fredId}`,
    name: displayName,
    displayName,
    freqLabel: "月",
    granularity: "MONTHLY",
    unit,
    category: "国内贸易与消费",
    countryCode: "US",
    source: "Census/FRED",
    sourceUpdateNote: "Advance Monthly Sales for Retail and Food Services",
    releasePackageId: "us.bls.retail_sales",
  };
}

export function buildUsRetailSalesInstrumentMetadata(
  row: UsRetailSalesFredSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const existing = opts?.existing ?? {};
  const next: Record<string, unknown> = {
    ...existing,
    sourceTag: "us-retail-sales-fred-seed",
    source: row.source,
    sourceUpdateNote: row.sourceUpdateNote,
    countryCode: row.countryCode,
    countryNameZh: "美国",
    displayName: row.displayName,
    catalogCategory: usMetadataCatalogCategory({
      code: row.code,
      fredId: row.fredId,
      label: row.displayName,
      legacyCategory: row.category,
    }),
    freqLabel: row.freqLabel,
    unit: row.unit,
    catalogKey: `fred:${row.fredId}`,
  };
  if (opts?.dataLastObsDateIso) {
    next.dataLastObsDateIso = opts.dataLastObsDateIso;
  }
  return next;
}

/**
 * 19 条 Advance Monthly Retail Trade Survey「by kind of business」分项 + 加总口径，
 * 与已入库的 RSAFS（含餐饮总额）/RSXFS（零售贸易）互补，覆盖 Census Table 2 的全部行。
 *
 * 未入库：4522 Department Stores（NAICS 二级子项）——原 FRED 序列 RSDSELD 已于
 * 2025-03 后停止更新（AIES 方法论调整导致 Advance 口径下架该分项），FRED 上未找到
 * 对应的现行 Advance 替代序列，仅有滞后 ~2 个月的非 Advance 月度调查版本
 * （SM4522USS），与本包其余序列的发布节奏不一致，故不纳入本次入库，留待人工确认。
 */
export const US_RETAIL_SALES_FRED_SERIES: readonly UsRetailSalesFredSeedRow[] = [
  // —— 加总口径（与 RSAFS/RSXFS 互补） ——
  usRetailSalesFredRow("RSFSXMV", "零售销售总额（不含机动车与零部件）"),
  usRetailSalesFredRow("MARTSSM44Z72USS", "零售销售总额（不含加油站）"),
  usRetailSalesFredRow(
    "MARTSSM44W72USS",
    "零售销售总额（不含机动车与零部件、加油站）",
  ),
  // —— by kind of business（NAICS 441–722，14 大类） ——
  usRetailSalesFredRow("RSMVPD", "零售销售：机动车与零部件经销商"),
  usRetailSalesFredRow("RSFHFS", "零售销售：家具与家居用品店"),
  usRetailSalesFredRow("RSEAS", "零售销售：电子电器店"),
  usRetailSalesFredRow("RSBMGESD", "零售销售：建材园艺用品店"),
  usRetailSalesFredRow("RSDBS", "零售销售：食品与饮料店"),
  usRetailSalesFredRow("RSHPCS", "零售销售：健康与个人护理店"),
  usRetailSalesFredRow("RSGASS", "零售销售：加油站"),
  usRetailSalesFredRow("RSCCAS", "零售销售：服装及饰品店"),
  usRetailSalesFredRow("RSSGHBMS", "零售销售：运动用品、爱好、乐器及书店"),
  usRetailSalesFredRow("RSGMS", "零售销售：综合商品店"),
  usRetailSalesFredRow("RSMSR", "零售销售：其他杂项零售店"),
  usRetailSalesFredRow("RSNSR", "零售销售：无店铺零售商"),
  usRetailSalesFredRow("RSFSDP", "零售销售：餐饮服务与饮品场所"),
  // —— NAICS 子项（Table 2 的二级明细行） ——
  usRetailSalesFredRow("RSGCS", "零售销售：食品杂货店"),
  usRetailSalesFredRow("RSAOMV", "零售销售：汽车及其他机动车经销商"),
] as const;

export const US_RETAIL_SALES_FRED_IDS = new Set(
  US_RETAIL_SALES_FRED_SERIES.map((x) => x.fredId),
);

export function releaseRuleForUsRetailSalesFred(row: UsRetailSalesFredSeedRow) {
  return defaultEconomicCalendarRule(row.granularity);
}
