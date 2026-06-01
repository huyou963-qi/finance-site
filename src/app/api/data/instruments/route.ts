import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { InstrumentKind } from "@prisma/client";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/data/instruments?q=&kind=&limit=
 * 统一标的目录（mds）。业务引用优先使用 id（UUID）或 code（稳定短码）。
 */
export async function GET(request: NextRequest) {
  const user = await getUserByRequest(request);
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const kindParam = url.searchParams.get("kind")?.trim();
  const codesParam = url.searchParams.get("codes")?.trim() ?? "";
  const codes = [
    ...new Set(
      codesParam
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, 300);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 100));

  const kind =
    kindParam && (Object.keys(InstrumentKind) as string[]).includes(kindParam)
      ? (kindParam as InstrumentKind)
      : undefined;

  const where = {
    ...(kind ? { kind } : {}),
    ...(codes.length > 0 ? { code: { in: codes } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { code: { contains: q, mode: "insensitive" as const } },
            { tickerSymbol: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.instrument.findMany({
        where,
        take: codes.length > 0 ? Math.max(codes.length, limit) : limit,
        orderBy: { name: "asc" },
        select: {
          id: true,
          code: true,
          kind: true,
          name: true,
          shortName: true,
          freqLabel: true,
          unit: true,
          categoryId: true,
          category: { select: { id: true, code: true, name: true } },
          fredSeriesId: true,
          exchange: true,
          tickerSymbol: true,
          metadata: true,
          updatedAt: true,
        },
      }),
      prisma.instrument.count({ where }),
    ]);
    return NextResponse.json({
      items,
      total,
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    return NextResponse.json({ error: err.message ?? "查询失败" }, { status: 500 });
  }
}
