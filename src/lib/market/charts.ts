import * as presets from "@/lib/data/macroPresetTemplates";
import type { MacroChartTemplate, MacroSeriesCalcConfig } from "@/lib/data/macroPresetTemplates";
import { loadSystemMacroChartPrefs, mergeBuiltinTemplateOverride } from "@/lib/data/macroChartPrefs";
import { applyMacroSeriesSteps, resampleMacroSeries } from "@/lib/macroCalculationEngine";
import { applyMacroSeriesOp } from "@/lib/data/macroSeriesTransform";
import { applyMacroDerivedValue } from "@/lib/macroDerivedCalc";
import { trailingMean } from "@/lib/macroRolling";
import { parseMacroDateLabelToUtcMs, sortMacroPeriodLabels } from "@/lib/macroPeriodLabel";
import { buildMacroSeriesCalcSuffix, decorateMacroSeriesDisplayName, effectiveMacroSeriesUnit } from "@/lib/macroSeriesDisplayName";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { queryMarketData } from "./data";
import { describeIndicator, housingIndicatorBasis, indicatorCoverage, resolveIndicator } from "./indicators";
import { getChartSchema, MarketError, searchChartsSchema } from "./schema";

function isTemplate(value: unknown): value is MacroChartTemplate {
  return Boolean(value && typeof value === "object" && "selectedKeys" in value && "slotAssignment" in value && "id" in value);
}
export async function chartCatalog() {
  const system = await loadSystemMacroChartPrefs();
  const all: MacroChartTemplate[] = (Object.values(presets) as unknown[]).flatMap(value => Array.isArray(value) ? (value as unknown[]).filter(isTemplate) : isTemplate(value) ? [value] : []);
  const templates = new Map(all.map(t => [t.id, mergeBuiltinTemplateOverride(t, system.builtinTemplateOverrides[t.id])]));
  for (const t of system.customBuiltinTemplates ?? []) templates.set(t.id, t);
  const charts = [];
  for (const t of templates.values()) {
    if (system.hiddenBuiltinTemplateIds?.includes(t.id)) continue;
    for (let slot = 0; slot < t.layoutMode; slot++) {
      const keys = [...new Set([...t.selectedKeys, ...(t.derivedCalcs ?? []).map(d => `calc:${d.id}`)])].filter(key => t.slotAssignment[key] === slot);
      if (!keys.length) continue;
      const mode = t.displayConfig?.slotModes?.[slot] ?? "timeseries";
      const unsupported = keys.some(k => !/^(fred:|mds:|calc:)/.test(k)) || (t.derivedCalcs ?? []).some(d => keys.includes(`calc:${d.id}`) && (d.advanced || d.single || d.disabled || d.postOp)) || !["timeseries", "timeSeries"].includes(mode);
      charts.push({ chartId: `${t.id}:${slot}`, title: t.displayConfig?.slotTitles?.[slot] ?? `${t.name} · 图 ${slot + 1}`, description: t.chartIntroNotes?.[String(slot)] ?? t.description ?? "", page: `/macro?template=${encodeURIComponent(t.id)}`, template: t, slot, keys, supportsEmbed: !unsupported });
    }
  }
  return charts;
}
type CatalogChart = Awaited<ReturnType<typeof chartCatalog>>[number];
function rawKeys(chart: CatalogChart) {
  const keys = chart.keys.filter(k => !k.startsWith("calc:"));
  for (const d of chart.template.derivedCalcs ?? []) if (chart.keys.includes(`calc:${d.id}`)) keys.push(d.leftKey, d.rightKey);
  return [...new Set(keys.map(k => k.split("::")[0]!))];
}
export async function searchCharts(raw: unknown, opts: { includeIndicatorCoverage?: boolean } = {}) {
  const p = searchChartsSchema.parse(raw), terms = [p.query, ...p.tags].join(" ").toLowerCase().split(/[\s,，]+/).filter(Boolean);
  const charts = await chartCatalog();
  const ranked = charts.map(c => {
    const aliases = c.template.id.includes("oil-diesel") ? "oil energy 原油 柴油 brent wti"
      : c.template.id.startsWith("builtin-us-housing-") ? "美国住房 美国住房市场 美国住宅市场 美国房地产 美国楼市 住宅 US housing residential" : "";
    const text = [c.title, c.description, c.template.name, c.chartId, ...c.keys, aliases].join(" ").toLowerCase();
    const score = terms.filter(term => text.includes(term)).length;
    return { c, score, activityOverview: c.chartId === "builtin-us-housing-activity:0" };
  }).filter(x => !terms.length || x.score > 0).sort((a, b) => b.score - a.score || (terms.length ? Number(b.activityOverview) - Number(a.activityOverview) : 0));
  return { charts: await Promise.all(ranked.slice(0, p.limit).map(async ({ c }) => {
    const indicators = opts.includeIndicatorCoverage === false ? [] : await Promise.all(rawKeys(c).map(async key => { try { const r = await resolveIndicator(key); return { indicatorId: r.id, ...await indicatorCoverage(r.id) }; } catch { return { indicatorId: key, availableFrom: null, availableTo: null, unavailable: true }; } }));
    const indicatorBasis = rawKeys(c).flatMap(key => {
      const basis = housingIndicatorBasis(key);
      return basis ? [{ catalogKey: key, ...basis }] : [];
    });
    return { chartId: c.chartId, title: c.title, description: c.description, page: c.page, indicatorIds: indicators.map(i => i.indicatorId), indicators, indicatorBasis,
      chartType: c.template.displayConfig?.slotModes?.[c.slot] ?? "timeseries", supportsEmbed: c.supportsEmbed, supportsInteraction: c.supportsEmbed, supportsData: c.supportsEmbed && rawKeys(c).length <= 8, access: "macro feature policy; system templates only", previewUrl: absoluteUrl(`/articles/charts/${encodeURIComponent(c.chartId)}`), lastUpdatedAt: null, dataUpdateNote: "获取 get_chart / 渲染结果中的各指标数据更新时间；模板更新时间不等于数据更新时间" };
  })), truncated: ranked.length > p.limit };
}
export async function getChart(raw: unknown) {
  const { chartId } = getChartSchema.parse(raw);
  const chart = (await chartCatalog()).find(c => c.chartId === chartId);
  if (!chart) throw new MarketError("NOT_FOUND", "图表不存在、已隐藏或不是系统图表");
  const indicators = await Promise.all(rawKeys(chart).map(async key => { const row = await resolveIndicator(key); return { ...describeIndicator(row), ...await indicatorCoverage(row.id) }; }));
  return { chartId, title: chart.title, description: chart.description, page: chart.page, slot: chart.slot, keys: chart.keys, indicators,
    template: chart.template, supportsEmbed: chart.supportsEmbed, supportsInteraction: chart.supportsEmbed,
    access: "macro", defaultTimeRange: "最近一年（文章引用必须显式指定范围）", alignment: "exact_date_no_fill" };
}
export type ChartDefinition = Awaited<ReturnType<typeof getChart>>;
export function transformChartSeries(categories: string[], data: (number | null)[], cfg?: MacroSeriesCalcConfig) {
  if (!cfg) return { categories, data };
  const scale = (cfg.scale ?? 1) * (cfg.unit === "x100" ? 100 : cfg.unit === "x0.01" ? 0.01 : 1);
  const scaled = data.map(v => v == null ? null : v * scale);
  let result = cfg.steps?.length ? applyMacroSeriesSteps(categories, scaled, cfg.steps) : resampleMacroSeries(categories, cfg.rollingWindow ? trailingMean(scaled, cfg.rollingWindow) : scaled, cfg.frequency, cfg.resampleMethod);
  if (!cfg.steps?.length) {
    result = { ...result, data: applyMacroSeriesOp(result.categories, result.data, cfg.op) };
  }
  return result;
}
function needsPreviousYear(cfg?: MacroSeriesCalcConfig) {
  return cfg?.steps?.length ? cfg.steps.some(step => step.type === "transform" && step.op === "yoy") : cfg?.op === "yoy";
}

export async function renderChartData(chart: ChartDefinition, startDate: string, endDate: string, dataCutoff?: string, options?: { includeYearOverYearLookback?: boolean }) {
  if (!chart.supportsEmbed) throw new MarketError("UNSUPPORTED_CHART", "该系统图表使用尚未支持的高级图型或计算，不能静默简化；请选其他图表");
  if (chart.indicators.length > 8) throw new MarketError("RANGE_TOO_LARGE", "该图表原始指标超过8条，暂不支持文章嵌入");
  const keys = new Set([...chart.keys.filter(k => !k.startsWith("calc:")), ...(chart.template.derivedCalcs ?? []).filter(d => chart.keys.includes(`calc:${d.id}`)).flatMap(d => [d.leftKey, d.rightKey])]);
  const configs = chart.template.seriesCalcConfigMap;
  const useLookback = options?.includeYearOverYearLookback && [...keys].some(key => needsPreviousYear(configs?.[key]));
  const fetchStart = useLookback ? new Date(Date.parse(startDate) - 397 * 86_400_000).toISOString().slice(0, 10) : startDate;
  const result = await queryMarketData({ indicatorIds: chart.indicators.map(i => i.indicatorId), startDate: fetchStart, endDate, dataCutoff, maxPoints: 1000 }, { alignDates: false });
  if (result.truncated) throw new MarketError("RANGE_TOO_LARGE", `图表数据超过本次查询的 ${result.effectiveMaxPoints} 个日期上限，请缩短时间范围`);
  const byKey = new Map(result.series.map(s => [s.indicator.catalogKey, s]));
  const working = new Map<string, { key: string; name: string; categories: string[]; data: (number | null)[]; unit: string | null }>();
  for (const key of keys) {
    const base = byKey.get(key.split("::")[0]!);
    if (!base) throw new MarketError("DATA_UNAVAILABLE", `图表指标 ${key} 不可用`);
    const cfg = configs?.[key];
    if (key.includes("::") && !cfg) throw new MarketError("UNSUPPORTED_CHART", "虚拟指标缺少显式变换配置，拒绝展示原始值");
    const points = useLookback && !needsPreviousYear(cfg) ? base.points.filter(point => point.date >= startDate) : base.points;
    const sampled = transformChartSeries(points.map(p => p.date), points.map(p => p.value), cfg);
    const unit = cfg ? effectiveMacroSeriesUnit(key, cfg, new Map(base.indicator.unit ? [[key, base.indicator.unit]] : [])) : base.indicator.unit;
    const suffix = cfg ? buildMacroSeriesCalcSuffix(cfg) : "";
    const name = decorateMacroSeriesDisplayName(suffix ? `${base.indicator.name} · ${suffix}` : base.indicator.name, { unit });
    working.set(key, { key, name, ...sampled, unit });
  }
  const formulas: string[] = [];
  for (const d of chart.template.derivedCalcs ?? []) {
    if (!chart.keys.includes(`calc:${d.id}`)) continue;
    const left = working.get(d.leftKey), right = working.get(d.rightKey);
    if (!left || !right) throw new MarketError("UNSUPPORTED_CHART", "暂不支持派生序列链，请选择直接引用原始指标的系统图表");
    const r = new Map(right.categories.map((date, i) => [date, right.data[i]]));
    const values = left.categories.map((date, i) => left.data[i] == null || r.get(date) == null ? null : applyMacroDerivedValue(left.data[i]!, r.get(date)!, d.op, d));
    const key = `calc:${d.id}`;
    working.set(key, { key, name: d.name, categories: left.categories, data: values, unit: d.name.match(/[（(](.*?)[）)]/)?.[1] ?? null });
    formulas.push(`${d.name} = ${d.leftScale ?? 1} × ${d.leftKey} ${d.op} ${d.rightScale ?? 1} × ${d.rightKey} (output scale ${d.scale ?? 1}); exact dates only`);
  }
  const displayed = chart.keys.map(k => working.get(k)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const categories = sortMacroPeriodLabels([...new Set(displayed.flatMap(s => s.categories))])
    .filter(date => !useLookback || (parseMacroDateLabelToUtcMs(date) ?? -1) >= Date.parse(startDate));
  const series = displayed.map(s => { const values = new Map(s.categories.map((d, i) => [d, s.data[i]])); return { key: s.key, name: s.name, unit: s.unit, data: categories.map(d => values.get(d) ?? null) }; });
  if (!series.some(s => s.data.some(v => v != null))) throw new MarketError("DATA_UNAVAILABLE", "指定范围/可见截止时间没有可核实数据；未补值或替换来源");
  return { chartId: chart.chartId, title: chart.title, categories, series, sources: result.series.map(s => s.indicator), formulas,
    revisionFingerprints: result.series.map(s => ({ indicatorId: s.indicator.indicatorId, fingerprint: s.revisionFingerprint })),
    lastUpdatedAt: result.series.flatMap(s => s.points.map(p => p.lastUpdatedAt).filter((d): d is string => Boolean(d))).sort().at(-1) ?? null,
    retrievedAt: result.retrievedAt, dataCutoff: dataCutoff ?? null, displayStartDate: startDate, displayEndDate: endDate,
    visualMap: chart.template.seriesVisualMap, displayConfig: chart.template.displayConfig, slot: chart.slot,
    calculationConfig: { series: chart.template.seriesCalcConfigMap, derived: chart.template.derivedCalcs },
  };
}
export type ChartData = Awaited<ReturnType<typeof renderChartData>>;
