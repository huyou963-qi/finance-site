import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import { futuresContractRoot } from "@/lib/chart/executionSymbolMatch";
import {
  cpBaseUrl,
  cpFetch,
  cpUnauthorizedHint,
} from "@/lib/data/ibkrCpFetch";
import {
  extractMonthsFromSecdefSearch,
  ibMonthFromUnixSec,
  parseIbkrFutMonthSpec,
  pickFrontIbMonth,
} from "@/lib/data/ibkrFuturesMonth";
import {
  fetchTrsrvFuturesByRoot,
  resolveIbkrFuturesViaTrsrv,
} from "@/lib/data/ibkrFuturesTrsrv";
import { isIbkrTwsMode } from "@/lib/data/ibkrApiConfig";
import { isIbkrContinuousFutChartSymbol } from "@/lib/data/ibkrFutSymbol";
import {
  clearKlineServerDebugRing,
  klineDebugLog,
} from "@/lib/data/klineDebug";
import { fetchIbkrTwsKlines } from "@/lib/data/ibkrTwsKlines";

export { parseIbkrFutMonthSpec } from "@/lib/data/ibkrFuturesMonth";
export { extractMonthsFromSecdefSearch } from "@/lib/data/ibkrFuturesMonth";
import {
  barMsForInterval,
  clampKlineLimit,
  isKlineInterval,
  lookbackMs,
} from "./klineShared";
import type { KlineInterval } from "./klineShared";
import { readIbkrCpCookie } from "@/lib/data/ibkrCpSession";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";
import type { KlinePayload } from "./types";

/**
 * IB `/iserver/marketdata/history` 单根 bar 的时间 → Unix 秒。
 * 常见：秒、毫秒；少数网关返回的数量级会偏一位（Campus 文档示例里 t 也曾出现非标准值）。
 */
function rowTimeToUnix(t: unknown): number {
  if (typeof t === "number" && Number.isFinite(t)) {
    const x = t;
    if (x > 1e12) return Math.floor(x / 1000);
    if (x >= 946684800 && x <= 4102444800) return Math.floor(x);
    if (x > 4102444800 && x < 1e13) {
      const y = x / 10;
      if (y >= 946684800 && y <= 4102444800) return Math.floor(y);
      const z = x / 100;
      if (z >= 946684800 && z <= 4102444800) return Math.floor(z);
    }
    if (x > 3e9 && x < 1e12) return Math.floor(x / 1000);
    return Math.floor(x);
  }
  if (typeof t === "string") {
    const n = Number(t);
    if (Number.isFinite(n)) return rowTimeToUnix(n);
    const ms = Date.parse(t);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

/**
 * CPAPI history 根字段 `priceFactor`：报价整数刻度相对「展示价格」的倍数（Campus 文档示例常为 100）。
 * IB 有时返回已为美元的浮点 OHLC，有时返回整数刻度 —— 需区分，否则会差整整数十倍（看起来像「和行情对不上」）。
 */
function adjustOhlcByPriceFactor(
  open: number,
  high: number,
  low: number,
  close: number,
  priceFactor: number,
): [number, number, number, number] {
  const pf = priceFactor > 0 ? priceFactor : 1;
  if (pf <= 1) return [open, high, low, close];
  const m = Math.max(open, high, low, close);
  const scaledMax = m / pf;
  const looksLikeIntegerTicks = [open, high, low, close].every(
    (x) => Number.isFinite(x) && Math.abs(x - Math.round(x)) < 1e-6,
  );
  // 大整数刻度（如 45231 → /100）；不可对「450 美元整数」误除（450 也会被当成整数）
  if (
    looksLikeIntegerTicks &&
    m >= 10_000 &&
    scaledMax >= 0.01 &&
    scaledMax <= 1e7
  ) {
    return [open / pf, high / pf, low / pf, close / pf];
  }
  // 浮点但仍异常偏大（未折合的刻度）
  if (m >= pf * 10 && scaledMax >= 0.01 && scaledMax <= 1e7) {
    return [open / pf, high / pf, low / pf, close / pf];
  }
  return [open, high, low, close];
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function intervalToCpBar(interval: KlineInterval): string {
  switch (interval) {
    case "15m":
      return "15min";
    case "1h":
      return "1h";
    case "4h":
      return "4h";
    case "1d":
      return "1d";
    case "1w":
      return "1w";
    default:
      return "1d";
  }
}

/**
 * 与首屏 `period` 字符串同源的天数（≤1000），用于向左分页时推算 startTime 锚点与拉宽 period。
 */
function cpPeriodCalendarDays(interval: KlineInterval, limit: number): number {
  const cappedLimit = Math.min(1000, Math.max(1, limit));
  const ms = lookbackMs(interval, cappedLimit);
  const days = Math.max(1, Math.ceil(ms / 86_400_000));
  return Math.min(days, 1000);
}

/**
 * 向左分页：IB CP 在带 startTime 时，period 实际多表现为「以 startTime 为端点向过去覆盖」
 *（若把 startTime 设在 cut−1000d，返回块最晚往往落在锚点附近，与 cut 相差约一整段 period → 图上竖跳）。
 * 分页时应让 startTime 靠近 cut，period 只覆盖 cut 之前若干日历日。
 */
function cpPaginationWindow(
  interval: KlineInterval,
  limit: number,
): { periodDays: number; spanSec: number } {
  const cappedLimit = Math.min(1000, Math.max(1, limit));
  const barSec = barMsForInterval(interval) / 1000;
  const spanSec = Math.min(
    1000 * 86_400,
    Math.ceil(barSec * cappedLimit * 1.45),
  );
  const periodDays = Math.min(
    1000,
    Math.max(5, Math.ceil(spanSec / 86_400)),
  );
  return { periodDays, spanSec };
}

function mergeCandlesByTimeAsc(
  a: CandlestickData[],
  b: CandlestickData[],
): CandlestickData[] {
  const byTime = new Map<number, CandlestickData>();
  for (const c of a) byTime.set(c.time as number, c);
  for (const c of b) byTime.set(c.time as number, c);
  return [...byTime.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([, c]) => c);
}

function mergeVolumesForCandles(
  candles: CandlestickData[],
  parts: { candles: CandlestickData[]; volumes: number[] }[],
): number[] {
  const vm = new Map<number, number>();
  for (const p of parts) {
    for (let i = 0; i < p.candles.length; i++) {
      vm.set(p.candles[i]!.time as number, p.volumes[i] ?? 0);
    }
  }
  return candles.map((c) => vm.get(c.time as number) ?? 0);
}

/** 主分页返回块最晚柱与 cut 之间若有空洞（如 10-11 与 10-15 间漏 10-14），再拉一小段楔内数据 */
async function cpFetchWedgeBeforeCut(
  conid: number,
  interval: KlineInterval,
  exchange: string,
  secType: string,
  outsideRth: string,
  afterExclusiveSec: number,
  beforeExclusiveSec: number,
): Promise<{ candles: CandlestickData[]; volumes: number[] }> {
  const gapSec = beforeExclusiveSec - afterExclusiveSec;
  if (gapSec <= 0) return { candles: [], volumes: [] };

  const periodDays = Math.min(
    30,
    Math.max(5, Math.ceil(gapSec / 86_400) + 3),
  );
  const bar = intervalToCpBar(interval);
  const qs = new URLSearchParams({
    conid: String(conid),
    exchange,
    period: `${periodDays}d`,
    bar,
    outsideRth,
    source: "Trades",
    startTime: formatIbCpStartTime(beforeExclusiveSec),
  });

  const res = await cpFetch(`/iserver/marketdata/history?${qs.toString()}`, {
    method: "GET",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(
      `IBKR wedge history HTTP ${res.status}: ${t.slice(0, 200)}`,
    );
  }

  const json: unknown = await res.json();
  const { candles, volumes } = parseHistoryPayload(json);
  const order = [...candles.keys()].sort(
    (i, j) => (candles[i]!.time as number) - (candles[j]!.time as number),
  );
  const sortedCandles = order.map((i) => candles[i]!);
  const sortedVolumes = order.map((i) => volumes[i]!);
  const idxs = sortedCandles
    .map((c, i) => {
      const t = c.time as number;
      return t > afterExclusiveSec && t < beforeExclusiveSec ? i : -1;
    })
    .filter((i) => i >= 0);

  const wedgeC = idxs.map((i) => sortedCandles[i]!);
  const wedgeV = idxs.map((i) => sortedVolumes[i]!);

  klineDebugLog("ibkr", "cpFetchWedge", {
    afterExclusiveSec,
    afterIso: new Date(afterExclusiveSec * 1000).toISOString(),
    beforeExclusiveSec,
    beforeIso: new Date(beforeExclusiveSec * 1000).toISOString(),
    periodDays,
    rawInRange: wedgeC.length,
    firstIso:
      wedgeC[0] != null
        ? new Date((wedgeC[0]!.time as number) * 1000).toISOString()
        : null,
    lastIso:
      wedgeC[wedgeC.length - 1] != null
        ? new Date(
            (wedgeC[wedgeC.length - 1]!.time as number) * 1000,
          ).toISOString()
        : null,
  });

  return { candles: wedgeC, volumes: wedgeV };
}

function sliceHistoryBeforeCut(
  sortedCandles: CandlestickData[],
  sortedVolumes: number[],
  cut: number,
  cap: number,
): { candles: CandlestickData[]; volumes: number[] } {
  const idxs = sortedCandles
    .map((c, i) => ((c.time as number) < cut ? i : -1))
    .filter((i) => i >= 0);
  let sliceC = idxs.map((i) => sortedCandles[i]!);
  let sliceV = idxs.map((i) => sortedVolumes[i]!);
  if (sliceC.length > cap) {
    sliceC = sliceC.slice(-cap);
    sliceV = sliceV.slice(-cap);
  }
  const n = Math.min(cap, sliceC.length);
  const from = Math.max(0, sliceC.length - n);
  return {
    candles: sliceC.slice(from),
    volumes: sliceV.slice(from),
  };
}

/** CPAPI `startTime`：YYYYMMDD-HH:mm:ss（UTC）；文档含义为「请求时段的起点」，与 `period` 联用向该时点之后覆盖一段时长 */
function formatIbCpStartTime(unixSec: number): string {
  const d = new Date(Math.floor(unixSec) * 1000);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${day}-${h}:${mi}:${s}`;
}

/** IB CP `/iserver/secdef/search` 返回里的一条可交易合约线索（含 history 所需的 exchange） */
interface IbkrContractCandidate {
  conid: number;
  symbol: string;
  secType: string;
  exchange: string;
}

function normalizeSymbolKey(s: string): string {
  return s.trim().toUpperCase().replace(/\./g, "");
}

/**
 * 从 secdef/search 的 JSON 中收集合约；正确处理顶层 conid + `sections[]` 结构（外汇常见）。
 * 参考：https://www.interactivebrokers.com/campus/ibkr-api-page/cpapi-v1/#search-symbol-contract
 */
function collectIbkrContractCandidates(data: unknown): IbkrContractCandidate[] {
  const rows: IbkrContractCandidate[] = [];

  const pushRow = (
    conid: number,
    symbol: string,
    secType: string,
    exchangeRaw: string,
  ): void => {
    if (!Number.isFinite(conid) || conid <= 0) return;
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    const sec = String(secType ?? "")
      .trim()
      .toUpperCase();
    const exch =
      String(exchangeRaw ?? "")
        .split(";")[0]
        ?.trim() ?? "";
    rows.push({ conid, symbol: sym, secType: sec, exchange: exch });
  };

  const visit = (node: unknown, inheritedConid?: number): void => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const x of node) visit(x, inheritedConid);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;

    let parentCid = inheritedConid;
    const topCidRaw = o.conid ?? o.conId;
    if (topCidRaw !== undefined && topCidRaw !== null) {
      const n =
        typeof topCidRaw === "number"
          ? topCidRaw
          : parseInt(String(topCidRaw), 10);
      if (Number.isFinite(n) && n > 0) parentCid = n;
    }

    if (Array.isArray(o.sections)) {
      for (const s of o.sections) {
        if (!s || typeof s !== "object") continue;
        const sec = s as Record<string, unknown>;
        const cidRaw = sec.conid ?? sec.conId ?? parentCid;
        if (cidRaw === undefined || cidRaw === null) continue;
        const conid =
          typeof cidRaw === "number" ? cidRaw : parseInt(String(cidRaw), 10);
        const sym = String(sec.symbol ?? o.symbol ?? "");
        const st = String(sec.secType ?? sec.sec_type ?? sec.sectype ?? "");
        const exch = String(sec.exchange ?? "");
        pushRow(conid, sym, st, exch);
      }
    }

    const cidRaw = o.conid ?? o.conId;
    const sym = String(o.symbol ?? o.companyName ?? "");
    const st = String(o.secType ?? o.sec_type ?? o.sectype ?? "");
    const exch = String(o.exchange ?? o.listingExchange ?? "");
    if (cidRaw !== undefined && cidRaw !== null && sym) {
      const conid =
        typeof cidRaw === "number" ? cidRaw : parseInt(String(cidRaw), 10);
      pushRow(conid, sym, st, exch);
    }

    for (const k of Object.keys(o)) {
      if (k === "sections") continue;
      visit(o[k], parentCid);
    }
  };

  visit(data, undefined);

  const byConid = new Map<number, IbkrContractCandidate>();
  for (const r of rows) {
    const prev = byConid.get(r.conid);
    if (
      !prev ||
      (r.exchange && !prev.exchange) ||
      (r.secType && !prev.secType)
    ) {
      byConid.set(r.conid, r);
    }
  }
  return [...byConid.values()];
}

type IbkrSearchMode = "forex" | "stk" | "fut" | "contfut";

/** 允许期货月份代码（MGCN6）、连续（MGC=F）、股票、外汇等 */
export function isValidIbkrSymbolInput(raw: string): boolean {
  const sym = raw.trim().toUpperCase();
  return /^[A-Z0-9.\-=^]{1,32}$/.test(sym);
}

function inferIbkrSearchMode(symbolUpper: string): IbkrSearchMode {
  if (/^[A-Z]{6}$/.test(symbolUpper)) return "forex";
  if (/=F$/i.test(symbolUpper)) return "contfut";
  if (futuresContractRoot(symbolUpper)) return "fut";
  return "stk";
}

function ibkrSecdefSearchSymbols(sym: string, mode: IbkrSearchMode): string[] {
  const out = new Set<string>([sym]);
  if (mode === "contfut") {
    out.add(sym.replace(/=F$/i, ""));
  }
  if (mode === "fut") {
    const root = futuresContractRoot(sym);
    if (root) out.add(root);
    /* 交割月合约用 root + secdef/info，勿把 MGCN6 直接丢给 search（易错 conid） */
    const monthSpec = parseIbkrFutMonthSpec(sym);
    if (monthSpec) out.delete(sym);
  }
  return [...out].filter(Boolean);
}

async function cpSecdefInfo(
  underlyingConid: number,
  sectype: "FUT" | "CONTFUT",
  month: string,
  exchange: string,
): Promise<IbkrContractCandidate | null> {
  async function fetchInfo(secTypeParam: string): Promise<IbkrContractCandidate | null> {
    const qs = new URLSearchParams({
      conid: String(underlyingConid),
      secType: secTypeParam,
      month,
    });
    if (exchange.trim()) qs.set("exchange", exchange.trim());
    const res = await cpFetch(`/iserver/secdef/info?${qs.toString()}`, {
      method: "GET",
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(cpUnauthorizedHint());
    }
    if (!res.ok) return null;
    const json: unknown = await res.json().catch(() => null);
    if (!Array.isArray(json) || !json.length) return null;
    const rows: IbkrContractCandidate[] = [];
    for (const row of json) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const conid = num(o.conid);
      if (!conid) continue;
      const symbol = String(o.symbol ?? o.ticker ?? "").trim().toUpperCase();
      const secType = String(o.secType ?? sectype).trim().toUpperCase();
      const exchangeResolved = String(
        o.listingExchange ?? o.exchange ?? exchange,
      ).trim();
      rows.push({
        conid,
        symbol: symbol || underlyingConid.toString(),
        secType,
        exchange: exchangeResolved,
      });
    }
    return rows[0] ?? null;
  }

  const primary = await fetchInfo("FUT");
  if (primary) return primary;
  return fetchInfo(sectype);
}

async function cpResolveFutMonthContract(
  sym: string,
  monthSpec: { root: string; ibMonth: string },
): Promise<{ conid: number; exchange: string; secType: string }> {
  const viaTrsrv = await resolveIbkrFuturesViaTrsrv({
    root: monthSpec.root,
    chartSymbol: sym,
    ibMonth: monthSpec.ibMonth,
  });
  if (viaTrsrv) {
    return {
      conid: viaTrsrv.conid,
      exchange: viaTrsrv.exchange,
      secType: viaTrsrv.secType,
    };
  }

  const underCandidates = await runSecdefSearch(monthSpec.root, "FUT");
  const underlying = pickIbkrContract(
    underCandidates,
    monthSpec.root,
    "fut",
  );
  if (!underlying) {
    throw new Error(
      `未找到期货根合约 ${monthSpec.root}（请先确认 IB 账户可交易该品种）`,
    );
  }

  const tryExchanges = [
    underlying.exchange,
    "SMART",
    "COMEX",
    "CME",
    "NYMEX",
    "GLOBEX",
    "ECBOT",
  ].filter((e, i, a) => e.trim() && a.indexOf(e) === i);

  for (const ex of tryExchanges) {
    const detailed = await cpSecdefInfo(
      underlying.conid,
      "FUT",
      monthSpec.ibMonth,
      ex,
    );
    if (detailed) {
      klineDebugLog("ibkr", "cpResolveFutMonth", {
        symbol: sym,
        root: monthSpec.root,
        ibMonth: monthSpec.ibMonth,
        underlyingConid: underlying.conid,
        conid: detailed.conid,
        exchange: detailed.exchange,
        secType: detailed.secType,
      });
      return {
        conid: detailed.conid,
        exchange: defaultHistoryExchange(detailed.secType, detailed.exchange),
        secType: detailed.secType || "FUT",
      };
    }
  }

  const listed = await fetchTrsrvFuturesByRoot(monthSpec.root);
  const expHint =
    listed.length > 0
      ? `IB 当前 listed 交割日：${listed.map((r) => r.expirationDate).join(", ")}。`
      : "";
  const biMonthlyHint =
    monthSpec.root === "MGC" || monthSpec.root === "GC"
      ? " 微黄金/黄金多为双月合约（如 6/8/10/12 月），无 7 月(N)；可试 MGCM6(6月)、MGCQ6(8月) 或 MGC=F。"
      : "";
  throw new Error(
    `未解析到 ${sym} 的交割月（${monthSpec.ibMonth}）。${expHint}${biMonthlyHint}`,
  );
}

/** 美股主上市优先：避免同名 STK 落到其它国家/货币列表，导致价格与北美行情不一致 */
function scoreUsStockListingExchange(exchangeField: string): number {
  const raw = exchangeField.toUpperCase();
  const parts = raw.split(";").map((s) => s.trim()).filter(Boolean);
  let score = 0;
  for (const ex of parts) {
    if (
      ex === "SMART" ||
      ex.includes("NASDAQ") ||
      ex === "ISLAND" ||
      ex.includes("NYSE") ||
      ex.includes("ARCA") ||
      ex === "BATS"
    ) {
      score = Math.max(score, 120);
    }
  }
  if (/NASDAQ|ISLAND/.test(raw)) score += 40;
  if (/NYSE|ARCA/.test(raw)) score += 35;
  if (/LSE|TSE|FWB|SWX|SBF|BVLP|ASX|TSX|HKEX|OSE/.test(raw))
    score -= 150;
  return score;
}

function pickIbkrContract(
  candidates: IbkrContractCandidate[],
  wantSymbol: string,
  mode: IbkrSearchMode,
): IbkrContractCandidate | null {
  if (!candidates.length) return null;
  const want = normalizeSymbolKey(wantSymbol);
  const wantRoot = futuresContractRoot(wantSymbol);
  const scored = candidates.map((c) => {
    let score = 0;
    const cs = normalizeSymbolKey(c.symbol);
    if (cs === want) score += 300;
    else if (cs.includes(want) || want.includes(cs)) score += 100;

    if (mode === "forex") {
      if (c.secType === "CASH") score += 100;
      else if (c.secType === "CFD") score += 70;
      if (c.exchange === "IDEALPRO" || c.exchange.includes("IDEALPRO"))
        score += 40;
    } else if (mode === "fut") {
      if (c.secType === "FUT") score += 120;
      if (wantRoot && cs.startsWith(wantRoot)) score += 60;
      if (c.exchange) score += 10;
    } else if (mode === "contfut") {
      if (c.secType === "CONTFUT") score += 140;
      else if (c.secType === "FUT") score += 40;
      if (/CONT|连续/i.test(c.symbol)) score += 50;
      if (wantRoot && cs.startsWith(wantRoot)) score += 40;
    } else {
      if (c.secType === "STK") score += 100;
      if (c.exchange === "SMART" || c.exchange.includes("SMART")) score += 25;
      score += scoreUsStockListingExchange(c.exchange);
    }
    if (c.exchange) score += 5;
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.c;
}

async function runSecdefSearchFull(
  symbol: string,
  sectype: string,
): Promise<{ candidates: IbkrContractCandidate[]; months: string[] }> {
  const qs = new URLSearchParams({ symbol, secType: sectype });
  let res = await cpFetch(`/iserver/secdef/search?${qs.toString()}`, {
    method: "GET",
  });
  if (!res.ok) {
    res = await cpFetch("/iserver/secdef/search", {
      method: "POST",
      jsonBody: { symbol, sectype },
    });
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(cpUnauthorizedHint());
  }
  if (!res.ok) return { candidates: [], months: [] };
  const json: unknown = await res.json().catch(() => null);
  return {
    candidates: collectIbkrContractCandidates(json),
    months: extractMonthsFromSecdefSearch(json),
  };
}

async function runSecdefSearch(
  symbol: string,
  sectype: string,
): Promise<IbkrContractCandidate[]> {
  const { candidates } = await runSecdefSearchFull(symbol, sectype);
  return candidates;
}

type CpResolvedContract = {
  conid: number;
  exchange: string;
  secType: string;
  chartMode?: "contfut_secdef" | "contfut_rolled_month";
  ibMonth?: string;
};

async function cpResolveContFutSecdef(
  sym: string,
  root: string,
): Promise<CpResolvedContract | null> {
  for (const searchSym of [sym, root]) {
    const candidates = await runSecdefSearch(searchSym, "CONTFUT");
    const pick = pickIbkrContract(candidates, sym, "contfut");
    if (pick?.secType === "CONTFUT") {
      klineDebugLog("ibkr", "cpResolveContFut", {
        symbol: sym,
        root,
        conid: pick.conid,
        secType: "CONTFUT",
        note: "secdef CONTFUT conid（若 history 失败将回退交割月 FUT）",
      });
      return {
        conid: pick.conid,
        exchange: defaultHistoryExchange("CONTFUT", pick.exchange),
        secType: "CONTFUT",
        chartMode: "contfut_secdef",
      };
    }
  }
  return null;
}

/**
 * MGC=F：首屏可试 CONTFUT；向左分页须按 asOf 切换交割月 FUT（近月 conid 无法拉 2024 数据）。
 */
async function cpResolveContFutContract(
  sym: string,
  beforeTimeSec?: number,
): Promise<CpResolvedContract | null> {
  const root = sym.replace(/=F$/i, "").trim().toUpperCase();
  if (!root) return null;

  const monthSet = new Set<string>();
  let underlying: IbkrContractCandidate | null = null;
  for (const sectype of ["FUT", "CONTFUT"] as const) {
    const { candidates, months } = await runSecdefSearchFull(root, sectype);
    for (const m of months) monthSet.add(m);
    const pick = pickIbkrContract(
      candidates,
      root,
      sectype === "CONTFUT" ? "contfut" : "fut",
    );
    if (pick?.secType === "FUT") underlying = pick;
    else if (!underlying && pick) underlying = pick;
  }
  const months = [...monthSet];

  if (beforeTimeSec == null) {
    const cont = await cpResolveContFutSecdef(sym, root);
    if (cont) return cont;
  }

  const asOf =
    beforeTimeSec != null ? new Date(beforeTimeSec * 1000) : new Date();
  const ibMonth =
    pickFrontIbMonth(months, asOf) ??
    (beforeTimeSec != null ? ibMonthFromUnixSec(beforeTimeSec) : null);

  const tryExchanges = [
    underlying?.exchange ?? "",
    "SMART",
    "COMEX",
    "CME",
    "NYMEX",
    "GLOBEX",
    "ECBOT",
  ].filter((e, i, a) => e.trim() && a.indexOf(e) === i);

  /** 历史分页：secdef/info 才能拿到已过期交割月；trsrv 仅非到期合约 */
  if (beforeTimeSec != null && underlying && ibMonth) {
    for (const ex of tryExchanges) {
      const detailed = await cpSecdefInfo(
        underlying.conid,
        "FUT",
        ibMonth,
        ex,
      );
      if (detailed) {
        klineDebugLog("ibkr", "cpResolveContFut", {
          symbol: sym,
          root,
          beforeTimeSec,
          ibMonth,
          conid: detailed.conid,
          note: "连续图分页：secdef/info 历史交割月",
        });
        return {
          conid: detailed.conid,
          exchange: defaultHistoryExchange(
            detailed.secType,
            detailed.exchange,
          ),
          secType: detailed.secType || "FUT",
          chartMode: "contfut_rolled_month",
          ibMonth,
        };
      }
    }
  }

  const viaTrsrv = await resolveIbkrFuturesViaTrsrv({
    root,
    chartSymbol: sym,
    ibMonth: beforeTimeSec != null ? ibMonth : null,
    asOfTimeSec: beforeTimeSec ?? null,
  });
  if (viaTrsrv) {
    klineDebugLog("ibkr", "cpResolveContFut", {
      symbol: sym,
      root,
      beforeTimeSec: beforeTimeSec ?? null,
      ibMonth: viaTrsrv.ibMonth ?? ibMonth,
      conid: viaTrsrv.conid,
      expirationDate: viaTrsrv.expirationDate,
      monthMatch: viaTrsrv.monthMatch,
      note:
        beforeTimeSec != null
          ? "连续图分页：trsrv 按 asOf 近月"
          : "连续图首屏：trsrv 近月 FUT",
    });
    return {
      conid: viaTrsrv.conid,
      exchange: viaTrsrv.exchange,
      secType: viaTrsrv.secType,
      chartMode: "contfut_rolled_month",
      ibMonth: viaTrsrv.ibMonth ?? ibMonth ?? undefined,
    };
  }

  if (!underlying || !ibMonth) {
    klineDebugLog("ibkr", "cpResolveContFut.skip", {
      symbol: sym,
      root,
      beforeTimeSec: beforeTimeSec ?? null,
      underlyingConid: underlying?.conid ?? null,
      monthCount: months.length,
      ibMonth,
    });
    return null;
  }

  for (const ex of tryExchanges) {
    const detailed = await cpSecdefInfo(
      underlying.conid,
      "FUT",
      ibMonth,
      ex,
    );
    if (detailed) {
      klineDebugLog("ibkr", "cpResolveContFut", {
        symbol: sym,
        root,
        beforeTimeSec: beforeTimeSec ?? null,
        ibMonth,
        underlyingConid: underlying.conid,
        conid: detailed.conid,
        note: "secdef/info 交割月 FUT",
      });
      return {
        conid: detailed.conid,
        exchange: defaultHistoryExchange(detailed.secType, detailed.exchange),
        secType: detailed.secType || "FUT",
        chartMode: "contfut_rolled_month",
        ibMonth,
      };
    }
  }
  return null;
}

/** `/iserver/marketdata/history` 需要 exchange；外汇 CASH 默认为 IDEALPRO，股票为 SMART（与文档示例一致） */
function defaultHistoryExchange(secType: string, resolvedExchange: string): string {
  const e = resolvedExchange.trim().split(";")[0]?.trim() ?? "";
  if (e && e !== "SMART") return e;
  const s = secType.toUpperCase();
  if (s === "CASH") return "IDEALPRO";
  if (s === "FUT" || s === "CONTFUT") return e || "SMART";
  return e || "SMART";
}

/** 期货 history 在 SMART 上常返回 Chart data unavailable，按上市所重试 */
function historyExchangeAttempts(
  secType: string,
  resolvedExchange: string,
): string[] {
  const primary = defaultHistoryExchange(secType, resolvedExchange);
  const extras =
    secType.toUpperCase() === "FUT" || secType.toUpperCase() === "CONTFUT"
      ? ["COMEX", "CME", "NYMEX", "GLOBEX", "ECBOT", "SMART"]
      : secType.toUpperCase() === "CASH"
        ? ["IDEALPRO"]
        : ["SMART"];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of [primary, resolvedExchange.split(";")[0]?.trim(), ...extras]) {
    const x = (e ?? "").trim();
    if (!x || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  if (secType.toUpperCase() === "FUT" || secType.toUpperCase() === "CONTFUT") {
    out.push("__OMIT__");
  }
  return out;
}

function parseHistoryPayload(
  json: unknown,
): { candles: CandlestickData[]; volumes: number[] } {
  const candles: CandlestickData[] = [];
  const volumes: number[] = [];

  let priceFactor = 1;
  let volumeFactor = 1;
  const rows: unknown[] = [];
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    if (!Array.isArray(json)) {
      priceFactor = num(o.priceFactor ?? o.PriceFactor) || 1;
      volumeFactor = num(o.volumeFactor ?? o.VolumeFactor) || 1;
    }
    if (Array.isArray(o.data)) rows.push(...o.data);
    else if (Array.isArray(o.bars)) rows.push(...o.bars);
    else if (Array.isArray(o)) rows.push(...(json as unknown[]));
  }

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const t =
      r.t ?? r.time ?? r.startTime ?? r.start ?? r.openTime ?? r.lastUpdate;
    let open = num(r.o ?? r.open ?? r.O);
    let high = num(r.h ?? r.high ?? r.H);
    let low = num(r.l ?? r.low ?? r.L);
    let close = num(r.c ?? r.close ?? r.C);
    [open, high, low, close] = adjustOhlcByPriceFactor(
      open,
      high,
      low,
      close,
      priceFactor,
    );
    let vol = num(r.v ?? r.volume ?? r.vol);
    if (volumeFactor > 1) vol *= volumeFactor;
    candles.push({
      time: rowTimeToUnix(t) as UTCTimestamp,
      open,
      high,
      low,
      close,
    });
    volumes.push(vol);
  }

  return { candles, volumes };
}

async function cpTickle(): Promise<void> {
  try {
    await cpFetch("/tickle", { method: "GET" });
  } catch {
    /* 部分版本可无 tickle */
  }
}

async function cpResolveContract(
  symbol: string,
  options?: { beforeTimeSec?: number },
): Promise<CpResolvedContract> {
  const sym = symbol.trim().toUpperCase();
  if (!isValidIbkrSymbolInput(sym)) {
    throw new Error(
      "无效的 IBKR 标的（示例：美股 AAPL；外汇 XAUUSD；期货 MGCN6；连续 MGC=F）",
    );
  }

  const mode = inferIbkrSearchMode(sym);
  const monthSpec = mode === "fut" ? parseIbkrFutMonthSpec(sym) : null;
  if (monthSpec) {
    return cpResolveFutMonthContract(sym, monthSpec);
  }

  if (mode === "contfut") {
    const cont = await cpResolveContFutContract(sym, options?.beforeTimeSec);
    if (cont) return cont;
    klineDebugLog("ibkr", "cpResolveContFut.fallback", {
      symbol: sym,
      beforeTimeSec: options?.beforeTimeSec ?? null,
      reason: "contfut_resolve_failed",
    });
  }

  const sectypes: string[] =
    mode === "forex"
      ? ["CASH", "STK"]
      : mode === "fut"
        ? ["FUT"]
        : mode === "contfut"
          ? ["CONTFUT", "FUT"]
          : ["STK", "CASH"];

  const searchSymbols = ibkrSecdefSearchSymbols(sym, mode);
  let best: IbkrContractCandidate | null = null;

  for (const sectype of sectypes) {
    for (const searchSym of searchSymbols) {
      const candidates = await runSecdefSearch(searchSym, sectype);
      best = pickIbkrContract(candidates, sym, mode);
      if (best) break;
    }
    if (best) break;
  }

  if (!best) {
    throw new Error(
      `未找到 ${sym} 的 IBKR 合约（conid）。期货请用交割月代码（如 MGCN6）或连续（MGC=F）；外汇用 XAUUSD；股票用 AAPL。`,
    );
  }

  const exchange = defaultHistoryExchange(best.secType, best.exchange);
  const resolved = { conid: best.conid, exchange, secType: best.secType };
  klineDebugLog("ibkr", "cpResolveContract", {
    symbol: sym,
    mode,
    searchSymbols,
    pickedSymbol: best.symbol,
    secType: best.secType,
    conid: best.conid,
    exchange,
  });
  return resolved;
}

async function cpFetchHistory(
  conid: number,
  interval: KlineInterval,
  limit: number,
  exchange: string,
  secType: string,
  options?: { endBeforeTimeSec?: number },
): Promise<{ candles: CandlestickData[]; volumes: number[] }> {
  const bar = intervalToCpBar(interval);
  const cappedLimit = Math.min(1000, Math.max(1, limit));
  const baseDays = cpPeriodCalendarDays(interval, cappedLimit);
  const cut = options?.endBeforeTimeSec;
  const isPaging = cut != null;
  const { periodDays: pagePeriodDays, spanSec: pageSpanSec } = cpPaginationWindow(
    interval,
    cappedLimit,
  );
  const periodDaysForIb = isPaging ? pagePeriodDays : baseDays;
  const period = `${periodDaysForIb}d`;
  const outsideRth =
    interval === "1d" && secType.toUpperCase() === "STK" ? "false" : "true";
  const cap = Math.min(1000, limit);
  const barSec = Math.ceil(barMsForInterval(interval) / 1000);
  /** 楔内允许最多约 2 个 bar 的间隔（周末）；更大则靠 wedge 补拉 */
  const minNewestSec = cut != null ? cut - barSec * 2.5 : 0;

  const attempts: { mode: "end_at_cut" | "legacy_anchor"; startTimeSec: number }[] =
    isPaging
      ? [
          { mode: "end_at_cut", startTimeSec: cut },
          {
            mode: "legacy_anchor",
            startTimeSec: Math.max(0, cut - pageSpanSec),
          },
        ]
      : [{ mode: "end_at_cut", startTimeSec: 0 }];

  let lastSortedCandles: CandlestickData[] = [];
  let lastSortedVolumes: number[] = [];
  let lastAttempt: (typeof attempts)[number] | null = null;
  let usedExchange = exchange;
  let lastHistoryErr: Error | null = null;

  const exchangeAttempts = historyExchangeAttempts(secType, exchange);
  const historySources = ["Trades", "Midpoint"] as const;

  klineDebugLog("ibkr", "cpFetchHistory.start", {
    conid,
    interval,
    secType,
    exchange,
    exchangeAttempts,
    historySources: [...historySources],
    period,
    isPaging,
  });

  exchangeLoop: for (const tryExchange of exchangeAttempts) {
    sourceLoop: for (const trySource of historySources) {
    lastSortedCandles = [];
    lastSortedVolumes = [];
    lastAttempt = null;
    lastHistoryErr = null;

    for (const attempt of attempts) {
      if (!isPaging && attempt.startTimeSec === 0) {
        /* 首屏：不设 startTime，由 IB 返最近 period */
      } else if (!isPaging) continue;

      const qs = new URLSearchParams({
        conid: String(conid),
        period,
        bar,
        outsideRth,
        source: trySource,
      });
      if (tryExchange !== "__OMIT__") {
        qs.set("exchange", tryExchange);
      }
      if (isPaging) {
        qs.set("startTime", formatIbCpStartTime(attempt.startTimeSec));
      }

      const res = await cpFetch(`/iserver/marketdata/history?${qs.toString()}`, {
        method: "GET",
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error(cpUnauthorizedHint());
      }
      if (!res.ok) {
        const t = await res.text();
        const err = new Error(
          `IBKR marketdata/history HTTP ${res.status}: ${t.slice(0, 320)}`,
        );
        const retryable =
          (res.status === 500 || res.status === 404) &&
          /Chart data unavailable/i.test(t);
        const lastEx = exchangeAttempts.at(-1);
        const lastSrc = historySources.at(-1);
        const hasMoreSource = trySource !== lastSrc;
        const hasMoreExchange = tryExchange !== lastEx;
        if (retryable && (hasMoreSource || hasMoreExchange)) {
          klineDebugLog("ibkr", "cpFetchHistory.retry", {
            exchange: tryExchange,
            source: trySource,
            status: res.status,
            body: t.slice(0, 160),
          });
          lastHistoryErr = err;
          if (hasMoreSource) continue sourceLoop;
          continue exchangeLoop;
        }
        klineDebugLog("ibkr", "cpFetchHistory.failure", {
          conid,
          exchange: tryExchange,
          source: trySource,
          status: res.status,
          body: t.slice(0, 320),
          exchangeAttempts,
          historySources: [...historySources],
        });
        throw err;
      }

      const json: unknown = await res.json();
      const { candles, volumes } = parseHistoryPayload(json);
      if (!candles.length) continue;

      const order = [...candles.keys()].sort(
        (i, j) =>
          (candles[i]!.time as number) - (candles[j]!.time as number),
      );
      lastSortedCandles = order.map((i) => candles[i]!);
      lastSortedVolumes = order.map((i) => volumes[i]!);
      lastAttempt = attempt;
      usedExchange = tryExchange;

      if (!isPaging) break sourceLoop;

      const { candles: outC } = sliceHistoryBeforeCut(
        lastSortedCandles,
        lastSortedVolumes,
        cut,
        cap,
      );
      const newest = outC[outC.length - 1]?.time as number | undefined;
      if (newest != null && newest >= minNewestSec) break sourceLoop;
    }

    if (lastSortedCandles.length) break sourceLoop;
    }
    if (lastSortedCandles.length) break exchangeLoop;
  }

  if (!lastSortedCandles.length && lastHistoryErr) {
    klineDebugLog("ibkr", "cpFetchHistory.failure", {
      conid,
      message: lastHistoryErr.message,
      reason: "all_exchange_source_attempts_failed",
    });
    throw lastHistoryErr;
  }

  if (!lastSortedCandles.length) {
    if (isPaging) return { candles: [], volumes: [] };
    klineDebugLog("ibkr", "cpFetchHistory.failure", {
      conid,
      reason: "empty_bars_after_ok_http",
      exchangeAttempts,
    });
    throw new Error(
      "IBKR 返回的历史数据为空（请检查合约权限、行情订阅与 period/bar 参数）",
    );
  }

  let outC: CandlestickData[];
  let outV: number[];
  if (isPaging) {
    ({ candles: outC, volumes: outV } = sliceHistoryBeforeCut(
      lastSortedCandles,
      lastSortedVolumes,
      cut,
      cap,
    ));

    const lastOut = outC[outC.length - 1]?.time as number | undefined;
    if (
      lastOut != null &&
      cut - lastOut > barSec * 1.5 &&
      cut - lastOut < barSec * 40
    ) {
      try {
        const wedge = await cpFetchWedgeBeforeCut(
          conid,
          interval,
          usedExchange,
          secType,
          outsideRth,
          lastOut,
          cut,
        );
        if (wedge.candles.length > 0) {
          const main = { candles: outC, volumes: outV };
          outC = mergeCandlesByTimeAsc(outC, wedge.candles);
          outV = mergeVolumesForCandles(outC, [main, wedge]);
        }
      } catch (e) {
        klineDebugLog("ibkr", "cpFetchWedge.error", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } else {
    const n = Math.min(cap, lastSortedCandles.length);
    const from = Math.max(0, lastSortedCandles.length - n);
    outC = lastSortedCandles.slice(from);
    outV = lastSortedVolumes.slice(from);
  }

  const firstOut = outC[0]?.time as number | undefined;
  const lastOut = outC[outC.length - 1]?.time as number | undefined;
  const firstRaw = lastSortedCandles[0]?.time as number | undefined;
  const lastRaw = lastSortedCandles[lastSortedCandles.length - 1]?.time as number | undefined;
  const joinGapToCutSec =
    cut != null && lastOut != null ? cut - lastOut : null;

  klineDebugLog("ibkr", "cpFetchHistory", {
    exchange: usedExchange,
    interval,
    limit,
    cappedLimit,
    period,
    periodDaysForIb,
    outsideRth,
    pagingMode: lastAttempt?.mode ?? null,
    endBeforeTimeSec: cut ?? null,
    endBeforeIso: cut != null ? new Date(cut * 1000).toISOString() : null,
    startTimeSec: lastAttempt?.startTimeSec ?? null,
    startTimeIso:
      lastAttempt != null
        ? new Date(lastAttempt.startTimeSec * 1000).toISOString()
        : null,
    rawBarCount: lastSortedCandles.length,
    rawFirstIso:
      firstRaw != null ? new Date(firstRaw * 1000).toISOString() : null,
    rawLastIso:
      lastRaw != null ? new Date(lastRaw * 1000).toISOString() : null,
    returnedBarCount: outC.length,
    outFirstIso:
      firstOut != null ? new Date(firstOut * 1000).toISOString() : null,
    outLastIso:
      lastOut != null ? new Date(lastOut * 1000).toISOString() : null,
    joinGapToCutSec,
    joinGapToCutBars:
      joinGapToCutSec != null && barSec > 0
        ? joinGapToCutSec / barSec
        : null,
    gapOk:
      joinGapToCutSec != null ? joinGapToCutSec <= barSec * 5 : null,
    barsAtOrAfterCut:
      cut != null
        ? lastSortedCandles.filter((c) => (c.time as number) >= cut).length
        : 0,
  });

  return { candles: outC, volumes: outV };
}

function resolveBridgeKlinesUrl(
  symbol: string,
  interval: string,
  limit: number,
  beforeTimeSec?: number,
): string {
  const b = process.env.IBKR_BRIDGE_URL!.trim();
  if (b.includes("/klines")) {
    const u = new URL(b);
    u.searchParams.set("symbol", symbol);
    u.searchParams.set("interval", interval);
    u.searchParams.set("limit", String(limit));
    if (beforeTimeSec != null) {
      u.searchParams.set("before", String(beforeTimeSec));
    }
    return u.toString();
  }
  const root = b.replace(/\/$/, "");
  const u = new URL(`${root}/klines`);
  u.searchParams.set("symbol", symbol);
  u.searchParams.set("interval", interval);
  u.searchParams.set("limit", String(limit));
  if (beforeTimeSec != null) {
    u.searchParams.set("before", String(beforeTimeSec));
  }
  return u.toString();
}

async function fetchIbkrViaBridge(
  symbol: string,
  interval: string,
  limit: number,
  beforeTimeSec?: number,
): Promise<KlinePayload> {
  const url = resolveBridgeKlinesUrl(symbol, interval, limit, beforeTimeSec);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`IBKR 桥接 HTTP ${res.status}: ${t.slice(0, 240)}`);
  }
  const json: unknown = await res.json();
  if (
    !json ||
    typeof json !== "object" ||
    !Array.isArray((json as KlinePayload).candles)
  ) {
    throw new Error("IBKR 桥接返回格式无效（需含 candles 数组）");
  }
  const p = json as KlinePayload;
  const n = p.candles?.length ?? 0;
  return {
    ...p,
    source: "ibkr",
    /** 与直连 CP 一致，避免旧桥在「不满一页」时写 hasMoreOlder:false 导致前端永不再请求 before= */
    hasMoreOlder: n > 0,
    attribution:
      p.attribution ??
      "Interactive Brokers（经 IBKR_BRIDGE_URL HTTP 桥接）",
  };
}

/**
 * Interactive Brokers — Client Portal Web API（本机 Gateway），流程对齐官方 Python 教程：
 *
 * 1. 启动 Client Portal Gateway；
 * 2. 浏览器打开同一 Gateway 登录页并完成登录；
 * 3. 代码侧仅向 `IBKR_CP_BASE_URL`（默认 https://localhost:5000）发 HTTPS 请求到 `/v1/api/...`，
 *    与 `requests.get(url, verify=False)` 同理（本机默认跳过自签名 TLS；可不设 Cookie）。
 *
 * 若配置了 `IBKR_BRIDGE_URL`，则优先走自建 HTTP 桥；否则调用
 * 期货合约：`GET /trsrv/futures`（Web API Ref getFutureBySymbol）+ `iserver/marketdata/history`；
 * 备选：`iserver/secdef/search` + `secdef/info`。
 * 若服务端请求被拒绝（401），可再设 `IBKR_CP_COOKIE` 或 `/api/ibkr/setup-cookie`。
 */
export type FetchIbkrKlinesOptions = {
  /** 当前已加载数据中最早一根 bar 的 Unix 秒；仅拉取严格早于该时刻的 K 线（向左追加） */
  beforeTimeSec?: number;
};

export async function fetchIbkrKlines(
  symbolRaw: string,
  intervalRaw: string,
  limitRaw: number,
  options?: FetchIbkrKlinesOptions,
): Promise<KlinePayload> {
  if (isIbkrTwsMode()) {
    return fetchIbkrTwsKlines(symbolRaw, intervalRaw, limitRaw, options);
  }

  const bridge = process.env.IBKR_BRIDGE_URL?.trim();
  /* CP 模式可选 HTTP 桥；TWS 模式已在上方 return */
  if (bridge) {
    return fetchIbkrViaBridge(
      symbolRaw.trim(),
      intervalRaw,
      clampKlineLimit(limitRaw),
      options?.beforeTimeSec,
    );
  }

  if (!isKlineInterval(intervalRaw)) {
    throw new Error("interval 必须为之一：15m, 1h, 4h, 1d, 1w");
  }
  const interval = intervalRaw;
  const limit = clampKlineLimit(limitRaw);
  const sym = symbolRaw.trim().toUpperCase();
  const contFutOnly = isIbkrContinuousFutChartSymbol(sym);

  if (contFutOnly && options?.beforeTimeSec != null) {
    klineDebugLog("ibkr", "cp.contfut.no_pagination", {
      symbol: sym,
      beforeTimeSec: options.beforeTimeSec,
    });
    return {
      source: "ibkr",
      symbol: sym,
      interval,
      candles: [],
      volumes: [],
      hasMoreOlder: false,
      attribution: `Interactive Brokers CP API（${cpBaseUrl()}；CONTFUT 仅首屏，不向左分页）`,
    };
  }

  clearKlineServerDebugRing();
  await cpTickle();
  let contract = await cpResolveContract(symbolRaw, {
    beforeTimeSec: contFutOnly ? undefined : options?.beforeTimeSec,
  });

  /** CONTFUT conid 首屏 history 常失败，回退为按近月 FUT 拉取 */
  if (
    contract.secType === "CONTFUT" &&
    options?.beforeTimeSec == null
  ) {
    try {
      await cpFetchHistory(
        contract.conid,
        interval,
        Math.min(5, limit),
        contract.exchange,
        contract.secType,
      );
    } catch {
      const rolled = await cpResolveContFutContract(symbolRaw.trim().toUpperCase());
      if (rolled && rolled.secType === "FUT") {
        klineDebugLog("ibkr", "cpResolveContFut.history_fallback", {
          fromConid: contract.conid,
          toConid: rolled.conid,
          ibMonth: rolled.ibMonth,
        });
        contract = rolled;
      }
    }
  }

  klineDebugLog("ibkr", "fetchIbkrKlines.contract", {
    symbol: symbolRaw.trim().toUpperCase(),
    conid: contract.conid,
    exchange: contract.exchange,
    secType: contract.secType,
    chartMode: contract.chartMode ?? null,
    ibMonth: contract.ibMonth ?? null,
    beforeTimeSec: options?.beforeTimeSec ?? null,
  });
  const beforeSec = options?.beforeTimeSec;
  const { candles, volumes } = await cpFetchHistory(
    contract.conid,
    interval,
    limit,
    contract.exchange,
    contract.secType,
    beforeSec != null ? { endBeforeTimeSec: beforeSec } : undefined,
  );
  const hasMoreOlder = contFutOnly ? false : candles.length > 0;

  return {
    source: "ibkr",
    symbol: sym,
    interval,
    candles,
    volumes,
    hasMoreOlder,
    attribution: `Interactive Brokers CP API（${cpBaseUrl()}；conid=${contract.conid} exchange=${contract.exchange}${contFutOnly ? "；CONTFUT 连续期货不向左分页" : contract.chartMode === "contfut_rolled_month" ? "；连续图按交割月拼接" : contract.secType === "CONTFUT" ? "；CONTFUT" : ""}）`,
  };
}

/**
 * Gateway 已配置 Cookie 时：用 `/iserver/secdef/search` 做代码型联想（名称侧为 IB 侧结果）。
 */
export async function searchIbkrSymbolsForAutocomplete(
  query: string,
): Promise<SymbolSearchItem[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  if (isIbkrTwsMode()) {
    const { searchIbkrTwsSymbols } = await import("@/lib/data/ibkrTwsSearch");
    return searchIbkrTwsSymbols(q);
  }
  if (!readIbkrCpCookie()) return [];

  const sym = q.toUpperCase().replace(/\s+/g, "");
  if (!isValidIbkrSymbolInput(sym)) return [];

  await cpTickle();

  const mode = inferIbkrSearchMode(sym);
  const sectypes: string[] =
    mode === "forex"
      ? ["CASH", "STK"]
      : mode === "fut"
        ? ["FUT"]
        : mode === "contfut"
          ? ["CONTFUT", "FUT"]
          : ["STK", "CASH"];

  const seen = new Set<string>();
  const out: SymbolSearchItem[] = [];

  for (const sectype of sectypes) {
    for (const searchSym of ibkrSecdefSearchSymbols(sym, mode)) {
      let candidates: IbkrContractCandidate[] = [];
      try {
        candidates = await runSecdefSearch(searchSym, sectype);
      } catch {
        return [];
      }
      for (const c of candidates) {
        const key = `${c.conid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          symbol: c.symbol,
          name: `${c.symbol} · ${c.secType}${c.exchange ? ` @ ${c.exchange}` : ""}`,
          exchange: c.exchange || "—",
          type: c.secType,
        });
        if (out.length >= 24) break;
      }
      if (out.length >= 20) break;
    }
    if (out.length >= 20) break;
  }

  return out;
}
