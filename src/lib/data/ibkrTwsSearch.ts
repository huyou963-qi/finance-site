import type { ContractDescription, IBApi } from "@stoqey/ib";
import { EventName } from "@stoqey/ib";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";
import { allocIbkrTwsReqId } from "@/lib/data/ibkrTwsShared";
import { withIbkrTwsApi } from "@/lib/data/ibkrTwsConnection";

function descriptionToSearchItem(desc: ContractDescription): SymbolSearchItem | null {
  const c = desc.contract;
  if (!c?.symbol?.trim()) return null;
  const symbol = c.symbol.trim().toUpperCase();
  const secType = c.secType ?? "";
  const exchange = c.exchange?.trim() || c.primaryExch?.trim() || "—";
  return {
    symbol,
    name: `${symbol} · ${secType}${exchange !== "—" ? ` @ ${exchange}` : ""}`,
    exchange,
    type: secType,
  };
}

function searchIbkrTwsSymbolsOn(
  ib: IBApi,
  pattern: string,
): Promise<SymbolSearchItem[]> {
  const reqId = allocIbkrTwsReqId();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("TWS reqMatchingSymbols 超时（30s）"));
    }, 30_000);

    const onSamples = (
      id: number,
      descriptions: ContractDescription[],
    ): void => {
      if (id !== reqId) return;
      cleanup();
      const seen = new Set<string>();
      const out: SymbolSearchItem[] = [];
      for (const d of descriptions) {
        const item = descriptionToSearchItem(d);
        if (!item) continue;
        const key = `${item.symbol}|${item.type}|${item.exchange}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
        if (out.length >= 20) break;
      }
      resolve(out);
    };

    const onError = (err: Error, code: number, id: number): void => {
      if (id !== reqId && id !== -1) return;
      cleanup();
      reject(new Error(`TWS reqMatchingSymbols 错误 ${code}: ${err.message}`));
    };

    const cleanup = (): void => {
      clearTimeout(timeout);
      ib.off(EventName.symbolSamples, onSamples);
      ib.off(EventName.error, onError);
    };

    ib.on(EventName.symbolSamples, onSamples);
    ib.on(EventName.error, onError);
    ib.reqMatchingSymbols(reqId, pattern);
  });
}

/**
 * TWS reqMatchingSymbols → 标的联想
 */
export async function searchIbkrTwsSymbols(
  query: string,
): Promise<SymbolSearchItem[]> {
  const pattern = query.trim();
  if (pattern.length < 1) return [];
  return withIbkrTwsApi((ib) => searchIbkrTwsSymbolsOn(ib, pattern));
}
