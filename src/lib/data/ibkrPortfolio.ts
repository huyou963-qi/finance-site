import { isIbkrTwsMode } from "@/lib/data/ibkrApiConfig";
import {
  cpBaseUrl,
  cpFetch,
  cpUnauthorizedHint,
} from "@/lib/data/ibkrCpFetch";
import { fetchIbkrMarketSnapshots } from "@/lib/data/ibkrMarketSnapshot";
import { fetchIbkrWatchlists, type IbkrWatchlist } from "@/lib/data/ibkrWatchlists";

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
    /* 部分版本可无 tickle */
  }
}

function extractAccountIds(data: unknown): string[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    const out: string[] = [];
    for (const item of data) {
      if (typeof item === "string" && item.trim()) out.push(item.trim());
      else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const id = o.accountId ?? o.id ?? o.acctId ?? o.account;
        if (typeof id === "string" && id.trim()) out.push(id.trim());
      }
    }
    return out;
  }
  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.accounts)) return extractAccountIds(o.accounts);
    if (typeof o.accountId === "string" && o.accountId.trim())
      return [o.accountId.trim()];
  }
  return [];
}

async function fetchAccountIds(): Promise<string[]> {
  let res = await cpFetch("/portfolio/accounts", { method: "GET" });
  if (res.ok) {
    const j: unknown = await res.json().catch(() => null);
    const ids = extractAccountIds(j);
    if (ids.length) return ids;
  }
  res = await cpFetch("/iserver/accounts", { method: "GET" });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(cpUnauthorizedHint());
    }
    const t = await res.text();
    throw new Error(`IBKR 账户列表 HTTP ${res.status}: ${t.slice(0, 240)}`);
  }
  const j: unknown = await res.json().catch(() => null);
  return extractAccountIds(j);
}

/**
 * Gateway 当前会话下的账户 ID（仅调 accounts 列表，不拉持仓）。
 * K 线成交标注等场景可用来解析默认 accountId。
 */
export async function fetchIbkrAccountIds(): Promise<string[]> {
  if (isIbkrTwsMode()) {
    const { fetchIbkrTwsPortfolio } = await import("@/lib/data/ibkrTwsPortfolio");
    const p = await fetchIbkrTwsPortfolio();
    return p.accounts.map((a) => a.accountId);
  }
  await cpTickle();
  return fetchAccountIds();
}

function normalizePositionsPayload(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    const p =
      o.positions ??
      o.portfolioPositions ??
      o.positionList;
    if (Array.isArray(p))
      return p.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  }
  return [];
}

function parsePositionRow(
  r: Record<string, unknown>,
): {
  symbol: string;
  instrumentLine?: string;
  exchange?: string;
  conid?: number;
  qty?: number;
  avgCost?: number;
  lastPrice?: number;
  marketValue?: number;
  unrealizedPnl?: number;
  currency?: string;
  assetClass?: string;
  raw: Record<string, unknown>;
} {
  const symRaw =
    r.symbol ??
    r.localSymbol ??
    r.ticker;
  let symbol = typeof symRaw === "string" ? symRaw.trim() : "";
  const desc =
    typeof r.contractDesc === "string"
      ? r.contractDesc.trim()
      : typeof r.description === "string"
        ? r.description.trim()
        : "";
  const instrumentLine = desc || symbol;
  if (!symbol && desc) {
    symbol = desc.split(/\s+/)[0] ?? desc;
  }
  const conid = typeof r.conid === "number" ? r.conid : num(r.conid);
  const exch =
    typeof r.exchange === "string"
      ? r.exchange
      : typeof r.listingExchange === "string"
        ? r.listingExchange
        : undefined;
  return {
    symbol,
    instrumentLine,
    exchange: exch,
    conid: conid != null ? Math.trunc(conid) : undefined,
    qty: num(r.position ?? r.pos ?? r.quantity ?? r.qty),
    avgCost: num(r.avgPrice ?? r.avgCost ?? r.costBasisPrice),
    lastPrice: num(
      r.mktPrice ?? r.marketPrice ?? r.markPrice ?? r.lastPrice ?? r.closePrice,
    ),
    marketValue: num(r.mktValue ?? r.marketValue ?? r.market_value),
    unrealizedPnl: num(r.unrealizedPnl ?? r.unrealizedPNL ?? r.unrealized_pnl),
    currency: typeof r.currency === "string" ? r.currency : undefined,
    assetClass:
      typeof r.assetClass === "string"
        ? r.assetClass
        : typeof r.secType === "string"
          ? r.secType
          : undefined,
    raw: r,
  };
}

/** 递归收集 CP 里嵌套的 `{ tag, value }` / Account Summary 数组（少数网关形态） */
function collectSummaryTagMap(root: unknown): Map<string, number> {
  const m = new Map<string, number>();
  function visit(x: unknown): void {
    if (x == null) return;
    if (Array.isArray(x)) {
      for (const el of x) visit(el);
      return;
    }
    if (typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    const tag = o.tag ?? o.Tag ?? o.name;
    const val = o.value ?? o.Value ?? o.amount;
    if (typeof tag === "string") {
      const n = num(val);
      if (n != null && Number.isFinite(n)) {
        m.set(tag, n);
        m.set(tag.toLowerCase(), n);
      }
    }
    for (const v of Object.values(o)) visit(v);
  }
  visit(root);
  return m;
}

/**
 * CP 文档：`GET /portfolio/{accountId}/summary` 返回 **键 → { amount, currency, value, ... }**，
 * 指标名为小写键（如 netliquidation、grosspositionvalue），数值在 `amount`，不是 `{tag,value}` 数组。
 */
function parseCpSummaryKvBlock(val: unknown): number | undefined {
  if (val == null || typeof val !== "object" || Array.isArray(val)) return undefined;
  const o = val as Record<string, unknown>;
  const amt = num(o.amount);
  let fromValue: number | undefined;
  if (o.value != null && typeof o.value !== "object") {
    const raw = String(o.value).replace(/,/g, "").trim();
    if (raw !== "") {
      const parsed = num(raw);
      if (parsed != null && Number.isFinite(parsed)) fromValue = parsed;
    }
  }
  /* 网关有时 amount 为 0 而数值在 value 字符串中 */
  if (amt != null && Number.isFinite(amt) && Math.abs(amt) > 1e-9) return amt;
  if (fromValue != null) return fromValue;
  if (amt != null && Number.isFinite(amt)) return amt;
  return undefined;
}

/** 合并官方 KV 摘要 + 嵌套 tag 树 */
function buildUnifiedSummaryMap(summary: Record<string, unknown>): Map<string, number> {
  const m = new Map<string, number>();

  for (const [rawKey, val] of Object.entries(summary)) {
    /* IB 在总额后附带 -c（商品）/-s（证券）分项，归一化键名会与总额冲突导致后者被覆盖 —— 分项跳过，只用无后缀总额 */
    if (/-c$|-s$/i.test(rawKey)) continue;

    const normKey = rawKey.toLowerCase();
    const n = parseCpSummaryKvBlock(val);
    if (n != null && Number.isFinite(n)) {
      m.set(normKey, n);
    }
  }

  const tagMap = collectSummaryTagMap(summary);
  for (const [tag, v] of tagMap) {
    const lk = tag.toLowerCase();
    if (!m.has(lk)) m.set(lk, v);
    if (!m.has(tag)) m.set(tag, v);
  }
  return m;
}

function firstFromMap(map: Map<string, number>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = map.get(k) ?? map.get(k.toLowerCase());
    if (v != null && Number.isFinite(v)) return v;
  }
  return undefined;
}

/**
 * Ledger 含按币种拆分的 realizedpnl / unrealizedpnl（summary 常不提供已实现盈亏）。
 * GET /portfolio/{accountId}/ledger → { USD|BASE|...: { realizedpnl, ... } }
 */
async function fetchLedgerMetrics(
  accountId: string,
): Promise<{ realizedPnl?: number; unrealizedPnl?: number } | undefined> {
  try {
    const res = await cpFetch(
      `/portfolio/${encodeURIComponent(accountId)}/ledger`,
      { method: "GET" },
    );
    if (!res.ok) return undefined;
    const j = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!j || typeof j !== "object") return undefined;

    const block =
      (j.BASE as Record<string, unknown> | undefined) ??
      (j.USD as Record<string, unknown> | undefined) ??
      (Object.values(j).find(
        (v) =>
          v &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          "realizedpnl" in (v as object),
      ) as Record<string, unknown> | undefined);
    if (!block) return undefined;

    return {
      realizedPnl: num(block.realizedpnl),
      unrealizedPnl: num(block.unrealizedpnl),
    };
  } catch {
    return undefined;
  }
}

/** `/iserver/account/pnl/partitioned` 补充当日盈亏等（部分账户可用；失败则忽略） */
async function fetchPnlPartitioned(
  accountId: string,
): Promise<Partial<{ dpl: number; nl: number; upl: number; el: number }> | undefined> {
  try {
    const res = await cpFetch("/iserver/account/pnl/partitioned", {
      method: "GET",
    });
    if (!res.ok) return undefined;
    const j = (await res.json().catch(() => null)) as {
      upnl?: Record<string, unknown>;
    } | null;
    if (!j?.upnl || typeof j.upnl !== "object") return undefined;

    const coreKey = `${accountId}.Core`;
    let block: unknown =
      j.upnl[coreKey] ??
      j.upnl[Object.keys(j.upnl).find((k) => k.startsWith(`${accountId}.`)) ?? ""];
    if (!block || typeof block !== "object") return undefined;

    const o = block as Record<string, unknown>;
    return {
      dpl: num(o.dpl),
      nl: num(o.nl),
      upl: num(o.upl),
      el: num(o.el),
    };
  } catch {
    return undefined;
  }
}

export type IbkrSummaryMetrics = {
  netLiquidation?: number;
  dailyPnl?: number;
  dailyPnlPct?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
  marketValue?: number;
  excessLiquidity?: number;
  buyingPower?: number;
  maintenanceMargin?: number;
  /** 维持保证金 / 净清算价值 ×100，与 App「保证金占用」类口径一致 */
  maintenanceMarginToNlPct?: number;
  /** IB 返回的 Cushion（多为 0–1 小数，含义为剩余风险缓冲比例） */
  cushionFraction?: number;
  sma?: number;
  totalCash?: number;
};

/** 判断 summary 中的「昨日」字段是否与当前总净清算同一量级（commodity+证券分段账户上二者常不可比） */
function prevNlComparableToFullNl(prev: number, nl: number): boolean {
  if (!Number.isFinite(prev) || !Number.isFinite(nl) || nl <= 0 || prev <= 0)
    return false;
  const r = prev / nl;
  return r >= 0.85 && r <= 1.15;
}

export function buildSummaryMetrics(
  summary: Record<string, unknown> | null,
  pnlExtra?: Partial<{ dpl: number; nl: number; upl: number; el: number }>,
  ledgerExtra?: { realizedPnl?: number; unrealizedPnl?: number },
): IbkrSummaryMetrics {
  const m = summary ? buildUnifiedSummaryMap(summary) : new Map<string, number>();

  /* 净清算：仅以 portfolio/summary 为准；partitioned 的 nl 语义不同，仅作兜底 */
  let nl = firstFromMap(m, ["netliquidation", "netliquidationvalue"]);
  if (nl == null && pnlExtra?.nl != null) nl = pnlExtra.nl;

  const prevEquity = firstFromMap(m, [
    "previousdayequitywithloanvalue",
    "previouscloseequitywithloanvalue",
    "previousdaynetliquidation",
  ]);

  /*
   * 当日盈亏：优先 /iserver/account/pnl/partitioned 的 dpl（与 App 一致），再读 summary；
   * 勿用 nl − previousdayequitywithloanvalue 除非二者量级一致（否则 commodity 分段下会错一个数量级）。
   */
  let dailyPnl: number | undefined;
  if (pnlExtra?.dpl != null && Number.isFinite(pnlExtra.dpl)) {
    dailyPnl = pnlExtra.dpl;
  } else {
    dailyPnl = firstFromMap(m, ["dailypnl", "todaypnl"]);
    if (
      dailyPnl == null &&
      nl != null &&
      prevEquity != null &&
      prevNlComparableToFullNl(prevEquity, nl)
    ) {
      dailyPnl = nl - prevEquity;
    }
  }

  /* 当日盈亏 %：当日盈亏 / 净清算价值 × 100 */
  let dailyPnlPct: number | undefined;
  const explicitDailyPct = firstFromMap(m, [
    "dailypnlpct",
    "dailypnlpercent",
    "dailyPnLPct",
  ]);
  if (explicitDailyPct != null && Number.isFinite(explicitDailyPct)) {
    dailyPnlPct = explicitDailyPct;
  } else if (
    dailyPnl != null &&
    nl != null &&
    Number.isFinite(nl) &&
    Math.abs(nl) > 1e-9
  ) {
    dailyPnlPct = (dailyPnl / nl) * 100;
  }

  const mm = firstFromMap(m, [
    "fullmaintmarginreq",
    "maintmarginreq",
    "maintenancemarginrequirement",
    "lookaheadmaintmarginreq",
  ]);

  let maintenanceMarginToNlPct: number | undefined;
  if (nl != null && nl !== 0 && mm != null && Number.isFinite(mm)) {
    maintenanceMarginToNlPct = (Math.abs(mm) / Math.abs(nl)) * 100;
  }

  /* cushion：amount 常为 0，比例在 value 字符串（见示例 "0.690096"）——已由 parseCpSummaryKvBlock 处理 */
  const cushionFraction = firstFromMap(m, ["cushion"]);

  return {
    netLiquidation: nl,
    dailyPnl,
    dailyPnlPct,
    unrealizedPnl:
      firstFromMap(m, ["unrealizedpnl"]) ??
      ledgerExtra?.unrealizedPnl ??
      pnlExtra?.upl,
    realizedPnl:
      firstFromMap(m, ["realizedpnl"]) ?? ledgerExtra?.realizedPnl,
    marketValue: firstFromMap(m, [
      "grosspositionvalue",
      "stockmarketvalue",
    ]),
    excessLiquidity:
      firstFromMap(m, ["excessliquidity"]) ?? pnlExtra?.el,
    buyingPower: firstFromMap(m, [
      "buyingpower",
      "fullavailablefunds",
      "availablefunds",
    ]),
    maintenanceMargin: mm,
    maintenanceMarginToNlPct,
    cushionFraction,
    sma: firstFromMap(m, ["sma", "sma-s"]),
    totalCash: firstFromMap(m, [
      "totalcashvalue",
      "settledcash",
    ]),
  };
}

const MAX_POSITION_PAGES = 24;

async function fetchPositionsForAccount(
  accountId: string,
): Promise<{ positions: ReturnType<typeof parsePositionRow>[]; truncated: boolean }> {
  const positions: ReturnType<typeof parsePositionRow>[] = [];
  let truncated = false;

  for (let page = 0; page < MAX_POSITION_PAGES; page++) {
    const res = await cpFetch(
      `/portfolio/${encodeURIComponent(accountId)}/positions/${page}`,
      { method: "GET" },
    );
    if (res.status === 401 || res.status === 403) {
      throw new Error(cpUnauthorizedHint());
    }
    if (!res.ok) break;

    const json: unknown = await res.json().catch(() => null);
    const rows = normalizePositionsPayload(json);
    for (const row of rows) {
      const p = parsePositionRow(row);
      if (p.symbol || p.instrumentLine) positions.push(p);
    }

    const next =
      res.headers.get("Next-Page") ??
      res.headers.get("next-page") ??
      (json &&
      typeof json === "object" &&
      (json as Record<string, unknown>)["next-page-id"] != null
        ? String((json as Record<string, unknown>)["next-page-id"])
        : null);
    const hasNext = Boolean(next) && rows.length > 0;
    if (!hasNext) break;
    if (page === MAX_POSITION_PAGES - 1) {
      truncated = true;
      break;
    }
  }

  return { positions, truncated };
}

async function fetchSummary(
  accountId: string,
): Promise<Record<string, unknown> | undefined> {
  const res = await cpFetch(
    `/portfolio/${encodeURIComponent(accountId)}/summary`,
    { method: "GET" },
  );
  if (res.status === 401 || res.status === 403) {
    throw new Error(cpUnauthorizedHint());
  }
  if (!res.ok) return undefined;
  const j: unknown = await res.json().catch(() => null);
  if (j && typeof j === "object" && !Array.isArray(j)) {
    return j as Record<string, unknown>;
  }
  return undefined;
}

export type IbkrPortfolioPositionRow = {
  symbol: string;
  instrumentLine?: string;
  exchange?: string;
  conid?: number;
  qty?: number;
  avgCost?: number;
  lastPrice?: number;
  marketValue?: number;
  unrealizedPnl?: number;
  currency?: string;
  assetClass?: string;
};

export type IbkrPortfolioAccountBlock = {
  accountId: string;
  summary: Record<string, unknown> | null;
  summaryMetrics: IbkrSummaryMetrics;
  positions: IbkrPortfolioPositionRow[];
  positionsTruncated: boolean;
};

export type IbkrPortfolioResult = {
  gatewayBaseUrl: string;
  accounts: IbkrPortfolioAccountBlock[];
  watchlists: IbkrWatchlist[];
};

/**
 * 拉取账户摘要与持仓。
 * - `IBKR_API_MODE=tws`：TWS Socket API
 * - 默认：Client Portal Gateway（需 Cookie / 浏览器登录）
 */
export async function fetchIbkrPortfolio(): Promise<IbkrPortfolioResult> {
  if (isIbkrTwsMode()) {
    const { fetchIbkrTwsPortfolio } = await import("@/lib/data/ibkrTwsPortfolio");
    return fetchIbkrTwsPortfolio();
  }

  await cpTickle();
  const accountIds = await fetchAccountIds();
  const gatewayBaseUrl = cpBaseUrl();

  const watchlistsP = fetchIbkrWatchlists().catch((): IbkrWatchlist[] => []);

  const accounts: IbkrPortfolioAccountBlock[] = [];
  for (const accountId of accountIds) {
    const [summary, { positions, truncated }, pnlExtra, ledgerExtra] =
      await Promise.all([
        fetchSummary(accountId),
        fetchPositionsForAccount(accountId),
        fetchPnlPartitioned(accountId),
        fetchLedgerMetrics(accountId),
      ]);
    accounts.push({
      accountId,
      summary: summary ?? null,
      summaryMetrics: buildSummaryMetrics(
        summary ?? null,
        pnlExtra,
        ledgerExtra,
      ),
      positions: positions.map((p) => ({
        symbol: p.symbol,
        instrumentLine: p.instrumentLine,
        exchange: p.exchange,
        conid: p.conid,
        qty: p.qty,
        avgCost: p.avgCost,
        lastPrice: p.lastPrice,
        marketValue: p.marketValue,
        unrealizedPnl: p.unrealizedPnl,
        currency: p.currency,
        assetClass: p.assetClass,
      })),
      positionsTruncated: truncated,
    });
  }

  let watchlists = await watchlistsP;

  const conids = watchlists.flatMap((wl) =>
    wl.symbols
      .map((s) => s.conid)
      .filter((c): c is number => typeof c === "number" && c > 0),
  );
  if (conids.length > 0) {
    try {
      const quotes = await fetchIbkrMarketSnapshots(conids);
      watchlists = watchlists.map((wl) => ({
        ...wl,
        symbols: wl.symbols.map((s) => {
          if (s.conid == null) return s;
          const q = quotes.get(s.conid);
          if (!q) return s;
          return { ...s, ...q };
        }),
      }));
    } catch {
      /* 行情快照失败时仍返回自选列表 */
    }
  }

  return { gatewayBaseUrl, accounts, watchlists };
}
