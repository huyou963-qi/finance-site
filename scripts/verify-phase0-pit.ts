/**
 * Phase 0 总验收：任选历史日 T，查询「T 日市场实际可见」的三件套 ——
 * 1. SP500 成分名单（index_constituent 月末粒度 as-of）
 * 2. 样本股最新已披露财报（equity_fundamental_snapshot.first_reported_at ≤ T）
 * 3. 最新已发布宏观值（getMacroValueAsOf，近似 PIT）
 *
 * Usage:
 *   npm run verify:phase0-pit                       # 默认 T=2023-06-15
 *   npm run verify:phase0-pit -- --t=2021-03-01
 */
import { prisma } from "../src/lib/prisma";
import { SP500_INDEX_CODE } from "../src/lib/equity/equitySecurities";
import { getMacroValueAsOf } from "../src/lib/data/macroAsOf";

function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

async function main() {
  const t = argValue("--t") ?? "2023-06-15";
  const tDate = new Date(`${t}T00:00:00.000Z`);
  console.log(`=== Phase 0 PIT 总验收：T = ${t} ===\n`);

  // 1. 成分名单 as-of T
  const latest = await prisma.indexConstituent.findFirst({
    where: { indexCode: SP500_INDEX_CODE, asOfDate: { lte: tDate } },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  if (!latest) throw new Error("T 之前无成分快照");
  const members = await prisma.indexConstituent.findMany({
    where: { indexCode: SP500_INDEX_CODE, asOfDate: latest.asOfDate },
    select: { symbol: true },
  });
  const memberSet = new Set(members.map((m) => m.symbol));
  console.log(
    `1) SP500 成分（快照期 ${latest.asOfDate.toISOString().slice(0, 10)}）：${memberSet.size} 只`,
  );
  console.log(`   样例：${[...memberSet].sort().slice(0, 12).join(", ")} …`);

  // 2. 样本股 T 日已披露的最新财报（firstReportedAt ≤ T）
  console.log(`\n2) T 日已披露的最新季报（first_reported_at ≤ T）：`);
  for (const symbol of ["AAPL", "MSFT", "JPM", "NVDA", "XOM"]) {
    const snap = await prisma.equityFundamentalSnapshot.findFirst({
      where: { symbol, periodType: "Q", firstReportedAt: { not: null, lte: tDate } },
      orderBy: { fiscalDate: "desc" },
      select: { period: true, fiscalDate: true, firstReportedAt: true, revenue: true, eps: true },
    });
    // 对照：如果不做 PIT（按 fiscalDate ≤ T 取）会拿到哪期
    const naive = await prisma.equityFundamentalSnapshot.findFirst({
      where: { symbol, periodType: "Q", fiscalDate: { lte: tDate } },
      orderBy: { fiscalDate: "desc" },
      select: { period: true, firstReportedAt: true },
    });
    if (!snap) {
      console.log(`   ${symbol.padEnd(6)} 无已披露季报（回填窗口外或未覆盖）`);
      continue;
    }
    const leak =
      naive && naive.period !== snap.period
        ? `（若按 fiscalDate 取会拿到 ${naive.period}，其披露日 ${naive.firstReportedAt?.toISOString().slice(0, 10) ?? "?"} > T → 前视泄漏，已避免）`
        : "";
    console.log(
      `   ${symbol.padEnd(6)} ${snap.period} fiscal=${snap.fiscalDate?.toISOString().slice(0, 10)} 披露=${snap.firstReportedAt!.toISOString().slice(0, 10)} rev=${snap.revenue?.toExponential(2)} eps=${snap.eps?.toFixed(2)} ${leak}`,
    );
  }

  // 3. 宏观 as-of
  console.log(`\n3) T 日已发布的最新宏观值：`);
  for (const fred of ["CPIAUCSL", "PAYEMS", "UNRATE"]) {
    const inst = await prisma.instrument.findFirst({
      where: { fredSeriesId: fred },
      select: { id: true, code: true, name: true },
    });
    if (!inst) {
      console.log(`   ${fred}: 库内无此序列`);
      continue;
    }
    const v = await getMacroValueAsOf(inst.id, t);
    console.log(
      v
        ? `   ${fred.padEnd(9)} obs=${v.obsDate} val=${v.value} est发布=${v.estimatedReleaseDate} lag=${v.lagDays}d(${v.lagSource})`
        : `   ${fred.padEnd(9)} T 日无可见观测`,
    );
  }

  // 4. 幸存者偏差对照：T 日在册但今天已不在的成员
  const latestNow = await prisma.indexConstituent.findFirst({
    where: { indexCode: SP500_INDEX_CODE },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  const nowMembers = await prisma.indexConstituent.findMany({
    where: { indexCode: SP500_INDEX_CODE, asOfDate: latestNow!.asOfDate },
    select: { symbol: true },
  });
  const nowSet = new Set(nowMembers.map((m) => m.symbol));
  const goneSince = [...memberSet].filter((s) => !nowSet.has(s)).sort();
  console.log(
    `\n4) T 日在册、现已移出的成员 ${goneSince.length} 只（幸存者偏差样本）：${goneSince.slice(0, 15).join(", ")}${goneSince.length > 15 ? " …" : ""}`,
  );

  console.log("\n总验收完成 ✔");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
