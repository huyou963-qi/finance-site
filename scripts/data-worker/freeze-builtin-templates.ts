/**
 * 把「还没有 admin 覆盖配置」的内置系统模板按当前线上效果生成覆盖配置 JSON（2026-09-22）。
 *
 * npm run data:freeze-builtin-templates -- --out=/tmp/builtin-template-overrides.json
 *
 * 用途：让系统模板只有 HK 库里一份（SystemMacroChartPrefs）、只能 admin 编辑。代码里的内置定义
 * 在库里有覆盖项时就不再生效，所以把没有覆盖项的模板各固化一份进库，以后改代码不会再悄悄改线上模板。
 *
 * **本脚本不写库**，只输出 JSON；写入走已登录 admin 的 /api/tools/macro-chart-prefs（PUT 系统部分），
 * 与界面「覆盖」同一接口。生成逻辑与页面加载一致：mergeBuiltinTemplateOverride 之后
 * resolveBuiltinTemplate（Overview 模板按线上目录允许列表算出指标与图位，其余原样）。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { getFredCatalogCached } from "../../src/lib/data/fredCatalog";
import type { BuiltinTemplateOverride } from "../../src/lib/data/macroChartPrefs";
import { loadSystemMacroChartPrefs } from "../../src/lib/data/macroChartPrefs";
import * as templates from "../../src/lib/data/macroPresetTemplates";
import type { MacroChartTemplate } from "../../src/lib/data/macroPresetTemplates";

/** 与 MacroSection 的 builtInTemplates 列表一致（页面实际展示的内置模板） */
const DISPLAYED_BUILTIN_EXPORTS = [
  "BUILTIN_CHINA_OVERVIEW_TEMPLATE", "BUILTIN_CN_BALANCE_OF_PAYMENTS_OVERVIEW_TEMPLATE",
  "BUILTIN_CN_ECONOMY_OVERVIEW_GROWTH_TEMPLATE", "BUILTIN_CN_ECONOMY_OVERVIEW_POLICY_TEMPLATE",
  "BUILTIN_CN_FINANCIAL_LIQUIDITY_CREDIT_TEMPLATE", "BUILTIN_CN_FINANCIAL_LIQUIDITY_FUNDING_TEMPLATE",
  "BUILTIN_CN_FISCAL_EXPENDITURE_TEMPLATE", "BUILTIN_CN_FISCAL_OVERVIEW_TEMPLATE", "BUILTIN_CN_FISCAL_REVENUE_TEMPLATE",
  "BUILTIN_DEBT_CAPACITY_TEMPLATE", "BUILTIN_GOLD_ANALYSIS_TEMPLATE", "BUILTIN_JAPAN_OVERVIEW_TEMPLATE",
  "BUILTIN_US_BALANCE_OF_PAYMENTS_OVERVIEW_TEMPLATE", "BUILTIN_US_CONSUMER_BALANCE_SHEET_TEMPLATE",
  "BUILTIN_US_CONSUMER_BALANCE_SPENDING_TEMPLATE", "BUILTIN_US_CPI_DRIVERS_TEMPLATE", "BUILTIN_US_CPI_OVERVIEW_TEMPLATE",
  "BUILTIN_US_CPI_SUBITEMS_TEMPLATE", "BUILTIN_US_CYCLE_RISK_MOMENTUM_TEMPLATE", "BUILTIN_US_CYCLE_RISK_SIGNALS_TEMPLATE",
  "BUILTIN_US_ECON_DEMAND_TEMPLATE", "BUILTIN_US_ECON_OVERVIEW_TEMPLATE", "BUILTIN_US_EXTERNAL_DOLLAR_BALANCE_TEMPLATE",
  "BUILTIN_US_EXTERNAL_DOLLAR_OVERVIEW_TEMPLATE", "BUILTIN_US_FISCAL_HIGHFREQ_TEMPLATE", "BUILTIN_US_FISCAL_OVERVIEW_TEMPLATE",
  "BUILTIN_US_FISCAL_STRUCTURE_TEMPLATE", "BUILTIN_US_HOUSING_ACTIVITY_TEMPLATE", "BUILTIN_US_HOUSING_PRICE_FINANCE_TEMPLATE",
  "BUILTIN_US_INDUSTRY_INVENTORY_CYCLE_TEMPLATE", "BUILTIN_US_INDUSTRY_INVENTORY_ORDERS_TEMPLATE",
  "BUILTIN_US_LABOR_DRIVERS_TEMPLATE", "BUILTIN_US_LABOR_OVERVIEW_TEMPLATE", "BUILTIN_US_MONETARY_CONDITIONS_TEMPLATE",
  "BUILTIN_US_MONETARY_OVERVIEW_TEMPLATE", "BUILTIN_US_OVERVIEW_TEMPLATE", "BUILTIN_US_REGIME_TEMPLATE",
] as const;

function toOverride(tpl: MacroChartTemplate): BuiltinTemplateOverride {
  return {
    name: tpl.name,
    description: tpl.description,
    ...(tpl.indicatorIntroNotes ? { indicatorIntroNotes: tpl.indicatorIntroNotes } : {}),
    ...(tpl.chartIntroNotes ? { chartIntroNotes: tpl.chartIntroNotes } : {}),
    selectedKeys: [...tpl.selectedKeys],
    ...(tpl.selectedListItems ? { selectedListItems: tpl.selectedListItems } : {}),
    layoutMode: tpl.layoutMode,
    slotAssignment: { ...tpl.slotAssignment },
    seriesVisualMap: { ...tpl.seriesVisualMap },
    ...(tpl.displayConfig ? { displayConfig: tpl.displayConfig } : {}),
    ...(tpl.seriesCalcConfigMap ? { seriesCalcConfigMap: tpl.seriesCalcConfigMap } : {}),
    ...(tpl.derivedCalcs ? { derivedCalcs: tpl.derivedCalcs } : {}),
    updatedAtIso: new Date().toISOString(),
  };
}

async function main() {
  const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? "builtin-template-overrides.json";
  const system = await loadSystemMacroChartPrefs();
  const hidden = new Set(system.hiddenBuiltinTemplateIds ?? []);
  const { allowlist } = await getFredCatalogCached();

  const result: Record<string, BuiltinTemplateOverride> = {};
  const skipped: string[] = [];
  for (const name of DISPLAYED_BUILTIN_EXPORTS) {
    const tpl = (templates as unknown as Record<string, MacroChartTemplate | undefined>)[name];
    if (!tpl?.id) throw new Error(`macroPresetTemplates 缺少导出 ${name}`);
    if (system.builtinTemplateOverrides[tpl.id]) {
      skipped.push(`${tpl.id}（已有覆盖）`);
      continue;
    }
    if (hidden.has(tpl.id)) {
      skipped.push(`${tpl.id}（已隐藏）`);
      continue;
    }
    const resolved = templates.resolveBuiltinTemplate(tpl, allowlist, new Map());
    // CPI 分项矩阵这类特殊视图本就不选指标（displayConfig.slotModes 里带 cpiMomMatrix 等），可以为空
    const hasSpecialSlot = Object.keys(resolved.displayConfig?.slotModes ?? {}).length > 0;
    if (resolved.selectedKeys.length === 0 && !hasSpecialSlot) {
      throw new Error(`${tpl.id} 解析后没有任何指标，拒绝固化空模板`);
    }
    result[tpl.id] = toOverride(resolved);
    console.log(`  + ${tpl.id}：${resolved.selectedKeys.length} 个指标，${resolved.layoutMode} 图`);
  }
  writeFileSync(out, JSON.stringify(result));
  console.log(`[freeze-builtin-templates] 生成 ${Object.keys(result).length} 个 → ${out}；跳过 ${skipped.length}：${skipped.join("、")}`);
  await new PrismaClient().$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
