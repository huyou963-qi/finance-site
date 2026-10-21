import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const subscriptions = await prisma.dataSubscription.findMany({
    where: { sourceId: "mof-budget-accounts", enabled: true },
    include: { source: true, instrument: { select: { id: true, code: true, name: true, metadata: true } }, releasePackage: { select: { id: true, labelZh: true, releaseTemplate: true, scheduleState: true, nextRunAt: true } } },
    orderBy: { sourceSeriesKey: "asc" },
  });
  if (!subscriptions.length) throw new Error("请先 data:seed-mof-budget-accounts");
  let failures = 0;
  let changed = 0;
  for (const sub of subscriptions) {
    // Exercise exactly the adapter/dispatch/writer/audit/schedule used by worker.
    const result = await runDataSubscription(prisma, sub, { force: true });
    console.log(sub.instrument.code, result.status, `upsert=${result.rowsUpserted}`, result.error ?? "");
    changed += result.rowsUpserted;
    if (result.status === "failed" || result.status === "partial") failures++;
  }
  console.log(`[sync-mof-budget-accounts] 序列=${subscriptions.length}，新增/修订=${changed}，失败=${failures}`);
  if (failures) throw new Error(`财政决算更新失败 ${failures} 条`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
