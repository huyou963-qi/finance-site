/**
 * SEC Form 4 XML 解析（纯函数，无 I/O）。只解析 Table I（非衍生证券普通股买卖），
 * 跳过 Table II（衍生证券/期权）。
 *
 * SEC Form 4 XML 惯例：
 * - 数值/日期字段包一层 <value> 子节点（如 <transactionShares><value>100</value></transactionShares>）。
 * - 单笔交易时 nonDerivativeTransaction 是单个对象而非数组，需归一化。
 */
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import type { OwnershipLineEvidence, OwnershipHolding, ReportingOwner } from "../equity/ownershipTypes";

export type Form4Transaction = {
  evidence: OwnershipLineEvidence;
  issuerCik: string;
  issuerSymbol: string | null;
  filerCik: string;
  filerName: string | null;
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
  officerTitle: string | null;
  transactionDate: string; // YYYY-MM-DD
  transactionCode: string;
  acquiredDisposedCode: string;
  shares: number;
  pricePerShare: number | null;
  sharesOwnedAfter: number | null;
};

// parseTagValue:false — 保留原始字符串，避免 CIK 前导零（如 "0000320193"）被当数字解析后丢失。
// 数值字段一律在 pluckNumber() 里显式 Number() 转换。
const parser = new XMLParser({ ignoreAttributes: false, trimValues: true, parseTagValue: false });

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * XSD 的 xs:date 允许可选时区后缀（`-?YYYY-MM-DD(Z|(+|-)hh:mm)?`），SEC 原样透传。
 * 高盛的申报代理就输出 `2012-07-27-04:00`，而下游按严格 `YYYY-MM-DD` 校验，
 * 导致整份申报被判「交易日期、股数或方向无效」而丢弃——全量回填中 GS 有 418 份、
 * DG 有 16 份因此失败，占非 CIK 类失败的绝大多数。
 * 不匹配的值原样返回，真正畸形的日期仍会在下游被拒。
 */
function normalizeXsdDate(value: string | null): string | null {
  if (!value) return value;
  const m = /^(\d{4}-\d{2}-\d{2})(?:Z|[+-]\d{2}:\d{2})$/.exec(value.trim());
  return m ? m[1] : value;
}

function pluckValue(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node === "object" && "value" in (node as Record<string, unknown>)) {
    const inner = (node as Record<string, unknown>).value;
    if (inner == null) return null;
    return String(inner);
  }
  return null;
}

function pluckNumber(node: unknown): number | null {
  const raw = pluckValue(node);
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function pluckFlag(node: unknown): boolean {
  const raw = pluckValue(node);
  if (raw == null) return false;
  return raw === "1" || raw.toLowerCase() === "true";
}

export function parseForm4Xml(xml: string): Form4Transaction[] {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root = (doc.ownershipDocument ?? doc.edgarSubmission) as Record<string, unknown> | undefined;
  if (!root) return [];

  const issuer = root.issuer as Record<string, unknown> | undefined;
  const issuerCik = pluckValue(issuer?.issuerCik) ?? "";
  const issuerSymbol = pluckValue(issuer?.issuerTradingSymbol);
  if (!issuerCik) return [];

  const ownerNode = root.reportingOwner;
  const owner = (Array.isArray(ownerNode) ? ownerNode[0] : ownerNode) as
    | Record<string, unknown>
    | undefined;
  const ownerId = owner?.reportingOwnerId as Record<string, unknown> | undefined;
  const relationship = owner?.reportingOwnerRelationship as Record<string, unknown> | undefined;
  const filerCik = pluckValue(ownerId?.rptOwnerCik) ?? "";
  const filerName = pluckValue(ownerId?.rptOwnerName);
  const isDirector = pluckFlag(relationship?.isDirector);
  const isOfficer = pluckFlag(relationship?.isOfficer);
  const isTenPercentOwner = pluckFlag(relationship?.isTenPercentOwner);
  const officerTitle = pluckValue(relationship?.officerTitle);
  if (!filerCik) return [];

  const table = root.nonDerivativeTable as Record<string, unknown> | undefined;
  const rows = toArray(table?.nonDerivativeTransaction as unknown);

  const owners: ReportingOwner[] = toArray(root.reportingOwner).map(value => {
    const o = value as Record<string, Record<string, unknown>>;
    const id = o.reportingOwnerId, rel = o.reportingOwnerRelationship;
    return { cik: pluckValue(id?.rptOwnerCik) ?? "", name: pluckValue(id?.rptOwnerName) ?? "",
      isOfficer: pluckFlag(rel?.isOfficer), isDirector: pluckFlag(rel?.isDirector),
      isTenPercentOwner: pluckFlag(rel?.isTenPercentOwner), title: pluckValue(rel?.officerTitle) };
  });
  const footnoteMap = new Map(toArray((root.footnotes as Record<string, unknown>)?.footnote).map(v => {
    const f = v as Record<string, unknown>;
    return [String(f["@_id"]), String(f["#text"] ?? "")];
  }));
  const out: Form4Transaction[] = [];
  for (const [lineIndex, row] of rows.entries()) {
    const r = row as Record<string, unknown>;
    const amounts = r.transactionAmounts as Record<string, unknown> | undefined;
    const postAmounts = r.postTransactionAmounts as Record<string, unknown> | undefined;
    const coding = r.transactionCoding as Record<string, unknown> | undefined;

    const transactionDate = normalizeXsdDate(pluckValue(r.transactionDate));
    const transactionCode = pluckValue(coding?.transactionCode);
    const acquiredDisposedCode = pluckValue(amounts?.transactionAcquiredDisposedCode);
    const shares = pluckNumber(amounts?.transactionShares);
    if (!transactionDate || !transactionCode || !acquiredDisposedCode || shares == null) continue;

    const ownershipNature = r.ownershipNature as Record<string, unknown> | undefined;
    const footnoteIds = collectFootnoteIds(r);
    const footnotes = footnoteIds.map(id => footnoteMap.get(id) ?? "").filter(Boolean);
    const planText = footnotes.join(" ");
    const explicitPlan = /(?:pursuant to|under|in accordance with)[\s\S]{0,100}(?:10b5-1|10b5–1)/i.test(planText);
    const explicitNotPlan = /(?:not (?:made |executed )?pursuant to|not under)[\s\S]{0,80}10b5-1/i.test(planText);
    const formFlag = root.aff10b5One ?? root.aff10B5One;
    const direction = pluckValue(ownershipNature?.directOrIndirectOwnership);
    out.push({
      evidence: { version: 2, security: pluckValue(r.securityTitle) ?? "", ownership: direction === "D" || direction === "I" ? direction : null,
        nature: pluckValue(ownershipNature?.natureOfOwnership), owners, footnotes, footnoteIds,
        documentType: pluckValue(root.documentType) ?? "4", originalSubmissionDate: pluckValue(root.dateOfOriginalSubmission), lineIndex,
        remarks: pluckValue(root.remarks) ?? "",
        formPlan: formFlag == null ? null : pluckFlag(formFlag),
        plan: explicitNotPlan ? false : explicitPlan ? true : null,
        planAdoptionDate: extractPlanAdoptionDate(footnotes),
        derivative: false, underlyingShares: null, underlyingSecurity: null },
      issuerCik,
      issuerSymbol,
      filerCik,
      filerName,
      isDirector,
      isOfficer,
      isTenPercentOwner,
      officerTitle,
      transactionDate,
      transactionCode,
      acquiredDisposedCode,
      shares,
      pricePerShare: pluckNumber(amounts?.transactionPricePerShare),
      sharesOwnedAfter: pluckNumber(postAmounts?.sharesOwnedFollowingTransaction),
    });
  }
  return out;
}

export function collectFootnoteIds(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const o = node as Record<string, unknown>;
  const here = o.footnoteId == null ? [] : toArray(o.footnoteId).map(f => String((f as Record<string, unknown>)["@_id"] ?? ""));
  return [...new Set([...here, ...Object.entries(o).filter(([k]) => k !== "footnoteId").flatMap(([,v]) => collectFootnoteIds(v))])].filter(Boolean);
}
// 10b5-1 计划采纳日：2023 修订后 Form 4 勾选 10b5-1 时须披露采纳日，措辞多为
// "plan adopted by the reporting person on November 20, 2025"——动词与日期之间夹词。
// 只在提到 10b5-1 / trading plan 的句子里找，且动词到日期之间不许出现其他数字，
// 避免抓到别处（信托设立日、加权均价区间、计划截止日）的日期。
const PLAN_DATE = String.raw`\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2})\b`;
const PLAN_GAP = String.raw`(?:10b5[-–‑]1(?:\([a-z0-9]+\))*|[^\d;])`;
const PLAN_ANCHOR = /10b5[-–‑]\s?1|trading (?:plan|arrangement)/i;
const ADOPTED_THEN_DATE = new RegExp(String.raw`\b(?:adopted|entered into|established|dated|adoption date)\b${PLAN_GAP}{0,60}?${PLAN_DATE}`, "i");
const DATE_THEN_ADOPTED = new RegExp(String.raw`\bOn\s+${PLAN_DATE},?[^;]{0,80}?\b(?:adopted|entered into|established)\b`, "i");
// 修改数量/价格/时点视同终止并采纳新计划（Rule 10b5-1(c)(1)(iv)），10-K/10-Q 按修改日登记。
const MODIFIED_THEN_DATE = new RegExp(String.raw`\b(?:modified|amended)\b${PLAN_GAP}{0,60}?${PLAN_DATE}`, "gi");
// 句末句点：后接空白+大写；排除称谓/公司后缀/单字母缩写（Mr. / Inc. / L.P. / Michael N.）。月份缩写后接数字，不受影响。
const SENTENCE_BREAK = /(?<!\b(?:Mr|Mrs|Ms|Dr|Inc|Corp|Co|Ltd|Jr|Sr|No|[A-Z]))\.(?=\s+[A-Z("])|;/;

export function extractPlanAdoptionDate(footnotes: string[]): string | null {
  for (const sentence of footnotes.flatMap(f => f.split(SENTENCE_BREAK))) {
    if (!PLAN_ANCHOR.test(sentence)) continue;
    const match = ADOPTED_THEN_DATE.exec(sentence) ?? DATE_THEN_ADOPTED.exec(sentence);
    const adopted = match ? parseOwnershipDate(match[1]) : null;
    if (!match || !adopted) continue;
    const rest = sentence.slice(match.index + match[0].length);
    const modified = [...rest.matchAll(MODIFIED_THEN_DATE)].map(m => parseOwnershipDate(m[1])).filter((d): d is string => !!d && d >= adopted);
    return modified.at(-1) ?? adopted;
  }
  return null;
}

export function parseOwnershipDate(raw: string): string | null {
  const text = raw.trim().replace(/^On /i, "");
  const named = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(text);
  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text); // 美式 M/D/YYYY
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const month = named && named[1].length>=3 ? months.findIndex(m=>m.startsWith(named[1].toLowerCase())) : -1;
  const pad = (v: string | number) => String(v).padStart(2,"0");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text
    : named && month>=0 ? `${named[3]}-${pad(month+1)}-${pad(named[2])}`
    : numeric ? `${numeric[3]}-${pad(numeric[1])}-${pad(numeric[2])}` : null;
  return day && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0,10)===day ? day : null;
}
/** Forms 3/4/5 holdings share the exact Table I parser and retain account footnotes. */
export function parseOwnershipHoldings(xml: string): OwnershipHolding[] {
  const root = parser.parse(xml)?.ownershipDocument;
  if (!root) return [];
  const holdings = toArray(root.nonDerivativeTable?.nonDerivativeHolding);
  return holdings.flatMap((holding) => {
    const r = holding as Record<string, unknown>;
    const synthetic = { ...root, nonDerivativeTable: { nonDerivativeTransaction: { ...r,
      transactionDate: { value: root.periodOfReport }, transactionCoding: { transactionCode: "H" },
      transactionAmounts: { transactionShares: { value: "0" }, transactionAcquiredDisposedCode: { value: "A" } },
    } } };
    // Build XML through the same schema serializer to avoid an independent ownership parser.
    const parsed = parseForm4Xml(new XMLBuilder({ ignoreAttributes: false }).build({ ownershipDocument: synthetic }))[0];
    if (!parsed || parsed.sharesOwnedAfter == null) return [];
    return [{ security: parsed.evidence.security, ownership: parsed.evidence.ownership, nature: parsed.evidence.nature,
      shares: parsed.sharesOwnedAfter, date: parsed.transactionDate, owners: parsed.evidence.owners, footnotes: parsed.evidence.footnotes }];
  });
}
/** Derivative legs preserved in filing evidence, excluded from share supply; no double count on exercise. */
export function parseDerivativeTransactions(xml: string): Form4Transaction[] {
  const root = parser.parse(xml)?.ownershipDocument;
  if (!root) return [];
  return toArray(root.derivativeTable?.derivativeTransaction).flatMap((value, index) => {
    const r = value as Record<string, unknown>;
    const synthetic = { ...root, nonDerivativeTable: { nonDerivativeTransaction: r } };
    const parsed = parseForm4Xml(new XMLBuilder({ ignoreAttributes: false }).build({ ownershipDocument: synthetic }))[0];
    if (!parsed) return [];
    const underlying = r.underlyingSecurity as Record<string, unknown> | undefined;
    return [{ ...parsed, evidence: { ...parsed.evidence, derivative: true, lineIndex: index,
      underlyingShares: pluckNumber(underlying?.underlyingSecurityShares), underlyingSecurity: pluckValue(underlying?.underlyingSecurityTitle) } }];
  });
}
