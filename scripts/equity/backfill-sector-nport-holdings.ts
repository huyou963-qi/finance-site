/**
 * 回填 Select Sector SPDR 的 SEC 季末普通股持仓。默认只审计；--apply 写库。
 * --from=2019-09-30 --through=2026-06-30 --xml-dir=.data/nport-xml
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../../src/lib/prisma";
import { SECTOR_ETF_SYMBOLS } from "../../src/lib/equity/gicsCatalog";
import { discoverSecFilings, fetchSecText, secDocumentUrl } from "../../src/lib/equity/secEdgar";
import { parseSectorNport, SECTOR_TRUST_CIK } from "../../src/lib/equity/sectorNportHoldings";
import { replaceEtfHoldingSnapshot, SEC_NPORT_HOLDINGS_SOURCE, type ParsedEtfHoldingSnapshot } from "../../src/lib/equity/sectorEtfHoldings";

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const quarterEnd = /^20\d{2}-(03-31|06-30|09-30|12-31)$/;

async function main() {
  const from = arg("from"), through = arg("through"), dir = arg("xml-dir");
  if (!from || !through || !dir || !quarterEnd.test(from) || !quarterEnd.test(through) || from > through) {
    throw Error("需要 --from=季末日期 --through=季末日期 --xml-dir=缓存目录");
  }
  await mkdir(dir, { recursive: true });
  const filings = (await discoverSecFilings(SECTOR_TRUST_CIK, from, true, { maxHistoryFiles: 3 }))
    .filter(row => /^NPORT-P(?:\/A)?$/.test(row.form) && row.reportDate && row.reportDate >= from
      && row.reportDate <= through && quarterEnd.test(row.reportDate));
  if (!filings.length || filings.length > 800) throw Error("申报数据为空或超出 800 份上限");

  const selections = new Map<string, { snapshot: ParsedEtfHoldingSnapshot; url: string; filedAt: string }>();
  const failures: string[] = [];
  for (let start = 0; start < filings.length; start += 3) {
    const reports = await Promise.all(filings.slice(start, start + 3).map(async row => {
      const filename = row.primaryDocument?.split("/").pop();
      const url = secDocumentUrl(SECTOR_TRUST_CIK, row.accession, row.primaryDocument, true);
      try {
        if (!/^\d{10}-\d{2}-\d{6}$/.test(row.accession) || !filename || !/^[\w.-]+\.xml$/i.test(filename)) {
          throw Error("申报 XML 文件名异常");
        }
        const path = join(dir, row.accession + ".xml");
        const xml = await readFile(path, "utf8").catch(async error => {
          if (error.code !== "ENOENT") throw error;
          const text = await fetchSecText(url, 15000);
          await writeFile(path, text, { flag: "wx" });
          return text;
        });
        if (xml.length > 4 * 1024 * 1024) throw Error("申报 XML 超出大小上限");
        const snapshot = parseSectorNport(xml, row.reportDate!);
        return snapshot ? { snapshot, url, filedAt: row.filedAt } : null;
      } catch (error) {
        failures.push(`${url} ${String(error)}`);
        return null;
      }
    }));
    for (const report of reports) {
      if (!report) continue;
      const key = `${report.snapshot.etf}/${report.snapshot.asOfDate}`;
      const previous = selections.get(key);
      if (!previous || report.filedAt > previous.filedAt) selections.set(key, report);
      else if (report.filedAt === previous.filedAt && JSON.stringify(previous.snapshot.rows) !== JSON.stringify(report.snapshot.rows)) {
        failures.push(`同日申报持仓冲突 ${key} ${report.url} ${previous.url}`);
      }
    }
  }
  if (failures.length) throw Error(failures.join("\n"));
  if (!selections.size) throw Error("指定区间没有这 11 只 ETF 的公开申报");

  // Reuse exact identifiers from the security master and the latest issuer holdings.
  // Conflicting CUSIPs remain unresolved. Names are never used to infer symbols.
  const cusips = [...new Set([...selections.values()].flatMap(({ snapshot }) => snapshot.rows.flatMap(row => row.cusip ? [row.cusip] : [])))];
  const latest = await prisma.sectorEtfHolding.groupBy({
    by: ["etf"], where: { etf: { in: [...SECTOR_ETF_SYMBOLS] }, source: "State Street daily holdings" }, _max: { asOfDate: true },
  });
  const [securities, currentHoldings] = await Promise.all([
    prisma.equitySecurity.findMany({ where: { cusip: { in: cusips } }, select: { cusip: true, symbol: true } }),
    latest.length ? prisma.sectorEtfHolding.findMany({ where: { OR: latest.map(row => ({ etf: row.etf, asOfDate: row._max.asOfDate! })),
      cusip: { in: cusips }, symbol: { not: null } }, select: { cusip: true, symbol: true } }) : [],
  ]);
  const byCusip = new Map<string, string | null>();
  for (const { cusip, symbol } of [...securities, ...currentHoldings]) {
    if (!cusip || !symbol) continue;
    const previous = byCusip.get(cusip);
    byCusip.set(cusip, previous === undefined || previous === symbol ? symbol : null);
  }

  const apply = process.argv.includes("--apply");
  for (const { snapshot, url } of selections.values()) {
    for (const row of snapshot.rows) if (row.cusip) row.symbol ??= byCusip.get(row.cusip) ?? null;
    const mappedWeight = snapshot.rows.reduce((sum, row) => sum + (row.symbol ? row.weight : 0), 0);
    const written = apply ? await replaceEtfHoldingSnapshot(snapshot, SEC_NPORT_HOLDINGS_SOURCE, url, { preserveExisting: true }) : 0;
    console.log(JSON.stringify({ etf: snapshot.etf, date: snapshot.asOfDate, url,
      positions: snapshot.rows.length, mappedWeight: mappedWeight / snapshot.totalWeight, apply, written }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
