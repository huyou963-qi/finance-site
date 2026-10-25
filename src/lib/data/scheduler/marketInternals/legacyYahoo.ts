/** QSTK旧Yahoo CSV的Close未复权，Adj Close精确到分。
 * 不估计拆股/分红因子：任何可观测调整因子变化日都排除，
 * 让严格连续交易日均线窗口无法跨过该日。默认也排除现金分红；
 * 仅公告已核验且金额与报价因子变化相符的普通现金分红可保留。
 * Adj Close低于1时分币精度过粗，排除该日并重新开始因子核验。
 */
export type VerifiedLegacyCashDividend = { date: string; previousDate: string; amount: number; source: string };
export function excludeLegacyYahooActionBoundaries<T extends { date: string; close: number; adjClose: number }>(rows: readonly T[], cashDividends: readonly VerifiedLegacyCashDividend[] = []): { rows: T[]; excludedDates: string[]; verifiedCashDates: string[] } {
  let lower = 0; let upper = Infinity; let previous = "";
  let previousRow: T | undefined;
  const cashByDate = new Map(cashDividends.map(event => [event.date, event]));
  if (cashByDate.size !== cashDividends.length || cashDividends.some(event => !/^\d{4}-\d{2}-\d{2}$/.test(event.date) || event.previousDate >= event.date || !Number.isFinite(event.amount) || event.amount <= 0 || !event.source.startsWith("https://"))) throw new Error("现金分红核验清单无效");
  const verifiedCashDates: string[] = [];
  const accepted: T[] = []; const excludedDates: string[] = [];
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date <= previous || !Number.isFinite(row.close) || !Number.isFinite(row.adjClose) || row.close <= 0 || row.adjClose <= 0 || Math.abs(row.adjClose * 100 - Math.round(row.adjClose * 100)) > 1e-6) throw new Error("旧Yahoo价格须按日升序、唯一、正数且Adj Close精确到分");
    previous = row.date;
    if (row.adjClose < 1) {
      excludedDates.push(row.date); lower = 0; upper = Infinity; continue;
    }
    const nextLower = Math.max(0, row.adjClose - 0.005000001) / row.close;
    const nextUpper = (row.adjClose + 0.005000001) / row.close;
    const cash = cashByDate.get(row.date);
    if (cash && previousRow?.date === cash.previousDate && previousRow.adjClose >= 1 && lower > 0 && Number.isFinite(upper) && cash.amount < previousRow.close) {
      // 仅解释已由公告确认的现金分红；若还含拆股等动作，区间不会相交，仍排除。
      const multiplier = 1 / (1 - cash.amount / previousRow.close);
      const shiftedLower = lower * multiplier; const shiftedUpper = upper * multiplier;
      if (Math.max(shiftedLower, nextLower) <= Math.min(shiftedUpper, nextUpper)) {
        lower = shiftedLower; upper = shiftedUpper; verifiedCashDates.push(row.date);
      }
    }
    const intersectionLower = Math.max(lower, nextLower);
    const intersectionUpper = Math.min(upper, nextUpper);
    if (intersectionLower > intersectionUpper) {
      excludedDates.push(row.date); lower = nextLower; upper = nextUpper;
    } else {
      accepted.push(row); lower = intersectionLower; upper = intersectionUpper;
    }
    previousRow = row;
  }
  return { rows: accepted, excludedDates, verifiedCashDates };
}
