import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminErrorResponse, requireAdmin } from "@/lib/auth/requireAdmin";
import {
  ANALYTICS_RANGE_DAYS,
  shanghaiDayKey,
  shanghaiDayKeys,
  shanghaiDayStart,
  type AnalyticsDailyRow,
  type AnalyticsSummary,
  type DeviceType,
} from "@/lib/analytics/pageView";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const daysRaw = Number(new URL(req.url).searchParams.get("days") || "30");
    const days = (ANALYTICS_RANGE_DAYS as readonly number[]).includes(daysRaw) ? daysRaw : 30;

    const now = new Date();
    const start = shanghaiDayStart(now, days - 1);
    // created_at 为 UTC 墙上时间（timestamp without tz），参数同口径传入
    const startTs = start.toISOString();
    const onlineTs = new Date(now.getTime() - 30 * 60_000).toISOString();

    const [daily, totals, online, newVisitors, pages, referrers, devices, usersTotal, usersNew] =
      await Promise.all([
        prisma.$queryRaw<AnalyticsDailyRow[]>`
          SELECT to_char(("created_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS day,
                 count(*)::int AS pv,
                 count(DISTINCT "visitor_id")::int AS uv,
                 count(DISTINCT "session_id")::int AS sessions
          FROM "public"."page_view"
          WHERE "created_at" >= ${startTs}::timestamp
          GROUP BY 1`,
        prisma.$queryRaw<{ pv: number; uv: number; sessions: number; loggedInUsers: number }[]>`
          SELECT count(*)::int AS pv,
                 count(DISTINCT "visitor_id")::int AS uv,
                 count(DISTINCT "session_id")::int AS sessions,
                 count(DISTINCT "user_id")::int AS "loggedInUsers"
          FROM "public"."page_view"
          WHERE "created_at" >= ${startTs}::timestamp`,
        prisma.$queryRaw<{ n: number }[]>`
          SELECT count(DISTINCT "visitor_id")::int AS n
          FROM "public"."page_view"
          WHERE "created_at" >= ${onlineTs}::timestamp`,
        prisma.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM (
            SELECT "visitor_id" FROM "public"."page_view"
            GROUP BY "visitor_id"
            HAVING min("created_at") >= ${startTs}::timestamp
          ) t`,
        prisma.$queryRaw<{ path: string; pv: number; uv: number }[]>`
          SELECT "path", count(*)::int AS pv, count(DISTINCT "visitor_id")::int AS uv
          FROM "public"."page_view"
          WHERE "created_at" >= ${startTs}::timestamp
          GROUP BY "path"
          ORDER BY pv DESC
          LIMIT 20`,
        prisma.$queryRaw<{ host: string | null; sessions: number }[]>`
          SELECT "referrer_host" AS host, count(*)::int AS sessions
          FROM "public"."page_view"
          WHERE "created_at" >= ${startTs}::timestamp AND "is_entry"
          GROUP BY "referrer_host"
          ORDER BY sessions DESC
          LIMIT 10`,
        prisma.$queryRaw<{ device: DeviceType; uv: number }[]>`
          SELECT "device", count(DISTINCT "visitor_id")::int AS uv
          FROM "public"."page_view"
          WHERE "created_at" >= ${startTs}::timestamp
          GROUP BY "device"
          ORDER BY uv DESC`,
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: start } } }),
      ]);

    const byDay = new Map(daily.map((r) => [r.day, r]));
    const filled = shanghaiDayKeys(start, days).map(
      (day) => byDay.get(day) ?? { day, pv: 0, uv: 0, sessions: 0 },
    );
    const todayRow = byDay.get(shanghaiDayKey(now));
    const yesterdayRow = byDay.get(shanghaiDayKey(new Date(now.getTime() - 86_400_000)));
    const t = totals[0] ?? { pv: 0, uv: 0, sessions: 0, loggedInUsers: 0 };

    const summary: AnalyticsSummary = {
      days,
      generatedAt: now.toISOString(),
      onlineNow: online[0]?.n ?? 0,
      today: { pv: todayRow?.pv ?? 0, uv: todayRow?.uv ?? 0 },
      yesterday: { pv: yesterdayRow?.pv ?? 0, uv: yesterdayRow?.uv ?? 0 },
      totals: { ...t, newVisitors: newVisitors[0]?.n ?? 0 },
      users: { total: usersTotal, newInRange: usersNew },
      daily: filled,
      pages,
      referrers,
      devices,
    };
    return NextResponse.json(summary);
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}
