import { prisma } from "@/lib/prisma";
import { FEATURE_CATALOG } from "@/lib/access/featureCatalog";
import { PRODUCT_USAGE_AUDIENCES, type UsageAudience } from "@/lib/analytics/usageTypes";
import {
  addShanghaiDays,
  dateOnlyUtc,
  shanghaiDateString,
  shanghaiDayBounds,
} from "@/lib/analytics/usageShanghaiDate";
import { actorDistinctFromEvents, liveAggregateDay } from "@/lib/analytics/usageLiveAgg";

const FEATURE_LABEL = new Map(FEATURE_CATALOG.map((f) => [f.id, f.label]));

export type AudienceMetrics = {
  audience: UsageAudience | "all";
  dau: number;
  sessions: number;
  pv: number;
  activeMsSum: number;
  avgSessionMs: number;
  avgActiveMsPerUser: number;
};

export type FeatureRankRow = {
  featureId: string;
  label: string;
  pv: number;
  uv: number;
  activeMsSum: number;
};

export type TrendRow = {
  date: string;
  dau: number;
  sessions: number;
  avgSessionMs: number;
  returningRate: number | null;
};

export type UsageTrafficAnalytics = {
  asOf: string;
  timezone: "Asia/Shanghai";
  windows: {
    today: AudienceBreakdown;
    d7: AudienceBreakdown;
    d30: AudienceBreakdown;
  };
  wau: number;
  mau: number;
  features: FeatureRankRow[];
  trend: TrendRow[];
};

type AudienceBreakdown = {
  byAudience: AudienceMetrics[];
  all: AudienceMetrics;
};

function emptyMetrics(audience: UsageAudience | "all"): AudienceMetrics {
  return {
    audience,
    dau: 0,
    sessions: 0,
    pv: 0,
    activeMsSum: 0,
    avgSessionMs: 0,
    avgActiveMsPerUser: 0,
  };
}

function finalize(m: AudienceMetrics): AudienceMetrics {
  return {
    ...m,
    avgSessionMs: m.sessions > 0 ? Math.round(m.activeMsSum / m.sessions) : 0,
    avgActiveMsPerUser: m.dau > 0 ? Math.round(m.activeMsSum / m.dau) : 0,
  };
}

function sumMetrics(rows: AudienceMetrics[]): AudienceMetrics {
  const all = emptyMetrics("all");
  for (const r of rows) {
    all.dau += r.dau;
    all.sessions += r.sessions;
    all.pv += r.pv;
    all.activeMsSum += r.activeMsSum;
  }
  return finalize(all);
}

async function siteAggForDates(dateStrs: string[]): Promise<Map<string, Map<string, { uv: number; pv: number; sessionCount: number; activeMsSum: number; returningUv: number }>>> {
  /** date → audience → metrics */
  const out = new Map<string, Map<string, { uv: number; pv: number; sessionCount: number; activeMsSum: number; returningUv: number }>>();
  if (!dateStrs.length) return out;

  const today = shanghaiDateString();
  const historical = dateStrs.filter((d) => d !== today);
  const needToday = dateStrs.includes(today);

  if (historical.length) {
    const rows = await prisma.usageDailyAgg.findMany({
      where: {
        featureId: "",
        audience: { in: [...PRODUCT_USAGE_AUDIENCES] },
        date: { in: historical.map(dateOnlyUtc) },
      },
    });
    for (const row of rows) {
      // @db.Date 存为 UTC 午夜，ISO 日期部分即上海日历日字符串
      const key = row.date.toISOString().slice(0, 10);
      let byAud = out.get(key);
      if (!byAud) {
        byAud = new Map();
        out.set(key, byAud);
      }
      byAud.set(row.audience, {
        uv: row.uv,
        pv: row.pv,
        sessionCount: row.sessionCount,
        activeMsSum: Number(row.activeMsSum),
        returningUv: row.returningUv,
      });
    }
  }

  if (needToday) {
    const live = await liveAggregateDay(today);
    out.set(today, live.siteByAudience);
  }

  return out;
}

function breakdownFromDateMap(
  dateMap: Map<string, Map<string, { uv: number; pv: number; sessionCount: number; activeMsSum: number; returningUv: number }>>,
  dates: string[],
): AudienceBreakdown {
  const dayCount = Math.max(dates.length, 1);
  const byAudience: AudienceMetrics[] = PRODUCT_USAGE_AUDIENCES.map((audience) => {
    const m = emptyMetrics(audience);
    for (const d of dates) {
      const row = dateMap.get(d)?.get(audience);
      if (!row) continue;
      m.dau += row.uv;
      m.sessions += row.sessionCount;
      m.pv += row.pv;
      m.activeMsSum += row.activeMsSum;
    }
    // 多日窗口：dau 取日均 UV；单日即为当日 DAU
    if (dates.length > 1) {
      m.dau = Math.round(m.dau / dayCount);
      m.sessions = Math.round(m.sessions / dayCount);
      m.pv = Math.round(m.pv / dayCount);
      m.activeMsSum = Math.round(m.activeMsSum / dayCount);
    }
    return finalize(m);
  });
  return { byAudience, all: sumMetrics(byAudience) };
}

export async function getUsageTrafficAnalytics(now = new Date()): Promise<UsageTrafficAnalytics> {
  const today = shanghaiDateString(now);
  const last7 = Array.from({ length: 7 }, (_, i) => addShanghaiDays(today, -i));
  const last30 = Array.from({ length: 30 }, (_, i) => addShanghaiDays(today, -i));

  // Ensure today (and yesterday) rollup-friendly: live path for today; historical from agg
  const dateMap = await siteAggForDates(last30);

  const todayBreakdown = breakdownFromDateMap(dateMap, [today]);
  // Recompute today per-audience with true unique (already unique in live/agg for one day)
  const d7Breakdown = breakdownFromDateMap(dateMap, last7);
  const d30Breakdown = breakdownFromDateMap(dateMap, last30);

  // Unique WAU / MAU from raw events (within retention)
  const weekBounds = shanghaiDayBounds(addShanghaiDays(today, -6));
  const monthBounds = shanghaiDayBounds(addShanghaiDays(today, -29));
  const todayEnd = shanghaiDayBounds(today).end;

  const [wauActors, mauActors] = await Promise.all([
    actorDistinctFromEvents(weekBounds.start, todayEnd),
    actorDistinctFromEvents(monthBounds.start, todayEnd),
  ]);

  // Feature ranking: last 7 days (agg + today live)
  const featureTotals = new Map<string, { pv: number; uv: number; activeMsSum: number }>();
  const histFeatureRows = await prisma.usageDailyAgg.findMany({
    where: {
      featureId: { not: "" },
      audience: { in: [...PRODUCT_USAGE_AUDIENCES] },
      date: { in: last7.filter((d) => d !== today).map(dateOnlyUtc) },
    },
  });
  for (const row of histFeatureRows) {
    const cur = featureTotals.get(row.featureId) ?? { pv: 0, uv: 0, activeMsSum: 0 };
    cur.pv += row.pv;
    cur.uv += row.uv;
    cur.activeMsSum += Number(row.activeMsSum);
    featureTotals.set(row.featureId, cur);
  }
  const todayLive = await liveAggregateDay(today);
  for (const [featureId, byAud] of todayLive.featureByAudience) {
    for (const row of byAud.values()) {
      const cur = featureTotals.get(featureId) ?? { pv: 0, uv: 0, activeMsSum: 0 };
      cur.pv += row.pv;
      cur.uv += row.uv;
      cur.activeMsSum += row.activeMsSum;
      featureTotals.set(featureId, cur);
    }
  }

  const features: FeatureRankRow[] = [...featureTotals.entries()]
    .map(([featureId, v]) => ({
      featureId,
      label: FEATURE_LABEL.get(featureId) ?? featureId,
      pv: v.pv,
      uv: v.uv,
      activeMsSum: v.activeMsSum,
    }))
    .sort((a, b) => b.pv - a.pv || b.uv - a.uv)
    .slice(0, 20);

  const trend: TrendRow[] = last30
    .slice()
    .reverse()
    .map((date) => {
      let dau = 0;
      let sessions = 0;
      let activeMsSum = 0;
      let returningUv = 0;
      for (const audience of PRODUCT_USAGE_AUDIENCES) {
        const row = dateMap.get(date)?.get(audience);
        if (!row) continue;
        dau += row.uv;
        sessions += row.sessionCount;
        activeMsSum += row.activeMsSum;
        returningUv += row.returningUv;
      }
      return {
        date,
        dau,
        sessions,
        avgSessionMs: sessions > 0 ? Math.round(activeMsSum / sessions) : 0,
        returningRate: dau > 0 ? returningUv / dau : null,
      };
    });

  return {
    asOf: now.toISOString(),
    timezone: "Asia/Shanghai",
    windows: {
      today: todayBreakdown,
      d7: d7Breakdown,
      d30: d30Breakdown,
    },
    wau: wauActors,
    mau: mauActors,
    features,
    trend,
  };
}
