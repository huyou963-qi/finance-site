import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { normalizeWatchlistTabOrder, orderWatchlistStocks } from "./marketWatchlist";
import type { SymbolSearchItem } from "./symbolSearchTypes";

export class WatchlistStoreError extends Error {
  constructor(public readonly code: "GROUP_NOT_FOUND" | "WATCHLIST_TOO_LARGE", message: string) { super(message); }
}

export async function listMarketWatchlist(userId: string, maxRows?: number) {
  const [stocks, groups, user] = await Promise.all([prisma.userMarketWatchlistItem.findMany({
    where: { userId }, take: maxRows === undefined ? undefined : maxRows + 1,
    select: { symbol: true, name: true, exchange: true, groupId: true },
    orderBy: [{ createdAt: "asc" }, { symbol: "asc" }],
  }), prisma.userMarketWatchlistGroup.findMany({ where: { userId }, take: maxRows === undefined ? undefined : maxRows + 1, select: { id: true, name: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }), prisma.user.findUnique({ where: { id: userId }, select: { marketWatchlistTabOrder: true, marketWatchlistStockOrder: true } })]);
  if (maxRows !== undefined && (stocks.length > maxRows || groups.length > maxRows)) {
    throw new WatchlistStoreError("WATCHLIST_TOO_LARGE", "自选股数量超过 AI 查询范围，请在网站查看");
  }
  return { stocks: orderWatchlistStocks(stocks, user?.marketWatchlistStockOrder), groups, tabOrder: normalizeWatchlistTabOrder(groups, user?.marketWatchlistTabOrder) };
}

/** Batch insert uses the website's one-row-per-user-and-symbol constraint. */
export async function addMarketWatchlistItems(userId: string, stocks: SymbolSearchItem[], groupId: string | null) {
  return prisma.$transaction(async tx => {
    if (groupId) {
      const group = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM public."UserMarketWatchlistGroup"
        WHERE "userId" = ${userId} AND id = ${groupId} FOR KEY SHARE
      `;
      if (!group.length) throw new WatchlistStoreError("GROUP_NOT_FOUND", "未找到你自己的自选分组");
    }
    const inserted = await tx.userMarketWatchlistItem.createManyAndReturn({
      data: stocks.map(({ symbol, name, exchange }) => ({ userId, symbol, name, exchange, groupId })),
      skipDuplicates: true, select: { symbol: true },
    });
    const created = new Set(inserted.map(row => row.symbol));
    return stocks.map(({ symbol }) => ({ symbol, added: created.has(symbol) }));
  }).catch(error => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003" && groupId) {
      throw new WatchlistStoreError("GROUP_NOT_FOUND", "自选分组已变化，请重新读取");
    }
    throw error;
  });
}
