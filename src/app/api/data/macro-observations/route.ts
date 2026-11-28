import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkFeatureAccess } from "@/lib/access/featureAccess";
import { MARKET_ADVANCED_OVERLAYS_FEATURE_ID } from "@/lib/access/featureCatalog";
import { DEFAULT_LAG_DAYS, periodEnd, resolveLagDays } from "@/lib/data/macroAsOf";

function parseDay(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
}

/**
 * GET /api/data/macro-observations?instrumentId=&from=&to=&limit=
 * 读取 mds.MacroObservation。instrumentId 为 Instrument.id（UUID）。
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const instrumentId = url.searchParams.get("instrumentId")?.trim();
  if (!instrumentId) {
    return NextResponse.json({ error: "缺少 instrumentId" }, { status: 400 });
  }

  const includeAvailability = url.searchParams.get("timing") === "available";
  if (includeAvailability && !(await checkFeatureAccess(MARKET_ADVANCED_OVERLAYS_FEATURE_ID)).allowed) {
    return NextResponse.json({ error: "当前账号无法使用高级行情叠加" }, { status: 403 });
  }
  if (includeAvailability && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(instrumentId)) {
    return NextResponse.json({ error: "未找到标的" }, { status: 404 });
  }
  const from = url.searchParams.get("from")?.trim();
  const to = url.searchParams.get("to")?.trim();
  const limit = Math.min(
    includeAvailability ? 20000 : 5000,
    Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 500)),
  );

  if (!from && to) {
    return NextResponse.json(
      { error: "单独指定 to 时请同时指定 from" },
      { status: 400 },
    );
  }

  const inst = await prisma.instrument.findUnique({
    where: { id: instrumentId },
    select: { id: true, code: true, name: true, ...(includeAvailability ? { freqLabel: true } : {}) },
  });
  if (!inst) {
    return NextResponse.json({ error: "未找到标的" }, { status: 404 });
  }

  const filter: Prisma.MacroObservationWhereInput = { instrumentId };
  if (from && to) {
    filter.obsDate = { gte: parseDay(from), lte: parseDay(to) };
  } else if (from) {
    filter.obsDate = { gte: parseDay(from) };
  }

  const rows = await prisma.macroObservation.findMany({
    where: filter,
    orderBy: { obsDate: includeAvailability ? "desc" : "asc" },
    take: limit,
    select: {
      obsDate: true,
      value: true,
    },
  });

  const points = rows.map(row => ({ date: row.obsDate.toISOString().slice(0, 10), value: row.value }));
  if (!includeAvailability || !rows.length) {
    return NextResponse.json({ instrument: inst, points, count: rows.length });
  }
  points.reverse();
  const [timing, vintages] = await Promise.all([
    resolveLagDays(instrumentId),
    prisma.macroObservationVintage.findMany({
      where: { instrumentId, realtimeStart: { not: null }, isInitialRelease: true,
        obsDate: { gte: rows.at(-1)!.obsDate, lte: rows[0]!.obsDate } },
      distinct: ["obsDate"],
      orderBy: [{ obsDate: "asc" }, { availableAt: "asc" }],
      select: { obsDate: true, availableAt: true, value: true },
    }),
  ]);
  const official = new Map(vintages.map(row => [row.obsDate.toISOString().slice(0, 10), row]));
  const label = inst.freqLabel ?? "";
  const fallback = /日|daily/i.test(label) ? "DAILY" : /周|weekly/i.test(label) ? "WEEKLY" :
    /季|quarter/i.test(label) ? "QUARTERLY" : /年|annual/i.test(label) ? "ANNUAL" : timing.granularity;
  const granularity = timing.lagSource === "default" ? fallback : timing.granularity;
  const lag = granularity === timing.granularity ? timing.lagDays : DEFAULT_LAG_DAYS[granularity];
  const available = points.map(point => {
    const release = official.get(point.date);
    const date = release?.availableAt ?? new Date(Date.parse(periodEnd(point.date, granularity)) + lag * 86400000);
    return { date: date.toISOString().slice(0, 10), value: release?.value ?? point.value };
  });
  return NextResponse.json({ instrument: inst, points, count: rows.length, available, timingEstimated: official.size < points.length });
}
