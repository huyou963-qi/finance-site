/**
 * 基本面覆盖核查（只读）：覆盖范围内每家公司的季度历史深度、最新财季、科目明细、是否滞后。
 *
 * 滞后判定：最新财季截止日距今超过 200 天（季末 + 最长 90 天 10-K 期限 + 一季余量）。
 * 「无数据」多为 SEC 无 US-GAAP 季度事实（外国申报人、刚上市、仅年报主体），需个案看。
 *
 * Usage:
 *   npm run equity:verify-fundamentals-coverage
 *   npm run equity:verify-fundamentals-coverage -- --out=.data/sec-bulk/coverage-report.json --max-stale-pct=5
 * 滞后或无数据占比超过 --max-stale-pct（默认 10）时以非零退出，可挂在日批之后做告警。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "../../src/lib/prisma";
import { loadFundamentalsCoverage } from "../../src/lib/equity/fundamentalsCoverage";

const arg = (name: string) => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const STALE_DAYS = 200;

async function main() {
  const out = arg("out");
  const maxStalePct = Number(arg("max-stale-pct") ?? 10);
  const coverage = [...await loadFundamentalsCoverage(prisma)];
  const rows = await prisma.$queryRaw<{ symbol: string; quarters: number; first: Date | null; latest: Date | null; with_lines: number; avg_lines: number | null }[]>`
    select symbol, count(*)::int quarters, min(fiscal_date) first, max(fiscal_date) latest,
      count(lines)::int with_lines, avg((select count(*) from jsonb_object_keys(lines)))::float avg_lines
    from mds.equity_fundamental_snapshot where period_type = 'Q' and symbol = any(${coverage}) group by symbol`;
  const bySymbol = new Map(rows.map(r => [r.symbol, r]));
  const today = Date.now();
  const report = { companies: coverage.length, withData: 0, noData: [] as string[], stale: [] as { symbol: string; latest: string }[],
    depth: { "<8": 0, "8-19": 0, "20-39": 0, "40-59": 0, "60+": 0 } as Record<string, number>,
    firstQuarterYears: {} as Record<string, number>, withStatementLines: 0, avgLinesPerQuarter: 0 };
  let linesSum = 0, linesCount = 0;
  for (const symbol of coverage) {
    const r = bySymbol.get(symbol);
    if (!r?.latest) { report.noData.push(symbol); continue; }
    report.withData++;
    const q = r.quarters;
    report.depth[q < 8 ? "<8" : q < 20 ? "8-19" : q < 40 ? "20-39" : q < 60 ? "40-59" : "60+"]++;
    const year = r.first!.toISOString().slice(0, 4);
    report.firstQuarterYears[year] = (report.firstQuarterYears[year] ?? 0) + 1;
    if ((today - r.latest.getTime()) / 86_400_000 > STALE_DAYS) report.stale.push({ symbol, latest: r.latest.toISOString().slice(0, 10) });
    if (r.with_lines) { report.withStatementLines++; linesSum += r.avg_lines ?? 0; linesCount++; }
  }
  report.avgLinesPerQuarter = linesCount ? Number((linesSum / linesCount).toFixed(1)) : 0;
  const badPct = ((report.noData.length + report.stale.length) / Math.max(1, report.companies)) * 100;
  const summary = { ...report, noData: report.noData.length, stale: report.stale.length, staleOrMissingPct: Number(badPct.toFixed(1)),
    sampleNoData: report.noData.slice(0, 20), sampleStale: report.stale.slice(0, 20) };
  console.log(JSON.stringify(summary, null, 2));
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(report, null, 1)); }
  if (badPct > maxStalePct) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
