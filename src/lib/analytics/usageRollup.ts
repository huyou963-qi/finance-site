import { prisma } from "@/lib/prisma";
import {
  PRODUCT_USAGE_AUDIENCES,
  USAGE_EVENT_RETENTION_DAYS,
  type UsageAudience,
} from "@/lib/analytics/usageTypes";
import {
  addShanghaiDays,
  dateOnlyUtc,
  shanghaiDateString,
  shanghaiDayBounds,
} from "@/lib/analytics/usageShanghaiDate";

type ActorKey = string;

function actorKey(userId: string | null, guestId: string | null): ActorKey | null {
  if (userId) return `u:${userId}`;
  if (guestId) return `g:${guestId}`;
  return null;
}

function isProductAudience(audience: string): boolean {
  return (PRODUCT_USAGE_AUDIENCES as readonly string[]).includes(audience);
}

type Bucket = {
  actors: Set<ActorKey>;
  sessions: Set<string>;
  pv: number;
  activeMsSum: number;
};

function emptyBucket(): Bucket {
  return { actors: new Set(), sessions: new Set(), pv: 0, activeMsSum: 0 };
}

/**
 * 将某一上海日历日的 UsageEvent 聚合成 UsageDailyAgg（按 audience × featureId）。
 * featureId="" 为全站汇总；另写 audience=`all` 去重合计（仅产品受众）。
 */
export async function rollupUsageDay(dateStr: string): Promise<{ rows: number }> {
  const { start, end } = shanghaiDayBounds(dateStr);
  const prevStr = addShanghaiDays(dateStr, -1);
  const prevBounds = shanghaiDayBounds(prevStr);

  const [events, prevEvents] = await Promise.all([
    prisma.usageEvent.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: {
        kind: true,
        audience: true,
        userId: true,
        guestId: true,
        sessionId: true,
        featureId: true,
        activeMs: true,
      },
    }),
    prisma.usageEvent.findMany({
      where: {
        createdAt: { gte: prevBounds.start, lt: prevBounds.end },
        kind: { in: ["page_view", "heartbeat", "session_end"] },
      },
      select: { userId: true, guestId: true, audience: true },
    }),
  ]);

  const prevActorsByAudience = new Map<string, Set<ActorKey>>();
  const prevAll = new Set<ActorKey>();
  for (const e of prevEvents) {
    const key = actorKey(e.userId, e.guestId);
    if (!key) continue;
    let set = prevActorsByAudience.get(e.audience);
    if (!set) {
      set = new Set();
      prevActorsByAudience.set(e.audience, set);
    }
    set.add(key);
    if (isProductAudience(e.audience)) prevAll.add(key);
  }
  prevActorsByAudience.set("all", prevAll);

  /** key = `${audience}\0${featureId}`；featureId 用 "" 表示全站 */
  const buckets = new Map<string, Bucket>();

  const touch = (audience: string, featureId: string): Bucket => {
    const k = `${audience}\0${featureId}`;
    let b = buckets.get(k);
    if (!b) {
      b = emptyBucket();
      buckets.set(k, b);
    }
    return b;
  };

  for (const e of events) {
    const actor = actorKey(e.userId, e.guestId);
    const site = touch(e.audience, "");
    if (actor) site.actors.add(actor);
    site.sessions.add(e.sessionId);
    if (e.kind === "page_view") site.pv += 1;
    if (e.activeMs > 0) site.activeMsSum += e.activeMs;

    if (isProductAudience(e.audience)) {
      const allSite = touch("all", "");
      if (actor) allSite.actors.add(actor);
      allSite.sessions.add(e.sessionId);
      if (e.kind === "page_view") allSite.pv += 1;
      if (e.activeMs > 0) allSite.activeMsSum += e.activeMs;
    }

    if (e.featureId) {
      const feat = touch(e.audience, e.featureId);
      if (actor) feat.actors.add(actor);
      feat.sessions.add(e.sessionId);
      if (e.kind === "page_view") feat.pv += 1;
      if (e.activeMs > 0) feat.activeMsSum += e.activeMs;
    }
  }

  const date = dateOnlyUtc(dateStr);
  let rows = 0;
  for (const [key, bucket] of buckets) {
    const sep = key.indexOf("\0");
    const audience = key.slice(0, sep);
    const featureId = key.slice(sep + 1);
    const prev = featureId === "" ? prevActorsByAudience.get(audience) : undefined;
    let returningUv = 0;
    if (prev) {
      for (const a of bucket.actors) {
        if (prev.has(a)) returningUv += 1;
      }
    }

    await prisma.usageDailyAgg.upsert({
      where: {
        date_audience_featureId: { date, audience, featureId },
      },
      create: {
        date,
        audience,
        featureId,
        uv: bucket.actors.size,
        pv: bucket.pv,
        sessionCount: bucket.sessions.size,
        activeMsSum: BigInt(bucket.activeMsSum),
        returningUv,
      },
      update: {
        uv: bucket.actors.size,
        pv: bucket.pv,
        sessionCount: bucket.sessions.size,
        activeMsSum: BigInt(bucket.activeMsSum),
        returningUv,
      },
    });
    rows += 1;
  }

  // 当天无事件时仍清理该日旧聚合，避免残留
  if (buckets.size === 0) {
    await prisma.usageDailyAgg.deleteMany({ where: { date } });
  }

  return { rows };
}

export async function cleanupExpiredUsageEvents(
  retentionDays = USAGE_EVENT_RETENTION_DAYS,
  now = new Date(),
): Promise<number> {
  const cutoffStr = addShanghaiDays(shanghaiDateString(now), -retentionDays);
  const { start: cutoff } = shanghaiDayBounds(cutoffStr);
  const result = await prisma.usageEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

export async function rollupRecentUsageDays(daysBack = 2): Promise<void> {
  const today = shanghaiDateString();
  for (let i = daysBack; i >= 0; i--) {
    await rollupUsageDay(addShanghaiDays(today, -i));
  }
}

export type { UsageAudience };
