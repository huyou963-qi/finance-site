import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { CONSUMER_PRESSURE_FRED, NYFED_HHDC_SERIES } from "../../src/lib/data/scheduler/consumerPressure/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import { fetchFredIncremental } from "../../src/lib/data/scheduler/adapters/fredAdapter";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  for (const code of [...CONSUMER_PRESSURE_FRED.map(row => `sched_fred_${row.fredId}`), ...NYFED_HHDC_SERIES.map(row => row.code)]) {
    const sub = await prisma.dataSubscription.findFirst({ where: { instrument: { code } }, include: { source: true, instrument: true, releasePackage: true } });
    if (!sub) throw new Error(`Missing subscription: ${code}`);
    const allowStaged = process.argv.includes("--backfill-staged") && sub.sourceId === "nyfed-hhdc";
    const result = await runDataSubscription(prisma, allowStaged ? { ...sub, enabled: true } : sub, {
      force: true, skipCalendarRefresh: true,
      ...(sub.sourceId === "fred" ? { fetchIncremental: () => fetchFredIncremental(sub.sourceSeriesKey, process.env.FRED_API_KEY!, "1776-07-04") } : {}),
    });
    console.log(code, JSON.stringify(result));
    if (result.status === "failed" || (result.status === "skipped" && !result.latestObsDate)) throw new Error(`Sync incomplete: ${code}`);
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
