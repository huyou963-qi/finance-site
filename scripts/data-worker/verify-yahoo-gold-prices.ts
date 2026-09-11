/**
 * 黄金收盘价（行情接口 Yahoo GC=F）——自检
 *
 * npm run data:verify-yahoo-gold-prices
 * npm run data:verify-yahoo-gold-prices -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { mergedUsovFredMap } from "../../src/lib/data/scheduler/usovFredMap";
import {
  YAHOO_CHART_SOURCE,
  YAHOO_GOLD_PACKAGE_ID,
  YAHOO_GOLD_SERIES,
} from "../../src/lib/data/scheduler/yahooGold/catalog";

async function main() {
  let errors = 0;
  const fail = (msg: string) => {
    console.error(`  ✗ ${msg}`);
    errors++;
  };

  if (mergedUsovFredMap().usov_c05_comex_gold) fail("usov_c05_comex_gold 仍映射 FRED（phase2 seed 会覆盖回 FRED 订阅）");
  else console.log("  ✓ usov_c05_comex_gold 无 FRED 映射");

  if (!process.argv.includes("--db")) {
    console.log(errors > 0 ? "[verify-yahoo-gold-prices] 失败" : "[verify-yahoo-gold-prices] 通过（加 --db 检查数据库）");
    if (errors > 0) process.exit(1);
    return;
  }

  const prisma = new PrismaClient();
  try {
    for (const row of YAHOO_GOLD_SERIES) {
      const inst = await prisma.instrument.findUnique({
        where: { code: row.code },
        include: { dataSubscription: true },
      });
      if (!inst) {
        fail(`缺 Instrument ${row.code}`);
        continue;
      }
      const md = (inst.metadata ?? {}) as Record<string, unknown>;
      const scrape = md.scrape as Record<string, unknown> | undefined;
      if (scrape?.provider !== "yahoo_chart" || scrape.symbol !== row.symbol) {
        fail(`${row.code} scrape=${JSON.stringify(scrape ?? null)}（应 yahoo_chart/${row.symbol}）`);
      }
      if (readFetchAcquisition(inst.metadata)?.status !== "known") fail(`${row.code} fetchAcquisition 非 known`);
      const sub = inst.dataSubscription;
      if (!sub?.enabled || sub.sourceId !== YAHOO_CHART_SOURCE.id || sub.releasePackageId !== YAHOO_GOLD_PACKAGE_ID) {
        fail(`${row.code} 订阅=${sub?.sourceId ?? "无"}/${sub?.enabled}/${sub?.releasePackageId ?? "无包"}（应 ${YAHOO_CHART_SOURCE.id}/启用/${YAHOO_GOLD_PACKAGE_ID}）`);
      }
      const last = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "desc" },
      });
      const lagDays = last ? (Date.now() - last.obsDate.getTime()) / 86_400_000 : Infinity;
      if (!last || lagDays > 7) {
        fail(`${row.code} 最新观测 ${last?.obsDate.toISOString().slice(0, 10) ?? "无"}（滞后 ${Math.round(lagDays)} 天，应 ≤7）`);
      } else if (last.value < 100 || last.value > 20_000) {
        fail(`${row.code} 最新值 ${last.value} 超出合理区间`);
      } else {
        console.log(
          `  ✓ ${row.code} ← ${sub?.sourceId}:${sub?.sourceSeriesKey} · ${sub?.releasePackageId} · 最新 ${last.obsDate.toISOString().slice(0, 10)}=${last.value}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-yahoo-gold-prices] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-yahoo-gold-prices] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
