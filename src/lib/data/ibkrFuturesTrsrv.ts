import { cpFetch, cpUnauthorizedHint } from "@/lib/data/ibkrCpFetch";
import { klineDebugLog } from "@/lib/data/klineDebug";
import { parseIbMonthToken } from "@/lib/data/ibkrFuturesMonth";

/** IB Web API Reference「getFutureBySymbol」在 CP Gateway 上对应 GET /trsrv/futures */
export type TrsrvFutureRow = {
  symbol: string;
  conid: number;
  underlyingConid: number;
  expirationDate: number;
  ltd: number;
};

export type IbkrFutContractResolved = {
  conid: number;
  exchange: string;
  secType: string;
  root: string;
  expirationDate: number;
  resolveVia: "trsrv/futures";
  ibMonth?: string;
  /** exact=交割月完全匹配；nearest=该品种无此月，用了最近 listed 月 */
  monthMatch?: "exact" | "nearest";
  requestedIbMonth?: string;
};

const COMEX_METAL_ROOTS = new Set(["GC", "MGC", "SI", "HG", "PL", "PA"]);

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** expirationDate(YYYYMMDD) 与 IB month（JUL26）是否同一交割月 */
export function expirationMatchesIbMonth(
  expirationDate: number,
  ibMonth: string,
): boolean {
  const d = parseIbMonthToken(ibMonth);
  if (!d || !expirationDate) return false;
  const yyyymm = d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
  return Math.floor(expirationDate / 100) === yyyymm;
}

/** 近月：未到期合约中 expiration 最早者 */
export function pickFrontTrsrvFuture(
  rows: TrsrvFutureRow[],
  asOf: Date = new Date(),
): TrsrvFutureRow | null {
  if (!rows.length) return null;
  const today =
    asOf.getUTCFullYear() * 10000 +
    (asOf.getUTCMonth() + 1) * 100 +
    asOf.getUTCDate();
  const future = rows
    .filter((r) => r.expirationDate >= today)
    .sort((a, b) => a.expirationDate - b.expirationDate);
  if (future.length) return future[0]!;
  return rows.sort((a, b) => b.expirationDate - a.expirationDate)[0]!;
}

export function pickTrsrvFutureByIbMonth(
  rows: TrsrvFutureRow[],
  ibMonth: string,
): TrsrvFutureRow | null {
  const matches = rows.filter((r) =>
    expirationMatchesIbMonth(r.expirationDate, ibMonth),
  );
  if (!matches.length) return null;
  return matches.sort((a, b) => a.expirationDate - b.expirationDate)[0]!;
}

function yyyymmFromExpiration(expirationDate: number): number {
  return Math.floor(expirationDate / 100);
}

function yyyymmFromIbMonth(ibMonth: string): number | null {
  const d = parseIbMonthToken(ibMonth);
  if (!d) return null;
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
}

/**
 * MGC 等品种在 IB 仅列出部分交割月（如 6/8/10/12，无 7 月）。
 * 用户代码 MGCN6（N=7月）无精确合约时，选日历上最近的 listed 月份。
 */
export function pickNearestTrsrvFutureByIbMonth(
  rows: TrsrvFutureRow[],
  ibMonth: string,
): TrsrvFutureRow | null {
  const exact = pickTrsrvFutureByIbMonth(rows, ibMonth);
  if (exact) return exact;
  const target = yyyymmFromIbMonth(ibMonth);
  if (target == null || !rows.length) return null;

  let best: TrsrvFutureRow | null = null;
  let bestDist = Infinity;
  for (const r of rows) {
    const ym = yyyymmFromExpiration(r.expirationDate);
    const dist = Math.abs(ym - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = r;
      continue;
    }
    if (dist !== bestDist || !best) continue;
    const bestYm = yyyymmFromExpiration(best.expirationDate);
    if (ym >= target && bestYm < target) best = r;
    else if (ym >= target && bestYm >= target && ym < bestYm) best = r;
  }
  return best;
}

export async function fetchTrsrvFuturesByRoot(
  root: string,
): Promise<TrsrvFutureRow[]> {
  const sym = root.trim().toUpperCase();
  if (!sym) return [];

  const res = await cpFetch(
    `/trsrv/futures?symbols=${encodeURIComponent(sym)}`,
    { method: "GET" },
  );
  if (res.status === 401 || res.status === 403) {
    throw new Error(cpUnauthorizedHint());
  }
  if (!res.ok) {
    klineDebugLog("ibkr", "trsrv.futures.http_error", {
      root: sym,
      status: res.status,
      body: (await res.text()).slice(0, 200),
    });
    return [];
  }

  const json: unknown = await res.json().catch(() => null);
  if (!json || typeof json !== "object") return [];

  const bucket =
    (json as Record<string, unknown>)[sym] ??
    (json as Record<string, unknown>)[sym.toLowerCase()];
  if (!Array.isArray(bucket)) return [];

  const rows: TrsrvFutureRow[] = [];
  for (const item of bucket) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const conid = num(o.conid);
    if (!conid) continue;
    rows.push({
      symbol: String(o.symbol ?? sym).toUpperCase(),
      conid,
      underlyingConid: num(o.underlyingConid),
      expirationDate: num(o.expirationDate),
      ltd: num(o.ltd),
    });
  }
  return rows;
}

async function fetchListingExchangeForConid(conid: number): Promise<string> {
  const res = await cpFetch(`/trsrv/secdef?conids=${conid}`, {
    method: "GET",
  });
  if (!res.ok) return "";
  const json: unknown = await res.json().catch(() => null);
  if (!json || typeof json !== "object") return "";
  const secdef = (json as Record<string, unknown>).secdef;
  if (!Array.isArray(secdef) || !secdef[0] || typeof secdef[0] !== "object") {
    return "";
  }
  const row = secdef[0] as Record<string, unknown>;
  return String(row.listingExchange ?? row.exchange ?? "").trim();
}

function defaultFutHistoryExchange(root: string, listingExchange: string): string {
  const ex = listingExchange.trim().split(";")[0]?.trim() ?? "";
  if (ex && ex !== "SMART") return ex;
  if (COMEX_METAL_ROOTS.has(root.toUpperCase())) return "COMEX";
  return "SMART";
}

/**
 * 用官方 /trsrv/futures 解析期货 conid（对应 Web API Ref getFutureBySymbol）。
 * @param ibMonth 指定交割月（MGCN6→JUL26）；省略则选近月（MGC=F 连续图）
 */
/** 在 asOf 当日仍存续的合约里取最近到期月（用于历史分页） */
export function pickTrsrvFutureActiveAtDate(
  rows: TrsrvFutureRow[],
  unixSec: number,
): TrsrvFutureRow | null {
  const d = new Date(Math.floor(unixSec) * 1000);
  const ymd =
    d.getUTCFullYear() * 10000 +
    (d.getUTCMonth() + 1) * 100 +
    d.getUTCDate();
  const active = rows
    .filter((r) => r.expirationDate >= ymd)
    .sort((a, b) => a.expirationDate - b.expirationDate);
  return active[0] ?? null;
}

export async function resolveIbkrFuturesViaTrsrv(args: {
  root: string;
  chartSymbol: string;
  ibMonth?: string | null;
  /** 连续合约向左翻页：按该时刻的主力月解析 conid */
  asOfTimeSec?: number | null;
}): Promise<IbkrFutContractResolved | null> {
  const root = args.root.trim().toUpperCase();
  const rows = await fetchTrsrvFuturesByRoot(root);
  if (!rows.length) {
    klineDebugLog("ibkr", "trsrv.futures.empty", {
      chartSymbol: args.chartSymbol,
      root,
      ibMonth: args.ibMonth ?? null,
    });
    return null;
  }

  let monthMatch: "exact" | "nearest" | undefined;
  let row: TrsrvFutureRow | null = null;
  if (args.ibMonth) {
    row = pickTrsrvFutureByIbMonth(rows, args.ibMonth);
    if (row) monthMatch = "exact";
    else {
      row = pickNearestTrsrvFutureByIbMonth(rows, args.ibMonth);
      if (row) monthMatch = "nearest";
    }
  } else if (args.asOfTimeSec != null) {
    row = pickTrsrvFutureActiveAtDate(rows, args.asOfTimeSec);
    if (row) monthMatch = "exact";
  } else {
    row = pickFrontTrsrvFuture(rows);
  }

  if (!row) {
    klineDebugLog("ibkr", "trsrv.futures.no_match", {
      chartSymbol: args.chartSymbol,
      root,
      ibMonth: args.ibMonth ?? null,
      rowCount: rows.length,
      listedExpirations: rows.map((r) => r.expirationDate),
    });
    return null;
  }

  const listing = await fetchListingExchangeForConid(row.conid);
  const exchange = defaultFutHistoryExchange(root, listing);

  const out: IbkrFutContractResolved = {
    conid: row.conid,
    exchange,
    secType: "FUT",
    root,
    expirationDate: row.expirationDate,
    resolveVia: "trsrv/futures",
    ibMonth: args.ibMonth ?? undefined,
    monthMatch,
    requestedIbMonth: args.ibMonth ?? undefined,
  };

  klineDebugLog("ibkr", "cpResolveTrsrvFutures", {
    chartSymbol: args.chartSymbol,
    ...out,
    listingExchange: listing || null,
    note:
      monthMatch === "nearest"
        ? `${root} 无 ${args.ibMonth} 交割月，已用最近 listed 合约 conid（见 expirationDate）`
        : "Web API getFutureBySymbol → GET /trsrv/futures",
  });

  return out;
}
