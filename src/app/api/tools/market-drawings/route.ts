import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseWatchlistSymbol } from "@/lib/data/marketWatchlist";
import { validateDrawings } from "@/lib/chart/marketDrawings";
const headers = { "Cache-Control": "private, no-store" };
function scopeOf(req: NextRequest) {
  const symbol = parseWatchlistSymbol(req.nextUrl.searchParams.get("symbol"));
  const source = req.nextUrl.searchParams.get("source") ?? "yahoo";
  const adjust = req.nextUrl.searchParams.get("adjust") ?? "forward";
  if (!/^[\w-]{1,32}$/.test(source) || !["forward", "backward", "none"].includes(adjust)) throw new Error("图表范围不正确");
  return { symbol, scope: `${source}:${symbol}:${adjust}` };
}
export async function GET(req: NextRequest) {
  let scope: string, symbol: string;
  try { ({ scope, symbol } = scopeOf(req)); } catch { return NextResponse.json({ error: "图表范围不正确" }, { status: 400, headers }); }
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ userId: null, cloud: false, drawings: [], revision: 0 }, { headers });
    const [watch, row] = await Promise.all([
      prisma.userMarketWatchlistItem.findUnique({ where: { userId_symbol: { userId: user.id, symbol } }, select: { symbol: true } }),
      prisma.userMarketDrawing.findUnique({ where: { userId_scope: { userId: user.id, scope } } }),
    ]);
    return NextResponse.json({ userId: user.id, cloud: Boolean(watch), drawings: row?.drawings ?? [], revision: row?.revision ?? 0 }, { headers });
  } catch (e) {
    console.error("[market-drawings] load failed", e);
    return NextResponse.json({ error: "无法读取图形，请重试" }, { status: 500, headers });
  }
}
export async function PUT(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "请求来源不正确" }, { status: 403, headers });
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401, headers });
    let body, scope: string, symbol: string, drawings;
    try {
      ({ scope, symbol } = scopeOf(req));
      const raw = await req.text();
      if (raw.length > 300000) throw new Error("图形数据过大");
      body = JSON.parse(raw);
      if (!body || typeof body !== "object" || !Number.isSafeInteger(body.revision) || body.revision < 0) throw new Error("版本不正确");
      drawings = validateDrawings(body.drawings);
    } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "图形格式不正确" }, { status: 400, headers }); }
    if (body.userId !== user.id) return NextResponse.json({ error: "登录账号已变化，请重新加载" }, { status: 409, headers });
    const result = await prisma.$transaction(async tx => {
      const watch = await tx.userMarketWatchlistItem.findUnique({ where: { userId_symbol: { userId: user.id, symbol } } });
      if (!watch) return "local";
      if (body.revision === 0) {
        await tx.userMarketDrawing.create({ data: { userId: user.id, scope, drawings: drawings as unknown as Prisma.InputJsonValue } });
      } else {
        const result = await tx.userMarketDrawing.updateMany({ where: { userId: user.id, scope, revision: body.revision }, data: { drawings: drawings as unknown as Prisma.InputJsonValue, revision: { increment: 1 } } });
        if (!result.count) return "conflict";
      }
      return "ok";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result === "local") return NextResponse.json({ error: "该标的已移出自选股，图形保留在本地" }, { status: 403, headers });
    if (result === "conflict") return NextResponse.json({ error: "另一台设备已修改图形，本地草稿已保留，请选择合并方式", conflict: true }, { status: 409, headers });
    return NextResponse.json({ revision: body.revision + 1 }, { headers });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(e.code)) return NextResponse.json({ error: "另一台设备已修改图形，本地草稿已保留", conflict: true }, { status: 409, headers });
    console.error("[market-drawings] save failed", e);
    return NextResponse.json({ error: "云端保存失败，本地草稿已保留，请重试" }, { status: 500, headers });
  }
}
