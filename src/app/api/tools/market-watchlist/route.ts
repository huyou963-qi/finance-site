import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeWatchlistTabOrder, validateWatchlistTabOrder, parseWatchlistGroupId, parseWatchlistGroupName, parseWatchlistItem, parseWatchlistSymbol } from "@/lib/data/marketWatchlist";

const headers = { "Cache-Control": "private, no-store" };

async function list(userId: string) {
  const [stocks, groups, user] = await Promise.all([prisma.userMarketWatchlistItem.findMany({
    where: { userId },
    select: { symbol: true, name: true, exchange: true, groupId: true },
    orderBy: [{ createdAt: "asc" }, { symbol: "asc" }],
  }), prisma.userMarketWatchlistGroup.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }), prisma.user.findUnique({ where: { id: userId }, select: { marketWatchlistTabOrder: true } })]);
  return { stocks, groups, tabOrder: normalizeWatchlistTabOrder(groups, user?.marketWatchlistTabOrder) };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    return NextResponse.json({ userId: user?.id ?? null, ...(user ? await list(user.id) : { stocks: [], groups: [] }) }, { headers });
  } catch (error) {
    console.error("[market-watchlist] load failed", error);
    return NextResponse.json({ error: "无法加载自选股，请稍后重试" }, { status: 500, headers });
  }
}

async function mutate(req: NextRequest, remove: boolean) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401, headers });
    let body: { userId?: unknown; stock?: unknown; symbol?: unknown; groupId?: unknown };
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
    let groupId;
    try {
      if (remove) symbol = parseWatchlistSymbol(body.symbol);
      else stock = parseWatchlistItem(body.stock);
      groupId = parseWatchlistGroupId(body.groupId);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "自选股格式不正确" }, { status: 400, headers });
    }
    if (stock) {
      if (groupId && !await prisma.userMarketWatchlistGroup.findUnique({ where: { userId_id: { userId: user.id, id: groupId } } })) return NextResponse.json({ error: "分组不存在，请重新加载" }, { status: 404, headers });
      await prisma.userMarketWatchlistItem.upsert({
        where: { userId_symbol: { userId: user.id, symbol: stock.symbol } },
        create: { userId: user.id, ...stock, groupId },
        update: { name: stock.name, exchange: stock.exchange },
      });
    } else if (symbol) {
      await prisma.userMarketWatchlistItem.deleteMany({ where: { userId: user.id, symbol } });
    }
    return NextResponse.json({ userId: user.id, ...await list(user.id) }, { headers });
  } catch (error) {
    console.error("[market-watchlist] save failed", error);
    return NextResponse.json({ error: "无法保存自选股，请稍后重试" }, { status: 500, headers });
  }
}

export async function POST(req: NextRequest) { return mutate(req, false); }
export async function DELETE(req: NextRequest) { return mutate(req, true); }

export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401, headers });
    const body = await req.json().catch(() => null) as { userId?: unknown; action?: unknown; groupId?: unknown; name?: unknown; symbol?: unknown; order?: unknown } | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "请求格式不正确" }, { status: 400, headers });
    if (body.userId !== user.id) return NextResponse.json({ error: "登录账号已变化，请重新加载自选股" }, { status: 409, headers });
    const action = body.action;
    if (action === "reorderGroups") {
      const groups = await prisma.userMarketWatchlistGroup.findMany({ where: { userId: user.id }, select: { id: true, name: true } });
      let order: string[];
      try { order = validateWatchlistTabOrder(groups, body.order); }
      catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "分组顺序不正确" }, { status: 400, headers }); }
      await prisma.user.update({ where: { id: user.id }, data: { marketWatchlistTabOrder: order } });
      return NextResponse.json({ userId: user.id, ...await list(user.id) }, { headers });
    }
    let groupId: string | null;
    let name: string | undefined;
    let symbol: string | undefined;
    try {
      if (!["createGroup", "renameGroup", "deleteGroup", "moveStock"].includes(String(action))) throw new Error("分组操作不正确");
      groupId = parseWatchlistGroupId(body.groupId);
      if ((action === "renameGroup" || action === "deleteGroup") && !groupId) throw new Error("不能修改默认分组");
      if (action === "createGroup" || action === "renameGroup") name = parseWatchlistGroupName(body.name);
      if (action === "moveStock") symbol = parseWatchlistSymbol(body.symbol);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "分组格式不正确" }, { status: 400, headers });
    }
    if (groupId && !await prisma.userMarketWatchlistGroup.findUnique({ where: { userId_id: { userId: user.id, id: groupId } } })) return NextResponse.json({ error: "分组不存在，请重新加载" }, { status: 404, headers });
    if (action === "createGroup") {
      await prisma.userMarketWatchlistGroup.create({ data: { userId: user.id, name: name! } });
    } else if (action === "renameGroup") {
      await prisma.userMarketWatchlistGroup.update({ where: { userId_id: { userId: user.id, id: groupId! } }, data: { name } });
    } else if (action === "deleteGroup") {
      await prisma.$transaction([
        prisma.userMarketWatchlistItem.updateMany({ where: { userId: user.id, groupId }, data: { groupId: null } }),
        prisma.userMarketWatchlistGroup.deleteMany({ where: { userId: user.id, id: groupId! } }),
      ]);
    } else {
      const result = await prisma.userMarketWatchlistItem.updateMany({ where: { userId: user.id, symbol }, data: { groupId } });
      if (!result.count) return NextResponse.json({ error: "自选股不存在，请重新加载" }, { status: 404, headers });
    }
    return NextResponse.json({ userId: user.id, ...await list(user.id) }, { headers });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "组名已存在" }, { status: 400, headers });
    console.error("[market-watchlist] group change failed", error);
    return NextResponse.json({ error: "无法保存分组，请稍后重试" }, { status: 500, headers });
  }
}
