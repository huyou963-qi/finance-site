import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseWatchlistItem, parseWatchlistSymbol } from "@/lib/data/marketWatchlist";

const headers = { "Cache-Control": "private, no-store" };

async function list(userId: string) {
  return prisma.userMarketWatchlistItem.findMany({
    where: { userId },
    select: { symbol: true, name: true, exchange: true },
    orderBy: [{ createdAt: "asc" }, { symbol: "asc" }],
  });
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    return NextResponse.json({ userId: user?.id ?? null, stocks: user ? await list(user.id) : [] }, { headers });
  } catch (error) {
    console.error("[market-watchlist] load failed", error);
    return NextResponse.json({ error: "无法加载自选股，请稍后重试" }, { status: 500, headers });
  }
}

async function mutate(req: NextRequest, remove: boolean) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401, headers });
    let body: { userId?: unknown; stock?: unknown; symbol?: unknown };
    try {
      body = await req.json();
      if (!body || typeof body !== "object") throw new Error();
    } catch {
      return NextResponse.json({ error: "请求格式不正确" }, { status: 400, headers });
    }
    // 客户端 ID 只用于识别过期页面；数据所属用户始终由服务端会话决定。
    if (body.userId !== user.id) return NextResponse.json({ error: "登录账号已变化，请重新加载自选股" }, { status: 409, headers });
    let stock;
    let symbol;
    try {
      if (remove) symbol = parseWatchlistSymbol(body.symbol);
      else stock = parseWatchlistItem(body.stock);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "自选股格式不正确" }, { status: 400, headers });
    }
    if (stock) {
      await prisma.userMarketWatchlistItem.upsert({
        where: { userId_symbol: { userId: user.id, symbol: stock.symbol } },
        create: { userId: user.id, ...stock },
        update: { name: stock.name, exchange: stock.exchange },
      });
    } else if (symbol) {
      await prisma.userMarketWatchlistItem.deleteMany({ where: { userId: user.id, symbol } });
    }
    return NextResponse.json({ userId: user.id, stocks: await list(user.id) }, { headers });
  } catch (error) {
    console.error("[market-watchlist] save failed", error);
    return NextResponse.json({ error: "无法保存自选股，请稍后重试" }, { status: 500, headers });
  }
}

export async function POST(req: NextRequest) { return mutate(req, false); }
export async function DELETE(req: NextRequest) { return mutate(req, true); }
