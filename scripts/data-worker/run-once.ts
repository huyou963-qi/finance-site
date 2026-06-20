/**
 * 执行所有到期的 DataSubscription（单次，适合 Windows 计划任务 / cron）
 *
 * npm run data:worker
 * npm run data:worker -- --force   # 忽略 nextRunAt，跑全部 enabled
 * npm run data:worker -- --limit=5
 * npm run data:worker -- --source=bis --force
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { listDueSubscriptions, runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  let force = false;
  let limit = 20;
  let sourceId: string | undefined;
  for (const a of args) {
    if (a === "--force") force = true;
    else if (a.startsWith("--limit=")) limit = Math.max(1, parseInt(a.split("=")[1] ?? "20", 10));
    else if (a.startsWith("--source=")) sourceId = a.split("=").slice(1).join("=");
  }
  return { force, limit, sourceId };
}

async function main() {
  const { force, limit, sourceId } = parseArgs();
  let subs = await listDueSubscriptions(prisma, limit, { forceAll: force });
  if (sourceId) {
    subs = subs.filter((s) => s.sourceId === sourceId);
    if (force) {
      const all = await prisma.dataSubscription.findMany({
        where: { enabled: true, sourceId },
        take: limit,
        orderBy: [{ priority: "desc" }, { nextRunAt: "asc" }],
        include: {
          source: true,
          instrument: { select: { id: true, code: true, name: true } },
        },
      });
      subs = all;
    }
  }

  if (subs.length === 0) {
    console.log("[data:worker] 无到期订阅。");
    return;
  }

  console.log(`[data:worker] 处理 ${subs.length} 条订阅…`);
  let ok = 0;
  let fail = 0;

  for (const sub of subs) {
    const label = `${sub.instrument.code} ← ${sub.sourceSeriesKey}`;
    process.stdout.write(`  ${label} … `);
    const result = await runDataSubscription(prisma, sub, { force });
    if (result.status === "failed") {
      fail += 1;
      console.log(`FAIL: ${result.error}`);
    } else {
      ok += 1;
      console.log(
        `${result.status} (+${result.rowsUpserted} upsert, skip ${result.rowsSkipped})`,
      );
    }
  }

  console.log(`[data:worker] 完成：${ok} 成功/跳过，${fail} 失败。`);

  if (process.env.DATA_LAG_ALERT_AFTER_WORKER?.trim() === "1") {
    const { runLagAlerts } = await import("../../src/lib/data/scheduler/lagAlerts");
    const lag = await runLagAlerts(prisma);
    if (lag.alerts.length > 0) {
      console.log(
        `[data:worker] 滞后告警 ${lag.alerts.length} 条，通知 ${lag.toNotify.length}（抑制 ${lag.suppressed}）`,
      );
    }
  }

  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
