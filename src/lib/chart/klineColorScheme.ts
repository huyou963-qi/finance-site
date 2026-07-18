/**
 * K 线涨跌配色（用户级偏好，跨标的共享，localStorage）。
 *
 * - red-up：红涨绿跌（A 股常见）
 * - green-up：红跌绿涨（美股 / TradingView 常见）
 */

export type KlineCandleColorMode = "red-up" | "green-up";

export type KlineCandleColors = {
  up: string;
  down: string;
  volumeUp: string;
  volumeDown: string;
};

export const KLINE_CANDLE_COLOR_MODE_LABEL: Record<KlineCandleColorMode, string> =
  {
    "red-up": "红涨绿跌",
    "green-up": "红跌绿涨",
  };

export const KLINE_CANDLE_COLOR_MODES: KlineCandleColorMode[] = [
  "red-up",
  "green-up",
];

const COLORS: Record<KlineCandleColorMode, KlineCandleColors> = {
  "red-up": {
    up: "#ef5350",
    down: "#26a69a",
    volumeUp: "rgba(239,83,80,0.65)",
    volumeDown: "rgba(38,166,154,0.65)",
  },
  "green-up": {
    up: "#26a69a",
    down: "#ef5350",
    volumeUp: "rgba(38,166,154,0.65)",
    volumeDown: "rgba(239,83,80,0.65)",
  },
};

/** 默认：红涨绿跌（与中文产品常见习惯一致） */
export const DEFAULT_KLINE_CANDLE_COLOR_MODE: KlineCandleColorMode = "red-up";

const STORAGE_KEY = "kline-candle-color-mode-v1";

export function isKlineCandleColorMode(v: unknown): v is KlineCandleColorMode {
  return v === "red-up" || v === "green-up";
}

export function colorsForKlineMode(
  mode: KlineCandleColorMode,
): KlineCandleColors {
  return COLORS[mode] ?? COLORS[DEFAULT_KLINE_CANDLE_COLOR_MODE];
}

export function loadKlineCandleColorMode(): KlineCandleColorMode {
  if (typeof window === "undefined") return DEFAULT_KLINE_CANDLE_COLOR_MODE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isKlineCandleColorMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_KLINE_CANDLE_COLOR_MODE;
}

export function saveKlineCandleColorMode(mode: KlineCandleColorMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
