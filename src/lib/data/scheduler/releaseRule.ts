import type { DataGranularity } from "@prisma/client";

/** Investing 日历匹配快照（写入 releaseRule.calendarMatch） */
export type CalendarMatchSnapshot = {
  eventId: string;
  title: string;
  releaseAt: string;
  syncedAt: string;
  source?: string;
};

export type CalendarSyncStatus =
  | "matched"
  | "no_match"
  | "fetch_failed"
  | "no_mapping"
  | "probe_only";

export type CalendarSyncMeta = {
  status: CalendarSyncStatus;
  message?: string;
  syncedAt: string;
};

/** 发布/探测规则（存于 DataSubscription.releaseRule JSON） */
export type ReleaseRule =
  | {
      type: "probe_interval";
      /** 成功后距下次探测的小时数 */
      intervalHours: number;
    }
  | {
      type: "calendar_monthly";
      /** 每月第几天（UTC）起进入高频探测 */
      probeFromDay: number;
      /** 探测窗口内每隔多少小时 probe 一次 */
      intervalHours: number;
      /** 窗口结束日（含） */
      probeUntilDay: number;
    }
  | {
      type: "economic_calendar";
      /** 发布后持续探测间隔（小时），直至抓到新数据或下一日历事件 */
      postReleaseProbeHours: number;
      /** 相对发布时刻的延迟（分钟），避免源端尚未入库 */
      releaseDelayMinutes: number;
      /** 日历拉取失败时回退 */
      fallback?: ReleaseRule;
      calendarMatch?: CalendarMatchSnapshot;
      calendarSync?: CalendarSyncMeta;
    }
  | {
      type: "manual";
    };

export function defaultReleaseRuleForGranularity(
  granularity: DataGranularity,
): ReleaseRule {
  switch (granularity) {
    case "DAILY":
      return { type: "probe_interval", intervalHours: 6 };
    case "WEEKLY":
      return { type: "probe_interval", intervalHours: 12 };
    case "MONTHLY":
      return {
        type: "calendar_monthly",
        probeFromDay: 10,
        intervalHours: 12,
        probeUntilDay: 28,
      };
    case "QUARTERLY":
      return { type: "probe_interval", intervalHours: 72 };
    case "ANNUAL":
      return { type: "probe_interval", intervalHours: 168 };
    default:
      return { type: "probe_interval", intervalHours: 24 };
  }
}

export function parseReleaseRule(raw: unknown): ReleaseRule {
  if (!raw || typeof raw !== "object") {
    return { type: "probe_interval", intervalHours: 24 };
  }
  const r = raw as Record<string, unknown>;
  if (r.type === "manual") return { type: "manual" };
  if (r.type === "economic_calendar") {
    const fallback =
      r.fallback && typeof r.fallback === "object"
        ? parseReleaseRule(r.fallback)
        : { type: "probe_interval" as const, intervalHours: 12 };
    const cm = r.calendarMatch as Record<string, unknown> | undefined;
    const calendarMatch: CalendarMatchSnapshot | undefined =
      cm && typeof cm.releaseAt === "string"
        ? {
            eventId: String(cm.eventId ?? ""),
            title: String(cm.title ?? ""),
            releaseAt: String(cm.releaseAt),
            syncedAt: String(cm.syncedAt ?? ""),
            source: cm.source != null ? String(cm.source) : undefined,
          }
        : undefined;
    const cs = r.calendarSync as Record<string, unknown> | undefined;
    const calendarSync: CalendarSyncMeta | undefined =
      cs && typeof cs.syncedAt === "string"
        ? {
            status: (cs.status as CalendarSyncStatus) ?? "no_match",
            message: cs.message != null ? String(cs.message) : undefined,
            syncedAt: String(cs.syncedAt),
          }
        : undefined;
    return {
      type: "economic_calendar",
      postReleaseProbeHours: Number(r.postReleaseProbeHours) || 2,
      releaseDelayMinutes: Number(r.releaseDelayMinutes) || 3,
      fallback,
      calendarMatch,
      calendarSync,
    };
  }
  if (r.type === "calendar_monthly") {
    return {
      type: "calendar_monthly",
      probeFromDay: Number(r.probeFromDay) || 10,
      intervalHours: Number(r.intervalHours) || 12,
      probeUntilDay: Number(r.probeUntilDay) || 28,
    };
  }
  return {
    type: "probe_interval",
    intervalHours: Number(r.intervalHours) || 24,
  };
}

/** 经济日历规则：根据已同步的 calendarMatch 计算 nextRunAt */
export function nextRunAtFromCalendarRule(
  rule: Extract<ReleaseRule, { type: "economic_calendar" }>,
  from: Date = new Date(),
): Date | null {
  const match = rule.calendarMatch;
  if (!match?.releaseAt) {
    const fb = rule.fallback;
    return fb ? computeNextRunAt(fb, from) : null;
  }
  const releaseAt = new Date(match.releaseAt);
  if (Number.isNaN(releaseAt.getTime())) {
    const fb = rule.fallback;
    return fb ? computeNextRunAt(fb, from) : null;
  }
  const runAt = new Date(
    releaseAt.getTime() + rule.releaseDelayMinutes * 60_000,
  );
  if (runAt > from) return runAt;
  return new Date(from.getTime() + rule.postReleaseProbeHours * 3_600_000);
}

/** 计算下一次应运行时间（从 now 起） */
export function computeNextRunAt(rule: ReleaseRule, from: Date = new Date()): Date | null {
  if (rule.type === "manual") return null;

  if (rule.type === "economic_calendar") {
    return nextRunAtFromCalendarRule(rule, from);
  }

  if (rule.type === "probe_interval") {
    return new Date(from.getTime() + rule.intervalHours * 3_600_000);
  }

  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const day = from.getUTCDate();

  const inWindow = day >= rule.probeFromDay && day <= rule.probeUntilDay;
  if (inWindow) {
    return new Date(from.getTime() + rule.intervalHours * 3_600_000);
  }

  let targetMonth = m;
  let targetYear = y;
  if (day > rule.probeUntilDay) {
    targetMonth += 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
  }

  const next = new Date(Date.UTC(targetYear, targetMonth, rule.probeFromDay, 8, 0, 0));
  if (next <= from) {
    const m2 = targetMonth + 1;
    return new Date(Date.UTC(targetYear + (m2 > 11 ? 1 : 0), m2 % 12, rule.probeFromDay, 8, 0, 0));
  }
  return next;
}

/** 失败后指数退避（小时） */
export function computeBackoffRunAt(retryCount: number, from: Date = new Date()): Date {
  const hours = Math.min(72, Math.pow(2, Math.min(retryCount, 6)));
  return new Date(from.getTime() + hours * 3_600_000);
}

/** 管理页展示用 */
export function summarizeReleaseRule(rule: ReleaseRule): string {
  if (rule.type === "manual") return "手动更新";
  if (rule.type === "economic_calendar") {
    const m = rule.calendarMatch;
    const sync = rule.calendarSync;
    if (m?.releaseAt) {
      const d = new Date(m.releaseAt);
      const when = Number.isNaN(d.getTime())
        ? m.releaseAt
        : d.toISOString().replace("T", " ").slice(0, 16);
      const base = `经济日历：${m.title || "下一发布"} @ ${when} UTC`;
      if (sync?.status === "fetch_failed") return `${base}（日历拉取失败，已回退间隔探测）`;
      if (sync?.status === "no_match") return `${base}（待重新匹配）`;
      return base;
    }
    if (sync?.status === "fetch_failed") {
      return `经济日历未同步（403/网络），回退：${summarizeReleaseRule(rule.fallback ?? { type: "probe_interval", intervalHours: 12 })}`;
    }
    if (sync?.status === "no_match") {
      return "经济日历：窗口内无匹配发布";
    }
    return "经济日历（待 sync-calendar）";
  }
  if (rule.type === "probe_interval") {
    return `每 ${rule.intervalHours} 小时探测一次`;
  }
  return `每月 ${rule.probeFromDay}–${rule.probeUntilDay} 日，每 ${rule.intervalHours} 小时探测`;
}

export function calendarSyncLabel(status: CalendarSyncStatus | null | undefined): string {
  switch (status) {
    case "matched":
      return "已对齐";
    case "no_match":
      return "未匹配";
    case "fetch_failed":
      return "拉取失败";
    case "probe_only":
      return "固定探测";
    case "no_mapping":
      return "无映射";
    default:
      return "未同步";
  }
}

export function defaultEconomicCalendarRule(
  granularity: DataGranularity,
): Extract<ReleaseRule, { type: "economic_calendar" }> {
  const post =
    granularity === "DAILY" ? 4 : granularity === "MONTHLY" ? 2 : 6;
  return {
    type: "economic_calendar",
    postReleaseProbeHours: post,
    releaseDelayMinutes: 3,
    fallback: defaultReleaseRuleForGranularity(granularity),
  };
}
