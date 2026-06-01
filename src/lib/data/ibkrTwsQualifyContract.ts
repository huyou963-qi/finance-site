import type { Contract } from "@stoqey/ib";
import { EventName, IBApi, SecType } from "@stoqey/ib";
import { klineDebugLog } from "@/lib/data/klineDebug";
import { withIbkrTwsApi } from "@/lib/data/ibkrTwsConnection";

const QUALIFY_TIMEOUT_MS = 20_000;

function contractMonthKey(ltd: string | undefined): string {
  const s = (ltd ?? "").trim();
  const m = s.match(/^(\d{6})/);
  return m ? m[1]! : s.slice(0, 6);
}

function scoreContractMatch(
  details: { contract: Contract },
  want: Contract,
): number {
  const c = details.contract;
  let score = 0;
  if (c.conId) score += 10;
  if (
    want.lastTradeDateOrContractMonth &&
    contractMonthKey(c.lastTradeDateOrContractMonth) ===
      contractMonthKey(want.lastTradeDateOrContractMonth)
  ) {
    score += 50;
  }
  if (c.symbol?.toUpperCase() === want.symbol?.toUpperCase()) score += 5;
  if (c.exchange?.toUpperCase() === want.exchange?.toUpperCase()) score += 3;
  return score;
}

async function reqContractDetailsBest(
  ib: IBApi,
  probe: Contract,
): Promise<Contract | null> {
  const reqId = Math.floor(Math.random() * 1_000_000) + 10_000;
  const rows: { contract: Contract }[] = [];

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, QUALIFY_TIMEOUT_MS);

    const onDetails = (id: number, details: { contract: Contract }): void => {
      if (id !== reqId) return;
      rows.push(details);
    };

    const onEnd = (id: number): void => {
      if (id !== reqId) return;
      cleanup();
      if (!rows.length) {
        resolve(null);
        return;
      }
      let best = rows[0]!;
      let bestScore = scoreContractMatch(best, probe);
      for (let i = 1; i < rows.length; i++) {
        const sc = scoreContractMatch(rows[i]!, probe);
        if (sc > bestScore) {
          best = rows[i]!;
          bestScore = sc;
        }
      }
      resolve(best.contract);
    };

    const onError = (err: Error, _code: number, id: number): void => {
      if (id !== reqId && id !== -1) return;
      klineDebugLog("ibkr", "tws.qualify.error", {
        reqId: id,
        message: err?.message ?? String(err),
        probe,
      });
      cleanup();
      resolve(null);
    };

    const cleanup = (): void => {
      clearTimeout(timeout);
      ib.off(EventName.contractDetails, onDetails);
      ib.off(EventName.contractDetailsEnd, onEnd);
      ib.off(EventName.error, onError);
    };

    ib.on(EventName.contractDetails, onDetails);
    ib.on(EventName.contractDetailsEnd, onEnd);
    ib.on(EventName.error, onError);

    ib.reqContractDetails(reqId, probe);
  });
}

/**
 * 用 TWS reqContractDetails 解析过期/挂牌交割月 FUT（须 includeExpired）。
 */
export async function qualifyTwsFutContract(
  partial: Contract,
): Promise<Contract> {
  const base: Contract = {
    ...partial,
    secType: SecType.FUT,
    includeExpired: true,
    tradingClass: partial.tradingClass ?? partial.symbol,
  };

  const exchanges = [
    base.exchange,
    "COMEX",
    "NYMEX",
    "CME",
    "SMART",
  ].filter((e): e is string => Boolean(e?.trim()));

  const seen = new Set<string>();
  for (const exchange of exchanges) {
    const ex = exchange.trim().toUpperCase();
    if (seen.has(ex)) continue;
    seen.add(ex);

    const probe: Contract = {
      ...base,
      exchange: ex,
      ...(ex === "SMART" ? { primaryExch: base.exchange ?? "COMEX" } : {}),
    };

    const qualified = await withIbkrTwsApi((ib) =>
      reqContractDetailsBest(ib, probe),
    );
    if (qualified?.conId) {
      klineDebugLog("ibkr", "tws.qualify.ok", {
        symbol: qualified.symbol,
        conId: qualified.conId,
        exchange: qualified.exchange,
        ltd: qualified.lastTradeDateOrContractMonth,
        localSymbol: qualified.localSymbol,
      });
      return { ...qualified, includeExpired: true };
    }
  }

  throw new Error(
    `TWS 未找到期货合约定义：${base.symbol} ${base.lastTradeDateOrContractMonth ?? ""}（已试 COMEX/SMART 等；过期合约需 includeExpired）`,
  );
}
