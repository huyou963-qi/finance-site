import { NextRequest, NextResponse } from "next/server";
import { fetchIbkrAccountIds } from "@/lib/data/ibkrPortfolio";
import {
  fetchIbkrAccountTradesRaw,
  ibkrTradeMatchesSymbol,
  type IbkrTradeRow,
} from "@/lib/data/ibkrTrades";

export type IbkrTradeWire = {
  executionId: string;
  symbol: string;
  side: string;
  tradeTimeSec: number;
  size: number;
  price: number;
  exchange?: string;
  conid?: number;
  orderDescription?: string;
};

function toWire(t: IbkrTradeRow): IbkrTradeWire {
  return {
    executionId: t.executionId,
    symbol: t.symbol,
    side: t.side,
    tradeTimeSec: t.tradeTimeSec,
    size: t.size,
    price: t.price,
    exchange: t.exchange,
    conid: t.conid,
    orderDescription: t.orderDescription,
  };
}

/**
 * GET /api/ibkr/trades?accountId=U123&days=7&symbol=AAPL&conid=
 * accountId 可省略：服务端用当前 Gateway 会话的第一个账户。
 * days: 1–7，与 Gateway `/iserver/account/trades` 一致（更早成交需 Flex/报表）。
 */
export async function GET(req: NextRequest) {
  let accountId = req.nextUrl.searchParams.get("accountId")?.trim() ?? "";
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim() ?? "";
  const conidRaw = req.nextUrl.searchParams.get("conid");
  const conid =
    conidRaw != null && conidRaw !== ""
      ? Number(conidRaw)
      : undefined;
  const days = Number(req.nextUrl.searchParams.get("days") ?? "7");

  if (!symbol) {
    return NextResponse.json(
      { error: "缺少 symbol", trades: [] as IbkrTradeWire[] },
      { status: 400 },
    );
  }

  if (!accountId) {
    try {
      const ids = await fetchIbkrAccountIds();
      accountId = ids[0] ?? "";
    } catch {
      accountId = "";
    }
  }

  if (!accountId) {
    return NextResponse.json({
      trades: [] as IbkrTradeWire[],
      note:
        "未登录 IBKR Gateway 或未解析到账户；无法拉取成交。K 线仍可正常使用。",
    });
  }

  try {
    const all = await fetchIbkrAccountTradesRaw(accountId, days);
    const filtered = all.filter((t) =>
      ibkrTradeMatchesSymbol(t, symbol, Number.isFinite(conid as number) ? conid : undefined),
    );
    return NextResponse.json({
      trades: filtered.map(toWire),
      note:
        "成交范围为 Gateway 支持的最近 ≤7 日；更早记录需在 TWS/报表中查看。",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "加载成交失败";
    return NextResponse.json(
      { error: message, trades: [] as IbkrTradeWire[] },
      { status: 502 },
    );
  }
}
