import { discoverSecFilings, fetchSecJson, fetchSecText, secDocumentUrl, type SecIndexRow } from "./secEdgar";
import type { SecFactPoint } from "./secFundamentals";

const TAG = "PurchasesOfPropertyAndEquipmentAndIntangibleAssets";
type CompanyFacts = { cik?: string | number; facts?: Record<string, Record<string, { units?: Record<string, SecFactPoint[]> }>> };
const attr = (source: string, key: string) => source.match(new RegExp(`(?:^|\\s)${key}=["']([^"']*)["']`, "i"))?.[1];
const day = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86400000;

/** SEC生成的XBRL instance已带完整数值：decimals是精度，绝不能当缩放倍数。 */
export function parseNvidiaCashCapexInstance(xml: string, filing: Pick<SecIndexRow, "accession" | "form" | "filedAt">): SecFactPoint[] {
  if (!/^10-[KQ](?:\/A)?$/.test(filing.form)) throw new Error("资本开支补充只接受10-K/10-Q");
  if (xml.length > 32 * 1024 * 1024) throw new Error("XBRL instance超出32 MiB上限");
  const contexts = new Map<string, { start: string; end: string }>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?context>/gi)) {
    const id = attr(m[1]!, "id"), body = m[2]!;
    if (!id || /<(?:[\w-]+:)?(?:explicitMember|typedMember)\b/i.test(body)) continue;
    const cik = body.match(/<(?:[\w-]+:)?identifier\b[^>]*>\s*(\d+)\s*<\//i)?.[1];
    const start = body.match(/<(?:[\w-]+:)?startDate>\s*(\d{4}-\d{2}-\d{2})\s*<\//i)?.[1];
    const end = body.match(/<(?:[\w-]+:)?endDate>\s*(\d{4}-\d{2}-\d{2})\s*<\//i)?.[1];
    if (Number(cik) !== 1045810 || !start || !end || end > filing.filedAt || day(end) - day(start) < 70 || day(end) - day(start) > 380) continue;
    contexts.set(id, { start, end });
  }
  const usd = new Set<string>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?unit\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?unit>/gi)) {
    const id = attr(m[1]!, "id"), body = m[2]!;
    const measures = [...body.matchAll(/<(?:[\w-]+:)?measure>\s*([^<]*)\s*<\//gi)].map(x => x[1]!.trim());
    if (id && !/<(?:[\w-]+:)?divide\b/i.test(body) && measures.length === 1 && /^(?:[\w-]+:)?USD$/.test(measures[0]!)) usd.add(id);
  }
  const out: SecFactPoint[] = [];
  const seen = new Map<string, number>();
  for (const m of xml.matchAll(new RegExp(`<nvda:${TAG}\\b([^>]*)>([^<]*)<\\/nvda:${TAG}>`, "gi"))) {
    const a = m[1]!, context = contexts.get(attr(a, "contextRef") ?? "");
    const text = m[2]!.trim();
    if (!context || !usd.has(attr(a, "unitRef") ?? "") || /(?:xsi:)?nil=["']true["']/i.test(a) || !/^\d+(?:\.\d+)?$/.test(text)) continue;
    const val = Number(text);
    if (!Number.isFinite(val) || val > Number.MAX_SAFE_INTEGER) continue;
    const key = `${context.start}|${context.end}`;
    if (seen.has(key) && seen.get(key) !== val) throw new Error("同申报同期间资本开支事实冲突");
    if (seen.has(key)) continue;
    seen.set(key, val);
    out.push({ ...context, val, form: filing.form, filed: filing.filedAt, accn: filing.accession });
  }
  return out;
}

/** 用已有标准事实的accn定位覆盖缺口的申报，而非猜文档URL；每次最多8份。 */
export function selectCashCapexFilings(facts: unknown, missingDates: string[]) {
  const shape = facts as CompanyFacts;
  if (Number(shape?.cik) !== 1045810) return [];
  const wanted = new Set(missingDates);
  const candidates = new Map<string, { accession: string; filedAt: string; dates: Set<string> }>();
  for (const name of ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "NetIncomeLoss", "ProfitLoss", "NetCashProvidedByUsedInOperatingActivities"]) {
    for (const p of shape.facts?.["us-gaap"]?.[name]?.units?.USD ?? []) {
      if (!p.start || !p.end || !wanted.has(p.end) || !p.accn || !p.filed || !/^10-[KQ](?:\/A)?$/.test(p.form ?? "")) continue;
      const annual = p.end.slice(5, 7) === "01";
      const span = day(p.end) - day(p.start);
      if (annual ? !p.form!.startsWith("10-K") || span < 330 : !p.form!.startsWith("10-Q") || span > 300) continue;
      let c = candidates.get(p.accn);
      if (!c) { c = { accession: p.accn, filedAt: p.filed, dates: new Set() }; candidates.set(p.accn, c); }
      c.dates.add(p.end);
    }
  }
  const remaining = new Set(wanted), selected = [];
  while (remaining.size && selected.length < 8) {
    const ranked = [...candidates.values()].map(c => ({ c, gain: [...c.dates].filter(d => remaining.has(d)).length }))
      .filter(x => x.gain).sort((a, b) => b.gain - a.gain || b.c.filedAt.localeCompare(a.c.filedAt));
    const best = ranked[0]?.c;
    if (!best) break;
    selected.push({ accession: best.accession, filedAt: best.filedAt });
    for (const date of best.dates) remaining.delete(date);
  }
  return selected;
}

/** 显式历史回填入口；不在页面或普通日批上增加外部请求。仅补已核实的NVIDIA现金购置科目。 */
export async function supplementSecCashCapex(facts: unknown, missingDates: string[]) {
  const shape = facts as CompanyFacts;
  const selected = selectCashCapexFilings(facts, missingDates);
  const sources: { accession: string; url: string; filedAt: string; points: number }[] = [];
  if (!selected.length) return { facts, sources };
  const filings = await discoverSecFilings("1045810", selected.map(f => f.filedAt).sort()[0]!, true, { maxHistoryFiles: 8 });
  const byAccession = new Map(filings.map(f => [f.accession, f]));
  const points: SecFactPoint[] = [];
  for (const chosen of selected) {
    const filing = byAccession.get(chosen.accession);
    if (!filing || filing.filedAt !== chosen.filedAt || !/^10-[KQ](?:\/A)?$/.test(filing.form)) throw new Error("补充申报元数据不一致");
    const index = await fetchSecJson<{ directory?: { item?: { name: string; size?: string | number }[] } }>(secDocumentUrl("1045810", filing.accession, "index.json"), 30000);
    const files = (index.directory?.item ?? []).filter(f => /^[\w.-]+\.xml$/i.test(f.name)
      && !/_(cal|def|lab|pre)\.xml$|^FilingSummary\.xml$/i.test(f.name) && Number(f.size) > 0 && Number(f.size) <= 32 * 1024 * 1024);
    if (!files.length || files.length > 2) throw new Error("无法有界确定XBRL instance");
    for (const file of files) {
      const url = secDocumentUrl("1045810", filing.accession, file.name);
      const parsed = parseNvidiaCashCapexInstance(await fetchSecText(url, 30000), filing);
      if (parsed.length) { points.push(...parsed); sources.push({ accession: filing.accession, url, filedAt: filing.filedAt, points: parsed.length }); }
    }
  }
  if (!points.length) throw new Error("有界申报中未找到可核实的现金资本开支事实");
  const previous = shape.facts?.nvda?.[TAG]?.units?.USD ?? [];
  return { facts: { ...shape, facts: { ...shape.facts, nvda: { ...shape.facts?.nvda,
    [TAG]: { units: { USD: [...previous, ...points] } },
  } } }, sources };
}
