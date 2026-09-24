import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import { defaultReleaseRuleForGranularity, type ReleaseRule } from "./releaseRule";

/**
 * EIA 能源价格（经 FRED）——CPI 能源分项的高频代理。
 *
 * - GASREGW：全美普通汽油零售均价（周度，EIA「Gasoline and Diesel Fuel Update」，
 *   FRED release 183）。每周一采价、当日傍晚发布，是 CPI 汽油分项最直接的代理：
 *   月均零售价环比 ≈ 未季调汽油 CPI 环比（2018–2026 样本外相关 0.94）。
 * - DHHNGSP：亨利港天然气现货（日频，FRED release 342），领先 CPI 管道燃气/电力 1–2 月。
 * - DJFUELUSGULF：墨西哥湾航空煤油现货（日频，release 212），CPI 机票的成本代理。
 * - DHOILNYH：纽约港 2 号取暖油现货（日频，release 212），CPI 燃油分项代理。
 *
 * 全部为 FRED 原生序列（2026-09-24 逐条核实 ID、频率、单位与 release），复用既有
 * FRED adapter / writer / scheduler，不新增抓取器。EIA 现货在 FRED 上每周三左右批量
 * 更新（与 DCOILWTICO 同批），源端滞后约一周；汽油周度序列在周二前后到 FRED。
 *
 * 目录：`usCatalogTaxonomy.FRED_INFLATION_EXPECT_ENERGY` 显式归「通胀与价格 > 通胀预期与能源」，
 * 与 WTI 现货/期货同组；前台经 `FRED_US_ITEMS` 以 `fred:<ID>` 呈现。
 */
export type EiaEnergyPricesFredSeedRow = {
  fredId: string;
  code: string;
  name: string;
  displayName: string;
  freqLabel: string;
  granularity: DataGranularity;
  unit: string;
  category: string;
  source: string;
  sourceUpdateNote: string;
  releasePackageId: string;
};

function row(
  fredId: string,
  name: string,
  displayName: string,
  freqLabel: string,
  granularity: DataGranularity,
  unit: string,
  sourceUpdateNote: string,
  releasePackageId: string,
): EiaEnergyPricesFredSeedRow {
  return {
    fredId,
    code: `sched_fred_${fredId}`,
    name,
    displayName,
    freqLabel,
    granularity,
    unit,
    category: "通胀驱动因子",
    source: "EIA/FRED",
    sourceUpdateNote,
    releasePackageId,
  };
}

export const EIA_ENERGY_PRICES_FRED_SERIES: readonly EiaEnergyPricesFredSeedRow[] = [
  row(
    "GASREGW",
    "US Regular All Formulations Gas Price",
    "美国普通汽油零售均价（周度）",
    "周",
    "WEEKLY",
    "美元/加仑",
    "EIA 每周一采价、当日发布（Gasoline and Diesel Fuel Update，1990-08 起）",
    "us.eia.gasoline_diesel",
  ),
  row(
    "DHHNGSP",
    "Henry Hub Natural Gas Spot Price",
    "亨利港天然气现货价格",
    "日",
    "DAILY",
    "美元/百万英热",
    "EIA 现货，FRED 约每周三批量更新（1997-01 起）",
    "us.eia.natural_gas_spot",
  ),
  row(
    "DJFUELUSGULF",
    "Kerosene-Type Jet Fuel Prices: U.S. Gulf Coast",
    "航空煤油现货价格（美国墨西哥湾）",
    "日",
    "DAILY",
    "美元/加仑",
    "EIA 现货，FRED 约每周三批量更新（1990-04 起）",
    "us.eia.spot_prices",
  ),
  row(
    "DHOILNYH",
    "No. 2 Heating Oil Prices: New York Harbor",
    "2 号取暖油现货价格（纽约港）",
    "日",
    "DAILY",
    "美元/加仑",
    "EIA 现货，FRED 约每周三批量更新（1986-06 起）",
    "us.eia.spot_prices",
  ),
] as const;

export const EIA_ENERGY_PRICES_FRED_IDS = new Set(
  EIA_ENERGY_PRICES_FRED_SERIES.map((item) => item.fredId),
);

export function buildEiaEnergyPricesInstrumentMetadata(
  item: EiaEnergyPricesFredSeedRow,
  opts?: {
    existing?: Record<string, unknown> | null;
    dataLastObsDateIso?: string | null;
  },
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ...(opts?.existing ?? {}),
    sourceTag: "eia-energy-prices-fred-seed",
    source: item.source,
    sourceUpdateNote: item.sourceUpdateNote,
    countryCode: "US",
    countryNameZh: "美国",
    displayName: item.displayName,
    catalogCategory: usMetadataCatalogCategory({
      code: item.code,
      fredId: item.fredId,
      label: item.displayName,
      legacyCategory: item.category,
    }),
    freqLabel: item.freqLabel,
    unit: item.unit,
    catalogKey: `fred:${item.fredId}`,
  };
  if (!metadata.fetchAcquisition) {
    metadata.fetchAcquisition = {
      status: "known",
      method: "subscription_fred",
      methodLabel: "FRED 定时订阅 API",
      officialUrl: `https://fred.stlouisfed.org/series/${item.fredId}`,
      probedAt: new Date().toISOString(),
      message: "FRED 序列 ID 已人工核实存在（seed 预标 known）",
    };
  }
  if (opts?.dataLastObsDateIso) metadata.dataLastObsDateIso = opts.dataLastObsDateIso;
  return metadata;
}

/** 日频 6 小时、周频 12 小时探测（与其余日/周频 FRED 市场数据一致） */
export function releaseRuleForEiaEnergyPrices(granularity: DataGranularity): ReleaseRule {
  return defaultReleaseRuleForGranularity(granularity);
}
