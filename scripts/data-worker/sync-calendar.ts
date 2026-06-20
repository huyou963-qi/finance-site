/**
 * 从 Investing.com 经济日历同步各订阅的下一次发布时间 → nextRunAt
 *
 * npm run data:sync-calendar
 * npm run data:sync-calendar -- --dry-run
 * npm run data:sync-calendar -- --code=sched_fred_CPIAUCSL
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  filterEventsForDebug,
  syncSubscriptionsFromInvestingCalendar,
} from "../../src/lib/data/scheduler/applyCalendarSchedules";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

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

  let subscriptionIds: string[] | undefined;
  if (code) {
    const inst = await prisma.instrument.findUnique({ where: { code } });
    if (!inst) {
      console.error(`未找到 Instrument: ${code}`);
      process.exit(1);
    }
    const sub = await prisma.dataSubscription.findUnique({
      where: { instrumentId: inst.id },
    });
    if (!sub) {
      console.error(`未找到 DataSubscription: ${code}`);
      process.exit(1);
    }
    subscriptionIds = [sub.id];
  }

  console.log(`[data:sync-calendar] 拉取经济日历${dryRun ? "（dry-run）" : ""}…`);
  const result = await syncSubscriptionsFromInvestingCalendar(prisma, {
    subscriptionIds,
    dryRun,
  });

  console.log(
    `[data:sync-calendar] 事件 ${result.eventsFetched} 条，来源 ${result.source}`,
  );
  if (result.warning) console.warn(`  ⚠ ${result.warning}`);

  if (result.eventsFetched > 0 && argFlag("verbose")) {
    const events = await import("../../src/lib/data/scheduler/investingCalendar/client").then(
      (m) =>
        m.fetchInvestingEconomicCalendar(m.defaultCalendarWindow()).then((r) =>
          filterEventsForDebug(r.events, 15),
        ),
    );
    console.log("  样例事件:", events);
  }

  for (const row of result.rows) {
    const mark = row.matched ? "✓" : "·";
    const when = row.nextRunAt?.toISOString() ?? "—";
    const extra = row.eventTitle ? ` ← ${row.eventTitle}` : row.message ? ` (${row.message})` : "";
    console.log(`  ${mark} ${row.instrumentCode} nextRunAt=${when}${extra}`);
  }

  const calendarEligible = result.rows.filter((r) => r.syncStatus !== "probe_only");
  const matched = result.rows.filter((r) => r.matched).length;
  console.log(
    `[data:sync-calendar] 完成：${matched}/${calendarEligible.length} 条日历订阅已对齐（共 ${result.rows.length} 条）`,
  );
  if (result.fetchFailed) {
    console.warn(
      "  日历拉取失败，economic_calendar 订阅已回退间隔探测。请配置 INVESTING_CALENDAR_COOKIE",
    );
  }
  if (!dryRun && matched === 0 && result.eventsFetched === 0 && calendarEligible.length > 0) {
    process.exit(2);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
