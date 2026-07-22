/**
 * ETF 资金流快照（Phase 5 WS4）。
 *
 * ⚠ 免费源硬约束（WS0 probe 实证）：Yahoo quoteSummary 对 ETF 不返回 sharesOutstanding、
 * SSGA 仅当日文件、无免费历史日频份额 → 真实「Δ份额×NAV 资金流」不可回测历史。
 * 本脚本落「NAV 时间序列 + 前向份额挂钩」：把板块 ETF + SPY 的 NAV（前复权收盘）写入 etf_flow，
 * sharesOutstanding/flowUsd 暂为 null（待份额源就绪后回填即得 flowUsd = Δ份额×NAV）。
 * 板块级「成交额代理」信号可由 equity_daily_bar 的 close×volume 现算（见 docs），不落库避免冗余。
 *
 * Usage:
 *   npm run quant:build-etf-flow                 # 落最近 ~1 年 NAV
 *   npm run quant:build-etf-flow -- --days=2000  # 更长历史
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { SECTOR_ETF_SYMBOLS, BENCHMARK_ETF } from "../../src/lib/equity/gicsCatalog";
import { ensureDailyBars } from "../../src/lib/equity/equityPriceStore";

const INSERT_CHUNK = 1000;

function argValue(name: string): string | undefined {
  const kv = process.argv.find((a) => a.startsWith(`${name}=`));
  return kv ? kv.slice(name.length + 1) : undefined;
}

async function main() {
  const t0 = Date.now();
  const days = Math.max(30, Number(argValue("--days") ?? 400) || 400);
  const symbols = [...SECTOR_ETF_SYMBOLS, BENCHMARK_ETF];
  const cutoff = new Date(Date.now() - days * 86_400_000);

  console.log(`ETF NAV 快照：${symbols.length} 只（${symbols.join(", ")}），近 ${days} 天`);
  await ensureDailyBars(symbols);

  let total = 0;
  for (const sym of symbols) {
    const bars = await prisma.equityDailyBar.findMany({
      where: { symbol: sym, date: { gte: cutoff } },
      orderBy: { date: "asc" },
      select: { date: true, adjClose: true, source: true },
    });
    if (!bars.length) {
      console.log(`  ${sym}: 无日线，跳过`);
      continue;
    }
    const rows = bars.map((b) => ({
      etfSymbol: sym,
      date: b.date,
      nav: b.adjClose, // 前复权收盘作 NAV 代理（免费源无净值文件）
      source: b.source,
    }));
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      const values = chunk.map(
        (r) =>
          Prisma.sql`(${randomUUID()}::uuid, ${r.etfSymbol}, ${r.date}::date, ${null}, ${r.nav}, ${null}, ${r.source}, CURRENT_TIMESTAMP)`,
      );
      total += await prisma.$executeRaw`
        INSERT INTO "mds"."etf_flow"
          ("id","etf_symbol","date","shares_outstanding","nav","flow_usd","source","updated_at")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("etf_symbol","date") DO UPDATE SET
          "nav" = EXCLUDED."nav",
          "source" = EXCLUDED."source",
          "updated_at" = CURRENT_TIMESTAMP
      `;
    }
    console.log(`  ${sym}: ${rows.length} 天 NAV`);
  }

  console.log(
    `\n完成：写 ${total} 行 NAV（sharesOutstanding/flowUsd 待份额源），耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
