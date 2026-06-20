import type { PrismaClient } from "@prisma/client";
import { syncSubscriptionsFromInvestingCalendar } from "./applyCalendarSchedules";
import { runLagAlerts } from "./lagAlerts";
import {
  loadInstrumentsForProbe,
  probeInstrumentAcquisition,
  saveProbeResult,
} from "./sourceProbe";
import {
  listDueSubscriptions,
  runDataSubscription,
} from "./runSubscription";

export type SchedulerActionName =
  | "sync_calendar"
  | "run_worker"
  | "run_worker_bis"
  | "run_worker_overview"
  | "run_worker_estat"
  | "reimport_overview_cn"
  | "reimport_overview_jp"
  | "probe_overview"
  | "check_lag_alerts"
  | "sync_one";

export type SchedulerActionResult = {
  action: SchedulerActionName;
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
};

export async function executeSchedulerAction(
  prisma: PrismaClient,
  action: SchedulerActionName,
  options?: { instrumentCode?: string; limit?: number; force?: boolean; dryRun?: boolean },
): Promise<SchedulerActionResult> {
  switch (action) {
    case "sync_calendar": {
      const result = await syncSubscriptionsFromInvestingCalendar(prisma, {
        dryRun: false,
      });
      const matched = result.rows.filter((r) => r.matched).length;
      return {
        action,
        ok: !result.fetchFailed || matched > 0,
        message: `日历事件 ${result.eventsFetched} 条，对齐 ${matched}/${result.rows.length}`,
        details: {
          source: result.source,
          warning: result.warning,
          matched,
          total: result.rows.length,
        },
      };
    }
    case "run_worker":
    case "run_worker_bis":
    case "run_worker_overview":
    case "run_worker_estat": {
      const sourceId =
        action === "run_worker_bis"
          ? "bis"
          : action === "run_worker_estat"
            ? "estat-jp"
            : undefined;
      const overviewOnly = action === "run_worker_overview";
      const limit =
        overviewOnly ? (options?.limit ?? 60) : (options?.limit ?? 25);
      const force = options?.force ?? false;
      let subs = await listDueSubscriptions(prisma, limit, { forceAll: force });
      if (sourceId) {
        if (force) {
          subs = await prisma.dataSubscription.findMany({
            where: { enabled: true, sourceId },
            take: limit,
            orderBy: [{ priority: "desc" }, { nextRunAt: "asc" }],
            include: {
              source: true,
              instrument: { select: { id: true, code: true, name: true } },
            },
          });
        } else {
          subs = subs.filter((s) => s.sourceId === sourceId);
        }
      } else if (overviewOnly) {
        const overviewIds = ["overview-china", "overview-japan"];
        subs = await prisma.dataSubscription.findMany({
          where: { enabled: true, sourceId: { in: overviewIds } },
          take: limit,
          orderBy: [{ priority: "desc" }, { nextRunAt: "asc" }],
          include: {
            source: true,
            instrument: { select: { id: true, code: true, name: true } },
          },
        });
      }
      let ok = 0;
      let fail = 0;
      const errors: string[] = [];
      for (const sub of subs) {
        const r = await runDataSubscription(prisma, sub, { force });
        if (r.status === "failed") {
          fail++;
          errors.push(`${sub.instrument.code}: ${r.error}`);
        } else {
          ok++;
        }
      }
      return {
        action,
        ok: fail === 0,
        message: `处理 ${subs.length} 条：${ok} 成功/跳过，${fail} 失败`,
        details: { processed: subs.length, ok, fail, errors: errors.slice(0, 8) },
      };
    }
    case "reimport_overview_cn":
    case "reimport_overview_jp": {
      const sourceId = action === "reimport_overview_cn" ? "overview-china" : "overview-japan";
      const subs = await prisma.dataSubscription.findMany({
        where: { enabled: true, sourceId },
        orderBy: { instrument: { code: "asc" } },
        include: {
          source: true,
          instrument: { select: { id: true, code: true, name: true } },
        },
      });
      let ok = 0;
      let fail = 0;
      const errors: string[] = [];
      for (const sub of subs) {
        const r = await runDataSubscription(prisma, sub, { force: true });
        if (r.status === "failed") {
          fail++;
          errors.push(`${sub.instrument.code}: ${r.error}`);
        } else {
          ok++;
        }
      }
      return {
        action,
        ok: fail === 0,
        message: `${sourceId} 重导 ${subs.length} 条：${ok} 成功/跳过，${fail} 失败`,
        details: { processed: subs.length, ok, fail, errors: errors.slice(0, 8) },
      };
    }
    case "check_lag_alerts": {
      const result = await runLagAlerts(prisma, {
        dryRun: options?.dryRun,
        force: options?.force,
      });
      return {
        action,
        ok: true,
        message: `滞后 ${result.alerts.length} 条，待通知 ${result.toNotify.length}，抑制 ${result.suppressed}`,
        details: {
          alerts: result.alerts.slice(0, 20),
          toNotify: result.toNotify.slice(0, 10),
          suppressed: result.suppressed,
          emailSent: result.emailSent,
          webhookSent: result.webhookSent,
          slackSent: result.slackSent,
        },
      };
    }
    case "probe_overview": {
      const all = await loadInstrumentsForProbe(prisma, "imported");
      const instruments = all.filter(
        (r) =>
          r.code.startsWith("jpov_") ||
          r.code.startsWith("chov_") ||
          r.code.startsWith("usov_") ||
          r.code.startsWith("debtcap_") ||
          r.code.startsWith("sched_fred_"),
      );
      const fredKey = process.env.FRED_API_KEY?.trim();
      let known = 0;
      let pending = 0;
      for (const inst of instruments.slice(0, 120)) {
        const outcome = await probeInstrumentAcquisition(inst, {
          fredApiKey: fredKey,
          sleepMs: 200,
        });
        await saveProbeResult(prisma, inst.id, inst.metadata, outcome);
        if (outcome.status === "known") known++;
        else pending++;
      }
      return {
        action,
        ok: true,
        message: `探测 ${Math.min(instruments.length, 120)} 条：known ${known}，pending ${pending}`,
        details: { probed: Math.min(instruments.length, 120), known, pending },
      };
    }
    case "sync_one": {
      const code = options?.instrumentCode?.trim();
      if (!code) {
        return { action, ok: false, message: "缺少 instrumentCode" };
      }
      const inst = await prisma.instrument.findUnique({ where: { code } });
      if (!inst) return { action, ok: false, message: `未找到 ${code}` };
      const sub = await prisma.dataSubscription.findUnique({
        where: { instrumentId: inst.id },
        include: {
          source: true,
          instrument: { select: { id: true, code: true, name: true } },
        },
      });
      if (!sub) return { action, ok: false, message: `${code} 无订阅` };
      const r = await runDataSubscription(prisma, sub, { force: true });
      return {
        action,
        ok: r.status !== "failed",
        message:
          r.status === "failed"
            ? r.error ?? "失败"
            : `${code} ${r.status} (+${r.rowsUpserted} 条)`,
        details: { status: r.status, rowsUpserted: r.rowsUpserted },
      };
    }
    default:
      return { action, ok: false, message: "未知 action" };
  }
}

export async function listRecentFetchRuns(
  prisma: PrismaClient,
  options?: { instrumentCode?: string; limit?: number },
) {
  const limit = options?.limit ?? 20;
  const where = options?.instrumentCode
    ? { subscription: { instrument: { code: options.instrumentCode } } }
    : {};

  const rows = await prisma.fetchRun.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: limit,
    include: {
      subscription: {
        include: {
          instrument: { select: { code: true, name: true } },
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    instrumentCode: r.subscription.instrument.code,
    instrumentName: r.subscription.instrument.name,
    sourceId: r.subscription.sourceId,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    status: r.status,
    rowsUpserted: r.rowsUpserted,
    rowsSkipped: r.rowsSkipped,
    error: r.error,
    sourceLagDays: r.sourceLagDays,
  }));
}
