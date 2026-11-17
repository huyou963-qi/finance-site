/**
 * 「股票数据」布局偏好：左栏宽度、指标列宽。纯读写 localStorage，失败则静默忽略。
 */

export const LAYOUT_KEY = "gekko.stockData.layout.v1";

export const LEFT_WIDTH_DEFAULT = 248;
export const LEFT_WIDTH_MIN = 200;
export const LEFT_WIDTH_MAX = 420;

export const COL_WIDTH_DEFAULT = 96;
export const COL_WIDTH_MIN = 72;
export const COL_WIDTH_MAX = 360;

export type StockDataLayoutPrefs = {
  leftWidthPx: number;
  /** 按 indicatorId 记忆列宽（同指标多列共用） */
  colWidths: Record<string, number>;
  /** 是否冻结序号/代码/简称（电脑版） */
  freezeIdentity: boolean;
};

const DEFAULT: StockDataLayoutPrefs = {
  leftWidthPx: LEFT_WIDTH_DEFAULT,
  colWidths: {},
  freezeIdentity: true,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function readLayoutPrefs(): StockDataLayoutPrefs {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return { ...DEFAULT, colWidths: {} };
    const j = JSON.parse(raw) as Partial<StockDataLayoutPrefs>;
    const colWidths: Record<string, number> = {};
    if (j.colWidths && typeof j.colWidths === "object") {
      for (const [k, v] of Object.entries(j.colWidths)) {
        if (typeof v === "number" && Number.isFinite(v)) colWidths[k] = clamp(v, COL_WIDTH_MIN, COL_WIDTH_MAX);
      }
    }
    return {
      leftWidthPx: typeof j.leftWidthPx === "number" ? clamp(j.leftWidthPx, LEFT_WIDTH_MIN, LEFT_WIDTH_MAX) : LEFT_WIDTH_DEFAULT,
      colWidths,
      freezeIdentity: j.freezeIdentity !== false,
    };
  } catch {
    return { ...DEFAULT, colWidths: {} };
  }
}

export function writeLayoutPrefs(p: StockDataLayoutPrefs): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(p));
  } catch {
    /* 隐私模式等 */
  }
}

export function clampLeftWidth(px: number): number {
  return clamp(Math.round(px), LEFT_WIDTH_MIN, LEFT_WIDTH_MAX);
}

export function clampColWidth(px: number): number {
  return clamp(Math.round(px), COL_WIDTH_MIN, COL_WIDTH_MAX);
}
