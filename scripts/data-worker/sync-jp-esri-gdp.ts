import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import { JP_ESRI_GDP_SOURCE_ID, JP_ESRI_GDP_SERIES } from "../../src/lib/data/scheduler/jpEsriGdp/catalog";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const subs = await prisma.dataSubscription.findMany({ where: { sourceId: JP_ESRI_GDP_SOURCE_ID, instrument: { code: { in: JP_ESRI_GDP_SERIES.map((s) => s.code) } } }, include: { source: true, instrument: { select: { id: true, code: true, name: true, metadata: true } }, releasePackage: { select: { id: true, labelZh: true, releaseTemplate: true, scheduleState: true, nextRunAt: true } } }, orderBy: { sourceSeriesKey: "asc" } });
  if (subs.length !== JP_ESRI_GDP_SERIES.length) throw new Error("ESRI missing subscriptions; run seed first");
  let failures = 0;
  for (const sub of subs) {
    const result = await runDataSubscription(prisma, sub, { force: true, preserveNextRunAt: true });
    console.log(sub.instrument.code, JSON.stringify(result));
    if (result.status === "failed") failures++;
  }
  if (failures) throw new Error(`ESRI ${failures} failed subscriptions`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
