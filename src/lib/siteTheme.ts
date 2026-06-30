/** Scheme D — Notion / Apple 极简石墨亮色主题 */
export const SITE = {
  bg: "#ffffff",
  elevated: "#f7f7f5",
  text: "#1a1a18",
  secondary: "#3d3d3a",
  muted: "#454542",
  border: "#e9e9e7",
  accent: "#2383e2",
  accentSoft: "#e7f3ff",
  accentText: "#0b6bcb",
  positive: "#0b6bcb",
  negative: "#eb5757",
} as const;

export const CHART = {
  text: SITE.text,
  muted: SITE.muted,
  grid: SITE.border,
  tooltipBg: SITE.bg,
  tooltipBorder: SITE.border,
  tooltipText: SITE.text,
  endLabelBg: SITE.elevated,
  crosshair: SITE.secondary,
  seriesDefault: SITE.secondary,
} as const;

export const KLINE = {
  background: SITE.bg,
  text: SITE.text,
  grid: SITE.border,
  border: SITE.border,
  up: SITE.positive,
  down: SITE.negative,
} as const;
