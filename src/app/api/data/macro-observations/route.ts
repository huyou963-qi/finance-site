import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

  const from = url.searchParams.get("from")?.trim();
  const to = url.searchParams.get("to")?.trim();
  const limit = Math.min(
    5000,
    Math.max(1, Number(url.searchParams.get("limit")) || 500),
  );

  if (!from && to) {
    return NextResponse.json(
      { error: "单独指定 to 时请同时指定 from" },
      { status: 400 },
    );
  }

  const inst = await prisma.instrument.findUnique({
    where: { id: instrumentId },
    select: { id: true, code: true, name: true },
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
    orderBy: { obsDate: "asc" },
    take: limit,
    select: {
      obsDate: true,
      value: true,
    },
  });

  return NextResponse.json({
    instrument: inst,
    points: rows.map((r) => ({
      date: r.obsDate.toISOString().slice(0, 10),
      value: r.value,
    })),
    count: rows.length,
  });
}
