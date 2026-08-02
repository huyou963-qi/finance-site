/**
 * regime 展示常量（Phase 4 WS5）+ 分歧色阶。
 * 四象限配色取 dataviz 校验通过的分类 4 色集（blue/green/magenta/yellow，全对 CVD 通过），
 * 语义化指派后始终配文字标签作二级编码（不靠颜色单独承载身份）。
 *
 * **UI 统一用 Dalio 口径**（增长方向 × 通胀方向）。旧「水平×动量」口径两轴导数阶数不一致，
 * 实测 13 次离开「衰退式」13 次全跳「滞胀」的结构性锁死，故不再展示、避免两套并行造成误读；
 * 数据层仍保留 macro_regime.regime 供回溯与既有 regimeFilter 键使用。
 */

export type RegimeKey = "reflation" | "goldilocks" | "stagflation" | "deflation";

export const REGIME_ORDER: RegimeKey[] = [
  "goldilocks",
  "reflation",
  "stagflation",
  "deflation",
];

export const REGIME_LABEL: Record<RegimeKey, string> = {
  goldilocks: "金发女孩",
  reflation: "再通胀",
  stagflation: "滞胀",
  deflation: "通缩衰退",
};

export const REGIME_DESC: Record<RegimeKey, string> = {
  goldilocks: "增长加速 · 通胀回落",
  reflation: "增长加速 · 通胀升温",
  stagflation: "增长减速 · 通胀升温",
  deflation: "增长减速 · 通胀回落",
};

/** dataviz 校验通过的分类 4 色（暗色步进），语义化指派 */
export const REGIME_COLOR: Record<RegimeKey, string> = {
  goldilocks: "#008300", // 绿：最有利
  reflation: "#c98500", // 琥珀：增长+通胀同升
  stagflation: "#d55181", // 品红：滞胀压力（实测唯一负收益象限）
  deflation: "#3987e5", // 蓝：通缩收缩
};

// ────────────────────────────────────────────────────────── 分歧色阶（热力图）

const GRAY = [56, 56, 53]; // #383835 暗色中性中点
const RED = [227, 73, 72]; // #e34948 正极（暖）
const BLUE = [42, 120, 214]; // #2a78d6 负极（冷）

function mix(a: number[], b: number[], t: number): string {
  const c = a.map((av, i) => Math.round(av + (b[i]! - av) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/**
 * 分歧背景色：v>0 → 灰→红，v<0 → 灰→蓝，0 → 灰。scale = 满色对应的绝对值。
 * 正=暖（红）负=冷（蓝），中点灰读作「零/无」。
 */
export function divergingColor(v: number | null, scale = 1): string {
  if (v == null || !Number.isFinite(v)) return "transparent";
  const t = Math.min(1, Math.abs(v) / scale);
  return v >= 0 ? mix(GRAY, RED, t) : mix(GRAY, BLUE, t);
}

/** 强背景上文字取白，弱背景（|v| 小）取次级墨；阈值粗判 */
export function onColorInk(v: number | null, scale = 1): string {
  if (v == null || !Number.isFinite(v)) return "#898781";
  return Math.min(1, Math.abs(v) / scale) > 0.4 ? "#ffffff" : "#c3c2b7";
}
