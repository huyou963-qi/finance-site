import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { JP_ESTAT_CPI_SERIES } from "../../src/lib/data/scheduler/eStat/cpiCatalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  for (const s of JP_ESTAT_CPI_SERIES) {
    const sub = await prisma.dataSubscription.findFirstOrThrow({ where: { instrument: { code: s.instrumentCode } }, include: { source: true, instrument: { select: { id: true, code: true, name: true, metadata: true } }, releasePackage: true } });
    const result = await runDataSubscription(prisma, sub, { force: true, skipCalendarRefresh: true });
    console.log(s.instrumentCode, JSON.stringify(result));
    if (result.status === "failed" || result.status === "partial") throw new Error(`${s.instrumentCode}: sync incomplete`);
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
