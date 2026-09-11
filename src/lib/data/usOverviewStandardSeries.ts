import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type { MacroSeriesCalcConfig } from "@/lib/data/macroPresetTemplates";

/**
 * US_Overview 中不符合项目入库标准的 9 条 xlsx 序列已退役（2026-09-11）。
 *
 * 这些序列来源标注为「美国劳工部 / 美国经济分析局 / Wind」，是 xlsx 导入的月末日期预变换值，
 * 又被调度器挂上 FRED 原始订阅写入月初水平值，两套口径混存（新增非农被写成 ~15 万的水平值）。
 * 标准替代：复用已按 Agent B 流程入库的 `sched_fred_*`（`fred:<ID>[::变换]` 虚拟键 +
 * seriesCalcConfig 在图表侧计算），或新接入的 multpl 抓取序列；`null` 表示无标准替代，
 * 从模板中移除（3 月移动平均无对应计算算子，其源 UNRATE 已入库）。
 */
export type UsOverviewReplacement = {
  key: string;
  calc: MacroSeriesCalcConfig;
};

const NONE: MacroSeriesCalcConfig = { op: "none", frequency: "keep", unit: "keep", resampleMethod: "avg" };
const YOY_MONTH: MacroSeriesCalcConfig = { op: "yoy", frequency: "month", unit: "keep", resampleMethod: "end" };
const DIFF_MONTH: MacroSeriesCalcConfig = { op: "diff", frequency: "month", unit: "keep", resampleMethod: "end" };

export const US_SP500_PE_CODE = "us_sp500_pe";

export const RETIRED_USOV_REPLACEMENTS: Readonly<Record<string, UsOverviewReplacement | null>> = {
  usov_c13_gdp_qoq_saar: { key: "fred:A191RL1Q225SBEA", calc: NONE },
  usov_c16_cpi_yoy: { key: "fred:CPIAUCSL::yoy", calc: YOY_MONTH },
  usov_c17_core_cpi_yoy: { key: "fred:CPILFESL::yoy", calc: YOY_MONTH },
  usov_c18_pce_yoy: { key: "fred:PCEPI::yoy", calc: YOY_MONTH },
  usov_c19_core_pce_yoy: { key: "fred:PCEPILFE::yoy", calc: YOY_MONTH },
  usov_c20_unrate_sa: { key: "fred:UNRATE", calc: NONE },
  usov_c21_unrate_sa_3mma: null,
  usov_c22_nfp: { key: "fred:PAYEMS::diff", calc: DIFF_MONTH },
  usov_c28_sp500_pe: { key: `mds:${US_SP500_PE_CODE}`, calc: NONE },
};

export const RETIRED_USOV_CODES = Object.keys(RETIRED_USOV_REPLACEMENTS);

const REPLACEMENT_BY_KEY = new Map(
  Object.entries(RETIRED_USOV_REPLACEMENTS).map(([code, repl]) => [`mds:${code}`, repl]),
);

export type UsOverviewStandardSeriesDef = {
  key: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4 | 5 | 6;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calc: MacroSeriesCalcConfig;
};

/** 内置 US_Overview 模板中替代退役 xlsx 序列的标准指标（图位/样式沿用原列） */
export const US_OVERVIEW_STANDARD_SERIES: readonly UsOverviewStandardSeriesDef[] = [
  { key: "fred:A191RL1Q225SBEA", displayName: "实际GDP环比折年率", panel: 3, axis: "left", chartType: "line", color: "#f1cd57", calc: NONE },
  { key: "fred:UNRATE", displayName: "失业率", panel: 4, axis: "right", chartType: "line", color: "#f2cf67", calc: NONE },
  { key: "fred:PAYEMS::diff", displayName: "新增非农就业人数", panel: 4, axis: "left", chartType: "bar", color: "#9ea68b", calc: DIFF_MONTH },
  { key: "fred:CPIAUCSL::yoy", displayName: "CPI 同比", panel: 5, axis: "left", chartType: "line", color: "#a7b4c1", calc: YOY_MONTH },
  { key: "fred:CPILFESL::yoy", displayName: "核心CPI 同比", panel: 5, axis: "left", chartType: "line", color: "#5f76b8", calc: YOY_MONTH },
  { key: "fred:PCEPI::yoy", displayName: "PCE 同比", panel: 5, axis: "left", chartType: "line", color: "#d89b4e", calc: YOY_MONTH },
  { key: "fred:PCEPILFE::yoy", displayName: "核心PCE 同比", panel: 5, axis: "left", chartType: "dashedLine", color: "#7fc8c5", calc: YOY_MONTH },
  { key: `mds:${US_SP500_PE_CODE}`, displayName: "标普500市盈率", panel: 1, axis: "right", chartType: "line", color: "#5f76b8", calc: NONE },
];

export const US_OVERVIEW_STANDARD_BY_KEY = new Map(US_OVERVIEW_STANDARD_SERIES.map((row) => [row.key, row]));

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 旧键 → 新键；`null` = 删除；未退役键原样返回 */
function nextKey(key: string): string | null {
  if (!REPLACEMENT_BY_KEY.has(key)) return key;
  return REPLACEMENT_BY_KEY.get(key)?.key ?? null;
}

function remapKeyList(list: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const item of list) {
    if (typeof item !== "string") {
      out.push(item);
      continue;
    }
    const k = nextKey(item);
    if (k === null || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function remapRecord(record: JsonObject): JsonObject {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(record)) {
    const k = nextKey(key);
    if (k === null) continue;
    // 新键已有自己的配置时不被旧键覆盖
    if (k !== key && Object.prototype.hasOwnProperty.call(record, k)) continue;
    out[k] = value;
  }
  return out;
}

/**
 * 把模板/工作区 JSON 中退役 usov 键替换为标准指标键（幂等）。
 * 覆盖 selectedKeys、selectedListItems、slotAssignment、seriesVisualMap、seriesCalcConfigMap、
 * indicatorIntroNotes、displayConfig.slotSeriesOrder、derivedCalcs；替换键写入对应计算配置。
 */
export function rewriteRetiredUsovKeys(input: JsonObject): { value: JsonObject; changed: boolean } {
  const before = JSON.stringify(input);
  if (![...REPLACEMENT_BY_KEY.keys()].some((key) => before.includes(`"${key}"`))) {
    return { value: input, changed: false };
  }
  const out = JSON.parse(before) as JsonObject;
  const replaced = new Set<string>();
  for (const [oldKey, repl] of REPLACEMENT_BY_KEY) {
    if (repl && before.includes(`"${oldKey}"`)) replaced.add(repl.key);
  }

  if (Array.isArray(out.selectedKeys)) out.selectedKeys = remapKeyList(out.selectedKeys);

  if (Array.isArray(out.selectedListItems)) {
    const seen = new Set<string>();
    out.selectedListItems = out.selectedListItems.flatMap((item) => {
      if (!isObject(item) || typeof item.key !== "string") return [item];
      const k = nextKey(item.key);
      if (k === null || seen.has(k)) return [];
      seen.add(k);
      return [{ ...item, key: k }];
    });
  }

  for (const field of ["slotAssignment", "seriesVisualMap", "seriesCalcConfigMap", "indicatorIntroNotes"]) {
    if (isObject(out[field])) out[field] = remapRecord(out[field] as JsonObject);
  }

  if (isObject(out.displayConfig) && isObject(out.displayConfig.slotSeriesOrder)) {
    const order = out.displayConfig.slotSeriesOrder as JsonObject;
    const next: JsonObject = {};
    for (const [slot, keys] of Object.entries(order)) {
      next[slot] = Array.isArray(keys) ? remapKeyList(keys) : keys;
    }
    out.displayConfig = { ...out.displayConfig, slotSeriesOrder: next };
  }

  if (Array.isArray(out.derivedCalcs)) {
    out.derivedCalcs = out.derivedCalcs.flatMap((calc) => {
      if (!isObject(calc)) return [calc];
      const left = typeof calc.leftKey === "string" ? nextKey(calc.leftKey) : calc.leftKey;
      const right = typeof calc.rightKey === "string" ? nextKey(calc.rightKey) : calc.rightKey;
      if (left === null || right === null) return [];
      return [{ ...calc, leftKey: left, rightKey: right }];
    });
  }

  if (replaced.size > 0) {
    const calcMap = isObject(out.seriesCalcConfigMap) ? { ...(out.seriesCalcConfigMap as JsonObject) } : {};
    for (const repl of Object.values(RETIRED_USOV_REPLACEMENTS)) {
      if (repl && replaced.has(repl.key)) calcMap[repl.key] = repl.calc;
    }
    out.seriesCalcConfigMap = calcMap;
  }

  return { value: out, changed: JSON.stringify(out) !== before };
}
