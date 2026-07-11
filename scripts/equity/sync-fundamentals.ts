/**
 * 同步行业基本面快照（主路径：SEC companyfacts，免密钥）。
 * FMP 当前套餐对 period=quarter 的 ratios/income 常 402，不再作为默认源。
 *
 * Usage:
 *   npm run equity:sync-fundamentals
 *   npm run equity:sync-fundamentals -- --limit=100
 */
import { prisma } from "../../src/lib/prisma";
import {
  extractAnnualFundamentals,
  fetchSecCompanyFacts,
  fetchSecTickerCikMap,
  fetchYahooLastClose,
} from "../../src/lib/equity/secFundamentals";

function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const limit = Math.max(1, Number(argValue("--limit") ?? 100) || 100);
  const delayMs = Math.max(120, Number(argValue("--delay-ms") ?? 200) || 200);

  console.log("Loading SEC ticker→CIK map…");
  const cikMap = await fetchSecTickerCikMap();

  const securities = await prisma.equitySecurity.findMany({
    orderBy: [{ marketCap: "desc" }, { symbol: "asc" }],
    take: Math.max(limit * 3, 200),
    select: { symbol: true, cik: true, marketCap: true },
  });

  // 回填缺失 CIK，并挑出有 CIK 的前 limit 只
  const withCik: { symbol: string; cik: string }[] = [];
  for (const row of securities) {
    let cik = row.cik;
    if (!cik) {
      const mapped = cikMap.get(row.symbol);
      if (mapped) {
        cik = mapped;
        await prisma.equitySecurity.update({
          where: { symbol: row.symbol },
          data: { cik: mapped },
        });
      }
    }
    if (cik) withCik.push({ symbol: row.symbol, cik });
    if (withCik.length >= limit) break;
  }

  if (!withCik.length) {
    console.error("无可用 CIK：请先 equity:seed-sp500，并确认可访问 sec.gov");
    process.exitCode = 1;
    return;
  }

  let ok = 0;
  let fail = 0;

  for (const { symbol, cik } of withCik) {
    try {
      const facts = await fetchSecCompanyFacts(cik);
      const snap = extractAnnualFundamentals(facts);
      if (!snap) {
        fail += 1;
        console.warn(`no annual facts: ${symbol}`);
        await sleep(delayMs);
        continue;
      }

      let pe: number | null = null;
      if (snap.eps != null && snap.eps !== 0) {
        const px = await fetchYahooLastClose(symbol);
        if (px != null) pe = px / snap.eps;
      }

      const asOf = new Date(`${snap.asOf}T00:00:00.000Z`);
      await prisma.equityFundamentalSnapshot.upsert({
        where: { symbol_period: { symbol, period: snap.period } },
        create: {
          symbol,
          period: snap.period,
          revenue: snap.revenue,
          revenueYoY: snap.revenueYoY,
          eps: snap.eps,
          epsYoY: snap.epsYoY,
          grossMargin: snap.grossMargin,
          opMargin: snap.opMargin,
          pe,
          asOf,
        },
        update: {
          revenue: snap.revenue,
          revenueYoY: snap.revenueYoY,
          eps: snap.eps,
          epsYoY: snap.epsYoY,
          grossMargin: snap.grossMargin,
          opMargin: snap.opMargin,
          pe,
          asOf,
        },
      });

      // 兼容聚合：再写一条 TTM 别名指向同一套年报指标
      await prisma.equityFundamentalSnapshot.upsert({
        where: { symbol_period: { symbol, period: "TTM" } },
        create: {
          symbol,
          period: "TTM",
          revenue: snap.revenue,
          revenueYoY: snap.revenueYoY,
          eps: snap.eps,
          epsYoY: snap.epsYoY,
          grossMargin: snap.grossMargin,
          opMargin: snap.opMargin,
          pe,
          asOf,
        },
        update: {
          revenue: snap.revenue,
          revenueYoY: snap.revenueYoY,
          eps: snap.eps,
          epsYoY: snap.epsYoY,
          grossMargin: snap.grossMargin,
          opMargin: snap.opMargin,
          pe,
          asOf,
        },
      });

      ok += 1;
      console.log(
        `ok ${symbol} ${snap.period} revYoY=${snap.revenueYoY?.toFixed(3) ?? "n/a"} pe=${pe?.toFixed(1) ?? "n/a"}`,
      );
    } catch (e) {
      fail += 1;
      console.warn(`fail ${symbol}:`, e instanceof Error ? e.message : e);
    }
    await sleep(delayMs);
  }

  console.log(JSON.stringify({ attempted: withCik.length, ok, fail }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
