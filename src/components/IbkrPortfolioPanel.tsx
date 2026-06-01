"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  chartExecutionTradesToTradeRows,
  type ChartExecutionTrade,
  type TradeRecordRow,
} from "@/lib/chart/executionMarkers";
import { executionSymbolMatchKey } from "@/lib/chart/executionSymbolMatch";
import { normalizeTickerSymbol } from "@/lib/data/tickerSymbolNormalize";

type SummaryMetrics = {
  netLiquidation?: number;
  dailyPnl?: number;
  dailyPnlPct?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
  marketValue?: number;
  excessLiquidity?: number;
  buyingPower?: number;
  maintenanceMargin?: number;
  maintenanceMarginToNlPct?: number;
  cushionFraction?: number;
  sma?: number;
  totalCash?: number;
};

type PortfolioPayload = {
  gatewayBaseUrl?: string;
  error?: string;
  accounts: {
    accountId: string;
    summary: Record<string, unknown> | null;
    summaryMetrics: SummaryMetrics;
    positions: {
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
    }[];
    positionsTruncated: boolean;
  }[];
  watchlists?: {
    id: string;
    name: string;
    symbols: {
      symbol: string;
      productCode?: string;
      contractLabel?: string;
      chartSymbol?: string;
      instrumentLine?: string;
      exchange?: string;
      conid?: number;
      currency?: string;
      lastPrice?: number;
      changePct?: number;
      volume?: number;
    }[];
  }[];
};

const STORAGE_WIDTH_KEY = "ibkr-portfolio-panel-width";
const STORAGE_COLLAPSED_KEY = "ibkr-portfolio-panel-collapsed";
const STORAGE_TOP_PCT_KEY = "ibkr-portfolio-panel-top-pct";
const STORAGE_MID_PCT_KEY = "ibkr-portfolio-panel-mid-pct";
/** @deprecated 旧版底栏高度，仅用于迁移默认宽度 */
const STORAGE_HEIGHT_KEY_LEGACY = "ibkr-portfolio-panel-height";

const MIN_W = 260;
const MAX_W = 440;
const DEFAULT_W = 300;
const DRAG_THRESHOLD_PX = 5;

/** 上：持仓/自选 占侧栏内容高度比例 */
const MIN_TOP_PCT = 22;
const MAX_TOP_PCT = 58;
const DEFAULT_TOP_PCT = 36;

/** 中：交易记录 占侧栏内容高度比例 */
const MIN_MID_PCT = 14;
const MAX_MID_PCT = 40;
const DEFAULT_MID_PCT = 22;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function fmtNum(n: number | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function fmtMoney(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 0 : 2;
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function signedColor(n: number | undefined): string {
  if (n == null || Number.isNaN(n) || n === 0) return "text-slate-300";
  return n > 0 ? "text-emerald-400" : "text-rose-400";
}

/** Cushion：网关多为 0–1 小数表示比例 */
function fmtCushionPct(c: number | undefined): string {
  if (c == null || Number.isNaN(c)) return "—";
  const pct = c > 0 && c <= 1 ? c * 100 : c;
  return `${pct.toFixed(2)}%`;
}

function fmtChangePct(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtVolume(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** 取用于 K 线搜索的代码：自选行若有解析好的 chartSymbol（含连续期货 ROOT=F）则优先 */
function chartSymbolFromPosition(p: {
  symbol: string;
  instrumentLine?: string;
  chartSymbol?: string;
}): string {
  if (p.chartSymbol?.trim()) return p.chartSymbol.trim();
  const s = p.symbol.trim();
  if (s) return s.split(/\s+/)[0] ?? s;
  const line = p.instrumentLine?.trim() ?? "";
  return line.split(/\s+/)[0] ?? line;
}

/** 与 K 线 Flex/Gateway 成交筛选一致：期货合约与连续合约 ROOT=F 视为同一标的 */
function chartSymKey(raw: string): string {
  try {
    const y = normalizeTickerSymbol(raw.trim());
    return (
      executionSymbolMatchKey(y) || (y.split(/\s+/)[0]?.toUpperCase() ?? "")
    );
  } catch {
    return executionSymbolMatchKey(raw.trim()) || "";
  }
}

type TradeFocus = { chartSymbol: string; conid?: number };

export function IbkrPortfolioPanel({
  onPickSymbol,
  activeChartSymbol,
  chartExecutionTrades = [],
  onExecutionTradesChange,
  flexTradesImportSlot,
}: {
  onPickSymbol: (symbol: string) => void;
  /** 当前主图代码；与持仓选中不一致时清空成交选中 */
  activeChartSymbol?: string;
  /** 当前图表已合并的成交（Flex / Gateway / 持仓点击），用于侧栏列表与 K 线一致 */
  chartExecutionTrades?: ChartExecutionTrade[];
  /** 传给 K 线标注的成交（最近 Gateway 支持的日历日） */
  onExecutionTradesChange?: (trades: ChartExecutionTrade[]) => void;
  /** 渲染在「交易记录」标题右侧，例如 IB 报表导入 */
  flexTradesImportSlot?: ReactNode;
}) {
  const [width, setWidth] = useState(DEFAULT_W);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [topPct, setTopPct] = useState(DEFAULT_TOP_PCT);
  const [topSplitDragging, setTopSplitDragging] = useState(false);
  const [midPct, setMidPct] = useState(DEFAULT_MID_PCT);
  const [midSplitDragging, setMidSplitDragging] = useState(false);
  const [payload, setPayload] = useState<PortfolioPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [accountIdx, setAccountIdx] = useState(0);
  const [rightPaneTab, setRightPaneTab] = useState<"positions" | "watchlists">(
    "positions",
  );
  const [watchlistIdx, setWatchlistIdx] = useState(0);
  const [tradeFocus, setTradeFocus] = useState<TradeFocus | null>(null);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesErr, setTradesErr] = useState<string | null>(null);
  const [gatewayTradeRows, setGatewayTradeRows] = useState<TradeRecordRow[]>(
    [],
  );

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startW: number;
    dragging: boolean;
  } | null>(null);

  const columnContainerRef = useRef<HTMLDivElement>(null);
  const topSplitDragRef = useRef<{
    pointerId: number;
    startY: number;
    startPct: number;
    containerH: number;
  } | null>(null);
  const midSplitDragRef = useRef<{
    pointerId: number;
    startY: number;
    startPct: number;
    containerH: number;
  } | null>(null);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const w = Number(localStorage.getItem(STORAGE_WIDTH_KEY));
      if (Number.isFinite(w) && w >= MIN_W && w <= MAX_W) {
        setWidth(w);
      } else {
        const legacyH = Number(
          localStorage.getItem(STORAGE_HEIGHT_KEY_LEGACY),
        );
        if (Number.isFinite(legacyH) && legacyH >= 200) {
          setWidth(clamp(Math.round(legacyH * 1.15), MIN_W, MAX_W));
        }
      }
      if (localStorage.getItem(STORAGE_COLLAPSED_KEY) === "1") setCollapsed(true);
      const top = Number(localStorage.getItem(STORAGE_TOP_PCT_KEY));
      if (Number.isFinite(top) && top >= MIN_TOP_PCT && top <= MAX_TOP_PCT) {
        setTopPct(top);
      }
      const mid = Number(localStorage.getItem(STORAGE_MID_PCT_KEY));
      if (Number.isFinite(mid) && mid >= MIN_MID_PCT && mid <= MAX_MID_PCT) {
        setMidPct(mid);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_WIDTH_KEY, String(Math.round(width)));
    } catch {
      /* ignore */
    }
  }, [width]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TOP_PCT_KEY, String(Math.round(topPct * 10) / 10));
    } catch {
      /* ignore */
    }
  }, [topPct]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_MID_PCT_KEY,
        String(Math.round(midPct * 10) / 10),
      );
    } catch {
      /* ignore */
    }
  }, [midPct]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const load = useCallback(() => {
    setLoading(true);
    setFetchErr(null);
    fetch("/api/ibkr/portfolio", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as PortfolioPayload & { error?: string };
        setPayload(j);
        setAccountIdx(0);
        if (j.error) setFetchErr(j.error);
      })
      .catch((e) => {
        setPayload(null);
        setFetchErr(e instanceof Error ? e.message : "请求失败");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const n = payload?.accounts?.length ?? 0;
    if (accountIdx >= n) setAccountIdx(0);
  }, [payload?.accounts?.length, accountIdx]);

  useEffect(() => {
    const n = payload?.watchlists?.length ?? 0;
    if (watchlistIdx >= n) setWatchlistIdx(0);
  }, [payload?.watchlists?.length, watchlistIdx]);

  useEffect(() => {
    if (!tradeFocus || !activeChartSymbol?.trim()) return;
    const a = chartSymKey(activeChartSymbol);
    const b = chartSymKey(tradeFocus.chartSymbol);
    if (a && b && a !== b) {
      setTradeFocus(null);
      setGatewayTradeRows([]);
      setTradesErr(null);
      onExecutionTradesChange?.([]);
    }
  }, [activeChartSymbol, tradeFocus, onExecutionTradesChange]);

  const chartTradeRows = useMemo(
    () => chartExecutionTradesToTradeRows(chartExecutionTrades),
    [chartExecutionTrades],
  );

  const displayTradeRows = useMemo(() => {
    if (gatewayTradeRows.length > 0) return gatewayTradeRows;
    return chartTradeRows;
  }, [gatewayTradeRows, chartTradeRows]);

  const tradeListSymbol =
    tradeFocus?.chartSymbol?.trim() || activeChartSymbol?.trim() || "";

  useEffect(() => {
    if (!tradeFocus) {
      setGatewayTradeRows([]);
      setTradesErr(null);
      setTradesLoading(false);
      /** 仅清空「组合里选中持仓」叠加层；Flex/Gateway 由行情页 chartExecutionTrades 维护 */
      onExecutionTradesChange?.([]);
      return;
    }

    const acc = payload?.accounts?.[accountIdx];
    if (!acc?.accountId) {
      setTradesErr("无账户");
      onExecutionTradesChange?.([]);
      return;
    }

    let cancelled = false;
    setTradesLoading(true);
    setTradesErr(null);

    const qs = new URLSearchParams({
      accountId: acc.accountId,
      symbol: tradeFocus.chartSymbol,
      days: "7",
    });
    if (tradeFocus.conid != null) qs.set("conid", String(tradeFocus.conid));

    fetch(`/api/ibkr/trades?${qs.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as {
          trades?: {
            executionId: string;
            side: string;
            tradeTimeSec: number;
            size: number;
            price: number;
            exchange?: string;
            orderDescription?: string;
          }[];
          error?: string;
        };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        if (cancelled) return;
        const list = j.trades ?? [];
        setGatewayTradeRows(
          list.map((t) => ({
            executionId: t.executionId,
            side: t.side,
            tradeTimeSec: t.tradeTimeSec,
            size: t.size,
            price: t.price,
          })),
        );
        const markers: ChartExecutionTrade[] = list.map((t) => ({
          tradeTimeSec: t.tradeTimeSec,
          price: t.price,
          size: t.size,
          side: t.side,
          source: "portfolio",
          dedupeKey: t.executionId,
        }));
        onExecutionTradesChange?.(markers);
      })
      .catch((e) => {
        if (cancelled) return;
        setGatewayTradeRows([]);
        setTradesErr(e instanceof Error ? e.message : "加载失败");
        onExecutionTradesChange?.([]);
      })
      .finally(() => {
        if (!cancelled) setTradesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tradeFocus, payload?.accounts, accountIdx, onExecutionTradesChange]);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);

      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startW: width,
        dragging: false,
      };

      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d || ev.pointerId !== d.pointerId) return;

        if (collapsed) return;

        if (Math.abs(ev.clientX - d.startX) > DRAG_THRESHOLD_PX) {
          if (!d.dragging) {
            d.dragging = true;
            setDragging(true);
          }
          const next = clamp(
            d.startW + (ev.clientX - d.startX),
            MIN_W,
            MAX_W,
          );
          setWidth(next);
        }
      };

      const onUp = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d || ev.pointerId !== d.pointerId) return;

        try {
          el.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }

        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);

        const wasDrag = d.dragging;
        dragRef.current = null;
        setDragging(false);

        if (!wasDrag) {
          setCollapsed((c) => !c);
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [collapsed, width],
  );

  const onTopSplitPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const panel = columnContainerRef.current;
      if (!panel) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const H = panel.offsetHeight || 1;
      topSplitDragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startPct: topPct,
        containerH: H,
      };
      setTopSplitDragging(true);

      const onMove = (ev: PointerEvent) => {
        const d = topSplitDragRef.current;
        if (!d || ev.pointerId !== d.pointerId) return;
        const deltaPct = ((ev.clientY - d.startY) / d.containerH) * 100;
        const maxTop = Math.min(
          MAX_TOP_PCT,
          100 - midPct - 18,
        );
        setTopPct(clamp(d.startPct + deltaPct, MIN_TOP_PCT, maxTop));
      };

      const onUp = (ev: PointerEvent) => {
        const d = topSplitDragRef.current;
        if (!d || ev.pointerId !== d.pointerId) return;
        try {
          el.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        topSplitDragRef.current = null;
        setTopSplitDragging(false);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [topPct, midPct],
  );

  const onMidSplitPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const panel = columnContainerRef.current;
      if (!panel) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const H = panel.offsetHeight || 1;
      midSplitDragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startPct: midPct,
        containerH: H,
      };
      setMidSplitDragging(true);

      const onMove = (ev: PointerEvent) => {
        const d = midSplitDragRef.current;
        if (!d || ev.pointerId !== d.pointerId) return;
        const deltaPct = ((ev.clientY - d.startY) / d.containerH) * 100;
        const maxMid = Math.min(
          MAX_MID_PCT,
          100 - topPct - 18,
        );
        setMidPct(clamp(d.startPct + deltaPct, MIN_MID_PCT, maxMid));
      };

      const onUp = (ev: PointerEvent) => {
        const d = midSplitDragRef.current;
        if (!d || ev.pointerId !== d.pointerId) return;
        try {
          el.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        midSplitDragRef.current = null;
        setMidSplitDragging(false);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [topPct, midPct],
  );

  const panelOpen = !collapsed;
  const acc = payload?.accounts?.[accountIdx];
  const m = acc?.summaryMetrics;
  const watchlists = payload?.watchlists ?? [];
  const activeWatchlist = watchlists[watchlistIdx];

  const tabBtn =
    "rounded px-1.5 py-px text-[10px] font-medium leading-tight transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/80";
  const tabBtnActive = "bg-amber-600/90 text-white shadow-sm";
  const tabBtnIdle =
    "text-slate-500 hover:bg-slate-800/80 hover:text-slate-300";

  const panePad = "px-1.5 py-1";
  const secTitle = "text-[11px] font-semibold leading-none text-slate-100";
  const hintText = "text-[9px] leading-snug text-slate-600";
  const tableWrap = "w-full min-w-0 border-collapse text-left text-[10px] leading-tight";
  const thCell =
    "py-0.5 pr-1 text-[9px] font-normal text-slate-500 whitespace-nowrap";
  const tdNum =
    "py-0.5 pr-1 text-right font-mono text-[10px] tabular-nums leading-tight text-slate-200 whitespace-nowrap";
  const tdSym = "w-[1%] max-w-[9.5rem] py-0.5 pr-1 align-top";
  const symBtn =
    "block w-full max-w-[9.5rem] truncate text-left font-mono text-[10px] leading-tight text-amber-200/90 hover:underline";
  const exLine = "block truncate text-[8px] leading-tight text-slate-600";

  const horizSplitClass = (active: boolean) =>
    `flex h-1.5 shrink-0 cursor-row-resize touch-none select-none items-center justify-center border-y border-slate-800/90 bg-slate-900/85 hover:bg-slate-800/90 ${
      active ? "bg-slate-700/90" : ""
    }`;

  return (
    <div className="flex h-full min-h-0 shrink-0 flex-row border-r border-slate-700/90 bg-slate-950/98">
      <div
        className={`flex min-h-0 flex-col overflow-hidden ${
          dragging ? "" : "transition-[width] duration-200 ease-out"
        }`}
        style={{
          width: panelOpen ? width : 0,
        }}
      >
        {panelOpen ? (
          <div
            ref={columnContainerRef}
            className="flex min-h-0 h-full flex-1 flex-col gap-0"
          >
            {/* 上：持仓 / 自选 */}
            <div
              className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${panePad} ${
                topSplitDragging
                  ? ""
                  : "transition-[flex-basis] duration-150 ease-out"
              }`}
              style={{ flex: `0 0 ${topPct}%` }}
            >
              <div className="mb-1 flex shrink-0 flex-wrap items-center gap-1">
                  <div
                    className="inline-flex rounded-md border border-slate-800/90 bg-slate-900/55 p-px"
                    role="tablist"
                    aria-label="持仓与自选"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightPaneTab === "positions"}
                      className={`${tabBtn} ${
                        rightPaneTab === "positions"
                          ? tabBtnActive
                          : tabBtnIdle
                      }`}
                      onClick={() => setRightPaneTab("positions")}
                    >
                      持仓
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightPaneTab === "watchlists"}
                      className={`${tabBtn} ${
                        rightPaneTab === "watchlists"
                          ? tabBtnActive
                          : tabBtnIdle
                      }`}
                      onClick={() => setRightPaneTab("watchlists")}
                    >
                      自选
                    </button>
                  </div>
                </div>

                {rightPaneTab === "positions" ? (
                <>
                  {!acc ? (
                    <p className={hintText}>—</p>
                  ) : acc.positions.length === 0 ? (
                    <p className={hintText}>无持仓或暂无权限</p>
                  ) : (
                    <div className="min-h-0 flex-1 overflow-auto">
                      <table className={tableWrap}>
                        <thead className="sticky top-0 z-10 bg-slate-950/95 shadow-sm">
                          <tr className="border-b border-slate-800">
                            <th className={`${thCell} max-w-[9.5rem] text-left`}>
                              产品
                            </th>
                            <th className={`${thCell} text-right`}>现价</th>
                            <th className={`${thCell} text-right`}>持仓</th>
                            <th className={`${thCell} text-right`}>均价</th>
                            <th className={`${thCell} text-right`}>盈亏</th>
                            <th className={`${thCell} text-right`}>市值</th>
                          </tr>
                        </thead>
                        <tbody>
                          {acc.positions.map((p, idx) => (
                            <tr
                              key={`${p.symbol || p.instrumentLine}-${p.conid ?? idx}`}
                              className="border-b border-slate-800/60 hover:bg-slate-900/80"
                            >
                              <td className={tdSym}>
                                <button
                                  type="button"
                                  className={symBtn}
                                  title="打开图表并查看成交记录"
                                  onClick={() => {
                                    const sym = chartSymbolFromPosition(p);
                                    onPickSymbol(sym);
                                    setTradeFocus({
                                      chartSymbol: sym,
                                      conid: p.conid,
                                    });
                                  }}
                                >
                                  {p.instrumentLine ?? p.symbol}
                                </button>
                                {p.exchange ? (
                                  <span className={exLine}>{p.exchange}</span>
                                ) : null}
                              </td>
                              <td className={tdNum}>{fmtNum(p.lastPrice, 4)}</td>
                              <td className={tdNum}>{fmtNum(p.qty, 4)}</td>
                              <td className={tdNum}>{fmtNum(p.avgCost, 4)}</td>
                              <td
                                className={`${tdNum} ${signedColor(p.unrealizedPnl)}`}
                              >
                                {fmtMoney(p.unrealizedPnl)}
                              </td>
                              <td className={tdNum}>{fmtMoney(p.marketValue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {acc.positionsTruncated ? (
                        <p className="mt-0.5 text-[8px] text-amber-600/80">
                          持仓分页未全部加载（最多 24 页）
                        </p>
                      ) : null}
                    </div>
                  )}
                </>
              ) : watchlists.length === 0 ? (
                <p className={hintText}>
                  暂无自选列表或暂无权限（需 Gateway 已登录且接口返回自选）
                </p>
              ) : (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
                  <div
                    className="flex shrink-0 gap-0.5 overflow-x-auto"
                    role="tablist"
                    aria-label="自选列表"
                  >
                    {watchlists.map((wl, i) => (
                      <button
                        key={wl.id}
                        type="button"
                        role="tab"
                        title={wl.name}
                        aria-selected={i === watchlistIdx}
                        onClick={() => setWatchlistIdx(i)}
                        className={`max-w-[120px] shrink-0 truncate rounded border px-1 py-px text-[8px] leading-tight transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/80 ${
                          i === watchlistIdx
                            ? "border-amber-600/70 bg-amber-950/50 text-amber-100"
                            : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                        }`}
                      >
                        {wl.name}
                      </button>
                    ))}
                  </div>
                  {!activeWatchlist ? (
                    <p className={hintText}>—</p>
                  ) : activeWatchlist.symbols.length === 0 ? (
                    <p className={hintText}>
                      列表「{activeWatchlist.name}」暂无合约
                    </p>
                  ) : (
                    <div className="min-h-0 flex-1 overflow-auto">
                      <table className={tableWrap}>
                        <thead className="sticky top-0 z-10 bg-slate-950/95 shadow-sm">
                          <tr className="border-b border-slate-800">
                            <th className={`${thCell} max-w-[9.5rem] text-left`}>
                              合约
                            </th>
                            <th className={`${thCell} text-right`}>现价</th>
                            <th className={`${thCell} text-right`}>涨跌幅</th>
                            <th className={`${thCell} text-right`}>成交量</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeWatchlist.symbols.map((row, idx) => (
                            <tr
                              key={`wl-${activeWatchlist.id}-${row.conid ?? `i-${idx}`}`}
                              className="border-b border-slate-800/60 hover:bg-slate-900/80"
                            >
                              <td className={tdSym}>
                                <button
                                  type="button"
                                  className={`${symBtn} whitespace-normal break-words`}
                                  title={
                                    row.chartSymbol
                                      ? `在图表中打开：${row.chartSymbol}`
                                      : "在图表中打开"
                                  }
                                  onClick={() =>
                                    onPickSymbol(
                                      chartSymbolFromPosition(row),
                                    )
                                  }
                                >
                                  <span className="font-semibold">
                                    {row.productCode}
                                  </span>
                                  {row.contractLabel ? (
                                    <span className="mt-px block truncate text-[9px] font-normal text-slate-400">
                                      {row.contractLabel}
                                    </span>
                                  ) : null}
                                </button>
                                {row.exchange ? (
                                  <span className={exLine}>{row.exchange}</span>
                                ) : null}
                              </td>
                              <td className={tdNum}>{fmtNum(row.lastPrice, 4)}</td>
                              <td
                                className={`${tdNum} ${signedColor(row.changePct)}`}
                              >
                                {fmtChangePct(row.changePct)}
                              </td>
                              <td className={tdNum}>{fmtVolume(row.volume)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div
              role="separator"
              aria-orientation="horizontal"
              aria-valuenow={Math.round(topPct)}
              aria-valuemin={MIN_TOP_PCT}
              aria-valuemax={MAX_TOP_PCT}
              aria-label="拖拽调节持仓区与交易记录区高度比例"
              onPointerDown={onTopSplitPointerDown}
              className={horizSplitClass(topSplitDragging)}
            >
              <span
                className="pointer-events-none h-px w-10 rounded-full bg-slate-600"
                aria-hidden
              />
            </div>

            {/* 中：交易记录 */}
            <div
              className={`flex min-h-0 min-w-0 flex-col overflow-hidden bg-slate-950/40 ${panePad} ${
                midSplitDragging
                  ? ""
                  : "transition-[flex-basis] duration-150 ease-out"
              }`}
              style={{ flex: `0 0 ${midPct}%` }}
            >
                <div className="mb-1 flex shrink-0 flex-wrap items-center justify-between gap-x-1 gap-y-0.5">
                  <span className={secTitle}>交易记录</span>
                  {flexTradesImportSlot ? (
                    <div className="flex min-w-0 shrink-0 justify-end">
                      {flexTradesImportSlot}
                    </div>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {displayTradeRows.length === 0 ? (
                    tradeFocus && tradesLoading ? (
                      <p className="text-[9px] text-slate-500">加载成交…</p>
                    ) : tradeFocus && tradesErr ? (
                      <p className="text-[9px] text-rose-400/90">{tradesErr}</p>
                    ) : (
                      <p className={hintText}>
                        在「持仓」点击标的，或导入 IB 成交记录；列表与右侧 K
                        线标注同步（Gateway 约 7 日，导入记录按当前图表代码筛选）。
                      </p>
                    )
                  ) : (
                    <>
                      {tradeListSymbol ? (
                        <p className="mb-0.5 truncate font-mono text-[10px] leading-tight text-amber-200/90">
                          {tradeListSymbol}
                          {tradeFocus?.conid != null ? (
                            <span className="text-[9px] text-slate-500">
                              {" "}
                              · {tradeFocus.conid}
                            </span>
                          ) : null}
                          {!tradeFocus && chartTradeRows.length > 0 ? (
                            <span className="text-[9px] text-slate-500">
                              {" "}
                              · 含导入
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                      {tradeFocus && tradesLoading && gatewayTradeRows.length === 0 ? (
                        <p className="mb-0.5 text-[9px] text-slate-500">
                          Gateway 加载中…
                        </p>
                      ) : null}
                      {tradeFocus &&
                      tradesErr &&
                      gatewayTradeRows.length === 0 &&
                      chartTradeRows.length > 0 ? (
                        <p className="mb-0.5 text-[9px] text-amber-600/85">
                          Gateway：{tradesErr}（已显示导入/图表成交）
                        </p>
                      ) : null}
                      <table className={tableWrap}>
                        <thead className="sticky top-0 z-10 bg-slate-950/95 shadow-sm">
                          <tr className="border-b border-slate-800">
                            <th className={thCell}>时间</th>
                            <th className={thCell}>向</th>
                            <th className={`${thCell} text-right`}>量</th>
                            <th className={`${thCell} text-right`}>价</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayTradeRows.map((tr) => (
                            <tr
                              key={tr.executionId}
                              className="border-b border-slate-800/60"
                            >
                              <td className="max-w-[6.5rem] truncate py-0.5 pr-1 font-mono text-[10px] tabular-nums leading-tight text-slate-300 whitespace-nowrap">
                                {tr.tradeTimeSec
                                  ? new Date(
                                      tr.tradeTimeSec * 1000,
                                    ).toLocaleString(undefined, {
                                      month: "numeric",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "—"}
                              </td>
                              <td className="py-0.5 pr-1 text-[10px] leading-tight text-slate-300 whitespace-nowrap">
                                {tr.side === "B"
                                  ? "买"
                                  : tr.side === "S"
                                    ? "卖"
                                    : tr.side}
                              </td>
                              <td className={tdNum}>{fmtNum(tr.size, 4)}</td>
                              <td className={tdNum}>{fmtNum(tr.price, 4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
            </div>

            <div
              role="separator"
              aria-orientation="horizontal"
              aria-valuenow={Math.round(midPct)}
              aria-valuemin={MIN_MID_PCT}
              aria-valuemax={MAX_MID_PCT}
              aria-label="拖拽调节交易记录区与投资组合区高度比例"
              onPointerDown={onMidSplitPointerDown}
              className={horizSplitClass(midSplitDragging)}
            >
              <span
                className="pointer-events-none h-px w-10 rounded-full bg-slate-600"
                aria-hidden
              />
            </div>

            {/* 下：投资组合 */}
            <div
              className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto ${panePad}`}
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                <div className="flex min-w-0 flex-1 items-baseline gap-1">
                  <span className={secTitle}>投资组合</span>
                  {(payload?.accounts?.length ?? 0) <= 1 && acc ? (
                    <span
                      className="min-w-0 truncate font-mono text-[10px] text-amber-200/85"
                      title={acc.accountId}
                    >
                      {acc.accountId}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => load()}
                  disabled={loading}
                  className="shrink-0 rounded px-1 py-px text-[9px] leading-tight text-amber-500/90 hover:bg-slate-800 disabled:opacity-50"
                >
                  {loading ? "…" : "刷新"}
                </button>
              </div>

              {fetchErr ? (
                <p className="mb-1 rounded border border-rose-900/50 bg-rose-950/40 px-1 py-0.5 text-[8px] leading-snug text-rose-200/90">
                  {fetchErr}
                </p>
              ) : null}

              {(payload?.accounts?.length ?? 0) > 1 ? (
                <div className="mb-1 flex flex-wrap gap-0.5">
                  {payload!.accounts.map((a, i) => (
                    <button
                      key={a.accountId}
                      type="button"
                      onClick={() => setAccountIdx(i)}
                      className={`rounded px-1 py-px font-mono text-[8px] leading-tight ${
                        i === accountIdx
                          ? "bg-amber-600/90 text-white"
                          : "border border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {a.accountId}
                    </button>
                  ))}
                </div>
              ) : null}

              {!acc && !fetchErr && !loading ? (
                <p className="text-[8px] text-slate-500">暂无账户数据</p>
              ) : null}

              {acc ? (
                <>
                  <div className="mb-1 flex flex-col gap-0.5">
                    <div className="flex min-w-0 items-baseline justify-between gap-1">
                      <span className="shrink-0 text-[10px] text-slate-400">
                        净清算
                      </span>
                      <span className="min-w-0 truncate font-mono text-base font-semibold tabular-nums leading-none text-slate-50">
                        {fmtMoney(m?.netLiquidation)}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-1">
                      <span className="shrink-0 text-[9px] text-slate-500">
                        当日盈亏
                      </span>
                      <span
                        className={`font-mono text-[10px] font-semibold tabular-nums ${signedColor(m?.dailyPnl)}`}
                      >
                        {fmtMoney(m?.dailyPnl)}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-1">
                      <span className="shrink-0 text-[9px] text-slate-500">
                        当日 %
                      </span>
                      <span
                        className={`font-mono text-[10px] font-semibold tabular-nums ${signedColor(m?.dailyPnlPct)}`}
                      >
                        {m?.dailyPnlPct != null
                          ? `${m.dailyPnlPct >= 0 ? "+" : ""}${m.dailyPnlPct.toFixed(2)}%`
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-1 gap-y-1 text-[10px]">
                    <Metric label="未实现盈亏" value={m?.unrealizedPnl} signed />
                    <Metric label="市值" value={m?.marketValue} />
                    <Metric label="剩余流动性" value={m?.excessLiquidity} />
                    <Metric label="SMA 账户" value={m?.sma} />
                    <Metric label="已实现盈亏" value={m?.realizedPnl} signed />
                    <div
                      className="min-w-0 col-span-2 rounded border border-slate-800/80 bg-slate-900/40 px-1.5 py-1"
                      title={
                        m?.maintenanceMargin != null && m?.netLiquidation != null
                          ? `维持保证金 ${fmtMoney(m.maintenanceMargin)} / 净清算 ${fmtMoney(m.netLiquidation)}`
                          : undefined
                      }
                    >
                      <div className="flex min-w-0 items-center justify-between gap-1">
                        <span className="min-w-0 truncate text-[9px] text-slate-500">
                          维持保证金
                        </span>
                        <span className="flex shrink-0 items-baseline gap-1 font-mono tabular-nums">
                          <span className="text-[10px] text-slate-100">
                            {m?.maintenanceMarginToNlPct != null
                              ? `${m.maintenanceMarginToNlPct.toFixed(2)}%`
                              : "—"}
                          </span>
                          {m?.maintenanceMargin != null ? (
                            <span className="text-[9px] text-slate-500">
                              {fmtMoney(m.maintenanceMargin)}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                    {m?.cushionFraction != null ? (
                      <div className="min-w-0 rounded border border-slate-800/80 bg-slate-900/40 px-1.5 py-1">
                        <div className="flex min-w-0 items-center justify-between gap-1">
                          <span className="min-w-0 truncate text-[9px] text-slate-500">
                            Cushion
                          </span>
                          <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-100">
                            {fmtCushionPct(m.cushionFraction)}
                          </span>
                        </div>
                      </div>
                    ) : null}
                    <Metric label="购买力" value={m?.buyingPower} />
                    <Metric label="现金余额" value={m?.totalCash} />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="组合侧栏：左右拖拽调节宽度，单击收起或展开"
        onPointerDown={onResizePointerDown}
        className={`flex w-2 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center border-r border-slate-800/90 bg-slate-900/90 hover:bg-slate-800/90 ${
          dragging ? "bg-slate-700/90" : ""
        }`}
      >
        <span
          className="pointer-events-none h-10 w-1 rounded-full bg-slate-600"
          aria-hidden
        />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  signed,
}: {
  label: string;
  value?: number;
  signed?: boolean;
}) {
  return (
    <div className="min-w-0 rounded border border-slate-800/80 bg-slate-900/40 px-1.5 py-1">
      <div className="flex min-w-0 items-center justify-between gap-1">
        <span className="min-w-0 truncate text-[9px] text-slate-500">
          {label}
        </span>
        <span
          className={`shrink-0 truncate font-mono text-[10px] tabular-nums leading-tight ${
            signed ? signedColor(value) : "text-slate-100"
          }`}
        >
          {fmtMoney(value)}
        </span>
      </div>
    </div>
  );
}
