import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalCatalogLayout, resolveGlobalCatalogPlacement } from "./globalCatalogTaxonomy";
import type { UnifiedCatalogItem } from "./fredCatalog";
import { BOJ_SERIES } from "./scheduler/boj/catalog";
import { JGB_SERIES } from "./scheduler/japanMofJgb/catalog";
import { JP_ESRI_GDP_SERIES } from "./scheduler/jpEsriGdp/catalog";
import { JP_METI_IIP_SERIES } from "./scheduler/jpMetiIip/catalog";
import { JP_ESTAT_CPI_SERIES } from "./scheduler/eStat/cpiCatalog";
import { JP_ESTAT_LABOR_SERIES } from "./scheduler/eStat/laborCatalog";
import { JP_ESTAT_HOUSEHOLD_SERIES } from "./scheduler/eStat/householdCatalog";
import { JP_MHLW_MONTHLY_LABOUR_SERIES } from "./scheduler/jpMhlwMonthlyLabour/catalog";
import { JP_ESRI_CONSUMER_CONFIDENCE_SERIES } from "./scheduler/jpEsriConsumerConfidence/catalog";
import { JP_BOJ_BOP_SERIES } from "./scheduler/bojExternal/catalog";
import { JP_BOJ_CORE_SERIES } from "./scheduler/bojCore/catalog";
import { JP_CAO_WATCHERS_SERIES } from "./scheduler/jpCabinetEconomyWatchers/catalog";
import { JP_METI_RETAIL_SERIES } from "./scheduler/jpMetiRetail/catalog";
import { JP_ESRI_MACHINERY_ORDERS_SERIES } from "./scheduler/jpEsriMachineryOrders/catalog";
import { JP_MOF_RESERVES_SERIES } from "./scheduler/jpMofReserves/catalog";
import { JP_JNTO_VISITOR_ARRIVALS_SERIES } from "./scheduler/jpJntoVisitorArrivals/catalog";
import { JP_CUSTOMS_TRADE_SERIES } from "./scheduler/jpCustomsTrade/catalog";
import { JP_MOF_EXTERNAL_POSITION_SERIES } from "./scheduler/jpMofExternalPosition/catalog";
import { JP_MOF_SECURITIES_SERIES } from "./scheduler/jpMofSecuritiesTransactions/catalog";
import { JP_MOF_CORPORATE_FISCAL_SERIES } from "./scheduler/jpMofCorporateFiscal/catalog";
import { JP_CYCLE_LABOR_SERIES } from "./scheduler/jpCycleLabor/catalog";
import { JP_TOURISM_CORE_SERIES } from "./scheduler/jpTourismCore/catalog";
import { JP_HOUSING_POPULATION_ESTAT_SERIES, JP_MLIT_PROPERTY_PRICE_SERIES } from "./scheduler/jpHousingPopulation/catalog";

test("Japan source facts retain economic placement despite ambiguous names", () => {
  const items: UnifiedCatalogItem[] = [
    ...BOJ_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.displayName, frequency: r.freqLabel, provider: "mds" as const, countryCode: "JP", categoryName: r.category })),
    ...JGB_SERIES.map((r) => ({ key: `mds:${r.code}`, label: r.name, frequency: "日" as const, provider: "mds" as const, countryCode: "JP", categoryName: "国债收益率曲线" })),
    ...JP_ESRI_GDP_SERIES.map((r) => ({ key: `mds:${r.code}`, label: r.name, frequency: "季度" as const, provider: "mds" as const, countryCode: "JP", categoryName: r.category })),
    ...JP_METI_IIP_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: "国民经济" })),
    ...JP_ESTAT_CPI_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: r.category })),
    ...JP_ESTAT_LABOR_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: "劳动力市场" })),
    ...JP_ESTAT_HOUSEHOLD_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: "国民经济" })),
    ...JP_MHLW_MONTHLY_LABOUR_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: "劳动力市场" })),
    ...JP_ESRI_CONSUMER_CONFIDENCE_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: "国民经济" })),
    ...JP_BOJ_BOP_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.displayName, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: "对外与汇率" })),
    ...JP_BOJ_CORE_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.displayName, frequency: r.freqLabel, provider: "mds" as const, countryCode: "JP", categoryName: r.category })),
    ...JP_CAO_WATCHERS_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: "国民经济" })),
    ...JP_METI_RETAIL_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: "国民经济" })),
    ...JP_ESRI_MACHINERY_ORDERS_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: "国民经济" })),
    ...JP_MOF_RESERVES_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: "对外与汇率" })),
    ...JP_JNTO_VISITOR_ARRIVALS_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: "对外与汇率" })),
    ...JP_CUSTOMS_TRADE_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: "对外与汇率" })),
    ...JP_MOF_EXTERNAL_POSITION_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "季度" as const, provider: "mds" as const, countryCode: "JP", categoryName: "对外与汇率" })),
    ...JP_MOF_SECURITIES_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: "对外与汇率" })),
    ...JP_MOF_CORPORATE_FISCAL_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: r.granularity === "QUARTERLY" ? "季度" as const : "年" as const, provider: "mds" as const, countryCode: "JP", categoryName: r.dataset === "corporate" ? "国民经济" : "财政与公共债务" })),
    ...JP_CYCLE_LABOR_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: r.category })),
    ...JP_TOURISM_CORE_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: r.frequency === "季" ? "季度" as const : "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: r.category })),
    ...JP_HOUSING_POPULATION_ESTAT_SERIES.map((r) => ({ key: `mds:${r.instrumentCode}`, label: r.label, frequency: r.freqLabel, provider: "mds" as const, countryCode: "JP", categoryName: r.subcategory === "住宅开工" ? "地产与建筑" : "劳动力市场" })),
    { key: `mds:${JP_MLIT_PROPERTY_PRICE_SERIES.instrumentCode}`, label: JP_MLIT_PROPERTY_PRICE_SERIES.label, frequency: "月" as const, provider: "mds" as const, countryCode: "JP", categoryName: "地产与建筑" },
  ];
  // GDP residential investment remains an expenditure account; not housing-market data.
  assert.equal(resolveGlobalCatalogPlacement(items.find((i) => i.key === "mds:esri_jp_gdp_private_residential_real_saar")!).category, "国民经济");
  assert.equal(resolveGlobalCatalogPlacement(items.find((i) => i.key === "mds:boj_jp_bank_loans")!).category, "金融条件与银行");
  const country = buildGlobalCatalogLayout([{ code: "JP", name: "日本", categories: [{ name: "source", items }] }])[0]!;
  const leaves = country.categories.flatMap((c) => c.subgroups);
  const keys = leaves.flatMap((s) => s.itemKeys);
  assert.equal(keys.length, 150);
  assert.equal(new Set(keys).size, keys.length);
  assert(leaves.every((s) => s.itemKeys.length <= 48 && /（[年月季日]频）$/.test(s.name)));
  assert(country.categories.every((c) => c.itemKeys.length === 0));
});
