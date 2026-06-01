import type { Contract, IBApi } from "@stoqey/ib";
import { EventName } from "@stoqey/ib";
import { getIbkrTwsConnectionOptions } from "@/lib/data/ibkrApiConfig";
import {
  buildSummaryMetrics,
  type IbkrPortfolioAccountBlock,
  type IbkrPortfolioPositionRow,
  type IbkrPortfolioResult,
} from "@/lib/data/ibkrPortfolio";
import type { IbkrWatchlist } from "@/lib/data/ibkrWatchlists";
import {
  allocIbkrTwsReqId,
  twsManagedAccountsOn,
} from "@/lib/data/ibkrTwsShared";
import { withIbkrTwsApi } from "@/lib/data/ibkrTwsConnection";

function num(x: unknown): number | undefined {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function contractToSymbol(contract: Contract): string {
  const local =
    typeof contract.localSymbol === "string"
      ? contract.localSymbol.trim()
      : "";
  const sym =
    typeof contract.symbol === "string" ? contract.symbol.trim() : "";
  return local || sym;
}

async function twsPositionsOn(
  ib: IBApi,
): Promise<Map<string, IbkrPortfolioPositionRow[]>> {
  const byAccount = new Map<string, IbkrPortfolioPositionRow[]>();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("TWS reqPositions 超时（30s）"));
    }, 30_000);

    const onPosition = (
      account: string,
      contract: Contract,
      pos: number,
      avgCost?: number,
    ): void => {
      const qty = Number(pos);
      if (!Number.isFinite(qty) || Math.abs(qty) < 1e-12) return;
      const accountId = account.trim();
      if (!accountId) return;
      const symbol = contractToSymbol(contract);
      if (!symbol) return;

      const row: IbkrPortfolioPositionRow = {
        symbol,
        instrumentLine: symbol,
        exchange:
          typeof contract.exchange === "string"
            ? contract.exchange
            : undefined,
        conid:
          typeof contract.conId === "number" && contract.conId > 0
            ? contract.conId
            : undefined,
        qty,
        avgCost: avgCost != null && Number.isFinite(avgCost) ? avgCost : undefined,
        currency:
          typeof contract.currency === "string"
            ? contract.currency
            : undefined,
        assetClass:
          typeof contract.secType === "string" ? contract.secType : undefined,
      };

      const list = byAccount.get(accountId) ?? [];
      list.push(row);
      byAccount.set(accountId, list);
    };

    const onEnd = (): void => {
      cleanup();
      resolve(byAccount);
    };

    const onError = (err: Error, code: number, reqId: number): void => {
      if (reqId !== -1) return;
      cleanup();
      reject(new Error(`TWS reqPositions 错误 ${code}: ${err.message}`));
    };

    const cleanup = (): void => {
      clearTimeout(timeout);
      ib.off(EventName.position, onPosition);
      ib.off(EventName.positionEnd, onEnd);
      ib.off(EventName.error, onError);
      try {
        ib.cancelPositions();
      } catch {
        /* ignore */
      }
    };

    ib.on(EventName.position, onPosition);
    ib.on(EventName.positionEnd, onEnd);
    ib.on(EventName.error, onError);
    ib.reqPositions();
  });
}

const ACCOUNT_SUMMARY_TAGS =
  "NetLiquidation,TotalCashValue,GrossPositionValue,UnrealizedPnL,RealizedPnL,BuyingPower,ExcessLiquidity,MaintMarginReq,SMA,Cushion";

async function twsAccountSummariesOn(
  ib: IBApi,
  accountIds: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const reqId = allocIbkrTwsReqId();
  const byAccount = new Map<string, Record<string, unknown>>();
  for (const id of accountIds) byAccount.set(id, {});

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("TWS reqAccountSummary 超时（30s）"));
    }, 30_000);

    const onSummary = (
      id: number,
      account: string,
      tag: string,
      value: string,
    ): void => {
      if (id !== reqId) return;
      const acc = account.trim();
      if (!acc) return;
      const block = byAccount.get(acc) ?? {};
      const key = tag.toLowerCase();
      block[key] = { amount: num(value) ?? value, currency: "" };
      byAccount.set(acc, block);
    };

    const onEnd = (id: number): void => {
      if (id !== reqId) return;
      cleanup();
      resolve(byAccount);
    };

    const onError = (err: Error, code: number, id: number): void => {
      if (id !== reqId && id !== -1) return;
      cleanup();
      reject(new Error(`TWS reqAccountSummary 错误 ${code}: ${err.message}`));
    };

    const cleanup = (): void => {
      clearTimeout(timeout);
      ib.off(EventName.accountSummary, onSummary);
      ib.off(EventName.accountSummaryEnd, onEnd);
      ib.off(EventName.error, onError);
      try {
        ib.cancelAccountSummary(reqId);
      } catch {
        /* ignore */
      }
    };

    ib.on(EventName.accountSummary, onSummary);
    ib.on(EventName.accountSummaryEnd, onEnd);
    ib.on(EventName.error, onError);
    ib.reqAccountSummary(reqId, "All", ACCOUNT_SUMMARY_TAGS);
  });
}

/**
 * 经 TWS Socket API 拉取账户摘要与持仓（IBKR_API_MODE=tws 时使用）。
 */
export async function fetchIbkrTwsPortfolio(): Promise<IbkrPortfolioResult> {
  const { host, port, clientId } = getIbkrTwsConnectionOptions();
  const gatewayBaseUrl = `tws://${host}:${port}?clientId=${clientId}`;

  return withIbkrTwsApi(async (ib) => {
    const accountIds = await twsManagedAccountsOn(ib);
    const positionsMap = await twsPositionsOn(ib);
    const summariesMap = accountIds.length
      ? await twsAccountSummariesOn(ib, accountIds)
      : new Map<string, Record<string, unknown>>();

    const allAccountIds = new Set<string>([
      ...accountIds,
      ...positionsMap.keys(),
      ...summariesMap.keys(),
    ]);

    const accounts: IbkrPortfolioAccountBlock[] = [];
    for (const accountId of allAccountIds) {
      const summary = summariesMap.get(accountId) ?? null;
      accounts.push({
        accountId,
        summary,
        summaryMetrics: buildSummaryMetrics(summary),
        positions: positionsMap.get(accountId) ?? [],
        positionsTruncated: false,
      });
    }

    accounts.sort((a, b) => a.accountId.localeCompare(b.accountId));

    const watchlists: IbkrWatchlist[] = [];
    for (const acc of accounts) {
      if (acc.positions.length === 0) continue;
      watchlists.push({
        id: `tws-positions-${acc.accountId}`,
        name: `持仓 · ${acc.accountId}`,
        symbols: acc.positions.map((p) => ({
          productCode: p.symbol,
          chartSymbol: p.symbol,
          symbol: p.symbol,
          instrumentLine: p.instrumentLine,
          exchange: p.exchange,
          conid: p.conid,
          secType: p.assetClass,
        })),
      });
    }

    return {
      gatewayBaseUrl,
      accounts,
      watchlists,
    };
  });
}
