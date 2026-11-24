import { prisma } from "@/lib/prisma";
import { PRODUCT_USAGE_AUDIENCES } from "@/lib/analytics/usageTypes";
import { addShanghaiDays, shanghaiDayBounds } from "@/lib/analytics/usageShanghaiDate";

type AggRow = {
  uv: number;
  pv: number;
  sessionCount: number;
  activeMsSum: number;
  returningUv: number;
};

function actorKey(userId: string | null, guestId: string | null): string | null {
  if (userId) return `u:${userId}`;
  if (guestId) return `g:${guestId}`;
  return null;
}

type Bucket = {
  actors: Set<string>;
  sessions: Set<string>;
  pv: number;
  activeMsSum: number;
};

function emptyBucket(): Bucket {
  return { actors: new Set(), sessions: new Set(), pv: 0, activeMsSum: 0 };
}

async function loadPrevActorsByAudience(dateStr: string): Promise<Map<string, Set<string>>> {
  const prevStr = addShanghaiDays(dateStr, -1);
  const { start, end } = shanghaiDayBounds(prevStr);
  const prevEvents = await prisma.usageEvent.findMany({
    where: {
      createdAt: { gte: start, lt: end },
      audience: { in: [...PRODUCT_USAGE_AUDIENCES] },
    },
    select: { userId: true, guestId: true, audience: true },
  });
  const out = new Map<string, Set<string>>();
  const all = new Set<string>();
  for (const e of prevEvents) {
    const key = actorKey(e.userId, e.guestId);
    if (!key) continue;
    let set = out.get(e.audience);
    if (!set) {
      set = new Set();
      out.set(e.audience, set);
    }
    set.add(key);
    all.add(key);
  }
  out.set("all", all);
  return out;
}

function returningCount(actors: Set<string>, prev: Set<string> | undefined): number {
  if (!prev || !actors.size) return 0;
  let n = 0;
  for (const a of actors) {
    if (prev.has(a)) n += 1;
  }
  return n;
}

/**
 * 从明细即时汇总某一上海日（用于「今日」尚未跑完日聚合时）。
 * 仅统计产品受众（排除 admin）；另含 audience=`all` 去重合计行。
 */
export async function liveAggregateDay(dateStr: string): Promise<{
  siteByAudience: Map<string, AggRow>;
  featureByAudience: Map<string, Map<string, AggRow>>;
}> {
  const { start, end } = shanghaiDayBounds(dateStr);
  const [events, prevActors] = await Promise.all([
    prisma.usageEvent.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        audience: { in: [...PRODUCT_USAGE_AUDIENCES] },
      },
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
    loadPrevActorsByAudience(dateStr),
  ]);

  const site = new Map<string, Bucket>();
  const feature = new Map<string, Map<string, Bucket>>();
  const allSite = emptyBucket();

  const touchSite = (audience: string) => {
    let b = site.get(audience);
    if (!b) {
      b = emptyBucket();
      site.set(audience, b);
    }
    return b;
  };
  const touchFeat = (featureId: string, audience: string) => {
    let byAud = feature.get(featureId);
    if (!byAud) {
      byAud = new Map();
      feature.set(featureId, byAud);
    }
    let b = byAud.get(audience);
    if (!b) {
      b = emptyBucket();
      byAud.set(audience, b);
    }
    return b;
  };

  for (const e of events) {
    const actor = actorKey(e.userId, e.guestId);
    const s = touchSite(e.audience);
    if (actor) {
      s.actors.add(actor);
      allSite.actors.add(actor);
    }
    s.sessions.add(e.sessionId);
    allSite.sessions.add(e.sessionId);
    if (e.kind === "page_view") {
      s.pv += 1;
      allSite.pv += 1;
    }
    if (e.activeMs > 0) {
      s.activeMsSum += e.activeMs;
      allSite.activeMsSum += e.activeMs;
    }

    if (e.featureId) {
      const f = touchFeat(e.featureId, e.audience);
      if (actor) f.actors.add(actor);
      f.sessions.add(e.sessionId);
      if (e.kind === "page_view") f.pv += 1;
      if (e.activeMs > 0) f.activeMsSum += e.activeMs;
    }
  }

  const toRow = (b: Bucket, audience: string): AggRow => ({
    uv: b.actors.size,
    pv: b.pv,
    sessionCount: b.sessions.size,
    activeMsSum: b.activeMsSum,
    returningUv: returningCount(b.actors, prevActors.get(audience)),
  });

  const siteByAudience = new Map<string, AggRow>();
  for (const [aud, b] of site) siteByAudience.set(aud, toRow(b, aud));
  siteByAudience.set("all", toRow(allSite, "all"));

  const featureByAudience = new Map<string, Map<string, AggRow>>();
  for (const [fid, byAud] of feature) {
    const m = new Map<string, AggRow>();
    for (const [aud, b] of byAud) m.set(aud, toRow(b, aud));
    featureByAudience.set(fid, m);
  }

  return { siteByAudience, featureByAudience };
}

/** 区间内去重活跃身份数（产品受众）。 */
export async function actorDistinctFromEvents(start: Date, end: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT COALESCE('u:' || user_id, 'g:' || guest_id) AS actor
      FROM usage_event
      WHERE created_at >= ${start}
        AND created_at < ${end}
        AND audience IN ('guest', 'standard', 'pro')
        AND (user_id IS NOT NULL OR guest_id IS NOT NULL)
      GROUP BY 1
    ) t
  `;
  return Number(rows[0]?.n ?? BigInt(0));
}
