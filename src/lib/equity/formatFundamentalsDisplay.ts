/**
 * 个股基本面展示格式：金额缩写、比率→百分比、倍数/EPS。
 * 存储口径仍是原始小数（0.12 = 12%）；本模块只负责 UI 文案。
 */

export function formatCompactMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Y 轴短标签：略短于 tooltip（B 一位小数） */
export function formatCompactMoneyAxis(v: number): string {
  if (!Number.isFinite(v)) return "";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}

/** 小数比率 → 百分比文案（0.605 → 60.5%） */
export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

/** 带正负号的百分比（同比/环比增速） */
export function formatSignedPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
}

/** 百分点变化（利润率同比差） */
export function formatPp(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}pp`;
}

export function formatRatio(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function formatEps(v: number | null | undefined): string {
  return formatRatio(v, 2);
}

export function formatMultiplier(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}x`;
}

/** 轴标签用：比率 → 整数百分比 */
export function formatPctAxis(v: number): string {
  if (!Number.isFinite(v)) return "";
  return `${(v * 100).toFixed(0)}%`;
}

/**
 * 按系列名判断基本面图 tooltip 应使用的格式。
 * 同比/环比/利润率/收益率类 → %；金额类 → 缩写；EPS → 两位；其余倍数/估值 → 一位小数。
 */
export function formatFundamentalSeriesValue(seriesName: string, value: number): string {
  if (!Number.isFinite(value)) return "—";
  const name = seriesName.trim();

  if (
    /YoY|QoQ|同比|环比|利率|利润率|收益率|ROE|ROA|派息|回购|毛利|净利|营业利润/.test(name) ||
    /Margin|Yield|Payout/i.test(name)
  ) {
    if (/YoY|QoQ|同比|环比|回购/.test(name)) return formatSignedPct(value);
    return formatPct(value);
  }

  if (/^EPS$/i.test(name) || /稀释\s*EPS/.test(name)) return formatEps(value);
  if (/权益乘数|Multiplier/i.test(name)) return formatMultiplier(value);
  if (/^PE\b|^PB\b|^PS\b|Forward PE/i.test(name)) return formatRatio(value, 2);
  if (/营收|现金流|资本开支|自由现金|市值|债务|资产|负债|权益|现金|回购额|分红|EV\b/i.test(name)) {
    return formatCompactMoney(value);
  }
  // 默认：大数缩写，小数保留两位（覆盖估值带等）
  if (Math.abs(value) >= 1000) return formatCompactMoney(value);
  return formatRatio(value, 2);
}
