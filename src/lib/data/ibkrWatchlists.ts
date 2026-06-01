import { futuresContractRoot } from "@/lib/chart/executionSymbolMatch";
import { isIbkrTwsMode } from "@/lib/data/ibkrApiConfig";
import { cpFetch } from "@/lib/data/ibkrCpFetch";

function num(x: unknown): number | undefined {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export type IbkrWatchlistSymbolRow = {
  /**
   * 主行展示：股票如 QQQ；期货逐月优先完整 localSymbol/合约描述（如 MGC JUN2026）；
   * 期货连续为「MGC continuous」便于与交割月区分。
   */
  productCode: string;
  /** 副行补充（可选） */
  contractLabel?: string;
  /** 打开 K 线用的符号：连续期货为 ROOT=F，其余同接口 localSymbol / ticker */
  chartSymbol: string;
  /** 接口拼接用内部标识（兼容旧逻辑） */
  symbol: string;
  instrumentLine?: string;
  exchange?: string;
  conid?: number;
  currency?: string;
  /** 行情快照（31/83/7762），无 conid 或订阅缺失时为 undefined */
  lastPrice?: number;
  changePct?: number;
  volume?: number;
  /** 原始 localSymbol，便于区分具体月份 vs 连续 */
  localSymbol?: string;
  secType?: string;
  /** Gateway 若标明连续合约 */
  isContinuous?: boolean;
};

export type IbkrWatchlist = {
  /** Gateway 返回的自选列表 id（字符串化 wid 等） */
  id: string;
  /** 保留接口返回的原始名称 */
  name: string;
  symbols: IbkrWatchlistSymbolRow[];
};

function looksLikeCompanySentence(s: string): boolean {
  const t = s.trim();
  return t.includes(" ") && t.length > 14;
}

/** 展示用短代码：绝不把 fullName（公司全名）当成 ticker */
function watchlistProductCode(
  tickerOnly: string,
  explicitSymbol: string,
  localSymbol: string,
  symFallback: string,
): string {
  const tick = tickerOnly.trim();
  if (tick && !looksLikeCompanySentence(tick)) {
    const head = tick.split(/[@\s]/)[0] ?? tick;
    return head.toUpperCase();
  }

  const ex = explicitSymbol.trim().replace(/\s+/g, "");
  if (ex) {
    const root = futuresContractRoot(ex);
    if (root) return root;
    if (ex.length <= 16 && !explicitSymbol.includes(" ")) return ex.toUpperCase();
  }

  const lsCompact = localSymbol.replace(/\s+/g, "");
  if (lsCompact) {
    const root = futuresContractRoot(lsCompact);
    if (root) return root;
    const first = localSymbol.trim().split(/\s+/)[0] ?? "";
    if (first) return first.toUpperCase();
  }

  const fbCompact = symFallback.trim().replace(/\s+/g, "");
  if (fbCompact) {
    const root = futuresContractRoot(fbCompact);
    if (root) return root;
  }
  const fb = symFallback.trim().split(/\s+/)[0] ?? "";
  return fb.toUpperCase();
}

function watchlistChartSymbol(
  isContinuous: boolean,
  rootForFut: string | null,
  tickerOnly: string,
  localSymbol: string,
  explicitSymbol: string,
  symFallback: string,
): string {
  if (isContinuous) {
    const r =
      rootForFut ??
      (() => {
        const t = tickerOnly.trim();
        if (t && !looksLikeCompanySentence(t))
          return t.split(/[@\s]/)[0]?.toUpperCase() ?? null;
        return null;
      })();
    if (r) return `${r}=F`;
  }
  if (localSymbol.trim()) return localSymbol.trim();
  if (explicitSymbol.trim()) return explicitSymbol.trim();
  return symFallback.trim();
}

function normalizeSpaces(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * 与持仓「投资产品」列对齐：优先 IB `localSymbol`（含交割月文字），
 * 其次 `contractDesc` 首行，最后紧凑代码。
 */
function formatDatedFuturesDisplay(
  localSymbol: string,
  contractDesc: string,
  lsCompact: string,
): string {
  const ls = normalizeSpaces(localSymbol);
  if (ls) return ls.toUpperCase();
  const firstLine = normalizeSpaces(
    contractDesc.split("\n")[0] ?? contractDesc,
  );
  if (firstLine && firstLine.length <= 72) return firstLine.toUpperCase();
  if (lsCompact) return lsCompact.toUpperCase();
  return "";
}

function inferContinuousFuture(
  r: Record<string, unknown>,
  secType: string,
  localSymbol: string,
  contractDesc: string,
  descBlob: string,
): boolean {
  const st = secType.toUpperCase();
  if (st === "CONTFUT") return true;
  if (typeof r.isContinuous === "boolean" && r.isContinuous) return true;
  if (typeof r.continuous === "number" && r.continuous === 1) return true;
  const blob = `${contractDesc} ${descBlob} ${localSymbol}`;
  if (/continuous|rolling|连续|∞/i.test(blob)) return true;
  if (/@(?:\s*$)/.test(localSymbol.trim())) return true;
  return false;
}

function parseSymbolRow(r: Record<string, unknown>): IbkrWatchlistSymbolRow | null {
  /** 专用 ticker 字段（短代码）；不要用 fullName 顶替，否则会变成公司全名 */
  const tickerOnly =
    typeof r.ticker === "string"
      ? r.ticker.trim()
      : "";
  const fullName =
    typeof r.fullName === "string"
      ? r.fullName.trim()
      : "";

  const explicitSymbol =
    typeof r.symbol === "string"
      ? r.symbol.trim()
      : "";
  const localSymbol =
    typeof r.localSymbol === "string"
      ? r.localSymbol.trim()
      : "";

  const longCompany =
    typeof r.name === "string"
      ? r.name.trim()
      : typeof r.chineseName === "string"
        ? r.chineseName.trim()
        : "";

  const conidFromC =
    typeof r.C === "string"
      ? num(r.C)
      : typeof r.C === "number" && Number.isFinite(r.C)
        ? r.C
        : undefined;
  const conidRaw =
    typeof r.conid === "number" && Number.isFinite(r.conid)
      ? r.conid
      : num(r.conid) ?? conidFromC;

  const contractDesc =
    typeof r.contractDesc === "string"
      ? r.contractDesc.trim()
      : typeof r.description === "string"
        ? r.description.trim()
        : "";
  const companyHeader =
    typeof r.companyHeader === "string" ? r.companyHeader.trim() : "";

  const secTypeRaw =
    typeof r.secType === "string"
      ? r.secType.trim()
      : typeof r.sec_type === "string"
        ? String(r.sec_type).trim()
        : typeof r.sectype === "string"
          ? String(r.sectype).trim()
          : "";

  let symbol =
    explicitSymbol ||
    (tickerOnly ? tickerOnly : "") ||
    localSymbol ||
    (fullName.split(/\s+/)[0] ?? "");

  const desc =
    contractDesc || longCompany || companyHeader || symbol || "";

  let sym =
    explicitSymbol ||
    companyHeader ||
    (contractDesc ? (contractDesc.split(/\s+/)[0] ?? "") : "") ||
    tickerOnly ||
    (fullName.split(/\s+/)[0] ?? "");
  if (!sym && localSymbol) sym = localSymbol;
  if (!sym && fullName) sym = fullName.split(/\s+/)[0] ?? "";

  const lsCompact = localSymbol.replace(/\s+/g, "");
  const rootFromLs = lsCompact ? futuresContractRoot(lsCompact) : null;
  const rootFromEx = explicitSymbol.replace(/\s+/g, "")
    ? futuresContractRoot(explicitSymbol.replace(/\s+/g, ""))
    : null;
  const futRoot = rootFromLs ?? rootFromEx;

  const isContinuous = inferContinuousFuture(
    r,
    secTypeRaw,
    localSymbol,
    contractDesc,
    `${desc} ${companyHeader}`,
  );

  const symFallback = sym || symbol || desc;

  let productCode: string;
  let contractLabel: string | undefined;

  /** 非连续期货：可解析根代码、或 FUT、或 localSymbol 形态像交割合约 */
  const futLike =
    (!!futRoot && lsCompact.length > 0) ||
    /\bFUT\b/i.test(secTypeRaw) ||
    (!!lsCompact && /[FGHJKMNQUVXZ]\d{1,4}$/i.test(lsCompact));

  if (isContinuous) {
    const contRoot =
      futRoot ??
      (() => {
        const b = watchlistProductCode(
          tickerOnly,
          explicitSymbol,
          localSymbol,
          symFallback,
        );
        return (b.split(/[@\s]/)[0] ?? b).toUpperCase();
      })();
    /** 连续合约必须带 continuous，与逐月「带日期」的写法区分 */
    productCode = `${contRoot} continuous`;
    contractLabel = undefined;
  } else if (futLike) {
    productCode =
      formatDatedFuturesDisplay(localSymbol, contractDesc, lsCompact) ||
      lsCompact.toUpperCase() ||
      watchlistProductCode(
        tickerOnly,
        explicitSymbol,
        localSymbol,
        symFallback,
      );
    contractLabel = undefined;
  } else {
    productCode = watchlistProductCode(
      tickerOnly,
      explicitSymbol,
      localSymbol,
      symFallback,
    );
    if (localSymbol && localSymbol.toUpperCase() !== productCode.toUpperCase()) {
      contractLabel = localSymbol;
    }
  }

  const chartSymbol = watchlistChartSymbol(
    isContinuous,
    futRoot,
    tickerOnly,
    localSymbol,
    explicitSymbol,
    symFallback,
  );

  if (!sym && !desc && conidRaw == null) return null;

  return {
    productCode,
    contractLabel,
    chartSymbol,
    symbol: sym || desc || (conidRaw != null ? String(conidRaw) : ""),
    instrumentLine: desc || sym,
    exchange:
      typeof r.listingExchange === "string"
        ? r.listingExchange
        : typeof r.exchange === "string"
          ? r.exchange
          : undefined,
    conid: conidRaw,
    currency: typeof r.currency === "string" ? r.currency : undefined,
    localSymbol: localSymbol || undefined,
    secType: secTypeRaw || undefined,
    isContinuous,
  };
}

function extractSymbolRows(json: unknown): IbkrWatchlistSymbolRow[] {
  if (json == null) return [];
  if (Array.isArray(json)) {
    const out: IbkrWatchlistSymbolRow[] = [];
    for (const item of json) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const row = parseSymbolRow(item as Record<string, unknown>);
        if (row) out.push(row);
      }
    }
    return out;
  }
  if (typeof json === "object") {
    const o = json as Record<string, unknown>;
    const keys = [
      "instruments",
      "contracts",
      "rows",
      "symbolList",
      "secdef",
      "data",
      "wl",
    ] as const;
    for (const k of keys) {
      const arr = o[k];
      if (Array.isArray(arr)) return extractSymbolRows(arr);
    }
  }
  return [];
}

type CatalogEntry = { id: string; name: string; embedded?: unknown };

function nameFromItem(o: Record<string, unknown>): string {
  const raw =
    o.name ??
    o.watchlistName ??
    o.desc ??
    o.title ??
    o.watchlist_name ??
    o.companyHeader;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "";
}

function parseCatalogEntry(o: Record<string, unknown>): CatalogEntry | null {
  const idRaw =
    o.wid ?? o.id ?? o.watchlistId ?? o.watchlist_id ?? o.watchlistID;
  const id = idRaw != null ? String(idRaw).trim() : "";
  let name = nameFromItem(o);
  const embedded =
    o.instruments ?? o.contracts ?? o.rows ?? o.symbolList ?? o.secdef;

  if (!id) {
    if (Array.isArray(embedded) && embedded.length && name) {
      return { id: `inline-${name}`, name, embedded };
    }
    return null;
  }
  if (!name) name = id;
  return { id, name, embedded };
}

/**
 * 官方响应形如：
 * { "data": { "user_lists": [...], "system_lists": [...] }, "action": "content", ... }
 */
function extractListsFromDataEnvelope(json: unknown): Record<string, unknown>[] {
  if (json == null || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  const data = root.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const d = data as Record<string, unknown>;
  const out: Record<string, unknown>[] = [];
  for (const key of ["user_lists", "system_lists"] as const) {
    const arr = d[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        out.push(item as Record<string, unknown>);
      }
    }
  }
  return out;
}

function extractCatalogArray(json: unknown): Record<string, unknown>[] {
  const fromEnvelope = extractListsFromDataEnvelope(json);
  if (fromEnvelope.length) return fromEnvelope;

  if (json == null) return [];
  if (Array.isArray(json)) {
    return json.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<
      string,
      unknown
    >[];
  }
  if (typeof json === "object") {
    const o = json as Record<string, unknown>;
    const keys = [
      "watchlists",
      "wl",
      "data",
      "userLists",
      "USER_WATCHLIST",
    ] as const;
    for (const k of keys) {
      const v = o[k];
      if (Array.isArray(v)) return extractCatalogArray(v);
    }
    if (o.SC && Array.isArray(o.wl)) return extractCatalogArray(o.wl);
  }
  return [];
}

async function fetchWatchlistDetail(id: string): Promise<IbkrWatchlistSymbolRow[]> {
  const paths = [
    `/iserver/watchlist?id=${encodeURIComponent(id)}`,
    `/iserver/watchlist/${encodeURIComponent(id)}`,
  ];
  for (const path of paths) {
    const res = await cpFetch(path, { method: "GET" });
    if (!res.ok) continue;
    const j: unknown = await res.json().catch(() => null);
    const rows = extractSymbolRows(j);
    if (rows.length) return rows;
  }
  return [];
}

const CATALOG_PATHS = [
  "/iserver/watchlists?SC=USER_WATCHLIST",
  "/iserver/watchlist?SC=USER_WATCHLIST",
  "/iserver/watchlists",
  "/iserver/watchlist",
] as const;

/**
 * 拉取登录用户在 Gateway 下的全部自选列表（名称按接口原文保留）。
 */
export async function fetchIbkrWatchlists(): Promise<IbkrWatchlist[]> {
  if (isIbkrTwsMode()) {
    return [];
  }
  let catalog: CatalogEntry[] = [];

  for (const path of CATALOG_PATHS) {
    const res = await cpFetch(path, { method: "GET" });
    if (!res.ok) continue;
    const j: unknown = await res.json().catch(() => null);
    const raw = extractCatalogArray(j);
    const entries: CatalogEntry[] = [];
    for (const row of raw) {
      const e = parseCatalogEntry(row);
      if (e) entries.push(e);
    }
    if (entries.length) {
      catalog = entries;
      break;
    }
  }

  const out: IbkrWatchlist[] = [];
  const seenId = new Set<string>();

  for (const c of catalog) {
    if (seenId.has(c.id)) continue;
    seenId.add(c.id);

    let symbols: IbkrWatchlistSymbolRow[] = [];
    if (c.embedded != null) {
      symbols = extractSymbolRows(c.embedded);
    }
    if (!symbols.length && !c.id.startsWith("inline-")) {
      symbols = await fetchWatchlistDetail(c.id);
    }
    out.push({ id: c.id, name: c.name, symbols });
  }

  return out;
}
