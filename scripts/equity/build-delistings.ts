/**
 * 构建退市/移出清单 mds.equity_delisting（WS3，消除回测幸存者偏差）。
 *
 * 反推逻辑：出现在 SP500 历史成分（index_constituent）但不在最新一期名单中的
 * symbol 即"消失成员"；delistDate 优先取 Wikipedia 变更表的移出生效日，
 * 缺行时退化为最后出现的月末。lastPriceDate/priceStatus 标注 Yahoo 日线覆盖：
 * covered=有日线 / not_found=Yahoo 确认无此标的 /
 * no_data=Yahoo 有 symbol 但无日线（长退市 stub 页，已查过） / pending=尚未尝试补价。
 *
 * Usage:
 *   npm run equity:build-delistings                # 全量重建
 *   npm run equity:build-delistings -- --print-pending   # 额外打印待补价 symbol 列表
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../../src/lib/prisma";
import { SP500_INDEX_CODE } from "../../src/lib/equity/equitySecurities";
import { parseWikipediaSp500Changes } from "../../src/lib/equity/wikipediaSp500Changes";

const FIXTURE_PATH = join(__dirname, "fixtures", "wikipedia-sp500-page.html");

async function main() {
  const printPending = process.argv.includes("--print-pending");

  const latest = await prisma.indexConstituent.findFirst({
    where: { indexCode: SP500_INDEX_CODE },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  if (!latest) throw new Error("index_constituent 为空：先跑 equity:rebuild-sp500-history");

  const currentRows = await prisma.indexConstituent.findMany({
    where: { indexCode: SP500_INDEX_CODE, asOfDate: latest.asOfDate },
    select: { symbol: true },
  });
  const current = new Set(currentRows.map((r) => r.symbol));

  // 每个历史 symbol 的最后出现月末
  const lastSeen = await prisma.indexConstituent.groupBy({
    by: ["symbol"],
    where: { indexCode: SP500_INDEX_CODE },
    _max: { asOfDate: true },
  });

  // 变更表：每个 symbol 最近一次移出行（日期、公司名、原因）
  const changes = parseWikipediaSp500Changes(readFileSync(FIXTURE_PATH, "utf8"));
  const removalBySymbol = new Map<string, { date: string; reason: string | null }>();
  for (const c of changes) {
    if (!c.removedTicker) continue;
    const prev = removalBySymbol.get(c.removedTicker);
    if (!prev || c.date > prev.date) {
      const label = [c.removedName, c.reason].filter(Boolean).join(" — ");
      removalBySymbol.set(c.removedTicker, { date: c.date, reason: label || null });
    }
  }

  const gone = lastSeen
    .filter((r) => !current.has(r.symbol) && r._max.asOfDate != null)
    .map((r) => ({ symbol: r.symbol, lastSeen: r._max.asOfDate! }));
  console.log(
    `[delistings] 最新一期 ${latest.asOfDate.toISOString().slice(0, 10)} 共 ${current.size}；历史消失成员 ${gone.length}`,
  );

  // 价格覆盖状态
  const goneSymbols = gone.map((g) => g.symbol);
  const coverage = await prisma.equityPriceCoverage.findMany({
    where: { symbol: { in: goneSymbols } },
    select: { symbol: true, notFound: true, lastDate: true, lastCheckedAt: true },
  });
  const coverageBySymbol = new Map(coverage.map((c) => [c.symbol, c]));
  const barMax = await prisma.equityDailyBar.groupBy({
    by: ["symbol"],
    where: { symbol: { in: goneSymbols } },
    _max: { date: true },
  });
  const lastBarBySymbol = new Map(barMax.map((b) => [b.symbol, b._max.date]));

  let n = 0;
  const byStatus: Record<string, number> = {};
  const pending: string[] = [];
  for (const g of gone) {
    const removal = removalBySymbol.get(g.symbol);
    const delistDate = removal
      ? new Date(`${removal.date}T00:00:00.000Z`)
      : g.lastSeen;
    const lastPriceDate = lastBarBySymbol.get(g.symbol) ?? null;
    const cov = coverageBySymbol.get(g.symbol);
    const priceStatus = lastPriceDate
      ? "covered"
      : cov?.notFound
        ? "not_found"
        : cov?.lastCheckedAt
          ? "no_data"
          : "pending";
    if (priceStatus === "pending") pending.push(g.symbol);
    byStatus[priceStatus] = (byStatus[priceStatus] ?? 0) + 1;

    const data = {
      delistDate,
      reason: removal?.reason?.slice(0, 512) ?? null,
      lastPriceDate,
      priceStatus,
    };
    await prisma.equityDelisting.upsert({
      where: { symbol: g.symbol },
      create: { symbol: g.symbol, ...data },
      update: data,
    });
    n += 1;
  }

  console.log(JSON.stringify({ ok: true, upserted: n, byStatus }, null, 2));
  if (printPending && pending.length) {
    console.log(`待补价（跑 equity:sync-prices -- --full --symbols=…）：`);
    console.log(pending.sort().join(","));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
