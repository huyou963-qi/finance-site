/**
 * 从官方/第三方经济日历同步各订阅的下一次发布时间 → nextRunAt。
 * 国家统计局发布包只使用国家统计局官网年度日程，不使用 TradingEconomics。
 *
 * npm run data:sync-calendar
 * npm run data:sync-calendar -- --dry-run
 * npm run data:sync-calendar -- --code=sched_fred_CPIAUCSL
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient, SchedulerInvocationStatus } from "@prisma/client";
import {
  filterEventsForDebug,
  syncSubscriptionsFromEconomicCalendars,
} from "../../src/lib/data/scheduler/applyCalendarSchedules";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
let invocationId: string | undefined;

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${prefix}=`));
  return hit?.split("=").slice(1).join("=");
}

async function main() {
  const dryRun = argFlag("dry-run");
  const code = argValue("code");
  const startedAt = new Date();
  console.log(
    `[data:sync-calendar] START ${startedAt.toISOString()} pid=${process.pid} dryRun=${dryRun} code=${code ?? "all"}`,
  );
  const invocation = await prisma.schedulerInvocation.create({
    data: {
      job: "data:sync-calendar",
      startedAt,
      status: SchedulerInvocationStatus.RUNNING,
      metadata: {
        pid: process.pid,
        host: process.env.HOSTNAME ?? null,
        dryRun,
        code: code ?? null,
      },
    },
  });
  invocationId = invocation.id;

  let subscriptionIds: string[] | undefined;
  if (code) {
    const inst = await prisma.instrument.findUnique({ where: { code } });
    if (!inst) {
      throw new Error(`未找到 Instrument: ${code}`);
    }
    const sub = await prisma.dataSubscription.findUnique({
      where: { instrumentId: inst.id },
    });
    if (!sub) {
      throw new Error(`未找到 DataSubscription: ${code}`);
    }
    subscriptionIds = [sub.id];
  }

  console.log(`[data:sync-calendar] 拉取官方/经济日历${dryRun ? "（dry-run）" : ""}…`);
  const result = await syncSubscriptionsFromEconomicCalendars(prisma, {
    subscriptionIds,
    dryRun,
  });

  console.log(
    `[data:sync-calendar] 事件 ${result.eventsFetched} 条，来源 ${result.source}`,
  );
  if (result.warning) console.warn(`  ⚠ ${result.warning}`);

  if (result.eventsFetched > 0 && argFlag("verbose")) {
    const events = await import("../../src/lib/data/scheduler/tradingEconomicsCalendar/client").then(
      (m) =>
        m.fetchTradingEconomicsCalendar(m.defaultCalendarWindow()).then((r) =>
          filterEventsForDebug(r.events, 15),
        ),
    );
    console.log("  样例事件:", events);
  }

  for (const row of result.rows) {
    const mark = row.matched ? "✓" : "·";
    const when = row.nextRunAt?.toISOString() ?? "—";
    const name = row.packageLabelZh ?? row.instrumentCode;
    const members =
      row.memberCount != null && row.memberCount > 0 ? ` · ${row.memberCount} 指标` : "";
    const extra = row.eventTitle ? ` ← ${row.eventTitle}` : row.message ? ` (${row.message})` : "";
    console.log(`  ${mark} ${name}${members} nextRunAt=${when}${extra}`);
  }

  const calendarEligible = result.rows.filter((r) => r.syncStatus !== "probe_only");
  const matched = result.rows.filter((r) => r.matched).length;
  console.log(
    `[data:sync-calendar] END ${new Date().toISOString()} matched=${matched}/${calendarEligible.length} rows=${result.rows.length} events=${result.eventsFetched} source=${result.source}`,
  );
  const noCalendarMatches =
    !dryRun && matched === 0 && result.eventsFetched === 0 && calendarEligible.length > 0;
  await prisma.schedulerInvocation.update({
    where: { id: invocation.id },
    data: {
      finishedAt: new Date(),
      status: result.fetchFailed || noCalendarMatches
        ? SchedulerInvocationStatus.PARTIAL
        : SchedulerInvocationStatus.SUCCESS,
      selectedCount: result.rows.length,
      successCount: matched,
      skippedCount: Math.max(0, result.rows.length - matched),
      failedCount: result.fetchFailed || noCalendarMatches ? 1 : 0,
      error: result.fetchFailed
        ? result.warning?.slice(0, 2000)
        : noCalendarMatches
          ? "no_calendar_matches"
          : null,
    },
  });
  invocationId = undefined;
  if (result.fetchFailed) {
    console.warn(
      "  TE 日历拉取失败，economic_calendar 订阅已回退间隔探测。可检查网络或配置 TE_CALENDAR_COOKIE",
    );
  }
  if (noCalendarMatches) {
    process.exitCode = 2;
  }
}

main()
  .catch(async (e) => {
    if (invocationId) {
      await prisma.schedulerInvocation.update({
        where: { id: invocationId },
        data: {
          finishedAt: new Date(),
          status: SchedulerInvocationStatus.FAILED,
          failedCount: 1,
          error: (e instanceof Error ? e.message : String(e)).slice(0, 2000),
        },
      }).catch(() => undefined);
    }
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
