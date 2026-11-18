import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { CONSUMER_STRUCTURE_PACKAGE, CONSUMER_STRUCTURE_SERIES } from "../../src/lib/data/scheduler/consumerStructureCatalog";
import { defaultEconomicCalendarRule } from "../../src/lib/data/scheduler/releaseRule";
import { P0_DATA_SOURCE_FRED } from "../../src/lib/data/scheduler/p0SeedCatalog";
loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function main() {
  await db.dataSource.upsert({ where: { id: "fred" }, create: P0_DATA_SOURCE_FRED, update: {} });
  // data:apply creates catalog instruments before linking release packages.
  const pkg = await db.releasePackage.findUnique({ where: { id: CONSUMER_STRUCTURE_PACKAGE } });
  if (pkg && !pkg.enabled) throw new Error("既有个人收入与支出发布包被停用，请先核实原因");
  for (const row of CONSUMER_STRUCTURE_SERIES) {
    const existing = await db.instrument.findUnique({ where: { fredSeriesId: row.fredId }, include: { dataSubscription: true } });
    const excluded = await db.macroCatalogExcludedKey.findMany({ where: { catalogKey: { in: [`fred:${row.fredId}`, `mds:sched_fred_${row.fredId}`] } } });
    // Only restore the PCE total withdrawn by this task. Never resurrect an administrator deletion.
    if (excluded.some(x => row.fredId !== "PCE" || !x.deletedBy?.startsWith("consumer-monitor"))) {
      throw new Error(`${row.fredId}: 存在目录排除记录，请先核实原删除原因`);
    }
    if (existing?.dataSubscription?.enabled) {
      if (existing.dataSubscription.sourceId !== "fred" || existing.dataSubscription.sourceSeriesKey !== row.fredId ||
        (existing.dataSubscription.releasePackageId && existing.dataSubscription.releasePackageId !== CONSUMER_STRUCTURE_PACKAGE)) throw new Error(`${row.fredId}: existing owner conflict`);
      console.log(`[reuse] ${row.fredId}`); continue;
    }
    const metadata = {
      countryCode: "US", countryNameZh: "美国", catalogKey: `fred:${row.fredId}`,
      catalogCategory: "国民经济", catalogSubcategory: "消费与国内需求", displayName: row.name,
      sourceTag: "consumer-structure", source: "BEA/FRED", sourceUrl: `https://fred.stlouisfed.org/series/${row.fredId}`,
      officialUrl: "https://www.bea.gov/data/consumer-spending/main", beaAccountCode: row.beaCode,
      unit: "十亿美元", freqLabel: "月", seasonalAdjustment: "SAAR", observationStartDate: "1959-01-01",
      onboardingStatus: "complete", definitionNote: "BEA NIPA 2.8.5原生名义金额；季调折年，非单月实际支付额。结构占比只用同月同口径名义值计算；不得加总实际链价金额。",
      sourceUpdateNote: "BEA Personal Income and Outlays月报；复用us.bea.personal_income日历，完整回读历史捕获年度及基准修订",
      fetchAcquisition: { status: "known", method: "api", methodLabel: "FRED API", verifiedAt: "2026-11-18", note: "逐条核对FRED公开页面：月频、十亿美元、季调折年、BEA个人收入与支出发布" },
    };
    await db.$transaction(async tx => {
      const inst = await tx.instrument.upsert({ where: { fredSeriesId: row.fredId },
        create: { code: `sched_fred_${row.fredId}`, name: row.name, kind: "MACRO_SERIES", fredSeriesId: row.fredId, freqLabel: "月", unit: "十亿美元", metadata },
        update: { name: row.name, freqLabel: "月", unit: "十亿美元", metadata } });
      const plan = { sourceId: "fred", sourceSeriesKey: row.fredId, fetchMethod: "API" as const, granularity: "MONTHLY" as const,
        enabled: true, priority: 45, revisionLookback: 2400, releaseRule: defaultEconomicCalendarRule("MONTHLY") as object,
        ...(pkg ? { releasePackageId: pkg.id } : {}), nextRunAt: pkg?.nextRunAt ?? new Date() };
      await tx.dataSubscription.upsert({ where: { instrumentId: inst.id }, create: { instrumentId: inst.id, ...plan }, update: plan });
      if (pkg) await tx.releasePackageMember.upsert({ where: { instrumentId: inst.id }, create: { instrumentId: inst.id, packageId: pkg.id }, update: { packageId: pkg.id } });
      if (excluded.length) await tx.macroCatalogExcludedKey.deleteMany({ where: { catalogKey: { in: excluded.map(x => x.catalogKey) } } });
    });
    console.log(`[seed-consumer-structure] ${row.fredId}`);
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
