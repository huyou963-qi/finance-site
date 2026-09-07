/**
 * 把一个 DERA 季度包灌进 Tier B 三张表。
 *
 * 幂等策略：按 sourceQuarter 先删后插。DERA 会重新发布带更正的季度包，
 * `skipDuplicates` 式增量会把更正吞掉，所以整季替换才是正确语义。
 * 交易与申报人经外键 onDelete: Cascade 随申报头一起清除。
 */
import { unzipSync } from "fflate";
import type { PrismaClient } from "@prisma/client";
import {
  parseTsv,
  assertColumns,
  parseDeraDate,
  parseDeraBoolean,
  parseDeraNumber,
  parseRelationship,
} from "./parseDera";

const SUBMISSION_REQUIRED = [
  "ACCESSION_NUMBER", "FILING_DATE", "DOCUMENT_TYPE",
  "ISSUERCIK", "ISSUERNAME", "ISSUERTRADINGSYMBOL",
];
const TRANS_REQUIRED = [
  "ACCESSION_NUMBER", "NONDERIV_TRANS_SK", "TRANS_DATE", "TRANS_CODE", "TRANS_SHARES",
];
const OWNER_REQUIRED = ["ACCESSION_NUMBER", "RPTOWNERCIK"];

export type DeraIngestStats = {
  quarter: string;
  filings: number;
  transactions: number;
  owners: number;
  skippedRows: number;
  skippedFilings: number;
  skippedTransactions: number;
  anomalies: number;
  hasPlanColumn: boolean;
};

type Unzipped = Record<string, Uint8Array>;

function readEntry(zip: Unzipped, name: string): string {
  const entry = zip[name];
  if (!entry) {
    throw new Error(`季度包缺 ${name}（实际：${Object.keys(zip).join(",")}）`);
  }
  return Buffer.from(entry).toString("utf8");
}

/** 美股史上最高价 BRK.A 约 $70 万/股，超过 $100 万即定义上不可能。 */
const IMPOSSIBLE_PRICE = 1_000_000;

/**
 * 《证券交易法》1934-06-06 生效，Section 16 的内部人申报义务自此才存在，
 * 故早于此的交易日必为手误。实测这类是"世纪打错"：申报日恰好是交易日的 100 年后
 * （如 TLB 交易 1912-08-03 / 申报 2012-08-07），源里共 55 行。
 * 注意 1934–2004 之间的陈年交易**不**归此类：初次 Form 3 或更正记录时披露
 * 几十年前的持仓是合理的（如 NLCI 1986 年买入、2007 年申报），不可当错误剔除。
 */
const SEC_ACT_EFFECTIVE = Date.UTC(1934, 5, 6);

/**
 * 只标记**客观可判定**的错误，不做主观质量评分。
 * 三类都是源端申报人填错（SEC 原样发布），落库保真、仅打标。
 */
export function classifyAnomaly(t: {
  symbol: string;
  transDate: Date;
  filedAt: Date;
  price: number | null;
}): string | null {
  if (t.symbol === "NONE") return "no_ticker";
  if (t.transDate.getTime() > t.filedAt.getTime()) return "date_after_filed";
  if (t.transDate.getTime() < SEC_ACT_EFFECTIVE) return "date_impossible";
  if (t.price != null && t.price > IMPOSSIBLE_PRICE) return "price_impossible";
  return null;
}

const CHUNK = 2000;

async function insertChunked<T>(rows: T[], fn: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await fn(rows.slice(i, i + CHUNK));
  }
}

export async function ingestDeraQuarter(
  prisma: PrismaClient,
  quarter: string,
  zipBuffer: Buffer,
): Promise<DeraIngestStats> {
  const zip: Unzipped = unzipSync(new Uint8Array(zipBuffer));

  const subParsed = parseTsv(readEntry(zip, "SUBMISSION.tsv"));
  assertColumns(subParsed.header, SUBMISSION_REQUIRED, `${quarter} SUBMISSION.tsv`);
  // AFF10B5ONE 是后加的列，老季度没有——按可选处理，缺失写 null
  const hasPlanColumn = subParsed.header.includes("AFF10B5ONE");

  const trParsed = parseTsv(readEntry(zip, "NONDERIV_TRANS.tsv"));
  assertColumns(trParsed.header, TRANS_REQUIRED, `${quarter} NONDERIV_TRANS.tsv`);

  const ownParsed = parseTsv(readEntry(zip, "REPORTINGOWNER.tsv"));
  assertColumns(ownParsed.header, OWNER_REQUIRED, `${quarter} REPORTINGOWNER.tsv`);

  // ---- 申报头 ----
  const issuerByAccession = new Map<string, { cik: string; symbol: string; filedAt: Date }>();
  let skippedFilings = 0;
  const filings = [];
  for (const r of subParsed.rows) {
    const accession = r.ACCESSION_NUMBER?.trim();
    const filingDate = parseDeraDate(r.FILING_DATE);
    const symbol = r.ISSUERTRADINGSYMBOL?.trim() ?? "";
    const cik = r.ISSUERCIK?.trim() ?? "";
    if (!accession || !filingDate || !symbol || !cik) {
      skippedFilings += 1;
      continue;
    }
    if (issuerByAccession.has(accession)) continue; // 同 accession 只取首条
    issuerByAccession.set(accession, { cik, symbol, filedAt: filingDate });
    filings.push({
      accession,
      filingDate,
      periodOfReport: parseDeraDate(r.PERIOD_OF_REPORT),
      documentType: (r.DOCUMENT_TYPE ?? "").trim().slice(0, 8),
      issuerCik: cik.slice(0, 16),
      issuerName: (r.ISSUERNAME ?? "").trim().slice(0, 256),
      issuerSymbol: symbol.slice(0, 16),
      plan10b51: hasPlanColumn ? parseDeraBoolean(r.AFF10B5ONE) : null,
      sourceQuarter: quarter,
    });
  }

  // ---- 交易行 ----
  let skippedTransactions = 0;
  const seenTrans = new Set<string>();
  const transactions = [];
  for (const r of trParsed.rows) {
    const accession = r.ACCESSION_NUMBER?.trim();
    const issuer = accession ? issuerByAccession.get(accession) : undefined;
    const transDate = parseDeraDate(r.TRANS_DATE);
    const shares = parseDeraNumber(r.TRANS_SHARES);
    const sk = parseDeraNumber(r.NONDERIV_TRANS_SK);
    const code = (r.TRANS_CODE ?? "").trim();
    // 无申报头的交易行会成孤儿（外键会拒），无日期/股数/代码的无法参与任何统计
    if (!accession || !issuer || !transDate || shares == null || sk == null || !code) {
      skippedTransactions += 1;
      continue;
    }
    const key = `${accession}:${sk}`;
    if (seenTrans.has(key)) continue;
    seenTrans.add(key);
    const price = parseDeraNumber(r.TRANS_PRICEPERSHARE);
    transactions.push({
      anomaly: classifyAnomaly({ symbol: issuer.symbol, transDate, filedAt: issuer.filedAt, price }),
      accession,
      transSk: BigInt(Math.trunc(sk)),
      issuerCik: issuer.cik.slice(0, 16),
      issuerSymbol: issuer.symbol.slice(0, 16),
      securityTitle: (r.SECURITY_TITLE ?? "").trim().slice(0, 256) || null,
      transactionDate: transDate,
      filedAt: issuer.filedAt,
      transactionCode: code.slice(0, 4),
      acquiredDisposedCode: (r.TRANS_ACQUIRED_DISP_CD ?? "").trim().slice(0, 1) || null,
      shares,
      pricePerShare: price,
      sharesOwnedAfter: parseDeraNumber(r.SHRS_OWND_FOLWNG_TRANS),
      directIndirect: (r.DIRECT_INDIRECT_OWNERSHIP ?? "").trim().slice(0, 1) || null,
      natureOfOwnership: (r.NATURE_OF_OWNERSHIP ?? "").trim().slice(0, 512) || null,
    });
  }

  // ---- 申报人 ----
  const seenOwners = new Set<string>();
  const owners = [];
  for (const r of ownParsed.rows) {
    const accession = r.ACCESSION_NUMBER?.trim();
    const ownerCik = r.RPTOWNERCIK?.trim();
    if (!accession || !ownerCik || !issuerByAccession.has(accession)) continue;
    const key = `${accession}:${ownerCik}`;
    if (seenOwners.has(key)) continue; // 同一申报里同一人重复行
    seenOwners.add(key);
    const rel = parseRelationship(r.RPTOWNER_RELATIONSHIP);
    owners.push({
      accession,
      ownerCik: ownerCik.slice(0, 16),
      ownerName: (r.RPTOWNERNAME ?? "").trim().slice(0, 256) || null,
      ...rel,
      officerTitle: (r.RPTOWNER_TITLE ?? "").trim().slice(0, 256) || null,
    });
  }

  // ---- 落库：整季替换 ----
  await prisma.deraInsiderFiling.deleteMany({ where: { sourceQuarter: quarter } });
  await insertChunked(filings, (b) => prisma.deraInsiderFiling.createMany({ data: b, skipDuplicates: true }));
  await insertChunked(transactions, (b) => prisma.deraInsiderTransaction.createMany({ data: b, skipDuplicates: true }));
  await insertChunked(owners, (b) => prisma.deraInsiderOwner.createMany({ data: b, skipDuplicates: true }));

  return {
    quarter,
    filings: filings.length,
    transactions: transactions.length,
    owners: owners.length,
    skippedRows: subParsed.skipped + trParsed.skipped + ownParsed.skipped,
    skippedFilings,
    skippedTransactions,
    anomalies: transactions.filter((t) => t.anomaly != null).length,
    hasPlanColumn,
  };
}
