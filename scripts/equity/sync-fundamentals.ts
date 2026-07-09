/**
 * 同步 Top-N 成分股季度财报快照到 mds.equity_fundamental_snapshot。
 * Usage: npm run equity:sync-fundamentals -- --limit=100
 */
import { prisma } from "../../src/lib/prisma";
import {
  fetchFmpIncomeStatement,
  fetchFmpRatios,
  periodLabelFromDate,
} from "../../src/lib/equity/fmpEquity";

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function yoy(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return curr / prev - 1;
}

async function main() {
  const limit = Math.max(1, Number(argValue("--limit") ?? 100) || 100);
  const delayMs = Math.max(100, Number(argValue("--delay-ms") ?? 400) || 400);

  const securities = await prisma.equitySecurity.findMany({
    orderBy: [{ marketCap: "desc" }, { symbol: "asc" }],
    take: limit,
    select: { symbol: true },
  });

  let ok = 0;
  let fail = 0;

  for (const { symbol } of securities) {
    try {
      const [income, ratios] = await Promise.all([
        fetchFmpIncomeStatement(symbol),
        fetchFmpRatios(symbol),
      ]);
      if (!income.length) {
        fail += 1;
        console.warn(`no income: ${symbol}`);
        await sleep(delayMs);
        continue;
      }

      const peByDate = new Map(ratios.map((r) => [r.date, r.pe]));
      // 最新季 + 若有足够历史可算 YoY（limit=5 时约可对最近 1 季做 YoY）
      const latest = income[income.length - 1]!;
      const yearAgo = income.find(
        (r) =>
          r.date.slice(0, 4) === String(Number(latest.date.slice(0, 4)) - 1) &&
          r.date.slice(5, 7) === latest.date.slice(5, 7),
      );
      // fallback: 往前第 4 条（约一年）
      const approxYoY = yearAgo ?? (income.length >= 5 ? income[income.length - 5] : null);

      const period = periodLabelFromDate(latest.date);
      const asOf = new Date(`${latest.date}T00:00:00.000Z`);

      await prisma.equityFundamentalSnapshot.upsert({
        where: { symbol_period: { symbol, period } },
        create: {
          symbol,
          period,
          revenue: latest.revenue,
          revenueYoY: yoy(latest.revenue, approxYoY?.revenue ?? null),
          eps: latest.eps,
          epsYoY: yoy(latest.eps, approxYoY?.eps ?? null),
          grossMargin: latest.grossProfitRatio,
          opMargin: latest.operatingIncomeRatio,
          pe: peByDate.get(latest.date) ?? null,
          asOf,
        },
        update: {
          revenue: latest.revenue,
          revenueYoY: yoy(latest.revenue, approxYoY?.revenue ?? null),
          eps: latest.eps,
          epsYoY: yoy(latest.eps, approxYoY?.eps ?? null),
          grossMargin: latest.grossProfitRatio,
          opMargin: latest.operatingIncomeRatio,
          pe: peByDate.get(latest.date) ?? null,
          asOf,
        },
      });

      // 同时写 TTM 占位：用最新季 PE
      await prisma.equityFundamentalSnapshot.upsert({
        where: { symbol_period: { symbol, period: "TTM" } },
        create: {
          symbol,
          period: "TTM",
          revenue: latest.revenue,
          revenueYoY: yoy(latest.revenue, approxYoY?.revenue ?? null),
          eps: latest.eps,
          epsYoY: yoy(latest.eps, approxYoY?.eps ?? null),
          grossMargin: latest.grossProfitRatio,
          opMargin: latest.operatingIncomeRatio,
          pe: peByDate.get(latest.date) ?? null,
          asOf,
        },
        update: {
          revenue: latest.revenue,
          revenueYoY: yoy(latest.revenue, approxYoY?.revenue ?? null),
          eps: latest.eps,
          epsYoY: yoy(latest.eps, approxYoY?.eps ?? null),
          grossMargin: latest.grossProfitRatio,
          opMargin: latest.operatingIncomeRatio,
          pe: peByDate.get(latest.date) ?? null,
          asOf,
        },
      });

      ok += 1;
      console.log(`ok ${symbol} ${period}`);
    } catch (e) {
      fail += 1;
      console.warn(`fail ${symbol}:`, e instanceof Error ? e.message : e);
    }
    await sleep(delayMs);
  }

  console.log(JSON.stringify({ attempted: securities.length, ok, fail }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
