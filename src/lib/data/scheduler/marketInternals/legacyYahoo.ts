/** QSTK旧Yahoo CSV的Close未复权，Adj Close精确到分。
 * 不估计拆股/分红因子：任何可观测调整因子变化日都排除，
 * 让严格连续交易日均线窗口无法跨过该日。现金分红也被保守排除。
 * Adj Close低于1时分币精度过粗，排除该日并重新开始因子核验。
 */
export function excludeLegacyYahooActionBoundaries<T extends { date: string; close: number; adjClose: number }>(rows: readonly T[]): { rows: T[]; excludedDates: string[] } {
  let lower = 0; let upper = Infinity; let previous = "";
  const accepted: T[] = []; const excludedDates: string[] = [];
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date <= previous || !Number.isFinite(row.close) || !Number.isFinite(row.adjClose) || row.close <= 0 || row.adjClose <= 0 || Math.abs(row.adjClose * 100 - Math.round(row.adjClose * 100)) > 1e-6) throw new Error("旧Yahoo价格须按日升序、唯一、正数且Adj Close精确到分");
    previous = row.date;
    if (row.adjClose < 1) {
      excludedDates.push(row.date); lower = 0; upper = Infinity; continue;
    }
    const nextLower = Math.max(0, row.adjClose - 0.005000001) / row.close;
    const nextUpper = (row.adjClose + 0.005000001) / row.close;
    const intersectionLower = Math.max(lower, nextLower);
    const intersectionUpper = Math.min(upper, nextUpper);
    if (intersectionLower > intersectionUpper) {
      excludedDates.push(row.date); lower = nextLower; upper = nextUpper;
    } else {
      accepted.push(row); lower = intersectionLower; upper = intersectionUpper;
    }
  }
  return { rows: accepted, excludedDates };
}
