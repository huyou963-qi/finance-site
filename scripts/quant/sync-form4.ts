/**
 * 内部人交易摄入（Form 4 Table I，资金侧三角验证第三块拼图）。
 *
 * 对每个已知 CIK 的 EquitySecurity：拉 submissions API 发现 Form 4 申报索引，
 * 逐份申报再拉一次结构化 XML 解析出交易明细，落 mds.insider_transaction。
 * PIT 可见日 = filedAt（申报日）。只建模 Table I（普通股直接买卖），不含 Table II 衍生证券。
 *
 * Usage:
 *   npm run quant:sync-form4 -- --symbols=AAPL,MSFT
 *   npm run quant:sync-form4 -- --since=2023-01-01 --limit=50   # 调试：只跑前 50 只
 *   npm run quant:sync-form4 -- --delay-ms=300
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { parseForm4Xml, type Form4Transaction } from "../../src/lib/quant/form4";

const SEC_UA = process.env.SEC_USER_AGENT?.trim() || "hblook.com equity-sync-form4 admin@hblook.com";
const INSERT_CHUNK = Math.max(50, Number(process.env.FUNDING_INSERT_CHUNK) || 500);
/** 早期几年 Form 4 XML schema 不稳定，保守起点；具体是否再往前回填留待实测报错率后决定 */
const DEFAULT_SINCE = "2006-01-01";

type RecentFilings = {
  accessionNumber?: string[];
  form?: string[];
  filingDate?: string[];
  primaryDocument?: string[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function argValue(name: string): string | undefined {
  const kv = process.argv.find((a) => a.startsWith(`${name}=`));
  return kv ? kv.slice(name.length + 1) : undefined;
}
function argValues(name: string): string[] {
  return process.argv.filter((a) => a.startsWith(`${name}=`)).map((a) => a.slice(name.length + 1));
}
function argFlag(name: string): boolean {
  return process.argv.includes(name);
}

function padCik(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

/**
 * primaryDocument 在 submissions API 里给的是「XSL 渲染后的可读路径」（如
 * "xslF345X06/form4.xml"），该路径返回的是 HTML 而非机器可读 XML；真正的结构化 XML
 * 就在申报根目录下，文件名是该路径的 basename（如 "form4.xml"）。见 index.json 验证。
 */
function filingXmlUrl(cik: string, accession: string, primaryDocument: string | null): string | null {
  if (!primaryDocument) return null;
  const basename = primaryDocument.split("/").pop();
  if (!basename) return null;
  const noDash = accession.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${noDash}/${basename}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": SEC_UA, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": SEC_UA, Accept: "application/xml" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

type Row = {
  cik: string;
  symbol: string | null;
  accession: string;
  filerCik: string;
  filerName: string | null;
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
  officerTitle: string | null;
  transactionDate: string;
  transactionCode: string;
  acquiredDisposedCode: string;
  shares: number;
  pricePerShare: number | null;
  sharesOwnedAfter: number | null;
  lineIndex: number;
  filedAt: string;
};

function toRow(
  t: Form4Transaction,
  ctx: { cik: string; symbol: string | null; accession: string; filedAt: string; lineIndex: number },
): Row {
  return {
    cik: ctx.cik,
    symbol: ctx.symbol,
    accession: ctx.accession,
    filerCik: t.filerCik,
    filerName: t.filerName,
    isDirector: t.isDirector,
    isOfficer: t.isOfficer,
    isTenPercentOwner: t.isTenPercentOwner,
    officerTitle: t.officerTitle,
    transactionDate: t.transactionDate,
    transactionCode: t.transactionCode,
    acquiredDisposedCode: t.acquiredDisposedCode,
    shares: t.shares,
    pricePerShare: t.pricePerShare,
    sharesOwnedAfter: t.sharesOwnedAfter,
    lineIndex: ctx.lineIndex,
    filedAt: ctx.filedAt,
  };
}

async function upsertRows(rows: Row[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const values = chunk.map(
      (r) =>
        Prisma.sql`(${randomUUID()}::uuid, ${r.cik}, ${r.symbol}, ${r.accession}, ${r.filerCik}, ${r.filerName}, ${r.isDirector}, ${r.isOfficer}, ${r.isTenPercentOwner}, ${r.officerTitle}, ${new Date(`${r.transactionDate}T00:00:00.000Z`)}::date, ${r.transactionCode}, ${r.acquiredDisposedCode}, ${r.shares}, ${r.pricePerShare}, ${r.sharesOwnedAfter}, ${r.lineIndex}, ${new Date(`${r.filedAt}T00:00:00.000Z`)}::date, CURRENT_TIMESTAMP)`,
    );
    written += await prisma.$executeRaw`
      INSERT INTO "mds"."insider_transaction"
        ("id","cik","symbol","accession","filer_cik","filer_name","is_director","is_officer","is_ten_percent_owner","officer_title","transaction_date","transaction_code","acquired_disposed_code","shares","price_per_share","shares_owned_after","line_index","filed_at","updated_at")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("accession","line_index") DO UPDATE SET
        "symbol" = EXCLUDED."symbol",
        "filer_name" = EXCLUDED."filer_name",
        "shares" = EXCLUDED."shares",
        "price_per_share" = EXCLUDED."price_per_share",
        "shares_owned_after" = EXCLUDED."shares_owned_after",
        "filed_at" = EXCLUDED."filed_at",
        "updated_at" = CURRENT_TIMESTAMP
    `;
  }
  return written;
}

async function syncOne(
  security: { symbol: string; cik: string },
  since: string,
  delayMs: number,
): Promise<{ written: number; failed: boolean }> {
  const padded = padCik(security.cik);
  const cutoffMs = Date.parse(`${since}T00:00:00Z`);
  const submissions = await fetchJson<{ filings?: { recent?: RecentFilings } }>(
    `https://data.sec.gov/submissions/CIK${padded}.json`,
  );
  const recent = submissions.filings?.recent;
  const accessions = recent?.accessionNumber ?? [];
  const forms = recent?.form ?? [];
  const dates = recent?.filingDate ?? [];
  const primaryDocuments = recent?.primaryDocument ?? [];
  const count = Math.min(accessions.length, forms.length, dates.length);

  let written = 0;
  for (let i = 0; i < count; i += 1) {
    if (forms[i] !== "4") continue;
    const filed = dates[i]!;
    const filedMs = Date.parse(`${filed}T00:00:00Z`);
    if (!Number.isFinite(filedMs) || filedMs < cutoffMs) continue;
    const accession = accessions[i]!;
    const xmlUrl = filingXmlUrl(padded, accession, primaryDocuments[i]?.trim() || null);
    if (!xmlUrl) continue;
    await sleep(delayMs);
    try {
      const xml = await fetchText(xmlUrl);
      const txns = parseForm4Xml(xml);
      if (!txns.length) continue;
      const rows = txns.map((t, idx) =>
        toRow(t, { cik: padded, symbol: security.symbol, accession, filedAt: filed, lineIndex: idx }),
      );
      written += await upsertRows(rows);
    } catch (e) {
      console.warn(`  ✗ ${security.symbol} ${accession}:`, e instanceof Error ? e.message : e);
    }
  }
  return { written, failed: false };
}

async function main() {
  const t0 = Date.now();
  const symbols = argValues("--symbols")
    .flatMap((s) => s.split(","))
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const since = argValue("--since") || DEFAULT_SINCE;
  const delayMs = Math.max(120, Number(argValue("--delay-ms")) || 250);
  const limit = argValue("--limit") ? Number(argValue("--limit")) : undefined;
  const dryRun = argFlag("--dry-run");

  const securities = await prisma.equitySecurity.findMany({
    where: {
      cik: { not: null },
      ...(symbols.length ? { symbol: { in: symbols } } : {}),
    },
    orderBy: [{ marketCap: "desc" }, { symbol: "asc" }],
    ...(limit ? { take: Math.max(1, limit) } : {}),
    select: { symbol: true, cik: true },
  });
  if (!securities.length) throw new Error("无匹配标的（检查 --symbols 或 EquitySecurity.cik 是否已回填）");
  console.log(`目标 ${securities.length} 只标的，since=${since}，delay=${delayMs}ms${dryRun ? "（dry-run）" : ""}`);

  let total = 0;
  let failed = 0;
  for (const [i, sec] of securities.entries()) {
    if (dryRun) {
      console.log(`  [${i + 1}/${securities.length}] ${sec.symbol}（dry-run，跳过写库）`);
      continue;
    }
    try {
      const { written } = await syncOne(sec as { symbol: string; cik: string }, since, delayMs);
      total += written;
      console.log(`  [${i + 1}/${securities.length}] ${sec.symbol}: +${written} 行`);
    } catch (e) {
      failed += 1;
      console.warn(`  ✗ [${i + 1}/${securities.length}] ${sec.symbol}:`, e instanceof Error ? e.message : e);
    }
    await sleep(delayMs);
  }

  console.log(`\n完成：写库 ${total} 行，失败 ${failed} 只标的，耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
