import type { VerifiedLegacyCashDividend } from "./legacyYahoo";

export type LegacyYahooPriceRow = { date: string; open: number; high: number; low: number; close: number; adjClose: number; volume: number };
export type VerifiedLegacySplit = { date: string; previousDate: string; ratio: number; source: string };

/** 只按公告给定的拆股比例统一每股价格尺度；不从价格涨跌猜拆股，不调整现金分红。
 * Adj Close仍保留原始分币精度，交给共同因子检查继续阻断未知动作。
 * 成交量保留原文件当日实际成交量，与既有Yahoo日线的口径一致。
 */
export function normalizeVerifiedLegacySplits(rows: readonly LegacyYahooPriceRow[], splits: readonly VerifiedLegacySplit[], cashDividends: readonly VerifiedLegacyCashDividend[] = []) {
  const byDate = new Map(rows.map((row, index) => [row.date, { row, index }]));
  if (byDate.size !== rows.length || rows.some((row, index) => !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || (index > 0 && row.date <= rows[index - 1].date) || ![row.open, row.high, row.low, row.close, row.adjClose, row.volume].every(n => Number.isFinite(n) && n >= 0) || row.close <= 0 || row.adjClose <= 0)) throw new Error("拆股核验须使用升序、唯一、有效的原始价格");
  const events = [...splits].sort((a, b) => a.date.localeCompare(b.date));
  if (new Set(events.map(event => event.date)).size !== events.length) throw new Error("拆股核验清单日期重复");
  for (const event of events) {
    const current = byDate.get(event.date);
    const prior = current && rows[current.index - 1];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date) || !Number.isFinite(event.ratio) || event.ratio <= 0 || event.ratio === 1 || !event.source.startsWith("https://") || !current || !prior || prior.date !== event.previousDate || prior.adjClose < 1 || current.row.adjClose < 1 || cashDividends.some(cash => cash.date === event.date)) throw new Error(`拆股清单或相邻报价无效: ${event.date}`);
    const epsilon = 0.005000001;
    const priorLower = (prior.adjClose - epsilon) / prior.close * event.ratio;
    const priorUpper = (prior.adjClose + epsilon) / prior.close * event.ratio;
    const nextLower = (current.row.adjClose - epsilon) / current.row.close;
    const nextUpper = (current.row.adjClose + epsilon) / current.row.close;
    if (Math.max(priorLower, nextLower) > Math.min(priorUpper, nextUpper)) throw new Error(`公告拆股比例与原始调整因子不符: ${event.date}`);
  }
  const divisor = (date: string) => events.reduce((factor, event) => event.date > date ? factor * event.ratio : factor, 1);
  const normalized = rows.map(row => {
    const factor = divisor(row.date);
    const result = { ...row, open: row.open / factor, high: row.high / factor, low: row.low / factor, close: row.close / factor };
    if (![result.open, result.high, result.low, result.close].every(Number.isFinite) || result.close <= 0) throw new Error("拆股调整后的价格无效");
    return result;
  });
  return { rows: normalized, cashDividends: cashDividends.map(event => ({ ...event, amount: event.amount / divisor(event.date) })), verifiedSplits: events };
}
