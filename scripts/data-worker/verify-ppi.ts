/** Verify BLS/FRED Final Demand PPI subscriptions and recent observations. */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { PPI_FRED_SERIES } from "../../src/lib/data/scheduler/ppiFredSeedCatalog";
import { defaultFredCalendarWindow, fetchFredReleaseCalendar } from "../../src/lib/data/scheduler/fredReleaseCalendar/client";
import { fredReleaseOccurrencesForPackage, lastFredReleaseBefore } from "../../src/lib/data/scheduler/fredReleaseCalendar/parseCalendar";
import { expectedMonthlyObservation } from "../../src/lib/data/scheduler/releaseObservationPolicy";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.argv.includes("--db")) {
    console.log("[verify-ppi] 通过（加 --db 校验订阅、属性和最近观测）");
    return;
  }
  const prisma = new PrismaClient();
  let errors = 0;
  try {
    const now = new Date();
    const calendar = await fetchFredReleaseCalendar({ ...defaultFredCalendarWindow(now), releaseIds: [46], signal: AbortSignal.timeout(30_000) });
    const release = lastFredReleaseBefore(fredReleaseOccurrencesForPackage(calendar, "us.bls.ppi"), now);
    if (!release) throw new Error("无法确认 PPI 最近已发布期，禁止用三个月宽松阈值替代");
    const cutoff = expectedMonthlyObservation(release.releaseAt, 1).toISOString().slice(0, 10);
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
    console.log(`[verify-ppi] 已发布目标期 ${cutoff}；${PPI_FRED_SERIES.length} 条检查，错误 ${errors}`);
  } finally { await prisma.$disconnect(); }
  if (errors) process.exit(1);
  console.log(`[verify-ppi] 通过：${PPI_FRED_SERIES.length} 条`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
