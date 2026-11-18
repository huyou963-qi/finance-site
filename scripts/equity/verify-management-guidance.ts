/** Read-only coverage audit. --strict fails when an eligible registered earnings filing is still unprocessed. */
import fs from "node:fs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { loadFundamentalsCoverage } from "../../src/lib/equity/fundamentalsCoverage";
import { GUIDANCE_PARSER_VERSION } from "../../src/lib/equity/managementGuidance";
import { guidanceHistoryStart } from "../../src/lib/equity/managementGuidanceBackfill";

async function main() {
  const covered = await loadFundamentalsCoverage(prisma);
  if (!covered.size) throw new Error("覆盖名单为空，不能将空库判定为回填完成");
  const securities = await prisma.equitySecurity.findMany({ where: { symbol: { in: [...covered] } }, select: { symbol: true, cik: true } });
  const ciks = [...new Set(securities.flatMap(s => s.cik && /^\d{1,10}$/.test(s.cik) ? [s.cik.padStart(10, "0")] : []))];
  if (!ciks.length) throw new Error("覆盖名单没有可核验的 CIK");
  const missingCik = [...covered].filter(s => !securities.some(row => row.symbol === s && row.cik));
  const discoveryFile = process.argv.find(a => a.startsWith("--discovery-report="))?.slice("--discovery-report=".length);
  let missingDiscovery: string[] | null = null;
  if (discoveryFile) {
    const starts = await prisma.equityFundamentalSnapshot.groupBy({ by: ["symbol"], where: { symbol: { in: [...covered] }, periodType: "Q" }, _min: { fiscalDate: true } });
    const bySymbol = new Map(starts.map(s => [s.symbol, s._min.fiscalDate]));
    const wanted = new Map<string, string>();
    for (const security of securities) if (security.cik) {
      const cik = security.cik.padStart(10, "0"), from = guidanceHistoryStart(undefined, bySymbol.get(security.symbol) ?? null);
      if (!wanted.has(cik) || from < wanted.get(cik)!) wanted.set(cik, from);
    }
    const proven = new Map<string, string>();
    for (const line of fs.readFileSync(discoveryFile, "utf8").split("\n")) {
      try { const e = JSON.parse(line); if (e.phase === "discovery" && e.status === "complete" && typeof e.cik === "string" && typeof e.from === "string" && (!proven.has(e.cik) || e.from < proven.get(e.cik)!)) proven.set(e.cik, e.from); } catch { /* Incomplete log entry cannot prove coverage. */ }
    }
    missingDiscovery = [...wanted].filter(([cik, from]) => !proven.has(cik) || proven.get(cik)! > from).map(([cik]) => cik);
  }
  const eligible = Prisma.sql`SELECT cik,accession,filed_at,earnings_release->'managementGuidance' AS g FROM mds.sec_filing WHERE cik IN (${Prisma.join(ciks)}) AND form IN ('8-K','8-K/A') AND items ~ '(^|,)\\s*2[.]02\\s*(,|$)'`;
  const counts = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    WITH eligible AS (${eligible}) SELECT count(*)::int AS filings, count(DISTINCT cik)::int AS issuers_with_earnings,
      count(*) FILTER (WHERE g->>'parserVersion'=${String(GUIDANCE_PARSER_VERSION)} AND jsonb_typeof(g->'records')='array' AND g->>'sourceStatus' IN ('available','no_eligible_attachment'))::int AS processed,
      count(*) FILTER (WHERE g->>'sourceStatus'='legacy_truncated')::int AS legacy_truncated,
      count(*) FILTER (WHERE g->>'sourceStatus'='no_eligible_attachment')::int AS no_eligible_attachment,
      coalesce(sum(CASE WHEN jsonb_typeof(g->'records')='array' THEN jsonb_array_length(g->'records') ELSE 0 END),0)::int AS records,
      min(filed_at) AS earliest_filing,max(filed_at) AS latest_filing FROM eligible`);
  const statuses = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    WITH eligible AS (${eligible}) SELECT r->>'status' AS status,count(*)::int AS records FROM eligible,
      LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(g->'records')='array' THEN g->'records' ELSE '[]'::jsonb END) r GROUP BY r->>'status'`);
  const pending = Number(counts[0].filings) - Number(counts[0].processed);
  const report = { checkedAt: new Date().toISOString(), coveredSymbols: covered.size, eligibleIssuers: ciks.length, missingCik, ...counts[0], pending, statuses,
    discoveryVerified: discoveryFile ? missingDiscovery?.length === 0 : false, missingDiscovery };
  console.log(JSON.stringify(report, null, 2));
  const file = process.argv.find(a => a.startsWith("--report="))?.slice(9);
  if (file) fs.writeFileSync(file, JSON.stringify(report, null, 2));
  if (process.argv.includes("--strict") && (pending || missingDiscovery?.length)) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
