import type { ObservationPoint } from "../types";
import { MOF_FISCAL_COMPONENTS, type FiscalMeasure } from "./catalog";
function text(html: string) { return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/g, " ").replace(/[ \t\r]+/g, " ").replace(/(?<=\d) +(?=\d)/g, ""); }
function endPeriod(page: string): Date {
  const heading = /(20\d{2})年(?:(?:1[-—–－]\s*(\d{1,2})月)|(\d{1,2})月|(上半年)|(前三季度)|(一季度))?财政收支情况/.exec(page.slice(0, 8000));
  if (!heading) throw new Error("财政部月报缺少标题观测期");
  const month = Number(heading[2] ?? heading[3] ?? 0) || (heading[4] ? 6 : heading[5] ? 9 : heading[6] ? 3 : 12);
  if (month > 12) throw new Error("财政部月报观测期无法识别");
  return new Date(Date.UTC(Number(heading[1]), month - 1, 1));
}
function esc(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function labelExpression(label: string) { return [...label].map(esc).join("\\s*"); }
const nextAmount = new RegExp(MOF_FISCAL_COMPONENTS.flatMap(c => c.labels).map(labelExpression).join("|") , "g");
type Anchor = { amount: number; rate?: number; index: number; score: number };
export type MofFiscalWrongComponent = { component: string; sourceLabel: string; sourceExcerpt: string; sourcePeriod: "monthly" | "cumulative" | "unknown"; measures: Map<FiscalMeasure, ObservationPoint> };
function rejectedAlias(label: string, before: string): boolean {
  return (label === "税收收入" && /(?:非|等|其他(?:各项)?|中央|地方)$/.test(before)) ||
    (label === "非税收入" && /(?:中央|地方)(?:本级)?$/.test(before)) ||
    (label === "企业所得税" && /(?:金融业|工业|房地产|房地产业|制造业|建筑业)$/.test(before)) ||
    (label === "印花税" && before.endsWith("证券交易"));
}
/** Old MOF releases mix a monthly block with a YTD block. A monthly-only
 * item must not be smuggled into a series explicitly labelled cumulative. */
function periodContext(page: string, index: number): "cumulative" | "monthly" | undefined {
  let context: "cumulative" | "monthly" | undefined;
  const markers = /(?:^|[\n。；;])\s*(?:(?:20\d{2})年)?(1\s*[-—–－]\s*\d{1,2}月份?|上半年|前三季度|一季度|全年|\d{1,2}月份?)(?:累计|[，,]|主要)/g;
  for (const marker of page.slice(0,index).matchAll(markers)) {
    context = /^(?:1\s*[-—–－]|上半年|前三季度|一季度|全年)/.test(marker[1]!) ? "cumulative" : "monthly";
  }
  return context;
}
function cumulativeAnchor(page: string, label: string, mode: "cumulative" | "monthly" = "cumulative", acceptRejected = false): Anchor | undefined {
  const candidates: Anchor[] = [];
  const expression = new RegExp(labelExpression(label) + "\\s*(?:为|共计|合计)?\\s*([0-9,.]+)亿元", "g");
  for (const match of page.matchAll(expression)) {
    const before = page.slice(0, match.index).replace(/[ \t]+$/, "");
    if (!acceptRejected && rejectedAlias(label,before)) continue;
    if ((periodContext(page,match.index!) === "monthly") !== (mode === "monthly")) continue;
    let tail = page.slice(match.index! + match[0].length, match.index! + match[0].length + 180).split(/[。\n]/)[0]!;
    // Never borrow growth from a following component, but allow the official
    // budget-completion or absolute-change clauses before this component's rate.
    nextAmount.lastIndex = 0;
    const next = nextAmount.exec(tail);
    if (next) tail = tail.slice(0, next.index);
    const natural = /按自然口径计算(?:增长|下降|微增|微降)([0-9.]+)(%|倍)/.exec(tail);
    const reported = natural ?? /(?:增长|下降|微增|微降)([0-9.]+)(%|倍)/.exec(tail);
    // Adjusted-only growth is not the growth of the published nominal amount.
    const adjustedOnly = !natural && /扣除.*因素|同口径/.test(tail.slice(0, reported?.index ?? tail.length));
    const rate = reported && !adjustedOnly ? Number(reported[1]) * (reported[2] === "倍" ? 100 : 1) * (/下降|微降/.test(reported[0]) ? -1 : 1) : /与(?:上年|去年)(?:同期)?(?:基本)?持平/.test(tail) ? 0 : undefined;
    const prefix = page.slice(Math.max(0, match.index! - 100), match.index!);
    const sentencePrefix = prefix.slice(Math.max(prefix.lastIndexOf("。"), prefix.lastIndexOf("\n")) + 1);
    const score = /(?:1\s*[-—]\s*\d{1,2}月累计|累计|上半年|前三季度|一季度|全年|20\d{2}年\s*[，,])/.test(sentencePrefix) ? 10 : 0;
    candidates.push({ amount: Number(match[1]!.replace(/,/g, "")), rate, index: match.index!, score });
  }
  return candidates.sort((a,b) => b.score-a.score || b.index-a.index)[0];
}
/** Forensic evidence only: rejected suffix aliases are NEVER returned as data.
 * Reconstruct their precise printed value to explain old corrupted observations. */
function wrongComponents(page: string, obsDate: Date): MofFiscalWrongComponent[] {
  const evidence: MofFiscalWrongComponent[] = [];
  for (const component of MOF_FISCAL_COMPONENTS) for (const label of component.labels) {
    const expression = new RegExp(labelExpression(label) + "\\s*(?:为|共计|合计)?\\s*([0-9,.]+)亿元", "g");
    for (const match of page.matchAll(expression)) {
      const before = page.slice(0,match.index).replace(/[ \t]+$/, "");
      if (!rejectedAlias(label,before)) continue;
      const period = periodContext(page,match.index!);
      // Isolate this anchor; do not let later names or period switches select a different one.
      let local = page.slice(match.index!,match.index!+match[0].length+180).split(/[。\n]/)[0]!;
      nextAmount.lastIndex = 0;
      const next = nextAmount.exec(local.slice(match[0].length));
      if (next) local = local.slice(0,match[0].length+next.index);
      const anchor = cumulativeAnchor(local,label,"cumulative",true);
      if (!anchor) continue;
      const prefix = /[\u4e00-\u9fff、]+$/.exec(before)?.[0] ?? "";
      const measures = new Map<FiscalMeasure, ObservationPoint>([["amount",{obsDate,value:anchor.amount}]]);
      if (anchor.rate !== undefined) measures.set("yoy",{obsDate,value:anchor.rate});
      evidence.push({component:component.key,sourceLabel:prefix+label,sourceExcerpt:page.slice(Math.max(0,match.index!-80),match.index!+match[0].length+120).trim(),sourcePeriod:period ?? "unknown",measures});
    }
  }
  return evidence;
}
/** Official amounts and reported nominal growth are independent anchors.
 * 2022 refund-adjusted growth must not replace the explicitly published natural rate.
 * Old reports can put budget completion or absolute changes before growth; preserve
 * amounts even when the source publishes no matching nominal rate. */
export function parseMofFiscalPage(html: string): { obsDate: Date; values: Map<string, Map<FiscalMeasure, ObservationPoint>>; monthlyOnly: Map<string, Map<FiscalMeasure, ObservationPoint>>; wrongComponents: MofFiscalWrongComponent[] } {
  const page = text(html), obsDate = endPeriod(page);
  const values = new Map<string, Map<FiscalMeasure, ObservationPoint>>();
  const monthlyOnly = new Map<string, Map<FiscalMeasure, ObservationPoint>>();
  for (const component of MOF_FISCAL_COMPONENTS) {
    const anchor = component.labels.map(label => cumulativeAnchor(page,label)).find((a): a is Anchor => !!a);
    if (!anchor) {
      const monthly = component.labels.map(label => cumulativeAnchor(page,label,"monthly")).find((a): a is Anchor => !!a);
      if (monthly) {
        const measures = new Map<FiscalMeasure, ObservationPoint>([["amount", { obsDate, value: monthly.amount }]]);
        if (monthly.rate !== undefined) measures.set("yoy", { obsDate, value: monthly.rate });
        monthlyOnly.set(component.key, measures);
      }
      continue;
    }
    if (!Number.isFinite(anchor.amount) || anchor.amount < 0 || (anchor.rate !== undefined && !Number.isFinite(anchor.rate))) throw new Error(`财政部月报数值异常：${component.key}`);
    const measures = new Map<FiscalMeasure, ObservationPoint>([["amount", { obsDate, value: anchor.amount }]]);
    if (anchor.rate !== undefined) measures.set("yoy", { obsDate, value: anchor.rate });
    values.set(component.key, measures);
  }
  if (!values.size) throw new Error("财政部月报未解析到任何财政收支锚点");
  return { obsDate, values, monthlyOnly, wrongComponents: wrongComponents(page,obsDate) };
}
