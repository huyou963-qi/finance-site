/**
 * 把一个 DERA 季度包灌进 Tier B 三张表。
 *
 * 幂等策略：按 sourceQuarter 先删后插。DERA 会重新发布带更正的季度包，
 * `skipDuplicates` 式增量会把更正吞掉，所以整季替换才是正确语义。
 * 交易与申报人经外键 onDelete: Cascade 随申报头一起清除。
 *
 * ⚠ 内存约束（改动时勿回退）：生产机总内存仅 3.5GB，且同机常并行跑别的批任务。
 * 2026-09 曾因一次性物化整表把整机挤到 SSH 失联，故本模块做了三件事：
 * 1. **只解压用得到的 3 个 TSV**——整包 10 个条目，光 FOOTNOTES 就 42MB；
 * 2. **生成器逐行消费 + 按批 await 落库**，任一时刻内存里只有一批（CHUNK 条）；
 * 3. 三趟之间不保留上一趟的文本，只留 accession → 发行人 的小映射。
 */
import { unzipSync } from "fflate";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  readTsvHeader,
  iterTsvRows,
  assertColumns,
  parseDeraDate,
  parseDeraBoolean,
  parseDeraNumber,
  parseRelationship,
  type TsvScanStats,
} from "./parseDera";

const SUBMISSION_REQUIRED = [
  "ACCESSION_NUMBER", "FILING_DATE", "DOCUMENT_TYPE",
  "ISSUERCIK", "ISSUERNAME", "ISSUERTRADINGSYMBOL",
];
const TRANS_REQUIRED = [
  "ACCESSION_NUMBER", "NONDERIV_TRANS_SK", "TRANS_DATE", "TRANS_CODE", "TRANS_SHARES",
];
const OWNER_REQUIRED = ["ACCESSION_NUMBER", "RPTOWNERCIK"];

/** 只解压这三个；FOOTNOTES / DERIV_* / OWNER_SIGNATURE 等不进内存 */
const NEEDED_ENTRIES = new Set([
  "SUBMISSION.tsv",
  "NONDERIV_TRANS.tsv",
  "REPORTINGOWNER.tsv",
]);

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

/** 美股史上最高价 BRK.A 约 $70 万/股，超过 $100 万即定义上不可能。 */
const IMPOSSIBLE_PRICE = 1_000_000;

/**
 * 《证券交易法》1934-06-06 生效，Section 16 的内部人申报义务自此才存在，
 * 故早于此的交易日必为手误。实测这类是"世纪打错"：申报日恰好是交易日的 100 年后
 * （如 TLB 交易 1912-08-03 / 申报 2012-08-07），全量 81 季共 55 行。
 * 注意 1934–2004 之间的陈年交易**不**归此类：初次 Form 3 或更正记录时披露
 * 几十年前的持仓是合理的（如 NLCI 1986 年买入、2007 年申报），不可当错误剔除。
 */
const SEC_ACT_EFFECTIVE = Date.UTC(1934, 5, 6);

/**
 * 只标记**客观可判定**的错误，不做主观质量评分。
 * 这些都是源端申报人填错（SEC 原样发布），落库保真、仅打标。
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

type Unzipped = Record<string, Uint8Array>;

function readEntry(zip: Unzipped, name: string): string {
  const entry = zip[name];
  if (!entry) {
    throw new Error(`季度包缺 ${name}（实际：${Object.keys(zip).join(",")}）`);
  }
  return Buffer.from(entry).toString("utf8");
}

/**
 * 攒够 CHUNK 就 await 落库并清空。await 在这里就是背压：
 * 生成器要等这一批写完才继续吐行，内存里始终只有一批。
 */
function createBatcher<T>(flush: (batch: T[]) => Promise<unknown>) {
  let buf: T[] = [];
  let total = 0;
  return {
    async add(item: T): Promise<void> {
      buf.push(item);
      total += 1;
      if (buf.length >= CHUNK) {
        const batch = buf;
        buf = [];
        await flush(batch);
      }
    },
    async finish(): Promise<number> {
      if (buf.length) {
        const batch = buf;
        buf = [];
        await flush(batch);
      }
      return total;
    },
  };
}

export async function ingestDeraQuarter(
  prisma: PrismaClient,
  quarter: string,
  zipBuffer: Buffer,
): Promise<DeraIngestStats> {
  const zip: Unzipped = unzipSync(new Uint8Array(zipBuffer), {
    filter: (file) => NEEDED_ENTRIES.has(file.name),
  });

  // 整季替换：先清旧数据，交易与申报人经级联一并清除
  await prisma.deraInsiderFiling.deleteMany({ where: { sourceQuarter: quarter } });

  const scan: TsvScanStats = { skipped: 0 };
  const issuerByAccession = new Map<string, { cik: string; symbol: string; filedAt: Date }>();
  let skippedFilings = 0;
  let skippedTransactions = 0;
  let anomalies = 0;

  // ---- 第一趟：申报头 ----
  let hasPlanColumn = false;
  let filings = 0;
  {
    const text = readEntry(zip, "SUBMISSION.tsv");
    const header = readTsvHeader(text);
    assertColumns(header, SUBMISSION_REQUIRED, `${quarter} SUBMISSION.tsv`);
    // AFF10B5ONE 自 2023q1 起才有；遍历前就要知道，缺列时写 null 而非 false
    hasPlanColumn = header.includes("AFF10B5ONE");

    const batch = createBatcher<Prisma.DeraInsiderFilingCreateManyInput>(
      (b) => prisma.deraInsiderFiling.createMany({ data: b, skipDuplicates: true }),
    );
    for (const r of iterTsvRows(text, header, scan)) {
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
      await batch.add({
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
    filings = await batch.finish();
  }

  // ---- 第二趟：交易行 ----
  let transactions = 0;
  {
    const text = readEntry(zip, "NONDERIV_TRANS.tsv");
    const header = readTsvHeader(text);
    assertColumns(header, TRANS_REQUIRED, `${quarter} NONDERIV_TRANS.tsv`);

    const batch = createBatcher<Prisma.DeraInsiderTransactionCreateManyInput>(
      (b) => prisma.deraInsiderTransaction.createMany({ data: b, skipDuplicates: true }),
    );
    for (const r of iterTsvRows(text, header, scan)) {
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
      const price = parseDeraNumber(r.TRANS_PRICEPERSHARE);
      const anomaly = classifyAnomaly({
        symbol: issuer.symbol, transDate, filedAt: issuer.filedAt, price,
      });
      if (anomaly) anomalies += 1;
      await batch.add({
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
        anomaly,
      });
    }
    transactions = await batch.finish();
  }

  // ---- 第三趟：申报人 ----
  let owners = 0;
  {
    const text = readEntry(zip, "REPORTINGOWNER.tsv");
    const header = readTsvHeader(text);
    assertColumns(header, OWNER_REQUIRED, `${quarter} REPORTINGOWNER.tsv`);

    const batch = createBatcher<Prisma.DeraInsiderOwnerCreateManyInput>(
      (b) => prisma.deraInsiderOwner.createMany({ data: b, skipDuplicates: true }),
    );
    for (const r of iterTsvRows(text, header, scan)) {
      const accession = r.ACCESSION_NUMBER?.trim();
      const ownerCik = r.RPTOWNERCIK?.trim();
      if (!accession || !ownerCik || !issuerByAccession.has(accession)) continue;
      await batch.add({
        accession,
        ownerCik: ownerCik.slice(0, 16),
        ownerName: (r.RPTOWNERNAME ?? "").trim().slice(0, 256) || null,
        ...parseRelationship(r.RPTOWNER_RELATIONSHIP),
        officerTitle: (r.RPTOWNER_TITLE ?? "").trim().slice(0, 256) || null,
      });
    }
    owners = await batch.finish();
  }

  return {
    quarter,
    filings,
    transactions,
    owners,
    skippedRows: scan.skipped,
    skippedFilings,
    skippedTransactions,
    anomalies,
    hasPlanColumn,
  };
}
