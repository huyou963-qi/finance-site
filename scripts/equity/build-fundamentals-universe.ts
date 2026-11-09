/**
 * 构建「美股公众流通市值前 3000」基本面覆盖名单（开发机离线，每年 6 月重建一次）。
 * 规则见 src/lib/equity/fundamentalsUniverse.ts；文档 docs/STOCK_FINANCIAL_STATEMENTS.md。
 *
 * 输入：SEC 全量归档 companyfacts.zip（先下载到 .data/sec-bulk/）、equity_security（symbol↔CIK）、
 *      Nasdaq Trader 公开证券目录（排除 ETF / 测试代码）。
 * 输出：报告 JSON（排名、门槛、各排除原因计数）；加 --apply 时写入 index_constituent
 *      （index_code=US_TOP3000，as_of_date=构建日），基本面覆盖范围随之自动纳入。
 *
 * Usage:
 *   npm run equity:build-fundamentals-universe -- --facts-zip=.data/sec-bulk/companyfacts.zip
 *   npm run equity:build-fundamentals-universe -- --facts-zip=... --apply
 *   可选：--as-of=YYYY-MM-DD（默认今天）、--top=3000、--report=<path>、--symbols-out=<path>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "../../src/lib/prisma";
import { openSecBulkArchive } from "../../src/lib/equity/secBulkArchive";
import { loadNasdaqSymbolDirectory } from "../../src/lib/equity/nasdaqSymbolDirectory";
import {
  isActiveUsGaapFiler, isCommonEquityName, latestPublicFloat, rankUniverse, TOP_UNIVERSE_INDEX_CODE, TOP_UNIVERSE_SIZE, type UniverseCandidate,
} from "../../src/lib/equity/fundamentalsUniverse";

const arg = (name: string) => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  const zip = arg("facts-zip");
  if (!zip) throw new Error("需要 --facts-zip=<companyfacts.zip 路径>");
  const asOf = arg("as-of") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("--as-of 须为 YYYY-MM-DD");
  const top = Number(arg("top") ?? TOP_UNIVERSE_SIZE);
  if (!Number.isInteger(top) || top < 100 || top > 5000) throw new Error("--top 须为 100–5000");
  const apply = process.argv.includes("--apply");
  const report = arg("report") ?? `.data/sec-bulk/universe-${asOf}.json`;
  const symbolsOut = arg("symbols-out") ?? `.data/sec-bulk/universe-${asOf}.symbols.txt`;

  const directory = await loadNasdaqSymbolDirectory();
  // 目录两份文件任一失败时加载器会返回不完整结果：宁可停下，也不拿半份目录排除证券。
  if (directory.length < 6000) throw new Error(`Nasdaq 证券目录不完整（${directory.length} 行），稍后重试`);
  const listed = new Map(directory.map(d => [d.symbol, d]));
  const securities = await prisma.equitySecurity.findMany({ where: { cik: { not: null } }, select: { symbol: true, cik: true } });
  const byCik = new Map<string, string[]>();
  let etfExcluded = 0, notCommonExcluded = 0, notListedExcluded = 0;
  for (const s of securities) {
    const entry = listed.get(s.symbol);
    if (!entry) { notListedExcluded++; continue; }
    if (entry.type === "ETF") { etfExcluded++; continue; }
    if (!isCommonEquityName(entry.name)) { notCommonExcluded++; continue; }
    const cik = s.cik!.replace(/\D/g, "").padStart(10, "0");
    byCik.set(cik, [...(byCik.get(cik) ?? []), s.symbol]);
  }

  const archive = await openSecBulkArchive(zip);
  const reasons = { notInArchive: 0, inactiveOrNonUsGaap: 0, noRecentPublicFloat: 0, unreadable: 0 };
  const scaleErrors: { cik: string; symbols: string[]; rejected: number; usedFiled: string | null; correctedBy: number | null }[] = [];
  const candidates: UniverseCandidate[] = [];
  const t0 = Date.now();
  let seen = 0;
  for (const [cik, symbols] of byCik) {
    seen++;
    if (seen % 500 === 0) console.log(`[${seen}/${byCik.size}] ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    if (!archive.has(cik)) { reasons.notInArchive++; continue; }
    let facts: unknown;
    try { facts = await archive.read(cik); } catch { reasons.unreadable++; continue; }
    if (!isActiveUsGaapFiler(facts, asOf)) { reasons.inactiveOrNonUsGaap++; continue; }
    const { float, rejected } = latestPublicFloat(facts, asOf);
    if (rejected) scaleErrors.push({ cik, symbols, rejected, usedFiled: float?.filed ?? null, correctedBy: float?.corrected ?? null });
    if (!float) { reasons.noRecentPublicFloat++; continue; }
    candidates.push({ cik, symbols: symbols.sort(), name: String((facts as { entityName?: string }).entityName ?? ""),
      publicFloat: float.value, measuredAt: float.measuredAt, filed: float.filed });
  }
  await archive.close();

  const { selected, cutoff } = rankUniverse(candidates, top);
  const symbols = selected.flatMap(c => c.symbols);
  mkdirSync(dirname(report), { recursive: true });
  writeFileSync(report, JSON.stringify({ asOf, top, companies: selected.length, symbols: symbols.length, cutoffPublicFloat: cutoff,
    candidates: candidates.length, excluded: { notListed: notListedExcluded, etf: etfExcluded, notCommonEquity: notCommonExcluded, ...reasons }, publicFloatScaleErrors: scaleErrors, selected }, null, 1));
  writeFileSync(symbolsOut, `${symbols.join("\n")}\n`);
  console.log(JSON.stringify({ asOf, companies: selected.length, symbols: symbols.length, cutoffPublicFloat: cutoff,
    candidates: candidates.length, excluded: { notListed: notListedExcluded, etf: etfExcluded, notCommonEquity: notCommonExcluded, ...reasons }, report, symbolsOut,
    publicFloatScaleErrors: scaleErrors.length, elapsedMin: Number(((Date.now() - t0) / 60000).toFixed(1)) }, null, 2));

  if (!apply) { console.log("（未加 --apply，仅生成报告，不写库）"); return; }
  const asOfDate = new Date(`${asOf}T00:00:00Z`);
  const written = await prisma.indexConstituent.createMany({
    data: symbols.map(symbol => ({ indexCode: TOP_UNIVERSE_INDEX_CODE, symbol, asOfDate })), skipDuplicates: true,
  });
  console.log(`已写入 index_constituent ${TOP_UNIVERSE_INDEX_CODE} @ ${asOf}：${written.count} 行`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
