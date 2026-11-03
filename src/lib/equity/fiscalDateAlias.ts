import { calendarQuarterLabel, type SecFactPoint, type SecQuarterlyFundamentals } from "./secFundamentals";
import type { StoredQuarter } from "./quarterlyWritePlan";

/** Waters早期52/53周报告在后续比较表被改写为月末日期。只迁回原季度申报中的真实日期。
 * 不放宽普通季度writer的日期隔离；须两个独立USD科目同起日同金额，且后来的日期别名晚至少一年。
 */
export function fiscalDateAliasProof(facts: unknown, old: StoredQuarter, incoming: SecQuarterlyFundamentals) {
  const root = facts as { cik?: number; facts?: { "us-gaap"?: Record<string, { units?: { USD?: SecFactPoint[] } }> } };
  const from = old.fiscalDate instanceof Date ? old.fiscalDate.toISOString().slice(0, 10) : old.fiscalDate?.slice(0, 10);
  const to = incoming.fiscalDate;
  const day = 86400000, distance = from ? Math.abs(Date.parse(from) - Date.parse(to)) / day : 0;
  const equal = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null && Math.abs(a - b) <= Math.max(1, Math.abs(a), Math.abs(b)) * 1e-10;
  if (Number(root?.cik) !== 1000697 || !from || distance < 1 || distance > 7
    || old.period !== incoming.period || calendarQuarterLabel(from) !== incoming.period
    || !old.revenue || !equal(old.revenue, incoming.revenue)) return null;
  for (const field of ["netIncome", "ocf", "capex"] as const) if (old[field] != null && !equal(old[field], incoming[field])) return null;
  const evidence: { tag: string; from: SecFactPoint; to: SecFactPoint }[] = [];
  for (const tag of ["IncomeTaxExpenseBenefit", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "CostOfGoodsAndServicesSold"]) {
    const points = (root.facts?.["us-gaap"]?.[tag]?.units?.USD ?? []).filter(p => p.start && p.end && p.accn && p.filed
      && /^10-[KQ](?:\/A)?$/.test(p.form ?? "") && typeof p.val === "number" && Number.isFinite(p.val) && p.val !== 0
      && (Date.parse(p.end) - Date.parse(p.start)) / day >= 69 && (Date.parse(p.end) - Date.parse(p.start)) / day <= 125);
    const originals = points.filter(p => p.end === to && (Date.parse(p.filed!) - Date.parse(to)) / day >= 0
      && (Date.parse(p.filed!) - Date.parse(to)) / day <= 120).sort((a, b) => a.filed!.localeCompare(b.filed!));
    const pair = originals.flatMap(a => points.filter(b => b.end === from && b.start === a.start && b.val === a.val
      && Date.parse(b.filed!) - Date.parse(a.filed!) >= 365 * day).map(b => ({ tag, from: b, to: a })))[0];
    if (pair) evidence.push(pair);
  }
  return evidence.length >= 2 ? { from, to, evidence } : null;
}
