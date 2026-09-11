/** Verify BLS/FRED Final Demand PPI subscriptions and recent observations. */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { PPI_FRED_SERIES } from "../../src/lib/data/scheduler/ppiFredSeedCatalog";

loadEnvConfig(process.cwd());
const cutoff = (() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 3, 1); return d.toISOString().slice(0, 10); })();

async function main() {
  if (!process.argv.includes("--db")) {
    console.log("[verify-ppi] 通过（加 --db 校验订阅、属性和最近观测）");
    return;
  }
  const prisma = new PrismaClient();
  let errors = 0;
  try {
    for (const item of PPI_FRED_SERIES) {
      const instrument = await prisma.instrument.findUnique({ where: { code: item.code } });
      const subscription = instrument && await prisma.dataSubscription.findUnique({ where: { instrumentId: instrument.id } });
      const latest = instrument && await prisma.macroObservation.findFirst({ where: { instrumentId: instrument.id }, orderBy: { obsDate: "desc" } });
      const actual = latest?.obsDate.toISOString().slice(0, 10);
      if (!instrument || !subscription?.enabled || instrument.fredSeriesId !== item.fredId || instrument.freqLabel !== "月" || instrument.unit !== "指数" || !actual || actual < cutoff) {
        console.error(`  ✗ ${item.fredId}: instrument=${Boolean(instrument)} enabled=${Boolean(subscription?.enabled)} latest=${actual ?? "无"}`);
        errors++;
      } else {
        console.log(`  ✓ ${item.fredId} ${actual}`);
      }
    }
  } finally { await prisma.$disconnect(); }
  if (errors) process.exit(1);
  console.log(`[verify-ppi] 通过：${PPI_FRED_SERIES.length} 条，月频阈值 ${cutoff}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
