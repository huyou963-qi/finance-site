/**
 * SEC Form 4 XML 解析（纯函数，无 I/O）。只解析 Table I（非衍生证券普通股买卖），
 * 跳过 Table II（衍生证券/期权）。
 *
 * SEC Form 4 XML 惯例：
 * - 数值/日期字段包一层 <value> 子节点（如 <transactionShares><value>100</value></transactionShares>）。
 * - 单笔交易时 nonDerivativeTransaction 是单个对象而非数组，需归一化。
 */
import { XMLParser } from "fast-xml-parser";

export type Form4Transaction = {
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

  const out: Form4Transaction[] = [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const amounts = r.transactionAmounts as Record<string, unknown> | undefined;
    const postAmounts = r.postTransactionAmounts as Record<string, unknown> | undefined;
    const coding = r.transactionCoding as Record<string, unknown> | undefined;

    const transactionDate = pluckValue(r.transactionDate);
    const transactionCode = pluckValue(coding?.transactionCode);
    const acquiredDisposedCode = pluckValue(amounts?.transactionAcquiredDisposedCode);
    const shares = pluckNumber(amounts?.transactionShares);
    if (!transactionDate || !transactionCode || !acquiredDisposedCode || shares == null) continue;

    out.push({
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
