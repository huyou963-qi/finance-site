import { createHash } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { discoverSecFilings, fetchSecJson, fetchSecText, secDocumentUrl, type SecIndexRow } from "./secEdgar";
import { CASH_CAPEX_COMPONENTS, issuerReportedCashCapex } from "./issuerCashCapex";
import { extractQuarterlyFundamentals, type SecFactPoint } from "./secFundamentals";
import { statementSupplementFlows, STATEMENT_CAPEX_ROLES } from "./secStatementSupplement";

type Node = Record<string, unknown>;
export type PeriodicFiling = Pick<SecIndexRow, "accession" | "form" | "filedAt" | "primaryDocument"> & { reportDate?: string | null };
export type InstanceConcept = { namespace: string; points: SecFactPoint[] };
export type InstanceData = { concepts: Map<string, InstanceConcept>; standardPrefixes: Set<string>; namespaces: Record<string, string>; registrantName?: string; schemaDocument?: string };
const nodes = (v: unknown): Node[] => (Array.isArray(v) ? v : [v]).filter(x => x && typeof x === "object") as Node[];
const local = (key: string) => key.split(":").at(-1)!;
const children = (v: Node, name: string) => Object.entries(v).filter(([k]) => !k.startsWith("@_") && local(k) === name).flatMap(([, x]) => nodes(x));
const text = (v: Node | undefined) => String(v?.["#text"] ?? "").trim();
const attr = (v: Node, name: string) => String(Object.entries(v).find(([k]) => k.startsWith("@_") && local(k.slice(2)) === name)?.[1] ?? "");
const first = (v: Node, name: string) => children(v, name)[0];
const iso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");
const parse = (xml: string, max = 32 * 1024 * 1024) => {
  if (Buffer.byteLength(xml, "utf8") > max || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("SEC XML无效或超出预算");
  return new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false,
    processEntities: false, alwaysCreateTextNode: true, trimValues: true }).parse(xml) as Node;
};
const validateFiling = (filing: PeriodicFiling) => {
  if (!/^\d{10}-\d{2}-\d{6}$/.test(filing.accession) || !/^10-[KQ](?:\/A)?$/.test(filing.form) || !iso(filing.filedAt)) throw new Error("SEC申报身份无效");
};

/** 仅合并主体、无维度、美元事实。instance数值已展开，decimals不是scale。 */
export function parseSecPeriodicInstance(xml: string, filing: PeriodicFiling, cik: number): InstanceData {
  validateFiling(filing);
  if (!Number.isSafeInteger(cik) || cik <= 0) throw new Error("SEC主体无效");
  const doc = parse(xml), root = first(doc, "xbrl");
  if (!root) throw new Error("缺少XBRL instance根节点");
  const namespaces = new Map(Object.entries(root).filter(([k]) => k.startsWith("@_xmlns:")).map(([k, v]) => [k.slice(8), String(v)]));
  const standardPrefixes = new Set([...namespaces].filter(([, uri]) => /^https?:\/\/(?:fasb\.org|xbrl\.us)\/us-gaap\/20\d{2}(?:-\d{2}-\d{2})?$/.test(uri)).map(([prefix]) => prefix));
  if (!standardPrefixes.size) throw new Error("缺少US-GAAP命名空间");
  const contexts = new Map<string, { start?: string; end: string }>();
  for (const context of children(root, "context")) {
    const entity = first(context, "entity"), period = first(context, "period");
    if (!entity || !period || children(entity, "segment").length || children(context, "scenario").length) continue;
    const identifier = first(entity, "identifier");
    if (!identifier || !/^https?:\/\/www\.sec\.gov\/CIK$/.test(attr(identifier, "scheme")) || Number(text(identifier)) !== cik) continue;
    const end = text(first(period, "endDate")) || text(first(period, "instant")), start = text(first(period, "startDate"));
    if (!iso(end) || end > filing.filedAt || (start && (!iso(start) || (Date.parse(end) - Date.parse(start)) / 86400000 < 69 || (Date.parse(end) - Date.parse(start)) / 86400000 > 380))) continue;
    const id = attr(context, "id");
    if (contexts.has(id) && JSON.stringify(contexts.get(id)) !== JSON.stringify({ ...(start ? { start } : {}), end })) throw new Error("重复XBRL context冲突");
    contexts.set(id, { ...(start ? { start } : {}), end });
  }
  const usd = new Set<string>();
  for (const unit of children(root, "unit")) {
    const measures = children(unit, "measure");
    if (children(unit, "divide").length || measures.length !== 1) continue;
    const value = text(measures[0]), [prefix, code] = value.split(":");
    if (code === "USD" && namespaces.get(prefix!) === "http://www.xbrl.org/2003/iso4217") usd.add(attr(unit, "id"));
  }
  const focus = (name: string, pattern: RegExp) => [...new Set(children(root, name).filter(p => contexts.has(attr(p, "contextRef"))).map(text).filter(p => pattern.test(p)))];
  const fp = focus("DocumentFiscalPeriodFocus", /^(?:FY|Q[1-4])$/), fy = focus("DocumentFiscalYearFocus", /^20\d{2}$/);
  const concepts = new Map<string, InstanceConcept>();
  let count = 0;
  for (const [qname, values] of Object.entries(root)) {
    const prefix = qname.split(":")[0]!, namespace = namespaces.get(prefix);
    if (!qname.includes(":") || !namespace || /(?:xbrl\.org|xbrl\.sec\.gov)/.test(namespace)) continue;
    const found = new Map<string, SecFactPoint>();
    const precision = new Map<string, number>();
    for (const p of nodes(values)) {
      const context = contexts.get(attr(p, "contextRef")), raw = text(p);
      if (!context || !usd.has(attr(p, "unitRef")) || /^(?:true|1)$/i.test(attr(p, "nil")) || !/^[+-]?\d+(?:\.\d+)?$/.test(raw)) continue;
      const val = Number(raw);
      if (!Number.isFinite(val) || Math.abs(val) > Number.MAX_SAFE_INTEGER) continue;
      const key = `${context.start ?? ""}|${context.end}`;
      const decimals = attr(p, "decimals"), digits = decimals === "INF" ? Infinity : /^-?\d+$/.test(decimals) ? Number(decimals) : null;
      if (found.has(key) && found.get(key)!.val !== val) {
        const previousDigits = precision.get(key);
        // 同一金额可在主表与附注分别按百万/十亿显示；仅接受声明精度允许的舍入，取精度较高者。
        if (digits == null || previousDigits == null || digits === previousDigits || Math.abs(found.get(key)!.val! - val) > 0.5 * 10 ** -Math.min(digits, previousDigits))
          throw new Error(`同申报同主体金额冲突：${qname}/${key}`);
        if (previousDigits >= digits) continue;
      }
      if (digits != null) precision.set(key, digits);
      found.set(key, { ...context, val, form: filing.form, filed: filing.filedAt, accn: filing.accession,
        ...(fp.length === 1 ? { fp: fp[0] } : {}), ...(fy.length === 1 ? { fy: Number(fy[0]) } : {}) });
    }
    if (found.size) { concepts.set(qname, { namespace, points: [...found.values()] }); count += found.size; }
    if (concepts.size > 4000 || count > 25000) throw new Error("XBRL事实超出单份预算");
  }
  const names = [...new Set(Object.entries(root).filter(([key]) => local(key) === "EntityRegistrantName"
    && /^https?:\/\/xbrl\.sec\.gov\/dei\/20\d{2}(?:-\d{2}-\d{2})?$/.test(namespaces.get(key.split(":")[0]!) ?? ""))
    .flatMap(([, values]) => nodes(values)).filter(p => contexts.has(attr(p, "contextRef"))).map(text).filter(Boolean))];
  const schemas = [...new Set(children(root, "schemaRef").map(p => attr(p, "href")).filter(p => /^[\w.-]+\.xsd$/.test(p)))];
  return { concepts, standardPrefixes, namespaces: Object.fromEntries(namespaces), ...(names.length === 1 ? { registrantName: names[0] } : {}),
    ...(schemas.length === 1 ? { schemaDocument: schemas[0] } : {}) };
}

/** 相同申报与期间的冲突必须停止，不能用缓存与新文件拼出一个虚构金额。 */
export function mergeSecPeriodicInstance(facts: unknown, parsed: InstanceData, cik: number) {
  const root = facts as { cik?: number; facts?: Record<string, Record<string, { units?: Record<string, SecFactPoint[]> }>> };
  if (Number(root.cik) !== cik || !root.facts) throw new Error("公司缓存主体不符");
  const result = { ...root, facts: { ...root.facts } };
  const custom = new Set(CASH_CAPEX_COMPONENTS[cik] ?? []);
  for (const [qname, data] of parsed.concepts) {
    const [prefix, name] = qname.split(":") as [string, string];
    const ns = parsed.standardPrefixes.has(prefix) ? "us-gaap" : custom.has(qname) ? prefix : null;
    if (!ns) continue;
    const old = result.facts[ns]?.[name], points = [...(old?.units?.USD ?? [])];
    const keyed = new Map(points.map(p => [`${p.accn}|${p.start ?? ""}|${p.end}`, p]));
    for (const p of data.points) {
      const id = `${p.accn}|${p.start ?? ""}|${p.end}`, previous = keyed.get(id);
      if (previous && (previous.val !== p.val || previous.filed !== p.filed || previous.form !== p.form)) throw new Error(`缓存与申报事实冲突：${qname}/${id}`);
      if (!previous) { points.push(p); keyed.set(id, p); }
    }
    result.facts[ns] = { ...result.facts[ns], [name]: { ...old, units: { ...old?.units, USD: points } } };
  }
  return result;
}

/** 累计现金流必须有上一季累计值才能得到单季；不能把6/9/12个月直接当季度。 */
export function periodicFilingNeedsPrior(facts: unknown, date?: string | null) {
  if (!date || !iso(date)) return false;
  const row = extractQuarterlyFundamentals(facts, { maxQuarters: 20 }).find(r => r.fiscalDate === date);
  const root = facts as { cik?: number; facts?: Record<string, Record<string, { units?: { USD?: SecFactPoint[] } }>> };
  const ytd = (p: SecFactPoint) => p.end === date && p.start != null && (Date.parse(p.end) - Date.parse(p.start)) / 86400000 > 125;
  if (row?.revenue == null || row.netIncome == null || row.ocf == null) {
    if (Object.values(root.facts?.["us-gaap"] ?? {}).some(c => c.units?.USD?.some(ytd))) return true;
  }
  if (row?.capex == null) {
    const reported = [...statementSupplementFlows(facts).capex, ...issuerReportedCashCapex(facts)];
    if ((STATEMENT_CAPEX_ROLES[Number(root.cik)]?.length ?? 0) <= 1) {
      for (const name of ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PaymentsForCapitalImprovements", "PaymentsForConstructionInProcess"])
        reported.push(...(root.facts?.["us-gaap"]?.[name]?.units?.USD ?? []));
    }
    if (reported.some(ytd)) return true;
  }
  return false;
}

/** 日批最多读取本期+紧邻上一季两份申报；每次都能恢复累计差额，不依赖无界磁盘缓存。 */
export async function supplementSecPeriodicFilingPair(facts: unknown, cik: number, filing: PeriodicFiling, budget = 2,
  dependencies = { supplement: supplementSecPeriodicFiling, discover: discoverSecFilings }) {
  if (!Number.isInteger(budget) || budget < 1 || budget > 2) throw new Error("单主体申报回补预算须为1–2");
  let result: unknown = await dependencies.supplement(facts, cik, filing);
  const handledAccessions: string[] = [];
  if (!periodicFilingNeedsPrior(result, filing.reportDate)) return { facts: result, filingsUsed: 1, handledAccessions: [filing.accession] };
  if (budget < 2) return { facts: result, filingsUsed: 1, handledAccessions };
  const since = new Date(`${filing.filedAt}T00:00:00Z`); since.setUTCDate(since.getUTCDate() - 220);
  const candidates = await dependencies.discover(String(cik), since.toISOString().slice(0, 10), true, { maxHistoryFiles: 2 });
  const previous = candidates.filter(p => /^10-[KQ](?:\/A)?$/.test(p.form) && p.reportDate && iso(p.reportDate)
    && p.filedAt <= filing.filedAt && p.reportDate < filing.reportDate!
    && (Date.parse(filing.reportDate!) - Date.parse(p.reportDate)) / 86400000 >= 55
    && (Date.parse(filing.reportDate!) - Date.parse(p.reportDate)) / 86400000 <= 140)
    .sort((a, b) => b.reportDate!.localeCompare(a.reportDate!) || b.filedAt.localeCompare(a.filedAt))[0];
  // IPO等不存在上一份独立季报时保留现金流缺失，不补零、不编造季度。
  if (!previous) return { facts: result, filingsUsed: 1, handledAccessions: [filing.accession] };
  result = await dependencies.supplement(result, cik, previous);
  if (!periodicFilingNeedsPrior(result, filing.reportDate)) handledAccessions.push(filing.accession);
  if (!periodicFilingNeedsPrior(result, previous.reportDate)) handledAccessions.push(previous.accession);
  return { facts: result, filingsUsed: 2, handledAccessions };
}

export type FilingDocumentProof = { url: string; sha256: string };
export type FilingStatementProof = {
  taxonomySchemaName?: string; linkbaseStorage?: "schema";
  instance: FilingDocumentProof; presentation: FilingDocumentProof; labels: FilingDocumentProof; summary: FilingDocumentProof;
  cashFlowRole: string; cashFlowConcepts: string[]; namespaces: Record<string, string>; hashEncoding: "utf8-text";
};
const decode = (v: string) => v.replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, s => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " })[s]!)
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (s, code: string) => {
    const n = /^x/i.test(code) ? parseInt(code.slice(1), 16) : Number(code);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : s;
  });
const locs = (link: Node) => new Map(children(link, "loc").flatMap(p => {
  const anchor = attr(p, "href").split("#")[1], split = anchor?.indexOf("_") ?? -1;
  return anchor && split > 0 ? [[attr(p, "label"), `${anchor.slice(0, split)}:${anchor.slice(split + 1)}`] as const] : [];
}));
const linkbases = (doc: Node): Node[] => {
  const schema = first(doc, "schema");
  return [...children(doc, "linkbase"), ...children(schema ?? {}, "annotation").flatMap(a => children(a, "appinfo")).flatMap(a => children(a, "linkbase"))];
};

/** 多份现金流表时不猜主体；只接受FilingSummary明确列入Statements的唯一现金流表。 */
export function primaryCashFlowLabels(summary: string, presentation: string, labels: string, registrantName?: string) {
  const s = first(parse(summary, 2 * 1024 * 1024), "FilingSummary");
  const reports = s ? children(first(s, "MyReports") ?? s, "Report") : [];
  let candidates = reports.filter(r => text(first(r, "MenuCategory")) === "Statements"
    && /cash\s*flows?/i.test(text(first(r, "ShortName"))) && !/parenthetical/i.test(text(first(r, "ShortName"))));
  if (candidates.length > 1 && registrantName) {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase().replace(/\bco\.?$/, "company");
    // 联合申报（如DTE）仅按本CIK的DEI注册全名精确核对标题后缀，不按表顺序或相似公司名选。
    candidates = candidates.filter(r => normalize(text(first(r, "ShortName")).split(/\s+-\s+/).at(-1) ?? "") === normalize(registrantName));
  }
  if (candidates.length !== 1) return null;
  const role = text(first(candidates[0]!, "Role")), map = new Map<string, Set<string>>();
  const labelDoc = parse(labels, 8 * 1024 * 1024), presentationDoc = labels === presentation ? labelDoc : parse(presentation, 8 * 1024 * 1024);
  const lroots = linkbases(labelDoc), proots = linkbases(presentationDoc);
  if (!lroots.length || !proots.length) return null;
  for (const link of lroots.flatMap(p => children(p, "labelLink"))) {
    const locations = locs(link), resources = new Map<string, Node[]>();
    for (const p of children(link, "label")) resources.set(attr(p, "label"), [...(resources.get(attr(p, "label")) ?? []), p]);
    for (const arc of children(link, "labelArc")) {
      const qname = locations.get(attr(arc, "from")); if (!qname) continue;
      for (const p of resources.get(attr(arc, "to")) ?? []) {
        if (attr(p, "lang") && !/^en(?:-|$)/i.test(attr(p, "lang"))) continue;
        const key = `${qname}|${attr(p, "role")}`, value = decode(text(p)).replace(/\s+/g, " ").trim();
        if (value) map.set(key, new Set([...(map.get(key) ?? []), value]));
      }
    }
  }
  const selected = new Map<string, Set<string>>(), all = new Set<string>();
  for (const link of proots.flatMap(p => children(p, "presentationLink")).filter(p => attr(p, "role") === role)) {
    const locations = locs(link);
    for (const qname of locations.values()) all.add(qname);
    for (const arc of children(link, "presentationArc")) {
      const qname = locations.get(attr(arc, "to")); if (!qname) continue;
      const values = map.get(`${qname}|${attr(arc, "preferredLabel") || "http://www.xbrl.org/2003/role/label"}`);
      if (values?.size === 1) selected.set(qname, new Set([...(selected.get(qname) ?? []), ...values]));
    }
  }
  return { role, concepts: [...all], labels: new Map([...selected].filter(([, values]) => values.size === 1).map(([key, values]) => [key, [...values][0]!])) };
}

/** 一个缺失申报最多五份小型官方文件；缓存已经包含该申报时调用方不进入此路径。 */
export async function supplementSecPeriodicFiling(facts: unknown, cik: number, filing: PeriodicFiling,
  transport = { json: fetchSecJson, text: fetchSecText }) {
  validateFiling(filing);
  const index = await transport.json<{ directory?: { item?: { name: string; size?: string | number }[] } }>(secDocumentUrl(String(cik), filing.accession, "index.json"), 20000);
  const entries = index.directory?.item ?? [];
  const one = (pattern: RegExp, max: number) => {
    const found = entries.filter(p => /^[\w.-]+$/.test(p.name) && pattern.test(p.name) && Number(p.size) > 0 && Number(p.size) <= max);
    return found.length === 1 ? found[0] : null;
  };
  const instance = one(/_htm\.xml$/i, 32 * 1024 * 1024);
  if (!instance) throw new Error("无法唯一确定有界SEC instance");
  const source = secDocumentUrl(String(cik), filing.accession, instance.name), xml = await transport.text(source, 30000);
  const parsed = parseSecPeriodicInstance(xml, filing, cik);
  const result = mergeSecPeriodicInstance(facts, parsed, cik) as ReturnType<typeof mergeSecPeriodicInstance> & {
    statementSupplement?: unknown[]; secFilingStatementProofs?: Record<string, FilingStatementProof>;
    secFilingInstanceSources?: Record<string, FilingDocumentProof & { hashEncoding: "utf8-text" }>;
  };
  result.secFilingInstanceSources = { ...result.secFilingInstanceSources, [filing.accession]: { url: source, sha256: sha(xml), hashEncoding: "utf8-text" } };
  // 注册过现金流口径的主体始终留取主表证明，避免后续申报切换tag时丢失本期总额。
  if (!STATEMENT_CAPEX_ROLES[cik] && !CASH_CAPEX_COMPONENTS[cik]) return result;
  const pre = one(/_pre\.xml$/i, 8 * 1024 * 1024), lab = one(/_lab\.xml$/i, 8 * 1024 * 1024), summary = one(/^FilingSummary\.xml$/i, 2 * 1024 * 1024);
  const schema = !pre && !lab && parsed.schemaDocument ? entries.find(p => p.name === parsed.schemaDocument && Number(p.size) > 0 && Number(p.size) <= 8 * 1024 * 1024) : undefined;
  if ((pre && lab || schema) && summary) {
    const documents = [];
    for (const file of schema ? [schema, summary] : [pre!, lab!, summary]) {
      const url = secDocumentUrl(String(cik), filing.accession, file.name), content = await transport.text(url, 20000);
      documents.push({ url, sha256: sha(content), content });
    }
    const [p, l, s] = (schema ? [documents[0], documents[0], documents[1]] : documents) as [typeof documents[number], typeof documents[number], typeof documents[number]];
    if (schema) {
      const target = attr(first(parse(p.content, 8 * 1024 * 1024), "schema") ?? {}, "targetNamespace");
      if (!target || !Object.values(parsed.namespaces).includes(target)) throw new Error("内嵌标签schema与申报命名空间不符");
    }
    const selected = primaryCashFlowLabels(s.content, p.content, l.content, parsed.registrantName);
    if (selected) {
      const proof: FilingStatementProof = { instance: { url: source, sha256: sha(xml) }, presentation: { url: p.url, sha256: p.sha256 },
        labels: { url: l.url, sha256: l.sha256 }, summary: { url: s.url, sha256: s.sha256 },
        cashFlowRole: selected.role, cashFlowConcepts: selected.concepts, namespaces: parsed.namespaces, hashEncoding: "utf8-text",
        ...(parsed.schemaDocument ? { taxonomySchemaName: parsed.schemaDocument } : {}), ...(schema ? { linkbaseStorage: "schema" as const } : {}) };
      const extra = [];
      for (const [qname, label] of selected.labels) for (const point of parsed.concepts.get(qname)?.points ?? []) {
        if (!point.start) continue;
        const [prefix, tag] = qname.split(":") as [string, string];
        extra.push({ ...point, cik, tag, taxonomy: parsed.standardPrefixes.has(prefix) ? `us-gaap/${parsed.concepts.get(qname)!.namespace.match(/20\d{2}/)![0]}` : filing.accession,
          statement: "CF", label, segments: "", coreg: "", unit: "USD", parenthetical: false, source, sha256: proof.instance.sha256, sourceType: "sec-instance", concept: qname });
      }
      result.secFilingStatementProofs = { ...result.secFilingStatementProofs, [filing.accession]: proof };
      // 同一申报重试替换同来源事实，不能累加至超过单公司预算。
      result.statementSupplement = [...(result.statementSupplement ?? []).filter(p => (p as { source?: string }).source !== source), ...extra];
      if (result.statementSupplement.length > 8000) throw new Error("现金流补充超出单公司预算");
    }
  }
  return result;
}
