import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { JGB_SERIES } from "../../src/lib/data/scheduler/japanMofJgb/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  for (const row of JGB_SERIES) {
    const sub = await prisma.dataSubscription.findFirst({ where: { instrument: { code: row.code } }, include: { source: true, instrument: true, releasePackage: true } });
    if (!sub) throw new Error(`Seed first: ${row.code}`);
    const result = await runDataSubscription(prisma, sub, { force: true });
    console.log(row.code, JSON.stringify(result));
    if (result.status === "failed") throw new Error(`Worker failed: ${row.code}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
