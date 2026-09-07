/**
 * SEC DERA「Insider Transactions Data Sets」——Tier B 全市场内部人交易底座的数据源。
 *
 * SEC 经济与风险分析司（DERA）把每季度全市场的 Form 3/4/5 预解析成 TSV 打包发布，
 * 一个季度一个 zip（约 14MB，含 ~7 万份申报 / ~10 万笔非衍生交易 / 5000+ 发行人）。
 * 相比逐份抓 XML，全历史只需 ~81 次请求而不是几千万次。
 *
 * ⚠ 与 Tier A（insider_transaction）的边界：本数据集**不含原始 XML、脚注原文与
 * 共同申报人的裁定语义**，所以只能用于总量统计、横截面与历史查询，不能用于
 * 需要人工裁定的持股监控页。两者并存，互不覆盖。
 *
 * ⚠ 出版滞后：当季往往尚未发布（实测 2026-09 时 2026q2 仍 404）。最近一个季度
 * 需要用日度 form.idx + 文档抓取补齐，本模块不负责。
 */
export const DERA_INSIDER_BASE_URL =
  "https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets";

/** 实测最早可用季度（2006q1 起，更早返回 404） */
export const DERA_INSIDER_FIRST_QUARTER = "2006q1";

export function deraQuarterUrl(quarter: string): string {
  return `${DERA_INSIDER_BASE_URL}/${quarter}_form345.zip`;
}

const QUARTER_RE = /^(\d{4})q([1-4])$/;

export function isDeraQuarter(value: string): boolean {
  return QUARTER_RE.test(value);
}

export function parseQuarter(value: string): { year: number; quarter: number } {
  const m = QUARTER_RE.exec(value);
  if (!m) throw new Error(`季度格式无效：${value}（应形如 2026q1）`);
  return { year: Number(m[1]), quarter: Number(m[2]) };
}

export function formatQuarter(year: number, quarter: number): string {
  return `${year}q${quarter}`;
}

/** 枚举 [from, to] 闭区间内的所有季度 */
export function enumerateQuarters(from: string, to: string): string[] {
  const a = parseQuarter(from);
  const b = parseQuarter(to);
  const out: string[] = [];
  let { year, quarter } = a;
  while (year < b.year || (year === b.year && quarter <= b.quarter)) {
    out.push(formatQuarter(year, quarter));
    quarter += 1;
    if (quarter > 4) {
      quarter = 1;
      year += 1;
    }
  }
  return out;
}

/** 某个日期所属季度 */
export function quarterOf(date: Date): string {
  return formatQuarter(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) + 1);
}
