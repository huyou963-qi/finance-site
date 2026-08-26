/**
 * 周度 SEC 财报增量：扫描当前 GICS 成分最近的 10-Q/10-K，
 * 仅对有新披露的公司拉 companyfacts，并同时更新当前快照与 PIT vintage。
 */
import { prisma } from "../../src/lib/prisma";
import { upsertQuarterlyFundamentals } from "../../src/lib/equity/equityFundamentalsStore";
import {
  buildSecFundamentalVintages,
  upsertFundamentalVintages,
} from "../../src/lib/equity/fundamentalVintages";
import {
  extractQuarterlyFundamentals,
  fetchSecCompanyFacts,
} from "../../src/lib/equity/secFundamentals";
import { syncSecFilings } from "../../src/lib/equity/secFilingSync";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const requested = (arg("symbols") ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
  const lookbackDays = Math.max(7, Number(arg("days") ?? 10));
  const limitValue = Number(arg("limit"));
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.floor(limitValue) : undefined;
  const delayMs = Math.max(120, Number(arg("delay-ms") ?? 250));
  const concurrency = Math.min(4, Math.max(1, Number(arg("concurrency") ?? 3)));

  let filings:
    | Awaited<ReturnType<typeof syncSecFilings>>
    | { source: "existing-index"; financialSymbols: string[]; failed: number };
  if (hasFlag("from-index")) {
    const cutoff = new Date(Date.now() - lookbackDays * 86_400_000);
    const indexed = await prisma.secFiling.findMany({
      where: {
        filedAt: { gte: cutoff },
        form: { in: ["10-Q", "10-Q/A", "10-K", "10-K/A"] },
        symbol: requested.length ? { in: requested } : { not: null },
      },
      select: { symbol: true },
      distinct: ["symbol"],
      orderBy: { symbol: "asc" },
      ...(limit ? { take: limit } : {}),
    });
    filings = {
      source: "existing-index",
      financialSymbols: indexed.flatMap((row) => (row.symbol ? [row.symbol] : [])),
      failed: 0,
    };
  } else {
    filings = await syncSecFilings({
      symbols: requested.length ? requested : undefined,
      limit,
      lookbackDays,
      delayMs,
      gicsOnly: !requested.length,
    });
  }
  const changedSymbols = filings.financialSymbols;
  if (!changedSymbols.length) {
    console.log(JSON.stringify({ filings, refreshed: 0, failed: 0, message: "最近窗口没有新增定期财报" }, null, 2));
    return;
  }

  const securities = await prisma.equitySecurity.findMany({
    where: { symbol: { in: changedSymbols }, cik: { not: null } },
    select: { symbol: true, cik: true },
    orderBy: { symbol: "asc" },
  });
  let refreshed = 0;
  let snapshotRows = 0;
  let vintageRows = 0;
  let failed = 0;
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      const security = securities[index];
      if (!security) return;
    try {
      const facts = await fetchSecCompanyFacts(security.cik!, { timeoutMs: 60_000 });
      const quarters = extractQuarterlyFundamentals(facts, { maxQuarters: 20 });
      const vintages = buildSecFundamentalVintages(facts, {
        maxQuarters: 80,
        emitLastFilings: 4,
      });
      snapshotRows += await upsertQuarterlyFundamentals(security.symbol, quarters);
      vintageRows += await upsertFundamentalVintages(security.symbol, vintages);
      refreshed += 1;
      console.log(`[SEC fundamentals ${index + 1}/${securities.length}] ${security.symbol}: Q=${quarters.length}, vintage=${vintages.length}`);
    } catch (error) {
      failed += 1;
      console.error(`SEC fundamentals ${security.symbol}:`, error instanceof Error ? error.message : error);
    }
    await sleep(delayMs);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, securities.length) }, () => worker()),
  );

  console.log(JSON.stringify({ filings, refreshed, snapshotRows, vintageRows, failed }, null, 2));
  if (filings.failed || failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
