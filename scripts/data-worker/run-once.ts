/**
 * 执行所有到期的 DataSubscription（单次，适合 Windows 计划任务 / cron）
 *
 * npm run data:worker
 * npm run data:worker -- --force   # 忽略 nextRunAt，跑全部 enabled
 * npm run data:worker -- --limit=5
 * npm run data:worker -- --source=bis --force
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient, SchedulerInvocationStatus } from "@prisma/client";
import { listDueSubscriptions, runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import { recoverAbandonedSchedulerRuns } from "../../src/lib/data/scheduler/schedulerAudit";

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
  const startedAt = new Date();
  console.log(
    `[data:worker] START ${startedAt.toISOString()} pid=${process.pid} force=${force} limit=${limit} source=${sourceId ?? "all"}`,
  );
  const staleAfterHours = Number(process.env.SCHEDULER_ABANDONED_AFTER_HOURS ?? "6");
  const recovered = await recoverAbandonedSchedulerRuns(prisma, {
    now: startedAt,
    staleAfterHours: Number.isFinite(staleAfterHours) ? staleAfterHours : 6,
  });
  if (recovered.fetchRuns || recovered.invocations) {
    console.warn(
      `[data:worker] 收口中断记录：fetch=${recovered.fetchRuns}, invocation=${recovered.invocations}`,
    );
  }
  const invocation = await prisma.schedulerInvocation.create({
    data: {
      job: "data:worker",
      startedAt,
      status: SchedulerInvocationStatus.RUNNING,
      metadata: {
        pid: process.pid,
        host: process.env.HOSTNAME ?? null,
        force,
        limit,
        sourceId: sourceId ?? null,
      },
    },
  });
  let success = 0;
  let skipped = 0;
  let fail = 0;
  try {
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
            instrument: { select: { id: true, code: true, name: true, metadata: true } },
          },
        });
        subs = all;
      }
    }

    await prisma.schedulerInvocation.update({
      where: { id: invocation.id },
      data: { selectedCount: subs.length },
    });
    if (subs.length === 0) {
      console.log("[data:worker] 无到期订阅。");
    } else {
      console.log(`[data:worker] 处理 ${subs.length} 条订阅…`);
    }

    for (const sub of subs) {
      const label = `${sub.instrument.code} ← ${sub.sourceSeriesKey}`;
      process.stdout.write(`  ${label} … `);
      const result = await runDataSubscription(prisma, sub, { force });
      if (result.status === "failed") {
        fail += 1;
        console.log(`FAIL: ${result.error}`);
      } else {
        if (result.status === "skipped") skipped += 1;
        else success += 1;
        console.log(
          `${result.status} (+${result.rowsUpserted} upsert, skip ${result.rowsSkipped})`,
        );
      }
    }

    const finishedAt = new Date();
    await prisma.schedulerInvocation.update({
      where: { id: invocation.id },
      data: {
        finishedAt,
        status: fail > 0 ? SchedulerInvocationStatus.PARTIAL : SchedulerInvocationStatus.SUCCESS,
        successCount: success,
        skippedCount: skipped,
        failedCount: fail,
      },
    });
    console.log(
      `[data:worker] END ${finishedAt.toISOString()} success=${success} skipped=${skipped} failed=${fail}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.schedulerInvocation.update({
      where: { id: invocation.id },
      data: {
        finishedAt: new Date(),
        status: SchedulerInvocationStatus.FAILED,
        successCount: success,
        skippedCount: skipped,
        failedCount: fail,
        error: message.slice(0, 2000),
      },
    });
    console.error(`[data:worker] ABORT ${new Date().toISOString()} ${message}`);
    throw error;
  }

  if (process.env.DATA_LAG_ALERT_AFTER_WORKER?.trim() === "1") {
    const { runLagAlerts } = await import("../../src/lib/data/scheduler/lagAlerts");
    const lag = await runLagAlerts(prisma);
    if (lag.alerts.length > 0) {
      console.log(
        `[data:worker] 滞后告警 ${lag.alerts.length} 条，通知 ${lag.toNotify.length}（抑制 ${lag.suppressed}）`,
      );
    }
  }

  // 可作为 cron monitor 的冗余入口；复用同一 Stage H heartbeat/告警状态，不创建第二套监控。
  if (process.env.SECTOR_REGIME_MONITOR_AFTER_WORKER?.trim() === "1") {
    try {
      const { monitorSectorRegimeStageH } = await import(
        "../../src/lib/equity/sectorRegimeStageH"
      );
      const monitor = await monitorSectorRegimeStageH();
      console.log(
        `[data:worker] Stage H 监控 ${monitor.alerts.length} 条，通知 ${monitor.notified.length}（抑制 ${monitor.suppressed}）`,
      );
    } catch (error) {
      console.error(`[data:worker] Stage H 监控失败：${error instanceof Error ? error.message : String(error)}`);
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
