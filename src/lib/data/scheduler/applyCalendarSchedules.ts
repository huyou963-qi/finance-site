import type { PrismaClient } from "@prisma/client";
import {
  defaultCalendarWindow,
  fetchInvestingEconomicCalendar,
} from "./investingCalendar/client";
import type { EconomicCalendarEvent } from "./investingCalendar/types";
import {
  calendarSpecForSubscription,
  countryIdsForSpec,
  findNextCalendarRelease,
  subscriptionUsesCalendarSync,
} from "./investingEventMap";
import {
  computeNextRunAt,
  defaultEconomicCalendarRule,
  nextRunAtFromCalendarRule,
  parseReleaseRule,
  type CalendarMatchSnapshot,
  type CalendarSyncMeta,
  type ReleaseRule,
} from "./releaseRule";

export type CalendarSyncRow = {
  subscriptionId: string;
  instrumentCode: string;
  matched: boolean;
  nextRunAt: Date | null;
  eventTitle?: string;
  releaseAt?: string;
  message?: string;
  syncStatus?: CalendarSyncMeta["status"];
};

export type CalendarSyncResult = {
  eventsFetched: number;
  source: string;
  warning?: string;
  fetchFailed: boolean;
  rows: CalendarSyncRow[];
};

function asEconomicCalendarRule(rule: ReleaseRule): Extract<ReleaseRule, { type: "economic_calendar" }> {
  if (rule.type === "economic_calendar") return rule;
  return defaultEconomicCalendarRule("MONTHLY");
}

function fallbackNextRunAt(rule: ReleaseRule, from: Date): Date | null {
  const ec = rule.type === "economic_calendar" ? rule : null;
  const fb =
    ec?.fallback ??
    (rule.type !== "manual" ? rule : { type: "probe_interval" as const, intervalHours: 12 });
  return computeNextRunAt(fb, from);
}

function patchCalendarRule(
  rule: ReleaseRule,
  patch: {
    calendarMatch?: CalendarMatchSnapshot;
    calendarSync: CalendarSyncMeta;
  },
): Extract<ReleaseRule, { type: "economic_calendar" }> {
  const base = asEconomicCalendarRule(rule);
  return {
    ...base,
    ...(patch.calendarMatch ? { calendarMatch: patch.calendarMatch } : {}),
    calendarSync: patch.calendarSync,
  };
}

function collectCountryIds(
  subs: { sourceSeriesKey: string; instrument: { code: string } }[],
): number[] {
  const ids = new Set<number>();
  for (const s of subs) {
    if (!subscriptionUsesCalendarSync(s.sourceSeriesKey, s.instrument.code)) continue;
    const spec = calendarSpecForSubscription(s.sourceSeriesKey, s.instrument.code);
    if (spec) countryIdsForSpec(spec).forEach((id) => ids.add(id));
  }
  return [...ids];
}

async function persistSubscription(
  prisma: PrismaClient,
  subId: string,
  data: { releaseRule?: ReleaseRule; nextRunAt: Date | null },
  dryRun?: boolean,
) {
  if (dryRun) return;
  await prisma.dataSubscription.update({
    where: { id: subId },
    data: {
      ...(data.releaseRule ? { releaseRule: data.releaseRule as object } : {}),
      nextRunAt: data.nextRunAt,
    },
  });
}

/** 从 Investing 经济日历刷新订阅的 nextRunAt（在发布时刻触发 worker） */
export async function syncSubscriptionsFromInvestingCalendar(
  prisma: PrismaClient,
  options?: { subscriptionIds?: string[]; dryRun?: boolean },
): Promise<CalendarSyncResult> {
  const subs = await prisma.dataSubscription.findMany({
    where: {
      enabled: true,
      ...(options?.subscriptionIds?.length
        ? { id: { in: options.subscriptionIds } }
        : {}),
    },
    include: {
      instrument: { select: { code: true, name: true } },
    },
  });

  const window = defaultCalendarWindow();
  const countryIds = collectCountryIds(subs);
  const fetchResult = await fetchInvestingEconomicCalendar({
    ...window,
    countryIds: countryIds.length ? countryIds : undefined,
  });

  const events = fetchResult.events;
  const fetchFailed = events.length === 0 && Boolean(fetchResult.warning);
  const rows: CalendarSyncRow[] = [];
  const now = new Date();

  for (const sub of subs) {
    const rule = parseReleaseRule(sub.releaseRule);

    if (!subscriptionUsesCalendarSync(sub.sourceSeriesKey, sub.instrument.code)) {
      rows.push({
        subscriptionId: sub.id,
        instrumentCode: sub.instrument.code,
        matched: false,
        nextRunAt: sub.nextRunAt,
        message: "固定间隔探测（无日历）",
        syncStatus: "probe_only",
      });
      continue;
    }

    if (fetchFailed) {
      const nextRunAt = fallbackNextRunAt(rule, now);
      const newRule = patchCalendarRule(rule, {
        calendarSync: {
          status: "fetch_failed",
          message: fetchResult.warning?.slice(0, 500),
          syncedAt: now.toISOString(),
        },
      });
      await persistSubscription(
        prisma,
        sub.id,
        { releaseRule: newRule, nextRunAt },
        options?.dryRun,
      );
      rows.push({
        subscriptionId: sub.id,
        instrumentCode: sub.instrument.code,
        matched: false,
        nextRunAt,
        message: "日历拉取失败，已回退间隔探测",
        syncStatus: "fetch_failed",
      });
      continue;
    }

    const spec = calendarSpecForSubscription(sub.sourceSeriesKey, sub.instrument.code);
    if (!spec) {
      rows.push({
        subscriptionId: sub.id,
        instrumentCode: sub.instrument.code,
        matched: false,
        nextRunAt: sub.nextRunAt,
        message: "无日历映射",
        syncStatus: "no_mapping",
      });
      continue;
    }

    const nextEvent = findNextCalendarRelease(events, spec, now);

    if (!nextEvent) {
      const nextRunAt = fallbackNextRunAt(rule, now);
      const newRule = patchCalendarRule(rule, {
        calendarSync: {
          status: "no_match",
          message: "21 天窗口内未匹配到发布事件",
          syncedAt: now.toISOString(),
        },
      });
      await persistSubscription(
        prisma,
        sub.id,
        { releaseRule: newRule, nextRunAt },
        options?.dryRun,
      );
      rows.push({
        subscriptionId: sub.id,
        instrumentCode: sub.instrument.code,
        matched: false,
        nextRunAt,
        message: "日历中未找到下一发布，已回退间隔探测",
        syncStatus: "no_match",
      });
      continue;
    }

    const snapshot: CalendarMatchSnapshot = {
      eventId: nextEvent.eventId,
      title: nextEvent.title,
      releaseAt: nextEvent.releaseAt.toISOString(),
      syncedAt: now.toISOString(),
      source: fetchResult.source,
    };

    const newRule = patchCalendarRule(rule, {
      calendarMatch: snapshot,
      calendarSync: {
        status: "matched",
        syncedAt: now.toISOString(),
      },
    });
    const nextRunAt = nextRunAtFromCalendarRule(newRule, now);

    await persistSubscription(
      prisma,
      sub.id,
      { releaseRule: newRule, nextRunAt },
      options?.dryRun,
    );

    rows.push({
      subscriptionId: sub.id,
      instrumentCode: sub.instrument.code,
      matched: true,
      nextRunAt,
      eventTitle: nextEvent.title,
      releaseAt: snapshot.releaseAt,
      syncStatus: "matched",
    });
  }

  return {
    eventsFetched: events.length,
    source: fetchResult.source,
    warning: fetchResult.warning,
    fetchFailed,
    rows,
  };
}

/** 拉取成功后：若已过发布窗口则尽快安排下一次日历同步探测 */
export function scheduleAfterSuccessfulFetch(
  rule: ReleaseRule,
  hadNewData: boolean,
  from: Date = new Date(),
): Date | null {
  if (rule.type !== "economic_calendar") {
    return computeNextRunAt(rule, from);
  }

  const match = rule.calendarMatch;
  if (!match?.releaseAt) {
    return rule.fallback ? computeNextRunAt(rule.fallback, from) : null;
  }

  const releaseAt = new Date(match.releaseAt);
  const delayed = new Date(
    releaseAt.getTime() + rule.releaseDelayMinutes * 60_000,
  );

  if (from < delayed) {
    return delayed;
  }

  if (!hadNewData) {
    return new Date(from.getTime() + rule.postReleaseProbeHours * 3_600_000);
  }

  return new Date(from.getTime() + rule.postReleaseProbeHours * 3_600_000);
}

export function filterEventsForDebug(events: EconomicCalendarEvent[], limit = 20) {
  return events.slice(0, limit).map((e) => ({
    id: e.eventId,
    title: e.title,
    country: e.countryCode,
    at: e.releaseAt.toISOString(),
  }));
}
