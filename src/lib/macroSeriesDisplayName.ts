import { fredCatalogBaseKey } from "@/lib/data/fredCatalog";
import type { MacroSeriesCalcConfig } from "@/lib/data/macroPresetTemplates";
import type { MacroSeriesAxis } from "@/lib/macroChartOption";

/** 计算变换后缀（同比%、月频-期末等） */
export function buildMacroSeriesCalcSuffix(cfg: MacroSeriesCalcConfig): string {
  if (cfg.steps?.length) {
    return cfg.steps
      .map((step) => {
        if (step.type === "resample") {
          const frequency = step.frequency === "month" ? "月频" : step.frequency === "quarter" ? "季频" : "年频";
          const method = step.method === "avg" ? "平均" : step.method === "start" ? "期初" : step.method === "sum" ? "合计" : step.method === "min" ? "最小" : step.method === "max" ? "最大" : "期末";
          return `${frequency}-${method}`;
        }
        if (step.type === "transform") {
          return step.op === "pctChange" ? "变化%" : step.op === "logReturn" ? "对数变化%" : step.op === "yoy" ? "同比%" : step.op === "diff" ? "差分" : "累计";
        }
        if (step.type === "rollingMean") return `${step.window}期均值`;
        if (step.type === "zScore") return `${step.window}期Z-Score`;
        if (step.type === "rollingQuantile") return `${step.window}期P${Math.round(step.quantile * 100)}`;
        if (step.type === "outlier") return step.method === "winsorize" ? "Winsorize" : step.method === "null" ? "极端值置空" : "上下界截断";
        if (step.type === "volatility") return `${step.window}期${step.annualize ? "年化" : ""}波动率`;
        if (step.type === "fill") return step.method === "forward" ? "前向填充" : step.method === "backward" ? "后向填充" : "线性插值";
        return `x${step.factor}`;
      })
      .join(" → ");
  }
  const parts: string[] = [];
  if (cfg.op !== "none") {
    parts.push(
      cfg.op === "pctChange"
        ? "环比%"
        : cfg.op === "yoy"
          ? "同比%"
          : cfg.op === "diff"
            ? "差分"
            : cfg.op === "logReturn"
              ? "对数变化%"
              : "累计",
    );
  }
  if (cfg.frequency !== "keep") {
    const freqLabel =
      cfg.frequency === "month" ? "月频" : cfg.frequency === "quarter" ? "季频" : "年频";
    const methodLabel =
      cfg.resampleMethod === "avg" ? "平均" : cfg.resampleMethod === "start" ? "期初" : "期末";
    parts.push(`${freqLabel}-${methodLabel}`);
  }
  if (cfg.unit !== "keep") {
    parts.push(cfg.unit === "x0.01" ? "x0.01" : "x100");
  }
  if (cfg.scale !== undefined && cfg.scale !== 1) parts.push(`x${cfg.scale}`);
  if (cfg.rollingWindow && cfg.rollingWindow > 1) parts.push(`${cfg.rollingWindow}期均值`);
  return parts.join(" · ");
}

export function effectiveMacroSeriesUnit(
  key: string,
  cfg: MacroSeriesCalcConfig,
  mdsUnitByKey?: ReadonlyMap<string, string>,
): string | null {
  if (cfg.steps?.length) {
    const lastUnitStep = [...cfg.steps].reverse().find((step) => step.type === "scale" && step.unitLabel?.trim());
    if (lastUnitStep?.type === "scale" && lastUnitStep.unitLabel?.trim()) return lastUnitStep.unitLabel.trim();
    if (cfg.steps.some((step) => step.type === "zScore")) return "标准差";
    if (cfg.steps.some((step) => step.type === "volatility" || (step.type === "transform" && (step.op === "yoy" || step.op === "pctChange" || step.op === "logReturn")))) return "%";
  }
  if (cfg.op === "yoy" || cfg.op === "pctChange" || cfg.op === "logReturn") return "%";
  if (cfg.unitLabel?.trim()) return cfg.unitLabel.trim();
  const lookupKey = key.startsWith("fred:") ? fredCatalogBaseKey(key) : key;
  const raw = mdsUnitByKey?.get(key) ?? mdsUnitByKey?.get(lookupKey);
  if (!raw || raw.trim() === "" || raw === "-") return null;
  return raw.trim();
}

function unitAlreadyInName(name: string, unit: string): boolean {
  if (name.includes(unit)) return true;
  if (unit === "%" && /[%％]|同比|环比/.test(name)) return true;
  if (/^percent$/i.test(unit) && /[%％]/.test(name)) return true;
  return false;
}

/** 在基础名称后追加单位与右轴标记 */
export function decorateMacroSeriesDisplayName(
  baseName: string,
  opts?: { unit?: string | null; axis?: MacroSeriesAxis | null },
): string {
  let name = baseName.trim();
  const unit = opts?.unit?.trim();
  if (unit && !unitAlreadyInName(name, unit)) {
    name = `${name}（${unit}）`;
  }
  if (opts?.axis === "right" && !name.endsWith("(右轴)")) {
    name = `${name}(右轴)`;
  }
  return name;
}
