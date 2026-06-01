import { executionSymbolMatchKey } from "@/lib/chart/executionSymbolMatch";
import { isIbkrTwsMode } from "@/lib/data/ibkrApiConfig";
import { cpFetch, cpUnauthorizedHint } from "@/lib/data/ibkrCpFetch";
import { fetchIbkrTwsAccountTradesRaw } from "@/lib/data/ibkrTwsTrades";

function num(x: unknown): number | undefined {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

async function cpTickle(): Promise<void> {
  try {
    await cpFetch("/tickle", { method: "GET" });
  } catch {
    /* ignore */
  }
}

/** 切换 CP「当前账户」（多账户 / FA 结构）；单账户失败可忽略 */
async function trySwitchIbkrAccount(accountId: string): Promise<void> {
  const id = accountId.trim();
  if (!id) return;
  try {
    const res = await cpFetch("/iserver/account", {
      method: "POST",
      jsonBody: { acctId: id },
    });
    if (!res.ok && res.status !== 401) return;
  } catch {
    /* ignore */
  }
}

export type IbkrTradeRow = {
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

function parseTradeRow(o: Record<string, unknown>): IbkrTradeRow | null {
  const executionId =
    typeof o.execution_id === "string"
      ? o.execution_id
      : typeof o.executionId === "string"
        ? o.executionId
        : "";
  const symbol =
    typeof o.symbol === "string"
      ? o.symbol.trim()
      : typeof o.contract_description_1 === "string"
        ? o.contract_description_1.trim()
        : "";
  if (!symbol) return null;

  const side = typeof o.side === "string" ? o.side.trim() : "?";

  let tradeTimeSec = 0;
  const tr = o.trade_time_r;
  if (typeof tr === "number" && Number.isFinite(tr)) {
    tradeTimeSec = tr > 1e12 ? Math.floor(tr / 1000) : Math.floor(tr);
  } else if (typeof o.trade_time === "string" && o.trade_time.includes("-")) {
    const d = Date.parse(o.trade_time.replace(/^(\d{4})(\d{2})(\d{2})-/, "$1-$2-$3T"));
    if (Number.isFinite(d)) tradeTimeSec = Math.floor(d / 1000);
  }

  const size = num(o.size) ?? 0;
  const priceRaw = o.price;
  const price =
    typeof priceRaw === "number"
      ? priceRaw
      : typeof priceRaw === "string"
        ? num(priceRaw)
        : undefined;
  if (price == null || !Number.isFinite(price)) return null;

  const conid =
    typeof o.conid === "number"
      ? o.conid
      : num(o.conid);
  const exchange =
    typeof o.exchange === "string" ? o.exchange : undefined;
  const orderDescription =
    typeof o.order_description === "string"
      ? o.order_description
      : typeof o.orderDescription === "string"
        ? o.orderDescription
        : undefined;

  return {
    executionId: executionId || `${symbol}-${tradeTimeSec}-${price}`,
    symbol,
    side,
    tradeTimeSec,
    size,
    price,
    exchange,
    conid: conid != null && Number.isFinite(conid) ? Math.round(conid) : undefined,
    orderDescription,
  };
}

/** 是否属于当前筛选标的（代码或 conid）；期货合约与连续合约 ROOT=F 对齐 */
export function ibkrTradeMatchesSymbol(
  tr: IbkrTradeRow,
  chartSymbol: string,
  conid?: number,
): boolean {
  if (conid != null && tr.conid === conid) return true;
  const want = executionSymbolMatchKey(chartSymbol);
  const got = executionSymbolMatchKey(tr.symbol);
  return want !== "" && want === got;
}

/**
 * GET /iserver/account/trades — 当前会话账户最近最多 7 日成交。
 */
export async function fetchIbkrAccountTradesRaw(
  accountId: string,
  days: number,
): Promise<IbkrTradeRow[]> {
  if (isIbkrTwsMode()) {
    return fetchIbkrTwsAccountTradesRaw(accountId, days);
  }
  await cpTickle();
  await trySwitchIbkrAccount(accountId);

  const d = Math.min(7, Math.max(1, Math.floor(days)));
  const res = await cpFetch(
    `/iserver/account/trades?days=${encodeURIComponent(String(d))}`,
    { method: "GET" },
  );

  if (res.status === 401 || res.status === 403) {
    throw new Error(cpUnauthorizedHint());
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`IBKR trades HTTP ${res.status}: ${t.slice(0, 280)}`);
  }

  const json: unknown = await res.json().catch(() => null);
  const rows: unknown[] = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as { trades?: unknown }).trades)
      ? ((json as { trades: unknown[] }).trades ?? [])
      : [];

  const out: IbkrTradeRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const p = parseTradeRow(row as Record<string, unknown>);
    if (p) out.push(p);
  }

  out.sort((a, b) => b.tradeTimeSec - a.tradeTimeSec);
  return out;
}
