import { parseOwnershipDate } from "../quant/form4";
import type { TradingPlan } from "./ownershipTypes";

export function plainDisclosure(html: string): string {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_,n) => String.fromCodePoint(parseInt(n,16)))
    .replace(/&#(\d+);/g, (_,n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}
function attr(tag: string, key: string) { return tag.match(new RegExp(`\\b${key}=["']([^"']+)["']`, "i"))?.[1] ?? ""; }
function norm(s: string) { return s.toLowerCase().replace(/[^a-z0-9]/g, ""); }
/** ECD Inline XBRL facts; context dimensions keep people and individual arrangements separate. */
export function parseTradingPlans(html: string, sourceUrl: string, filedAt: string): TradingPlan[] {
  const contexts = new Map<string, string>();
  for (const m of html.matchAll(/<(?:xbrli:)?context\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?context>/gi)) {
    const dims = [...m[2].matchAll(/<xbrldi:(?:explicitMember|typedMember)\b[^>]*>[\s\S]*?<\/xbrldi:(?:explicitMember|typedMember)>/gi)].map(x => x[0]).sort();
    contexts.set(attr(m[1], "id"), dims.join("|"));
  }
  type Fact = { name: string; value: string; number: number | null; flag: boolean | null; context: string; at: number; end: number };
  const facts: Fact[] = [];
  for (const m of html.matchAll(/<ix:(nonNumeric|nonFraction)\b([^>]*)>/gi)) {
    const name = attr(m[2], "name");
    if (!name.startsWith("ecd:") || name.endsWith("TextBlock")) continue;
    const endAt = html.indexOf(`</ix:${m[1]}>`, m.index! + m[0].length);
    if (endAt < 0) continue;
    const value = plainDisclosure(html.slice(m.index! + m[0].length, endAt));
    const raw = Number(value.replace(/,/g, "")), scale = Number(attr(m[2], "scale") || 0);
    const format = attr(m[2], "format");
    facts.push({ name: name.slice(4), value, number: m[1].toLowerCase() === "nonfraction" && Number.isFinite(raw) ? raw * 10 ** scale : null,
      flag: /fixed-true/.test(format) || value === "true" ? true : /fixed-false/.test(format) || value === "false" ? false : null,
      context: contexts.get(attr(m[2], "contextRef")) || attr(m[2], "contextRef"), at: m.index!, end: endAt });
  }
  const out: TradingPlan[] = [];
  const names = facts.filter(f => f.name === "TrdArrIndName");
  for (const name of names) {
    const related = facts.filter(f => f.context === name.context);
    const values = (key: string) => [...new Set(related.filter(f => f.name === key).map(f => f.value))];
    const value = (key: string) => values(key).length === 1 ? values(key)[0] : null;
    const adoption = value("TrdArrAdoptionDate");
    const adopted = adoption ? parseOwnershipDate(adoption) : null;
    const terminated = value("TrdArrTerminationDate");
    const end = value("TrdArrExpirationDate");
    const rule = related.find(f => f.name === "Rule10b51ArrAdoptedFlag" || f.name === "Rule10b51ArrTrmntdFlag")?.flag ?? null;
    const isTerminated = related.some(f => f.name === "Rule10b51ArrTrmntdFlag" && f.flag === true);
    // A single aggregate in the SAME context is safe; child context amounts may overlap.
    const quantities = [...new Set(related.filter(f => f.name === "TrdArrSecuritiesAggAvailAmt").map(f => f.number).filter((v): v is number => v != null && v >= 0))];
    const nextName = names.find(n => n.at > name.at);
    const excerpt = plainDisclosure(html.slice(name.at, nextName ? nextName.at : name.end + 12000)).slice(0,12000);
    const childFacts = facts.filter(f=>f.name==="TrdArrSecuritiesAggAvailAmt" && !!name.context && f.context!==name.context && f.context.includes(name.context) && f.at>=name.at && (!nextName || f.at<nextName.at));
    const childGroups = new Map<string,number[]>();
    for(const f of childFacts) if(f.number!=null && f.number>=0) childGroups.set(f.context,[...(childGroups.get(f.context)??[]),f.number]);
    // Disjoint ECD arrangement members are components; duplicate contexts must agree. Never add parent total to children.
    const componentsUnambiguous = childGroups.size>0 && [...childGroups.values()].every(v=>new Set(v).size===1) && values("TrdArrAdoptionDate").length===1;
    const narrativeQuantity = [...excerpt.matchAll(/(?:sale of up to|sales of up to)\s+([\d,]+)\s+shares/gi)];
    const maxShares = quantities.length===1 ? quantities[0] : quantities.length===0 && componentsUnambiguous ? [...childGroups.values()].reduce((s,v)=>s+v[0],0) : quantities.length===0 && !childGroups.size && narrativeQuantity.length===1 ? Number(narrativeQuantity[0][1].replace(/,/g,"")) : null;
    const securityMatch = excerpt.match(/(?:our|the Issuer.s)\s+(Class [A-Z] common stock|common stock)/i);
    const startMatch = excerpt.match(/(?:estimated start date of|commencing on|beginning on)\s+([A-Z][a-z]+ \d{1,2},? \d{4})/);
    const verified = rule === true && values("TrdArrAdoptionDate").length <= 1 && (isTerminated ? !!terminated : !!adopted);
    out.push({ id: `${norm(name.value)}:${adopted ?? "unknown"}`, ownerName: name.value, ownerCik: null, adopted,
      start: startMatch ? parseOwnershipDate(startMatch[1]) : null, end: end ? parseOwnershipDate(end) : null,
      terminated: terminated ? parseOwnershipDate(terminated) : null, maxShares,
      security: securityMatch?.[1] ?? null, account: null, status: isTerminated ? "terminated" : verified ? "adopted" : "candidate", rule10b51: rule,
      conditions: /subject to reduction/i.test(excerpt) ? "可能与其他计划共享额度，不能直接相加" : /vesting|threshold prices/i.test(excerpt) ? "受归属、价格或其他条件约束；不是成交承诺" : "以原文条款为准",
      sourceUrl, filedAt, evidence: excerpt, verified });
  }
  // Untagged documents remain reviewable; never silently claim no plans.
  if (!out.length && /10b5[-–]1/i.test(plainDisclosure(html))) {
    const text = plainDisclosure(html); const at = Math.max(text.lastIndexOf("Trading Arrangements"), text.search(/10b5[-–]1/i));
    out.push({ id: `candidate:${filedAt}`, ownerName: "待解析的计划披露", ownerCik: null, adopted: null, start: null, end: null, terminated: null,
      maxShares: null, security: null, account: null, status: "candidate", rule10b51: null, conditions: "未找到可唯一对应的 ECD 标记，需审核原文",
      sourceUrl, filedAt, evidence: text.slice(at, at + 12000), verified: false });
  }
  return [...new Map(out.map(p => [p.id, p])).values()];
}
