import { fredCatalogBaseKey } from "@/lib/data/fredCatalog";
import type { MacroSeriesCalcConfig } from "@/lib/data/macroPresetTemplates";
import type { MacroSeriesAxis } from "@/lib/macroChartOption";

/** 计算变换后缀（同比%、月频-期末等） */
export function buildMacroSeriesCalcSuffix(cfg: MacroSeriesCalcConfig): string {
  const parts: string[] = [];
  if (cfg.op !== "none") {
    parts.push(
      cfg.op === "pctChange"
        ? "环比%"
        : cfg.op === "yoy"
          ? "同比%"
          : cfg.op === "diff"
            ? "差分"
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
  return parts.join(" · ");
}

export function effectiveMacroSeriesUnit(
  key: string,
  cfg: MacroSeriesCalcConfig,
  mdsUnitByKey?: ReadonlyMap<string, string>,
): string | null {
  if (cfg.op === "yoy" || cfg.op === "pctChange") return "%";
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
