import type { ObservationPoint } from "../types";
import type { FiscalMeasure } from "./catalog";
import type { MofFiscalMonthlyOnlyEvidence, MofFiscalWrongComponentEvidence } from "./client";
export type FiscalStoredRow = { id: string; instrumentId: string; code: string; obsDate: Date; value: number };
export type FiscalRepairCandidate = { code: string; date: string; oldValue: number; officialMonthlyValue?: number; officialWrongComponentValue?: number; evidenceType: "monthly_only" | "wrong_component"; sourceLabel?: string; sourceExcerpt?: string; url: string; title: string; sourcePeriod: "monthly" | "cumulative" | "unknown"; backup: FiscalStoredRow };
/** Deletion requires positive official monthly-only or rejected-component evidence
 * AND exact old-value correspondence. A missing parser result never suffices. */
export function planMofFiscalPeriodRepair(stored: FiscalStoredRow[], history: Map<string, Map<FiscalMeasure, ObservationPoint[]>>, evidence: MofFiscalMonthlyOnlyEvidence[], rejectedAliases: MofFiscalWrongComponentEvidence[] = []) {
  const candidates: FiscalRepairCandidate[] = [];
  const unresolved: Array<{ code: string; date: string; oldValue: number; reason: string; officialMonthlyValue?: number; url?: string }> = [];
  const corrections: Array<{ code: string; date: string; oldValue: number; officialCumulativeValue: number }> = [];
  for (const row of stored) {
    const match = /^mof_cn_fiscal_(.+)_(amount|yoy)$/.exec(row.code);
    if (!match) throw new Error(`财政修复仅接受已登记代码：${row.code}`);
    const [component, measure] = [match[1]!,match[2]! as FiscalMeasure];
    const date = row.obsDate.toISOString().slice(0,10);
    const ytd = history.get(component)?.get(measure)?.find(point => point.obsDate.getTime() === row.obsDate.getTime());
    if (ytd) {
      if (Math.abs(ytd.value-row.value)>1e-8) corrections.push({code:row.code,date,oldValue:row.value,officialCumulativeValue:ytd.value});
      continue;
    }
    const source = evidence.find(item => item.component === component && item.obsDate.getTime() === row.obsDate.getTime());
    const monthly = source?.measures.get(measure);
    if (source && monthly && Math.abs(monthly.value-row.value)<=1e-8) {
      candidates.push({code:row.code,date,oldValue:row.value,officialMonthlyValue:monthly.value,url:source.url,title:source.title,sourcePeriod:"monthly",evidenceType:"monthly_only",backup:row});
    } else {
      const rejected = rejectedAliases.find(item => item.component === component && item.obsDate.getTime() === row.obsDate.getTime() && item.measures.has(measure) && Math.abs(item.measures.get(measure)!.value-row.value)<=1e-8);
      if (rejected) candidates.push({code:row.code,date,oldValue:row.value,officialMonthlyValue:monthly?.value,officialWrongComponentValue:rejected.measures.get(measure)!.value,evidenceType:"wrong_component",sourceLabel:rejected.sourceLabel,sourceExcerpt:rejected.sourceExcerpt,url:rejected.url,title:rejected.title,sourcePeriod:rejected.sourcePeriod,backup:row});
      else unresolved.push({code:row.code,date,oldValue:row.value,reason:source ? monthly ? "原文仅披露当月，但旧值不匹配该当月值，保持不动待核对" : "原文仅披露当月，但该measure无可核对官方值，保持不动" : "源端未解析出累计值且无明确当月-only证据，保持不动",officialMonthlyValue:monthly?.value,url:source?.url});
    }
  }
  return {candidates,unresolved,corrections};
}
