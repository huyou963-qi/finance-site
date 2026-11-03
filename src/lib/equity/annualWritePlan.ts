import type { annualStatementSnapshots } from "./secStatementSupplement";

export type VerifiedAnnual = ReturnType<typeof annualStatementSnapshots>[number];
export const ANNUAL_FLOW_FIELDS = ["revenue", "netIncome", "ocf", "capex"] as const;
type ExistingAnnual = Partial<Record<typeof ANNUAL_FLOW_FIELDS[number], number | null>> & {
  periodType: string; fiscalDate: Date | string | null; asOf: Date | string;
};
const iso = (value: Date | string | null) => value instanceof Date ? value.toISOString().slice(0, 10) : value?.slice(0, 10);

/** 完整十二个月按实际截止日隔离，不覆盖原有年度估值缓存；重复输入不刷新更新时间。 */
export function planAnnualWrite(row: VerifiedAnnual, old: ExistingAnnual | null) {
  if (old && (old.periodType !== "FY12" || iso(old.fiscalDate) !== row.fiscalDate)) throw Error("年报实际期间或类型冲突");
  const values = {
    revenue: row.revenue ?? old?.revenue ?? null,
    netIncome: row.netIncome ?? old?.netIncome ?? null,
    ocf: row.ocf ?? old?.ocf ?? null,
    capex: row.capex ?? old?.capex ?? null,
  };
  if (old && iso(old.asOf) === row.fiscalDate && ANNUAL_FLOW_FIELDS.every(field => (old[field] ?? null) === values[field])) return null;
  return { period: `FY${row.fiscalDate}`, fiscalDate: row.fiscalDate, ...values };
}
