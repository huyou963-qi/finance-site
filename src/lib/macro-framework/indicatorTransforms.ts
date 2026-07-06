import { INDICATORS } from "./data";
import { FRAMEWORK_INDICATOR_CATALOG_KEYS, FRAMEWORK_SPARKLINE_POINTS } from "./indicatorCatalogKeys";

export type FrameworkValueTransform = "none" | "yoy_pct" | "mom_pct";

/** FRED 入库序列本身已是同比 %（Atlanta Fed sticky/flexible），勿二次 yoy。 */
const TRANSFORM_OVERRIDES: Partial<Record<string, FrameworkValueTransform>> = {
  "sticky-cpi": "none",
  "flexible-cpi": "none",
};

function defaultTransformFromUnit(unit: string): FrameworkValueTransform {
  if (unit === "YoY%") return "yoy_pct";
  if (unit === "MoM%") return "mom_pct";
  return "none";
}

/** 宏观框架指标 id → 观测值变换（与卡片 unit 语义一致）。 */
export const FRAMEWORK_INDICATOR_TRANSFORMS: Record<string, FrameworkValueTransform> =
  Object.fromEntries(
    INDICATORS.filter((ind) => ind.id in FRAMEWORK_INDICATOR_CATALOG_KEYS).map((ind) => [
      ind.id,
      TRANSFORM_OVERRIDES[ind.id] ?? defaultTransformFromUnit(ind.unit),
    ]),
  );

const RELEASE_FREQ_BY_ID = Object.fromEntries(INDICATORS.map((ind) => [ind.id, ind.releaseFreq]));

/** 为变换预留足够历史：yoy 月频 +12，季频 +4；mom +1。 */
export function rawObservationTake(
  indicatorId: string,
  transform: FrameworkValueTransform,
): number {
  if (transform === "mom_pct") return FRAMEWORK_SPARKLINE_POINTS + 1;
  if (transform === "yoy_pct") {
    const freq = RELEASE_FREQ_BY_ID[indicatorId];
    if (freq === "季度") return FRAMEWORK_SPARKLINE_POINTS + 4;
    if (freq === "年度") return FRAMEWORK_SPARKLINE_POINTS + 1;
    return FRAMEWORK_SPARKLINE_POINTS + 12;
  }
  return FRAMEWORK_SPARKLINE_POINTS;
}

/** 展示值合理性：离谱则视为无效，显示 N/A 而非误导数字。 */
export function isPlausibleFrameworkValue(unit: string, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (unit === "YoY%" || unit === "MoM%") return Math.abs(value) <= 50;
  if (unit === "%") return value >= -20 && value <= 100;
  if (unit === "指数") return value >= 0 && value <= 200;
  if (unit === "bp") return value >= 0 && value <= 5000;
  return true;
}
