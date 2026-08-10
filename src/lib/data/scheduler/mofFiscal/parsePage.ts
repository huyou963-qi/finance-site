import type { ObservationPoint } from "../types";
import { MOF_FISCAL_COMPONENTS, type FiscalMeasure } from "./catalog";
function text(html: string) { return html.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").replace(/(?<=\d)\s+(?=\d)/g, ""); }
function endPeriod(page: string): Date { const title = text(page).slice(0, 8000); const heading = /(20\d{2})年(?:(?:1[-—]\s*(\d{1,2})月)|(\d{1,2})月|(上半年)|(前三季度)|(一季度))?财政收支情况/.exec(title); if (!heading) throw new Error("财政部月报缺少标题观测期"); const month = Number(heading[2] ?? heading[3] ?? 0) || (heading[4] ? 6 : heading[5] ? 9 : heading[6] ? 3 : 12); if (month > 12) throw new Error("财政部月报观测期无法识别"); return new Date(Date.UTC(Number(heading[1]), month - 1, 1)); }
function esc(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function cumulativeAnchor(page: string, label: string): RegExpExecArray | null {
  const candidates: Array<{ match: RegExpExecArray; score: number }> = [];
  const expression = new RegExp(`${esc(label)}[^0-9]{0,36}([0-9,.]+)亿元[^。；]{0,80}?(?:同比|比上年(?:同期)?|比去年同期)(?:增长|下降)([0-9.]+)%`, "g");
  for (const match of page.matchAll(expression)) {
    const prefix = page.slice(Math.max(0, (match.index ?? 0) - 90), match.index ?? 0);
    const sentencePrefix = prefix.slice(Math.max(prefix.lastIndexOf("。"), prefix.lastIndexOf("；")) + 1);
    const score = /(?:1\s*[-—]\s*\d{1,2}月累计|累计|上半年|前三季度|一季度|全年|20\d{2}年\s*[，,])/.test(sentencePrefix) ? 10 : 0;
    candidates.push({ match, score });
  }
  candidates.sort((a, b) => b.score - a.score || (b.match.index ?? 0) - (a.match.index ?? 0));
  return candidates[0]?.match ?? null;
}
/** 正文锚点为“名称 金额亿元，同比（增长|下降）增速%”；缺锚点不写入该分项。 */
export function parseMofFiscalPage(html: string): { obsDate: Date; values: Map<string, Map<FiscalMeasure, ObservationPoint>> } { const page = text(html); const obsDate = endPeriod(page); const values = new Map<string, Map<FiscalMeasure, ObservationPoint>>(); for (const component of MOF_FISCAL_COMPONENTS) { let match: RegExpExecArray | null = null; for (const label of component.labels) { match = cumulativeAnchor(page, label); if (match) break; } if (!match) continue; const amount = Number(match[1]!.replace(/,/g, "")); // 少数月报同时给出扣除因素后及自然口径增速，优先自然口径以保持跨期可比性。
    const naturalRate = /按自然口径计算(?:增长|下降)([0-9.]+)%/.exec(match[0]); const rate = Number(naturalRate?.[1] ?? match[2]); if (!Number.isFinite(amount) || !Number.isFinite(rate)) throw new Error(`财政部月报数值异常：${component.key}`); const sign = (naturalRate?.[0] ?? match[0]).includes("下降") ? -1 : 1; values.set(component.key, new Map([["amount", { obsDate, value: amount }], ["yoy", { obsDate, value: sign * rate }]])); } if (!values.size) throw new Error("财政部月报未解析到任何财政收支锚点"); return { obsDate, values }; }
