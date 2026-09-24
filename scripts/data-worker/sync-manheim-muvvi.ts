import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { MANHEIM_MUVVI_CODE } from "../../src/lib/data/scheduler/manheimMuvvi/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const subscription = await prisma.dataSubscription.findFirst({
    where: { instrument: { code: MANHEIM_MUVVI_CODE } },
    include: { source: true, instrument: { select: { id: true, code: true, name: true, metadata: true } }, releasePackage: { select: { id: true, labelZh: true, releaseTemplate: true, scheduleState: true, nextRunAt: true } } },
  });
  if (!subscription) throw new Error("Run data:seed-manheim-muvvi first");
  const result = await runDataSubscription(prisma, subscription, { force: true });
  console.log(result);
  if (result.status === "failed" || result.status === "partial") throw new Error(`Manheim sync ${result.status}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
