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
    const planDateMatch = planText.match(/(?:adopted|entered into|established)(?: on)?\s+([A-Z][a-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2})/);
    const formFlag = root.aff10b5One ?? root.aff10B5One;
    const direction = pluckValue(ownershipNature?.directOrIndirectOwnership);
    out.push({
      evidence: { version: 2, security: pluckValue(r.securityTitle) ?? "", ownership: direction === "D" || direction === "I" ? direction : null,
        nature: pluckValue(ownershipNature?.natureOfOwnership), owners, footnotes, footnoteIds,
        documentType: pluckValue(root.documentType) ?? "4", originalSubmissionDate: pluckValue(root.dateOfOriginalSubmission), lineIndex,
        remarks: pluckValue(root.remarks) ?? "",
        formPlan: formFlag == null ? null : pluckFlag(formFlag),
        plan: explicitNotPlan ? false : explicitPlan ? true : null,
        planAdoptionDate: planDateMatch ? parseOwnershipDate(planDateMatch[1]) : null,
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
export function parseOwnershipDate(raw: string): string | null {
  const text = raw.trim().replace(/^On /i, "");
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  const match = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(text);
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const month = match ? months.findIndex(m=>m===match[1].toLowerCase() || m.slice(0,3)===match[1].toLowerCase()) : -1;
  const day = iso ?? (match && month>=0 ? `${match[3]}-${String(month+1).padStart(2,"0")}-${match[2].padStart(2,"0")}` : null);
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
