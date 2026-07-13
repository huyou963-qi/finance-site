/**
 * K 线技术指标参数（用户级偏好，跨标的共享，持久化到 localStorage）。
 *
 * 主图可同时叠加 MA 与 BOLL；副图 KDJ / MACD / RSI 各自可调参数。
 * 参数取值做上下限约束，避免用户输入 0 / 负数 / 过大导致指标计算异常或卡顿。
 */

export type BollParams = { period: number; mult: number };
export type MacdParams = { fast: number; slow: number; signal: number };
export type KdjParams = { n: number; m1: number; m2: number };
export type RsiParams = { period: number };

export type IndicatorSettings = {
  /** 主图叠加开关（可同时开启） */
  maOn: boolean;
  bollOn: boolean;
  /** MA 均线周期列表（升序去重后使用），如 [5,10,20] */
  maPeriods: number[];
  boll: BollParams;
  kdj: KdjParams;
  macd: MacdParams;
  rsi: RsiParams;
};

export const DEFAULT_INDICATOR_SETTINGS: IndicatorSettings = {
  maOn: false,
  bollOn: true,
  maPeriods: [5, 10, 20],
  boll: { period: 20, mult: 2 },
  kdj: { n: 9, m1: 3, m2: 3 },
  macd: { fast: 12, slow: 26, signal: 9 },
  rsi: { period: 14 },
};

const STORAGE_KEY = "kline-indicator-settings-v1";

/** MA 主图颜色轮转（周期按顺序取色） */
export const MA_COLORS = [
  "#fbbf24",
  "#38bdf8",
  "#c084fc",
  "#34d399",
  "#f472b6",
  "#f97316",
] as const;

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** 规范化 MA 周期列表：取整、限幅、去重、升序、最多 6 条 */
export function normalizeMaPeriods(raw: number[]): number[] {
  const set = new Set<number>();
  for (const v of raw) {
    const n = clampInt(v, 1, 500, 0);
    if (n >= 1) set.add(n);
  }
  const out = [...set].sort((a, b) => a - b).slice(0, MA_COLORS.length);
  return out.length ? out : [...DEFAULT_INDICATOR_SETTINGS.maPeriods];
}

/** 解析用户输入的逗号/空格分隔周期串（如 "5, 10 20"） */
export function parseMaPeriodsInput(s: string): number[] {
  const parts = s
    .split(/[^\d]+/)
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x >= 1);
  return normalizeMaPeriods(parts);
}

export function sanitizeIndicatorSettings(
  raw: Partial<IndicatorSettings> | null | undefined,
): IndicatorSettings {
  const d = DEFAULT_INDICATOR_SETTINGS;
  const r = raw ?? {};
  return {
    maOn: typeof r.maOn === "boolean" ? r.maOn : d.maOn,
    bollOn: typeof r.bollOn === "boolean" ? r.bollOn : d.bollOn,
    maPeriods: normalizeMaPeriods(
      Array.isArray(r.maPeriods) ? r.maPeriods : d.maPeriods,
    ),
    boll: {
      period: clampInt(r.boll?.period, 2, 250, d.boll.period),
      mult: clampNum(r.boll?.mult, 0.1, 10, d.boll.mult),
    },
    kdj: {
      n: clampInt(r.kdj?.n, 1, 250, d.kdj.n),
      m1: clampInt(r.kdj?.m1, 1, 50, d.kdj.m1),
      m2: clampInt(r.kdj?.m2, 1, 50, d.kdj.m2),
    },
    macd: {
      fast: clampInt(r.macd?.fast, 1, 200, d.macd.fast),
      slow: clampInt(r.macd?.slow, 2, 400, d.macd.slow),
      signal: clampInt(r.macd?.signal, 1, 100, d.macd.signal),
    },
    rsi: { period: clampInt(r.rsi?.period, 2, 250, d.rsi.period) },
  };
}

export function loadIndicatorSettings(): IndicatorSettings {
  if (typeof window === "undefined") return { ...DEFAULT_INDICATOR_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_INDICATOR_SETTINGS };
    return sanitizeIndicatorSettings(JSON.parse(raw) as Partial<IndicatorSettings>);
  } catch {
    return { ...DEFAULT_INDICATOR_SETTINGS };
  }
}

export function saveIndicatorSettings(s: IndicatorSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}
