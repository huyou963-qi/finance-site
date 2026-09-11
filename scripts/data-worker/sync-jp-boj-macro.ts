import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { BOJ_SERIES } from "../../src/lib/data/scheduler/boj/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const key = process.argv.find((a) => a.startsWith("--series="))?.slice(9);
  const rows = BOJ_SERIES.filter((r) => !key || r.key === key);
  if (!rows.length) throw new Error(`Unknown series ${key}`);
  let failed = 0;
  for (const row of rows) {
    const sub = await prisma.dataSubscription.findFirst({ where: { instrument: { code: row.instrumentCode } }, include: { source: true, instrument: { select: { id: true, code: true, name: true, metadata: true } }, releasePackage: { select: { id: true, labelZh: true, releaseTemplate: true, scheduleState: true, nextRunAt: true } } } });
    if (!sub) throw new Error(`Seed first: ${row.instrumentCode}`);
    const result = await runDataSubscription(prisma, sub, { force: true });
    console.log(JSON.stringify({ code: row.instrumentCode, ...result }));
    if (result.status === "failed" || result.status === "partial") failed++;
  }
  if (failed) throw new Error(`${failed} BOJ series failed`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
