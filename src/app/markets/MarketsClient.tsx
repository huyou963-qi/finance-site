"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartExecutionTrade } from "@/lib/chart/executionMarkers";
import { StockChartWorkspace } from "@/components/StockChartWorkspace";
import {
  isKlineInterval,
  KLINE_INTERVALS,
  type KlineInterval,
} from "@/lib/data/klineShared";
import {
  getOrCreateKlineSyncTabId,
  KLINE_PAGE_SYNC_CHANNEL,
  type KlineSyncMessage,
  type RangeStatWireSegment,
} from "@/lib/klinePageSyncChannel";
import { FlexTradesImportButton } from "@/components/FlexTradesImportButton";
import { IbkrPortfolioPanel } from "@/components/IbkrPortfolioPanel";
import {
  loadFlexTradesFromStorage,
  mergeChartExecutionTrades,
} from "@/lib/chart/flexExecutionImport";
import type { PriceAdjustmentMode } from "@/lib/data/klineAdjustment";
import { symbolSearchErrorForUser } from "@/lib/data/symbolSearchUserMessage";
import { normalizeTickerSymbol } from "@/lib/data/tickerSymbolNormalize";
import { EventChartSidePanel } from "@/components/events/EventChartSidePanel";
import { unixSecToContextDate } from "@/lib/data/marketEvents";

type SymbolHit = {
  symbol: string;
  name: string;
  exchange: string;
  type?: string;
};

const INTERVAL_LABEL: Record<KlineInterval, string> = {
  "15m": "15分",
  "1h": "1小时",
  "4h": "4小时",
  "1d": "日K",
  "1w": "周K",
};

function displayNameForSymbol(sym: string): string | undefined {
  const u = sym.toUpperCase();
  if (u === "AAPL") return "苹果公司";
  if (u === "XAUUSD" || u === "GC=F" || u === "XAUUSD=X") return "黄金/美元";
  return undefined;
}

/** 与 GET /api/data/klines?source= 及 StockChartWorkspace 一致 */
type KlineChartSource = "auto" | "ibkr";

export function MarketsClient() {
  const [klineSource, setKlineSource] = useState<KlineChartSource>("ibkr");
  const [symbol, setSymbol] = useState("");
  const [dataHint, setDataHint] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [interval, setKlineInterval] = useState<KlineInterval>("1d");
  const [priceAdjustment, setPriceAdjustment] =
    useState<PriceAdjustmentMode>("forward");
  const [hits, setHits] = useState<SymbolHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pickedName, setPickedName] = useState<string | undefined>(undefined);
  /** 跨标签页同步：勾选页广播周期、可见时间区间、十字线时间、区间统计 */
  const [pageSync, setPageSync] = useState(false);
  const [syncLeadNonce, setSyncLeadNonce] = useState(0);
  const [remoteVisible, setRemoteVisible] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [remoteVisibleVer, setRemoteVisibleVer] = useState(0);
  const [remoteCrosshair, setRemoteCrosshair] = useState<number | null>(null);
  const [remoteCrosshairVer, setRemoteCrosshairVer] = useState(0);
  const [remoteRangeSpecs, setRemoteRangeSpecs] = useState<
    RangeStatWireSegment[]
  >([]);
  const [remoteRangeSpecsVer, setRemoteRangeSpecsVer] = useState(0);
  const [gatewayTrades, setGatewayTrades] = useState<ChartExecutionTrade[]>([]);
  const [flexTrades, setFlexTrades] = useState<ChartExecutionTrade[]>([]);
  const [portfolioTrades, setPortfolioTrades] =
    useState<ChartExecutionTrade[]>([]);
  const [eventContextDate, setEventContextDate] = useState<string | null>(null);
  const [eventRangeFromSec, setEventRangeFromSec] = useState<number | null>(null);
  const [eventRangeToSec, setEventRangeToSec] = useState<number | null>(null);
  const chartSplitRowRef = useRef<HTMLDivElement | null>(null);

  const tabId = useMemo(() => getOrCreateKlineSyncTabId(), []);

  useEffect(() => {
    setFlexTrades(loadFlexTradesFromStorage());
  }, [tabId]);

  const executionTrades = useMemo(
    () =>
      mergeChartExecutionTrades(symbol.trim(), {
        gateway: gatewayTrades,
        flex: flexTrades,
        portfolio: portfolioTrades,
      }),
    [symbol, gatewayTrades, flexTrades, portfolioTrades],
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqIdRef = useRef(0);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const pageSyncRef = useRef(false);

  useEffect(() => {
    pageSyncRef.current = pageSync;
  }, [pageSync]);

  /** 切换标的后丢弃远端区间锚点，避免把上一标的的同步套到新图上 */
  useEffect(() => {
    setRemoteRangeSpecs([]);
    setRemoteRangeSpecsVer(0);
    setEventRangeFromSec(null);
    setEventRangeToSec(null);
    setEventContextDate(null);
  }, [symbol]);

  /**
   * IBKR：当前图表标的在 Gateway 最近 ≤7 日内的成交 → K 线箭头标注。
   * 无需先点组合持仓；未登录 Gateway 时静默为空。
   */
  useEffect(() => {
    const sym = symbol.trim();
    if (!sym) {
      setGatewayTrades([]);
      return;
    }
    let cancelled = false;
    const tid = window.setTimeout(() => {
      fetch(
        `/api/ibkr/trades?${new URLSearchParams({
          symbol: sym,
          days: "7",
        }).toString()}`,
        { cache: "no-store" },
      )
        .then(async (r) => {
          const j = (await r.json()) as {
            trades?: {
              executionId?: string;
              side: string;
              tradeTimeSec: number;
              size: number;
              price: number;
            }[];
            error?: string;
          };
          if (cancelled) return;
          if (!r.ok) {
            setGatewayTrades([]);
            return;
          }
          const list = j.trades ?? [];
          setGatewayTrades(
            list.map((t) => ({
              tradeTimeSec: t.tradeTimeSec,
              price: t.price,
              size: t.size,
              side: t.side,
              source: "gateway" as const,
              dedupeKey: t.executionId,
            })),
          );
        })
        .catch(() => {
          if (!cancelled) setGatewayTrades([]);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [symbol]);

  useEffect(() => {
    bcRef.current = new BroadcastChannel(KLINE_PAGE_SYNC_CHANNEL);
    return () => {
      bcRef.current?.close();
      bcRef.current = null;
    };
  }, [tabId]);

  useEffect(() => {
    const bc = bcRef.current;
    if (!bc) return;
    const onMsg = (ev: MessageEvent<KlineSyncMessage>) => {
      const msg = ev.data;
      if (!msg || msg.v !== 1) return;
      if (msg.tabId === tabId) return;
      if (!pageSyncRef.current) return;

      if (msg.type === "leader") {
        if (isKlineInterval(msg.interval)) {
          setKlineInterval(msg.interval);
        }
        setRemoteVisible({ from: msg.from, to: msg.to });
        setRemoteVisibleVer((v) => v + 1);
        setRemoteRangeSpecs(msg.rangeStats ?? []);
        setRemoteRangeSpecsVer((v) => v + 1);
        return;
      }
      if (msg.type === "range-stats") {
        setRemoteRangeSpecs(msg.ranges);
        setRemoteRangeSpecsVer((v) => v + 1);
        return;
      }
      if (msg.type === "visible-range") {
        setRemoteVisible({ from: msg.from, to: msg.to });
        setRemoteVisibleVer((v) => v + 1);
        return;
      }
      if (msg.type === "interval") {
        if (isKlineInterval(msg.interval)) {
          setKlineInterval(msg.interval);
        }
        return;
      }
      if (msg.type === "crosshair") {
        setRemoteCrosshair(msg.time);
        setRemoteCrosshairVer((v) => v + 1);
      }
    };
    bc.addEventListener("message", onMsg);
    return () => bc.removeEventListener("message", onMsg);
  }, [tabId]);

  const onLeaderSnapshot = useCallback(
    (p: {
      interval: string;
      visible: { from: number; to: number };
      rangeStats: RangeStatWireSegment[];
    }) => {
      const bc = bcRef.current;
      if (!bc) return;
      const msg: KlineSyncMessage = {
        v: 1,
        type: "leader",
        tabId: tabId,
        interval: p.interval,
        from: p.visible.from,
        to: p.visible.to,
        rangeStats: p.rangeStats,
      };
      bc.postMessage(msg);
    },
    [tabId],
  );

  const onRangeSpecsBroadcast = useCallback(
    (ranges: RangeStatWireSegment[]) => {
      const bc = bcRef.current;
      if (!bc || !pageSyncRef.current) return;
      const msg: KlineSyncMessage = {
        v: 1,
        type: "range-stats",
        tabId: tabId,
        ranges,
      };
      bc.postMessage(msg);
    },
    [tabId],
  );

  const onLocalVisibleTimeRange = useCallback((from: number, to: number) => {
    const bc = bcRef.current;
    if (!bc || !pageSyncRef.current) return;
    const msg: KlineSyncMessage = {
      v: 1,
      type: "visible-range",
      tabId: tabId,
      from,
      to,
    };
    bc.postMessage(msg);
  }, [tabId]);

  const onVisibleTimeRangeChange = useCallback((from: number, to: number) => {
    setEventRangeFromSec(from);
    setEventRangeToSec(to);
  }, []);

  const onLocalCrosshairTime = useCallback((time: number | null) => {
    if (time != null) {
      setEventContextDate(unixSecToContextDate(time));
    }
    const bc = bcRef.current;
    if (!bc || !pageSyncRef.current) return;
    const msg: KlineSyncMessage = {
      v: 1,
      type: "crosshair",
      tabId: tabId,
      time,
    };
    bc.postMessage(msg);
  }, [tabId]);

  const eventRangeFrom = useMemo(
    () => (eventRangeFromSec != null ? unixSecToContextDate(eventRangeFromSec) : null),
    [eventRangeFromSec],
  );

  const eventRangeTo = useMemo(
    () => (eventRangeToSec != null ? unixSecToContextDate(eventRangeToSec) : null),
    [eventRangeToSec],
  );

  const chartLinkedEventProps = useMemo(
    () => ({
      rangeFrom: eventRangeFrom,
      rangeTo: eventRangeTo,
      trackDate: eventContextDate,
      contextAssets: symbol.trim() ? [symbol.trim()] : [],
    }),
    [eventRangeFrom, eventRangeTo, eventContextDate, symbol],
  );

  const pickInterval = (iv: KlineInterval) => {
    setKlineInterval(iv);
    const bc = bcRef.current;
    if (pageSync && bc) {
      const msg: KlineSyncMessage = {
        v: 1,
        type: "interval",
        tabId: tabId,
        interval: iv,
      };
      bc.postMessage(msg);
    }
  };

  const handlePageSyncChange = (checked: boolean) => {
    setPageSync(checked);
    if (checked) {
      setSyncLeadNonce((n) => n + 1);
    }
  };

  const onKlineLoadSuccess = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    /** 已选定标的且输入与当前代码一致时不再打联想（与 K 线加载无关，减少无效请求） */
    if (symbol.trim() && q === symbol.trim()) {
      setSearchLoading(false);
      setSearchError(null);
      setHits([]);
      return;
    }

    const myId = ++reqIdRef.current;
    setSearchLoading(true);
    setSearchError(null);

    const t = window.setTimeout(() => {
      fetch(`/api/data/symbol-search?q=${encodeURIComponent(q)}`)
        .then(async (r) => {
          const j = (await r.json()) as {
            results?: SymbolHit[];
            error?: string;
          };
          if (reqIdRef.current !== myId) return;
          if (!r.ok) {
            throw new Error(j.error ?? `HTTP ${r.status}`);
          }
          setHits(j.results ?? []);
          setSearchError(null);
          setOpen(true);
        })
        .catch((e) => {
          if (reqIdRef.current !== myId) return;
          setHits([]);
          setSearchError(e instanceof Error ? e.message : "搜索失败");
          setOpen(true);
        })
        .finally(() => {
          if (reqIdRef.current === myId) setSearchLoading(false);
        });
    }, 180);

    return () => {
      window.clearTimeout(t);
    };
  }, [query, symbol]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const commitSymbol = (raw: string, name?: string) => {
    const s = normalizeTickerSymbol(raw);
    if (!s) return;
    // 丢弃仍在路上的 symbol-search 响应，否则会再次 setOpen(true) + 空列表 →「无匹配」盖住图表
    reqIdRef.current += 1;
    setPortfolioTrades([]);
    setSymbol(s);
    setQuery(s);
    setPickedName(name ?? displayNameForSymbol(s));
    setOpen(false);
    setHits([]);
    setSearchError(null);
    setSearchLoading(false);
  };

  useEffect(() => {
    if (!symbol.trim()) setDataHint(null);
  }, [symbol]);

  const showPanel = open && query.trim().length > 0;

  const [chartToolbarMount, setChartToolbarMount] =
    useState<HTMLDivElement | null>(null);

  return (
    <div
      ref={rootRef}
      className="flex h-full min-h-0 w-full flex-1 flex-row gap-0 overflow-hidden px-1 lg:px-2"
    >
      <IbkrPortfolioPanel
        activeChartSymbol={symbol}
        chartExecutionTrades={executionTrades}
        flexTradesImportSlot={
          <FlexTradesImportButton onImported={setFlexTrades} />
        }
        onExecutionTradesChange={setPortfolioTrades}
        onPickSymbol={(s) => {
          commitSymbol(s);
        }}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="relative z-20 flex min-w-0 shrink-0 flex-wrap items-center gap-1.5 overflow-visible py-0">
        <div className="relative min-h-[26px] min-w-[100px] max-w-[12rem] flex-1">
          <span className="sr-only">代码</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPickedName(undefined);
              setOpen(true);
              setHits([]);
              setSearchLoading(true);
              setSearchError(null);
            }}
            onFocus={() => {
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitSymbol(query);
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="输入代码或公司名，实时联想"
            className="h-[26px] w-full rounded border border-fs-border bg-fs-elevated py-0 pl-2 pr-2 font-mono text-[10px] leading-[26px] text-fs-text placeholder:text-fs-muted focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600/40"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {showPanel ? (
            <ul className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-72 overflow-auto rounded border border-fs-border bg-fs-elevated py-0.5 shadow-xl">
              {searchLoading ? (
                <li className="px-2 py-1 text-[10px] text-fs-muted">搜索中…</li>
              ) : null}
              {searchError ? (
                <li className="px-2 py-1 text-[10px] text-rose-300">
                  {symbolSearchErrorForUser(searchError)}
                </li>
              ) : null}
              {!searchLoading &&
              !searchError &&
              hits.length === 0 &&
              query.trim().length > 0 ? (
                <li className="px-2 py-1 text-[10px] text-fs-muted">
                  无匹配标的，请换个关键词或选下列交易所常用写法（如 AAPL、MSFT）
                </li>
              ) : null}
              {hits.map((h, idx) => (
                <li key={`${h.symbol}-${idx}`}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0 px-2 py-1 text-left text-[10px] hover:bg-fs-elevated"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commitSymbol(h.symbol, h.name)}
                  >
                    <span className="font-mono text-amber-200/90">
                      {h.symbol}
                    </span>
                    <span className="line-clamp-2 text-[9px] text-fs-muted">
                      <span className="text-fs-secondary">{h.name}</span>
                      {h.exchange ? (
                        <span className="text-fs-muted"> · {h.exchange}</span>
                      ) : null}
                      {h.type ? (
                        <span className="text-fs-secondary"> · {h.type}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div
          ref={setChartToolbarMount}
          className="flex min-w-0 shrink-0 flex-wrap items-center gap-2"
          aria-label="主图与画线工具"
        />

        <label className="flex shrink-0 items-center text-[9px] text-fs-muted">
          <select
            value={interval}
            onChange={(e) => {
              const v = e.target.value;
              if (isKlineInterval(v)) pickInterval(v);
            }}
            title="K 线周期"
            aria-label="K 线周期"
            className="h-[22px] min-w-[4.25rem] cursor-pointer rounded border border-amber-600/50 bg-fs-elevated px-1.5 py-0 text-[10px] font-medium leading-none text-fs-text shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
          >
            {KLINE_INTERVALS.map((iv) => (
              <option key={iv} value={iv}>
                {INTERVAL_LABEL[iv]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex max-w-[8.5rem] shrink-0 items-center text-[9px] text-fs-muted">
          <select
            value={klineSource}
            onChange={(e) =>
              setKlineSource(e.target.value as KlineChartSource)
            }
            title="K 线数据源：自动与 IBKR 均只请求 Interactive Brokers。"
            aria-label="K 线数据源"
            className="h-[22px] min-w-0 max-w-full cursor-pointer truncate rounded border border-fs-border bg-fs-elevated px-1 py-0 text-[10px] leading-none text-fs-text focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600/40"
          >
            <option value="auto">数据源·自动（仅IB）</option>
            <option value="ibkr">数据源·IBKR</option>
          </select>
        </label>

        <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] text-fs-muted">
          <select
            value={priceAdjustment}
            onChange={(e) =>
                setPriceAdjustment(e.target.value as PriceAdjustmentMode)
              }
              title="前复权：历史价按拆股/除权跳变对齐最新尺度（如 IBKR 2025-06-18 拆股）；IB 仅 Trades 价，不含现金分红平滑。"
              aria-label="K 线价格复权"
              className="h-[22px] max-w-[5.5rem] rounded border border-fs-border bg-fs-elevated px-1 py-0 font-mono text-[10px] text-fs-text focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600/40"
          >
            <option value="forward">前复权</option>
            <option value="backward">后复权</option>
            <option value="none">不复权</option>
          </select>
        </label>

        <label
          className="ml-2 flex shrink-0 cursor-pointer items-center gap-1 text-[10px] text-fs-muted"
          title="多屏幕多页面时间与光标的同步"
        >
          <input
            type="checkbox"
            checked={pageSync}
            onChange={(e) => handlePageSyncChange(e.target.checked)}
            className="h-3 w-3 shrink-0 rounded border-fs-border"
            aria-label="页面同步：多屏幕多页面时间与光标的同步"
          />
          页面同步
        </label>

        <div
          className="min-w-0 flex-1 px-0.5 text-[8px] leading-tight text-fs-muted sm:text-[9px]"
          title={dataHint ?? undefined}
        >
          {dataHint ? (
            <span className="line-clamp-2">{dataHint}</span>
          ) : null}
        </div>

        <div className="ml-auto flex min-w-0 shrink-0 flex-wrap items-end justify-end gap-x-2 gap-y-1 text-right sm:items-baseline">
          {symbol ? (
            <>
              <span className="font-mono text-[10px] font-semibold leading-none text-fs-text">
                {symbol}
              </span>
              {pickedName ? (
                <span className="max-w-[min(40vw,220px)] truncate text-[10px] leading-none text-fs-muted">
                  {pickedName}
                </span>
              ) : null}
              <span className="rounded bg-fs-elevated px-1 py-0 font-mono text-[9px] leading-none text-fs-muted">
                {INTERVAL_LABEL[interval]}
              </span>
            </>
          ) : (
            <span className="text-[10px] leading-none text-fs-secondary">
              选择标的后显示
            </span>
          )}
        </div>
      </div>

      <div
        ref={chartSplitRowRef}
        className="flex min-h-0 min-w-0 flex-1 flex-row items-stretch overflow-hidden"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <StockChartWorkspace
            key={`${klineSource}-${symbol || "none"}-${interval}-${priceAdjustment}`}
            source={klineSource}
            symbol={symbol}
            interval={interval}
            priceAdjustment={priceAdjustment}
            executionTrades={executionTrades}
            fillHeight
            onAttributionChange={setDataHint}
            onKlineLoadSuccess={onKlineLoadSuccess}
            pageSyncEnabled={pageSync}
            pageSyncLeadNonce={syncLeadNonce}
            onPageSyncLeaderSnapshot={onLeaderSnapshot}
            remoteVisibleTimeRange={remoteVisible}
            remoteVisibleTimeRangeVersion={remoteVisibleVer}
            remoteCrosshairTime={remoteCrosshair}
            remoteCrosshairVersion={remoteCrosshairVer}
            remoteRangeSpecs={remoteRangeSpecs}
            remoteRangeSpecsVersion={remoteRangeSpecsVer}
            onRangeSpecsBroadcast={onRangeSpecsBroadcast}
            onLocalVisibleTimeRange={onLocalVisibleTimeRange}
            onVisibleTimeRangeChange={onVisibleTimeRangeChange}
            onLocalCrosshairTime={onLocalCrosshairTime}
            toolbarPortalEl={chartToolbarMount}
          />
        </div>

        <EventChartSidePanel
          variant="docked"
          splitRowRef={chartSplitRowRef}
          {...chartLinkedEventProps}
        />
      </div>
      </div>
    </div>
  );
}
