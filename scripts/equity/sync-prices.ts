/**
 * 回填/增量同步美股日线与拆股事件到 mds.equity_daily_bar / mds.equity_split。
 * 数据源：Yahoo Finance v8 chart（免密钥）。首次按 range=max 拉全量历史。
 *
 * Usage:
 *   npm run equity:sync-prices                          # 市值前 100 成分 + 11 Sector ETF + SPY
 *   npm run equity:sync-prices -- --limit=500           # 市值前 500
 *   npm run equity:sync-prices -- --symbols=AAPL,GME    # 任意美股代码（不限 S&P500）
 *   npm run equity:sync-prices -- --index-date=2026-08-31 # 指定 S&P500 宇宙快照
 *   npm run equity:sync-prices -- --full                # 强制重拉全量历史（含拆股事件）
 */
import { prisma } from "../../src/lib/prisma";
import { syncSymbolFromRemote } from "../../src/lib/equity/equityPriceStore";
import { BENCHMARK_ETF, SECTOR_ETF_SYMBOLS } from "../../src/lib/equity/gicsCatalog";
import { SP500_INDEX_CODE } from "../../src/lib/equity/equitySecurities";

function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const symbolsArg = argValue("--symbols");
  const indexDate = argValue("--index-date");
  const limit = Math.max(1, Number(argValue("--limit") ?? 100) || 100);
  const delayMs = Math.max(80, Number(argValue("--delay-ms") ?? 150) || 150);
  const full = hasFlag("--full");

  let symbols: string[];
  if (symbolsArg) {
    symbols = symbolsArg
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  } else if (indexDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(indexDate)) throw new Error(`非法 --index-date: ${indexDate}`);
    const members = await prisma.indexConstituent.findMany({
      where: {
        indexCode: SP500_INDEX_CODE,
        asOfDate: new Date(`${indexDate}T00:00:00.000Z`),
      },
      orderBy: { symbol: "asc" },
      select: { symbol: true },
    });
    symbols = members.map((row) => row.symbol);
  } else {
    const rows = await prisma.equitySecurity.findMany({
      orderBy: [{ marketCap: "desc" }, { symbol: "asc" }],
      take: limit,
      select: { symbol: true },
    });
    symbols = [
      ...new Set([...rows.map((r) => r.symbol), ...SECTOR_ETF_SYMBOLS, BENCHMARK_ETF]),
    ];
  }

  if (!symbols.length) {
    console.error("无标的可同步：请先 equity:seed-sp500 或使用 --symbols=");
    process.exitCode = 1;
    return;
  }

  console.log(`syncing ${symbols.length} symbols${full ? " (full history)" : ""}…`);
  let ok = 0;
  let notFound = 0;
  let fail = 0;

  for (const symbol of symbols) {
    try {
      const res = await syncSymbolFromRemote(symbol, { full });
      if (res) {
        ok += 1;
        console.log(
          `ok ${symbol} bars=${res.barCount} splits=${res.splitCount} source=${res.source}`,
        );
      } else {
        notFound += 1;
        console.warn(`not-found ${symbol}`);
      }
    } catch (e) {
      fail += 1;
      console.warn(`fail ${symbol}:`, e instanceof Error ? e.message : e);
    }
    await sleep(delayMs);
  }

  console.log(JSON.stringify({ attempted: symbols.length, ok, notFound, fail }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
