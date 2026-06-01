import type { ChartExecutionTrade } from "@/lib/chart/executionMarkers";
import { executionSymbolMatchKey } from "@/lib/chart/executionSymbolMatch";
import { normalizeFlexSymbol } from "@/lib/chart/flexSymbolNormalize";

/** localStorage 键：导入的 Flex 成交（按浏览器持久化） */
export const FLEX_EXEC_STORAGE_KEY = "kline-ibkr-flex-executions-v1";

export type FlexImportBundle = {
  v: 1;
  importedAt: string;
  trades: ChartExecutionTrade[];
};

export { normalizeFlexSymbol } from "@/lib/chart/flexSymbolNormalize";

/**
 * IB Flex `Trade` 常见属性：tradeDate=YYYYMMDD tradeTime=HHMMSS（美东等时区由报表定义，此处按 UTC 拼接仅作近似）。
 */
function flexAttrDateTimeToUnixSec(
  tradeDate: string,
  tradeTime: string | null,
): number | null {
  const d = tradeDate.replace(/\D/g, "");
  if (d.length !== 8) return null;
  const y = Number(d.slice(0, 4));
  const mo = Number(d.slice(4, 6)) - 1;
  const day = Number(d.slice(6, 8));
  let hh = 0,
    mm = 0,
    ss = 0;
  if (tradeTime && /^\d{6}$/.test(tradeTime.replace(/\D/g, ""))) {
    const t = tradeTime.replace(/\D/g, "");
    hh = Number(t.slice(0, 2));
    mm = Number(t.slice(2, 4));
    ss = Number(t.slice(4, 6));
  }
  return Math.floor(Date.UTC(y, mo, day, hh, mm, ss) / 1000);
}

function parseBuySell(attr: string | null, quantity: number): string {
  const u = (attr ?? "").toUpperCase();
  if (u.includes("BUY") || u === "B" || u === "BOT") return "B";
  if (u.includes("SELL") || u === "S" || u === "SLD") return "S";
  return quantity < 0 ? "S" : "B";
}

/** 交易确认 HTML 常见格式：`2025-06-09, 09:30:00`（报表时间为东部时间，此处按 UTC 存 Unix 秒与 Flex XML 一致） */
function parseTradeConfirmHtmlDateTime(s: string): number | null {
  const t = s.trim();
  const m = t.match(
    /^(\d{4})-(\d{2})-(\d{2})[,\s]+(\d{1,2}):(\d{2}):(\d{2})/,
  );
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = Number(m[6]);
  const sec = Date.UTC(y, mo, d, hh, mm, ss) / 1000;
  return Number.isFinite(sec) ? Math.floor(sec) : null;
}

function parseLocaleNumberCell(text: string): number {
  return Number(String(text).replace(/,/g, "").trim());
}

/**
 * 解析 IBKR「交易确认报告」下载的 HTML（.htm）：主表 `#summaryDetailTable`，
 * 优先取 `tbody.row-detail` 中带 `td.indent` 的明细行（与汇总行不重复）。
 */
export function parseIbFlexTradesHtm(htmlText: string): {
  trades: ChartExecutionTrade[];
  errors: string[];
} {
  const errors: string[] = [];
  const trades: ChartExecutionTrade[] = [];
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(htmlText, "text/html");
  } catch {
    return { trades: [], errors: ["无法解析 HTML"] };
  }
  const table = doc.querySelector("#summaryDetailTable");
  if (!table) {
    return {
      trades: [],
      errors: [
        "未找到交易表 #summaryDetailTable。请使用盈透「交易确认报告」导出的 HTML。",
      ],
    };
  }

  const tbodies = Array.from(table.querySelectorAll("tbody"));

  const pushFromRow = (tr: Element): void => {
    const tds = tr.querySelectorAll(":scope > td");
    if (tds.length < 8) return;

    const symbolRaw = (tds[1]?.textContent ?? "").trim();
    if (!symbolRaw || symbolRaw.includes("总数")) return;

    const tradeTimeSec = parseTradeConfirmHtmlDateTime(
      tds[2]?.textContent ?? "",
    );
    if (tradeTimeSec == null || !Number.isFinite(tradeTimeSec)) return;

    const qtySigned = parseLocaleNumberCell(tds[6]?.textContent ?? "");
    const qty = Math.abs(qtySigned);
    if (!Number.isFinite(qty) || qty === 0) return;

    const price = parseLocaleNumberCell(tds[7]?.textContent ?? "");
    if (!Number.isFinite(price)) return;

    const sideRaw = (tds[5]?.textContent ?? "").trim();
    const side = parseBuySell(sideRaw, qtySigned);

    const exchange = (tds[4]?.textContent ?? "").trim();
    const proceeds = parseLocaleNumberCell(tds[8]?.textContent ?? "");
    const commission = parseLocaleNumberCell(tds[9]?.textContent ?? "");

    const sym = normalizeFlexSymbol(symbolRaw);
    const dedupeKey = `flexhtm|${sym}|${tradeTimeSec}|${price}|${qty}|${side}|${exchange}|${commission}|${proceeds}`;

    trades.push({
      tradeTimeSec,
      price,
      size: qty,
      side,
      symbol: sym,
      source: "flex",
      dedupeKey,
    });
  };

  for (let i = 0; i < tbodies.length; i++) {
    const tbody = tbodies[i]!;
    if (tbody.classList.contains("row-detail")) {
      for (const tr of tbody.querySelectorAll(":scope > tr")) {
        const first = tr.querySelector(":scope > td");
        if (!first?.classList.contains("indent")) continue;
        pushFromRow(tr);
      }
      continue;
    }

    const summaryTr = tbody.querySelector(":scope > tr.row-summary");
    if (!summaryTr) continue;
    const next = tbodies[i + 1];
    const hasDetailRows =
      next?.classList.contains("row-detail") &&
      next.querySelector(":scope > tr > td.indent");
    if (!hasDetailRows) {
      pushFromRow(summaryTr);
    }
  }

  if (!trades.length) {
    errors.push(
      "未能从 HTML 解析出成交。请确认文件为 IBKR「交易确认报告」且交易区块可展开明细。",
    );
  }

  return { trades, errors };
}

/**
 * 解析 IBKR Flex Web 下载的典型 XML（含 `<Trade ... />` 元素）。
 */
export function parseIbFlexTradesXml(xmlText: string): {
  trades: ChartExecutionTrade[];
  errors: string[];
} {
  const errors: string[] = [];
  const trades: ChartExecutionTrade[] = [];
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xmlText, "text/xml");
  } catch {
    return { trades: [], errors: ["无法解析 XML"] };
  }
  const parseErr = doc.querySelector("parsererror");
  if (parseErr) errors.push("XML 结构异常（可能不是 Flex 报表）");

  const nodes = doc.getElementsByTagName("Trade");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i]!;
    const symbol =
      el.getAttribute("symbol")?.trim() ||
      el.getAttribute("underlyingSymbol")?.trim() ||
      "";
    if (!symbol) continue;

    const tradeDate =
      el.getAttribute("tradeDate")?.trim() ||
      el.getAttribute("dateTime")?.trim()?.slice(0, 8) ||
      "";
    const tradeTime =
      el.getAttribute("tradeTime")?.trim() ||
      el.getAttribute("dateTime")?.trim()?.slice(9, 15) ||
      null;

    let tradeTimeSec = flexAttrDateTimeToUnixSec(tradeDate, tradeTime);
    if (tradeTimeSec == null || !Number.isFinite(tradeTimeSec)) {
      const alt = el.getAttribute("dateTime");
      if (alt && /^\d{8};?\d{6}$/.test(alt.replace(/\s/g, ""))) {
        const raw = alt.replace(/\s/g, "").replace(";", "");
        tradeTimeSec = flexAttrDateTimeToUnixSec(
          raw.slice(0, 8),
          raw.slice(8, 14),
        );
      }
    }
    if (tradeTimeSec == null || !Number.isFinite(tradeTimeSec)) continue;

    const qtyRaw =
      el.getAttribute("quantity")?.trim() ||
      el.getAttribute("units")?.trim() ||
      "0";
    const quantity = Math.abs(Number(qtyRaw));
    if (!Number.isFinite(quantity) || quantity === 0) continue;

    const priceRaw = el.getAttribute("tradePrice") ?? el.getAttribute("price");
    const price = Number(priceRaw);
    if (!Number.isFinite(price)) continue;

    const side = parseBuySell(el.getAttribute("buySell"), Number(qtyRaw));
    const execId =
      el.getAttribute("transactionID")?.trim() ||
      el.getAttribute("tradeID")?.trim() ||
      el.getAttribute("ibExecId")?.trim() ||
      "";

    const dedupeKey =
      execId ||
      `flex|${symbol}|${tradeTimeSec}|${price}|${quantity}|${side}`;

    trades.push({
      tradeTimeSec,
      price,
      size: quantity,
      side,
      symbol: normalizeFlexSymbol(symbol),
      source: "flex",
      dedupeKey,
    });
  }

  if (!trades.length && !errors.length && nodes.length === 0) {
    errors.push(
      "未找到 <Trade> 节点。请在 Flex 查询中选「交易」类字段并导出为 XML。",
    );
  }

  return { trades, errors };
}

/** 简易 CSV：表头需含 Symbol, TradeDate, TradeTime, Quantity, Price, Buy/Sell 等（不区分大小写） */
export function parseIbFlexTradesCsv(text: string): {
  trades: ChartExecutionTrade[];
  errors: string[];
} {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { trades: [], errors: ["CSV 行数不足"] };

  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) =>
    header.findIndex((h) => h.includes(name.toLowerCase()));

  const iSym = idx("symbol");
  const iDate =
    header.findIndex((h) => h === "tradedate" || h.includes("trade date")) >= 0
      ? header.findIndex((h) => h === "tradedate" || h.includes("trade date"))
      : idx("date");
  const iTime = idx("tradetime") >= 0 ? idx("tradetime") : idx("time");
  const iQty = idx("quantity") >= 0 ? idx("quantity") : idx("qty");
  const iPrice = idx("price") >= 0 ? idx("price") : idx("tradeprice");
  const iSide = idx("buysell") >= 0 ? idx("buysell") : idx("side");

  if (iSym < 0 || iQty < 0 || iPrice < 0) {
    return {
      trades: [],
      errors: ["CSV 缺少必要列（至少需要 Symbol、Quantity、Price）"],
    };
  }

  const trades: ChartExecutionTrade[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r]!.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const symbol = cols[iSym]?.trim() ?? "";
    if (!symbol) continue;

    const tradeDate = cols[iDate >= 0 ? iDate : iSym]?.replace(/\D/g, "") ?? "";
    const tradeTime =
      iTime >= 0 ? (cols[iTime]?.replace(/\D/g, "").slice(0, 6) ?? "") : "";
    let tradeTimeSec = flexAttrDateTimeToUnixSec(
      tradeDate.length === 8 ? tradeDate : "",
      tradeTime.length >= 6 ? tradeTime : null,
    );
    if (tradeTimeSec == null) continue;

    const qty = Math.abs(Number(cols[iQty]));
    const price = Number(cols[iPrice]);
    if (!Number.isFinite(qty) || qty === 0 || !Number.isFinite(price)) continue;

    const sideRaw = iSide >= 0 ? cols[iSide] : "";
    const side = parseBuySell(sideRaw, Number(cols[iQty]));

    trades.push({
      tradeTimeSec,
      price,
      size: qty,
      side,
      symbol: normalizeFlexSymbol(symbol),
      source: "flex",
      dedupeKey: `flexcsv|${symbol}|${tradeTimeSec}|${price}|${qty}|${side}`,
    });
  }

  if (!trades.length) errors.push("未能从 CSV 解析出有效成交行");
  return { trades, errors };
}

export function parseFlexFileContent(
  fileName: string,
  text: string,
): { trades: ChartExecutionTrade[]; errors: string[] } {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return parseIbFlexTradesCsv(text);
  if (lower.endsWith(".htm") || lower.endsWith(".html")) {
    return parseIbFlexTradesHtm(text);
  }
  return parseIbFlexTradesXml(text);
}

export function loadFlexTradesFromStorage(): ChartExecutionTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FLEX_EXEC_STORAGE_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as FlexImportBundle;
    if (j?.v !== 1 || !Array.isArray(j.trades)) return [];
    return j.trades;
  } catch {
    return [];
  }
}

export function saveFlexTradesToStorage(trades: ChartExecutionTrade[]): void {
  if (typeof window === "undefined") return;
  const bundle: FlexImportBundle = {
    v: 1,
    importedAt: new Date().toISOString(),
    trades,
  };
  localStorage.setItem(FLEX_EXEC_STORAGE_KEY, JSON.stringify(bundle));
}

export function clearFlexTradesStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(FLEX_EXEC_STORAGE_KEY);
}

/** 合并三路并按 dedupeKey / 合成键去重；portfolio 优先于 gateway 优先于 flex */
export function mergeChartExecutionTrades(
  chartSymbolRaw: string,
  parts: {
    gateway: ChartExecutionTrade[];
    flex: ChartExecutionTrade[];
    portfolio: ChartExecutionTrade[];
  },
): ChartExecutionTrade[] {
  const want = executionSymbolMatchKey(chartSymbolRaw);
  if (!want) return [];

  const flexFiltered = parts.flex.filter((t) => {
    if (!t.symbol?.trim()) return false;
    return executionSymbolMatchKey(t.symbol) === want;
  });

  const toMarker = (t: ChartExecutionTrade): ChartExecutionTrade => ({
    tradeTimeSec: t.tradeTimeSec,
    price: t.price,
    size: t.size,
    side: t.side,
  });

  const ordered = [...parts.portfolio, ...parts.gateway, ...flexFiltered];
  const seen = new Set<string>();
  const out: ChartExecutionTrade[] = [];
  for (const t of ordered) {
    const k =
      t.dedupeKey?.trim() ||
      `${t.tradeTimeSec}|${t.price}|${t.size}|${t.side}|${t.symbol ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(toMarker(t));
  }
  return out;
}
