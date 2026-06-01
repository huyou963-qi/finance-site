import type { Contract, Execution, IBApi } from "@stoqey/ib";
import { EventName } from "@stoqey/ib";
import type { IbkrTradeRow } from "@/lib/data/ibkrTrades";
import {
  allocIbkrTwsReqId,
  formatTwsFilterTime,
} from "@/lib/data/ibkrTwsShared";
import { withIbkrTwsApi } from "@/lib/data/ibkrTwsConnection";

function parseIbExecutionTime(time?: string): number {
  if (!time?.trim()) return 0;
  const m = time
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    return Math.floor(
      Date.UTC(
        parseInt(m[1]!, 10),
        parseInt(m[2]!, 10) - 1,
        parseInt(m[3]!, 10),
        parseInt(m[4]!, 10),
        parseInt(m[5]!, 10),
        parseInt(m[6]!, 10),
      ) / 1000,
    );
  }
  const ms = Date.parse(time);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

function mapSide(side?: string): string {
  const s = side?.trim().toUpperCase() ?? "";
  if (s === "BOT") return "BUY";
  if (s === "SLD") return "SELL";
  return side?.trim() || "?";
}

function contractSymbol(contract: Contract): string {
  const local =
    typeof contract.localSymbol === "string"
      ? contract.localSymbol.trim()
      : "";
  const sym =
    typeof contract.symbol === "string" ? contract.symbol.trim() : "";
  return local || sym;
}

function rowFromExecution(
  contract: Contract,
  ex: Execution,
): IbkrTradeRow | null {
  const symbol = contractSymbol(contract);
  if (!symbol) return null;
  const price = ex.price;
  if (price == null || !Number.isFinite(price)) return null;
  const size = ex.shares ?? 0;
  if (!Number.isFinite(size)) return null;

  return {
    executionId: ex.execId?.trim() || `${symbol}-${ex.time}-${price}`,
    symbol,
    side: mapSide(ex.side),
    tradeTimeSec: parseIbExecutionTime(ex.time),
    size: Math.abs(size),
    price,
    exchange:
      typeof ex.exchange === "string"
        ? ex.exchange
        : typeof contract.exchange === "string"
          ? contract.exchange
          : undefined,
    conid:
      typeof contract.conId === "number" && contract.conId > 0
        ? contract.conId
        : undefined,
    orderDescription:
      typeof contract.secType === "string" ? contract.secType : undefined,
  };
}

/**
 * TWS reqExecutions — 最近成交（受 IB 保留策略限制，通常约 7 日内可见）。
 */
function fetchIbkrTwsAccountTradesOn(
  ib: IBApi,
  accountId: string,
  days: number,
): Promise<IbkrTradeRow[]> {
  const reqId = allocIbkrTwsReqId();
  const d = Math.min(7, Math.max(1, Math.floor(days)));
  const since = new Date();
  since.setDate(since.getDate() - d);

  const rows: IbkrTradeRow[] = [];

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("TWS reqExecutions 超时（30s）"));
    }, 30_000);

    const onExec = (id: number, contract: Contract, execution: Execution): void => {
      if (id !== reqId) return;
      const row = rowFromExecution(contract, execution);
      if (row) rows.push(row);
    };

    const onEnd = (id: number): void => {
      if (id !== reqId) return;
      cleanup();
      rows.sort((a, b) => b.tradeTimeSec - a.tradeTimeSec);
      resolve(rows);
    };

    const onError = (err: Error, code: number, id: number): void => {
      if (id !== reqId && id !== -1) return;
      cleanup();
      reject(new Error(`TWS reqExecutions 错误 ${code}: ${err.message}`));
    };

    const cleanup = (): void => {
      clearTimeout(timeout);
      ib.off(EventName.execDetails, onExec);
      ib.off(EventName.execDetailsEnd, onEnd);
      ib.off(EventName.error, onError);
    };

    ib.on(EventName.execDetails, onExec);
    ib.on(EventName.execDetailsEnd, onEnd);
    ib.on(EventName.error, onError);

    ib.reqExecutions(reqId, {
      acctCode: accountId.trim(),
      time: formatTwsFilterTime(since),
    });
  });
}

/**
 * TWS reqExecutions — 最近成交（受 IB 保留策略限制，通常约 7 日内可见）。
 */
export async function fetchIbkrTwsAccountTradesRaw(
  accountId: string,
  days: number,
): Promise<IbkrTradeRow[]> {
  return withIbkrTwsApi((ib) =>
    fetchIbkrTwsAccountTradesOn(ib, accountId, days),
  );
}
