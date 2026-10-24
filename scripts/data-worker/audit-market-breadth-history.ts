import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/lib/prisma";
import { loadMembershipSource } from "../../src/lib/data/scheduler/marketInternals/client";
import { historicalDailyMembership, historicalPriceKeys, HISTORY_FIRST_DATE, HISTORY_SOURCE } from "../../src/lib/data/scheduler/marketInternals/membership";
import { parseWikipediaSp500Html } from "../../src/lib/equity/wikipediaSp500";
import { normalizeSp500Ticker, parseWikipediaSp500Changes, sliceTableById } from "../../src/lib/equity/wikipediaSp500Changes";
loadEnvConfig(process.cwd());

async function main() {
  const source = await loadMembershipSource(!process.argv.includes("--packaged-membership"));
  const current = parseWikipediaSp500Html(sliceTableById(source.html, "constituents")!).map((r) => normalizeSp500Ticker(r.symbol)).filter((s): s is string => s != null);
  const probes = ["1995-01-03", "1996-01-02", "2000-01-03", "2008-09-15", "2010-01-04", "2015-01-02", "2018-03-01", "2020-03-23", "2022-10-12"];
  const changes = parseWikipediaSp500Changes(source.html);
  historicalDailyMembership([source.anchor], current, changes, source.anchor);
  const membership = historicalDailyMembership(probes, current, changes, source.anchor);
  const keys = historicalPriceKeys;
  const symbols = [...new Set([...membership].flatMap(([date, set]) => [...set].flatMap((s) => keys(s, date))))].sort();
  const [history, coverage] = await Promise.all([
    prisma.equityDailyBar.groupBy({ by: ["symbol"], where: { symbol: { in: symbols } }, _min: { date: true }, _max: { date: true }, _count: true }),
    prisma.equityPriceCoverage.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true, notFound: true, fullHistory: true, lastCheckedAt: true } }),
  ]);
  const bySymbol = new Map(history.map((r) => [r.symbol, r]));
  const byCoverage = new Map(coverage.map((r) => [r.symbol, r]));
  const names = new Map<string, string>();
  for (const change of [...changes].sort((a, b) => b.date.localeCompare(a.date))) {
    if (change.removedTicker && change.removedName && !names.has(change.removedTicker)) names.set(change.removedTicker, change.removedName);
    if (change.addedTicker && change.addedName && !names.has(change.addedTicker)) names.set(change.addedTicker, change.addedName);
  }
  const reports = [];
  for (const probe of probes) {
    if (!membership.has(probe)) {
      reports.push({ date: probe, unavailable: "no historical membership source", firstMembershipDate: HISTORY_FIRST_DATE });
      console.log(probe, "缺少历史成分名单，留空"); continue;
    }
    const members = [...membership.get(probe)!].sort();
    const priceKeys = [...new Set(members.flatMap((s) => keys(s, probe)))];
    const calendar = await prisma.equityDailyBar.findMany({ where: { symbol: "SPY", date: { lte: new Date(`${probe}T00:00:00Z`) }, close: { gt: 0 } }, orderBy: { date: "desc" }, take: 200, select: { date: true } });
    if (calendar.length !== 200) throw new Error(`${probe}SPY预热不足`);
    const [count50, count200, closes] = await Promise.all([
      prisma.equityDailyBar.groupBy({ by: ["symbol"], where: { symbol: { in: priceKeys }, date: { gte: calendar[49].date, lte: calendar[0].date }, close: { gt: 0 } }, _count: true }),
      prisma.equityDailyBar.groupBy({ by: ["symbol"], where: { symbol: { in: priceKeys }, date: { gte: calendar[199].date, lte: calendar[0].date }, close: { gt: 0 } }, _count: true }),
      prisma.equityDailyBar.findMany({ where: { symbol: { in: priceKeys }, date: calendar[0].date, close: { gt: 0 } }, select: { symbol: true } }),
    ]);
    const n50 = new Map(count50.map((r) => [r.symbol, r._count]));
    const n200 = new Map(count200.map((r) => [r.symbol, r._count]));
    const present = new Set(closes.map((r) => r.symbol));
    const eligible = (s: string, period: 50 | 200) => keys(s, probe).some((key) => present.has(key) && (period === 50 ? n50 : n200).get(key) === period);
    const missing = members.filter((s) => !eligible(s, 50) || !eligible(s, 200)).map((symbol) => {
      const symbolKeys = keys(symbol, probe);
      const h = symbolKeys.map((s) => bySymbol.get(s)).find((r) => r != null);
      return { symbol, priceKeys: symbolKeys, name: names.get(normalizeSp500Ticker(symbol, probe) ?? symbol) ?? "", count50: Math.max(...symbolKeys.map((s) => n50.get(s) ?? 0)), count200: Math.max(...symbolKeys.map((s) => n200.get(s) ?? 0)), hasClose: symbolKeys.some((s) => present.has(s)), firstPrice: h?._min.date?.toISOString().slice(0, 10) ?? null, lastPrice: h?._max.date?.toISOString().slice(0, 10) ?? null, totalBars: h?._count ?? 0, yahooNotFound: byCoverage.get(symbolKeys[0])?.notFound ?? false, fullHistory: byCoverage.get(symbolKeys[0])?.fullHistory ?? false };
    });
    const eligible50 = members.filter((s) => eligible(s, 50)).length;
    const eligible200 = members.filter((s) => eligible(s, 200)).length;
    const row = { date: probe, members: members.length, eligible50, eligible200, coverage50: 100 * eligible50 / members.length, coverage200: 100 * eligible200 / members.length, missing };
    reports.push(row);
    console.log(probe, JSON.stringify({ members: row.members, eligible50, eligible200, coverage50: row.coverage50.toFixed(2), coverage200: row.coverage200.toFixed(2), missing: missing.length, noPriceHistory: missing.filter((r) => !r.totalBars).length, existingHistoryStartsTooLate: missing.filter((r) => r.firstPrice && r.firstPrice > probe).length }));
  }
  const target = path.join(process.cwd(), ".data", "market-breadth-history-audit.json");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify({ generatedAt: new Date().toISOString(), membershipAnchor: source.anchor, historicalMembership: HISTORY_SOURCE, reports }, null, 2));
  console.log(`audit: ${target}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
