"use client";
import { useChartEvents } from "@/lib/chart/useChartEvents";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StockChartWorkspace } from "@/components/StockChartWorkspace";
import { MarketsWatchlist } from "@/components/MarketsWatchlist";
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
import {
  PAGE_SYNC_CHANNEL,
  isoDateToUnixSec,
  type PageSyncMessage,
} from "@/lib/pageSyncChannel";
import type { PriceAdjustmentMode } from "@/lib/equity/priceAdjustment";
import { symbolSearchErrorForUser } from "@/lib/data/symbolSearchUserMessage";
import { normalizeTickerSymbol } from "@/lib/data/tickerSymbolNormalize";
import { resolveEastmoneyInstrument } from "@/lib/data/eastmoneySymbols";
import { MarketsEventShelf } from "@/components/equity/MarketsEventShelf";
import { useLocalCompanyEvents } from "@/lib/equity/useLocalCompanyEvents";
import { familyIdForEventType } from "@/lib/data/eventTaxonomy";
import { EventDetailDrawer } from "@/components/events/EventDetailDrawer";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import {
  DEFAULT_EVENT_VIEW_FILTERS,
  loadEventViewFilters,
  saveEventViewFilters,
  type EventViewFilterState,
} from "@/lib/chart/eventViewFilters";
import { unixSecToContextDate } from "@/lib/data/marketEvents";
import { findMarketInstrument, marketSymbolLabel } from "@/lib/data/marketInstruments";
import {
  applySymbolDraftToFilters,
  classifyChartSymbol,
  deriveEventFilterDraft,
} from "@/lib/data/chartSymbolProfile";

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
  // 直接输入商品/外汇/债券代码（未走联想）时也给出中文名
  const instrument = findMarketInstrument(u);
  if (instrument) return instrument.name;
  if (u === "XAUUSD" || u === "XAUUSD=X") return "黄金/美元";
  return undefined;
}

export function MarketsClient() {
  const [detailEvent, setDetailEvent] = useState<MarketEventDto | null>(null);
  const [detailOpenVersion, setDetailOpenVersion] = useState(0);
  const openEventDetail = useCallback((event: MarketEventDto) => {
    setDetailEvent(event);
    setDetailOpenVersion(version => version + 1);
  }, []);
  const closeEventDetail = useCallback(() => setDetailEvent(null), []);
  const [symbol, setSymbol] = useState("");
  const localEventStore = useLocalCompanyEvents(symbol);
  const allAssetEvents = localEventStore.allAssetEvents;
  const allAssetEventsRef = useRef(allAssetEvents);
  allAssetEventsRef.current = allAssetEvents;
  const [loadedSymbol, setLoadedSymbol] = useState("");
  const regionalInstrument = resolveEastmoneyInstrument(symbol);
  const yieldInstrument = Boolean(findMarketInstrument(symbol)?.fredSeriesId);
  const chartSource = yieldInstrument ? "fred" : regionalInstrument ? "eastmoney" : "yahoo";
  const [dataHint, setDataHint] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [interval, setKlineInterval] = useState<KlineInterval>("1d");
  const [priceAdjustment, setPriceAdjustment] =
    useState<PriceAdjustmentMode>("forward");
  const effectiveAdjustment = regionalInstrument?.market === "GOLD" || yieldInstrument ? "none" : priceAdjustment;
  useEffect(() => {
    if (yieldInstrument && interval !== "1d" && interval !== "1w") setKlineInterval("1d");
  }, [yieldInstrument, interval]);
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
  const [eventViewFilters, setEventViewFilters] = useState<EventViewFilterState>(
    DEFAULT_EVENT_VIEW_FILTERS,
  );
  const [eventFiltersHydrated, setEventFiltersHydrated] = useState(false);
  useEffect(() => {
    const loaded = loadEventViewFilters();
    const sym = symbol.trim();
    if (sym) {
      const draft = deriveEventFilterDraft(classifyChartSymbol(sym));
      setEventViewFilters(applySymbolDraftToFilters(loaded, draft));
    } else {
      setEventViewFilters(loaded);
    }
    setEventFiltersHydrated(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- 仅首屏 hydrate；换标的由 EventPanel 套草稿
  useEffect(() => {
    if (!eventFiltersHydrated) return;
    saveEventViewFilters(eventViewFilters);
  }, [eventViewFilters, eventFiltersHydrated]);
  const [eventContextDate, setEventContextDate] = useState<string | null>(null);
  const [eventRangeFromSec, setEventRangeFromSec] = useState<number | null>(null);
  const [eventRangeToSec, setEventRangeToSec] = useState<number | null>(null);
  const [eventShelfOpen, setEventShelfOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [markerGroupIds, setMarkerGroupIds] = useState<string[]>([]);
  const [eventSeek, setEventSeek] = useState<{ time: number; version: number }>({ time: 0, version: 0 });
  const eventResult = useChartEvents(symbol, localEventStore.events, eventViewFilters, eventRangeFromSec, eventRangeToSec);
  useEffect(() => { setSelectedEventId(null); setMarkerGroupIds([]); }, [symbol]);

  const tabId = useMemo(() => getOrCreateKlineSyncTabId(), []);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqIdRef = useRef(0);
  const bcRef = useRef<BroadcastChannel | null>(null);
  /** 跨页面桥接通道（行情↔宏观），以归一化日期为货币 */
  const pageBcRef = useRef<BroadcastChannel | null>(null);
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

  // Once the local store hydrates, include its families without resetting the user's other filters.
  const localFamiliesInitialized = useRef(false);
  useEffect(() => {
    if (!eventFiltersHydrated || localFamiliesInitialized.current || !allAssetEvents.length) return;
    localFamiliesInitialized.current = true;
    setEventViewFilters(prev => ({ ...prev, typeFamilies: [...new Set([...prev.typeFamilies, ...allAssetEvents.map(m => familyIdForEventType(m.eventType))])] }));
  }, [allAssetEvents, eventFiltersHydrated]);

  /** 换标的时套用事件筛选草稿（原右侧 EventPanel 行为） */
  useEffect(() => {
    if (!eventFiltersHydrated) return;
    const sym = symbol.trim();
    if (!sym) return;
    const draft = deriveEventFilterDraft(classifyChartSymbol(sym));
    setEventViewFilters((prev) => {
      const next = applySymbolDraftToFilters(prev, draft);
      // 换到宏观资产时，不让标的默认类型自动隐藏用户的通用研究。
      return { ...next, typeFamilies: [...new Set([...next.typeFamilies,
        ...allAssetEventsRef.current.map(m => familyIdForEventType(m.eventType))])] };
    });
  }, [symbol, eventFiltersHydrated]);

  useEffect(() => {
    bcRef.current = new BroadcastChannel(KLINE_PAGE_SYNC_CHANNEL);
    return () => {
      bcRef.current?.close();
      bcRef.current = null;
    };
  }, [tabId]);

  useEffect(() => {
    pageBcRef.current = new BroadcastChannel(PAGE_SYNC_CHANNEL);
    return () => {
      pageBcRef.current?.close();
      pageBcRef.current = null;
    };
  }, [tabId]);

  // 跨页桥接：仅处理来自「非行情页」（宏观页）的消息，把归一化日期折算成 K 线时间。
  // 同类行情页之间仍走 KLINE_PAGE_SYNC_CHANNEL 保持全保真（区间统计/周期等）。
  useEffect(() => {
    const bc = pageBcRef.current;
    if (!bc) return;
    const onMsg = (ev: MessageEvent<PageSyncMessage>) => {
      const msg = ev.data;
      if (!msg || msg.v !== 1) return;
      if (msg.tabId === tabId || msg.kind === "kline") return;
      if (!pageSyncRef.current) return;

      if (msg.type === "crosshair") {
        // 交给 StockChartWorkspace 按「起始时间 ≤ 目标」向下取整到所在周期起点柱
        setRemoteCrosshair(isoDateToUnixSec(msg.isoDate));
        setRemoteCrosshairVer((v) => v + 1);
        return;
      }
      if (msg.type === "visible-range") {
        const from = isoDateToUnixSec(msg.fromIso);
        const to = isoDateToUnixSec(msg.toIso);
        if (from == null || to == null) return;
        setRemoteVisible({ from: Math.min(from, to), to: Math.max(from, to) });
        setRemoteVisibleVer((v) => v + 1);
      }
    };
    bc.addEventListener("message", onMsg);
    return () => bc.removeEventListener("message", onMsg);
  }, [tabId]);

  const broadcastPageCrosshair = useCallback(
    (isoDate: string | null) => {
      const bc = pageBcRef.current;
      if (!bc || !pageSyncRef.current) return;
      const msg: PageSyncMessage = {
        v: 1,
        type: "crosshair",
        tabId,
        kind: "kline",
        isoDate,
      };
      bc.postMessage(msg);
    },
    [tabId],
  );

  const broadcastPageVisibleRange = useCallback(
    (fromIso: string | null, toIso: string | null) => {
      const bc = pageBcRef.current;
      if (!bc || !pageSyncRef.current) return;
      const msg: PageSyncMessage = {
        v: 1,
        type: "visible-range",
        tabId,
        kind: "kline",
        fromIso,
        toIso,
      };
      bc.postMessage(msg);
    },
    [tabId],
  );

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
    broadcastPageVisibleRange(unixSecToContextDate(from), unixSecToContextDate(to));
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
  }, [tabId, broadcastPageVisibleRange]);

  const onVisibleTimeRangeChange = useCallback((from: number, to: number) => {
    setEventRangeFromSec(from);
    setEventRangeToSec(to);
  }, []);

  const onEventMarkerClick = useCallback(
    (payload: { id: string; time: number; title: string; source: string; eventIds?: string[] }) => {
      setSelectedEventId(payload.id);
      setMarkerGroupIds(payload.eventIds || []);
      setEventShelfOpen(true);
      setEventContextDate(unixSecToContextDate(payload.time));
    },
    [],
  );

  const onLocalCrosshairTime = useCallback((time: number | null) => {
    if (time != null) {
      setEventContextDate(unixSecToContextDate(time));
    }
    broadcastPageCrosshair(time != null ? unixSecToContextDate(time) : null);
    const bc = bcRef.current;
    if (!bc || !pageSyncRef.current) return;
    const msg: KlineSyncMessage = {
      v: 1,
      type: "crosshair",
      tabId: tabId,
      time,
    };
    bc.postMessage(msg);
  }, [tabId, broadcastPageCrosshair]);

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
    }),
    [eventRangeFrom, eventRangeTo, eventContextDate],
  );

  const resetEventFiltersToSymbol = useCallback(() => {
    const sym = symbol.trim();
    if (!sym) {
      setEventViewFilters({ ...DEFAULT_EVENT_VIEW_FILTERS });
      return;
    }
    const draft = deriveEventFilterDraft(classifyChartSymbol(sym));
    setEventViewFilters(
      applySymbolDraftToFilters({ ...DEFAULT_EVENT_VIEW_FILTERS }, draft),
    );
  }, [symbol]);

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
    setLoadedSymbol(symbol);
  }, [symbol]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    /** 已选定标的且输入与当前代码一致时不再打联想（与 K 线加载无关，减少无效请求） */
    if (symbol.trim() && normalizeTickerSymbol(q) === symbol.trim()) {
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
    if (findMarketInstrument(s)?.fredSeriesId && interval !== "1d" && interval !== "1w") setKlineInterval("1d");
    // 丢弃仍在路上的 symbol-search 响应，否则会再次 setOpen(true) + 空列表 →「无匹配」盖住图表
    reqIdRef.current += 1;
    if (s !== symbol) setLoadedSymbol("");
    setSymbol(s);
    setQuery(marketSymbolLabel(s));
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

  const [mobileSettingsMount, setMobileSettingsMount] = useState<HTMLDivElement | null>(null);
  const [mobileLayout, setMobileLayout] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => { setMobileLayout(media.matches); setSettingsOpen(false); };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!settingsOpen) return;
    const close = (e: PointerEvent) => {
      if (!settingsRef.current?.contains(e.target as Node)) setSettingsOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSettingsOpen(false); settingsButtonRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [settingsOpen]);

  const pageSettings = (
    <>
        <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] text-fs-muted">
          <span className="md:hidden">复权类型</span>
          <select
            value={effectiveAdjustment}
            disabled={regionalInstrument?.market === "GOLD" || yieldInstrument}
            onChange={(e) =>
                setPriceAdjustment(e.target.value as PriceAdjustmentMode)
              }
              title={yieldInstrument ? "国债收益率不复权" : regionalInstrument?.market === "GOLD" ? "现货黄金不复权" : regionalInstrument ? "东方财富前复权 / 后复权 / 不复权；以供应商口径为准" : "前复权：历史价按拆股与现金分红对齐最新尺度；后复权：锚定上市首日名义价；不复权：当日真实成交价。"}
              aria-label="K 线价格复权"
              className="h-[22px] max-w-[5.5rem] rounded border border-fs-border bg-fs-elevated px-1 py-0 font-mono text-[10px] text-fs-text focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600/40"
          >
            <option value="forward">前复权</option>
            <option value="backward">后复权</option>
            <option value="none">不复权</option>
          </select>
        </label>

        <label
          className="flex shrink-0 cursor-pointer items-center gap-1 text-[10px] text-fs-muted"
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

    </>
  );

  const toolbar = (
      <div ref={rootRef} className="relative z-20 flex min-w-0 shrink-0 flex-wrap items-center gap-1.5 overflow-visible py-0">
        <div className="relative min-h-[28px] min-w-0 flex-1 md:min-h-[26px] md:min-w-[100px] md:max-w-[12rem]">
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
            placeholder="搜股票、ETF、股指、汇率、美债"
            title="支持常用代码和中文名称，例如 SOXX、SPX、DXY、US2Y、US10Y、EURUSD、600519.SH、00700.HK"
            className="h-7 w-full md:h-[26px] rounded border border-fs-border bg-fs-elevated py-0 pl-2 pr-2 font-mono text-[10px] leading-[26px] text-fs-text placeholder:text-fs-muted focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600/40"
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
                  可搜股票或ETF、标普500（SPX）、美元指数（DXY）、两年美债（US2Y）、十年美债（US10Y）、欧元美元（EURUSD）、黄金等；也可输入代码后按 Enter。
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
                    <span className="font-mono font-medium text-fs-text">
                      {marketSymbolLabel(h.symbol)}
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

        <div ref={settingsRef} className="static shrink-0 md:hidden">
          <button ref={settingsButtonRef} type="button" onClick={() => { setOpen(false); setSettingsOpen(v => !v); }}
            className="h-7 rounded border border-fs-border bg-fs-elevated px-3 text-[11px] text-fs-text"
            aria-expanded={settingsOpen} aria-controls="markets-mobile-settings">设置 ▾</button>
          <section id="markets-mobile-settings" role="dialog" aria-label="行情设置" hidden={!settingsOpen}
            className="absolute inset-x-0 top-8 z-[90] max-h-[70dvh] overflow-y-auto rounded-lg border border-fs-border bg-fs-bg p-3 shadow-xl">
            <header className="mb-3 flex items-center justify-between text-xs font-medium text-fs-text">
              行情设置<button type="button" aria-label="关闭行情设置" className="h-7 px-2" onClick={() => { setSettingsOpen(false); settingsButtonRef.current?.focus(); }}>✕</button>
            </header>
            <div ref={setMobileSettingsMount} className="flex min-w-0 flex-col items-start gap-3" />
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-fs-border pt-3">{pageSettings}</div>
            {dataHint ? <p className="mt-3 text-[10px] text-fs-muted">{dataHint}</p> : null}
          </section>
        </div>
        <div className="flex w-full min-w-0 items-center gap-1 md:contents" aria-label="行情快捷工具">
        <label className="flex shrink-0 items-center text-[9px] text-fs-muted">
          <select
            value={interval}
            onChange={(e) => {
              const v = e.target.value;
              if (isKlineInterval(v)) pickInterval(v);
            }}
            title="K 线周期"
            aria-label="K 线周期"
            className="h-7 min-w-[3.75rem] md:h-[22px] md:min-w-[4.25rem] cursor-pointer rounded border border-amber-600/50 bg-fs-elevated px-1.5 py-0 text-[10px] font-medium leading-none text-fs-text shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
          >
            {KLINE_INTERVALS.filter(iv => !findMarketInstrument(symbol)?.fredSeriesId || iv === "1d" || iv === "1w").map((iv) => (
              <option key={iv} value={iv}>
                {INTERVAL_LABEL[iv]}
              </option>
            ))}
          </select>
        </label>

          <div ref={setChartToolbarMount} className="flex min-w-0 flex-1 items-center gap-1 md:flex-none md:flex-wrap md:gap-2" aria-label="主图与画线工具" />
        </div>

        <div className="hidden md:contents">{pageSettings}</div>

        <div
          className={`min-w-0 flex-1 px-0.5 text-[8px] leading-tight text-fs-muted sm:text-[9px] ${dataHint?.includes("缓存") ? "" : "hidden md:block"}`}
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
                {marketSymbolLabel(symbol)}
              </span>
              {pickedName ? (
                <span className="max-w-[min(40vw,220px)] truncate text-[10px] leading-none text-fs-muted">
                  {pickedName}
                </span>
              ) : null}
              <span className="rounded bg-fs-elevated px-1 py-0 font-mono text-[9px] leading-none text-fs-muted">
                {INTERVAL_LABEL[interval]}
              </span>
              {classifyChartSymbol(symbol).kind === "equity" ? (
                <>
                  <a
                    href={`/equity/stocks/${encodeURIComponent(symbol.trim().toUpperCase())}`}
                    className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] leading-none text-fs-accent-text hover:bg-fs-accent-soft"
                    title="打开个股研究页（基本面 / 同业 / 事件）"
                  >
                    个股研究
                  </a>
                  <a
                    href={`/investments?symbol=${encodeURIComponent(symbol.trim().toUpperCase())}`}
                    className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] leading-none text-fs-accent-text hover:bg-fs-accent-soft"
                    title="为当前标的创建私人投资案例"
                  >
                    投资记录
                  </a>
                </>
              ) : null}
            </>
          ) : (
            <span className="text-[10px] leading-none text-fs-secondary">
              选择标的后显示
            </span>
          )}
        </div>
      </div>
  );

  return (
    <MarketsWatchlist toolbar={toolbar} symbol={symbol} name={pickedName} canAddCurrent={!!symbol && loadedSymbol === symbol && normalizeTickerSymbol(query) === symbol && !searchLoading && !searchError} onSelect={commitSymbol}
      rightPanel={detailEvent ? <EventDetailDrawer event={detailEvent} onClose={closeEventDetail} presentation="sidebar" /> : null}
      rightPanelOpenVersion={detailOpenVersion}>
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-row gap-0 overflow-hidden px-1 lg:px-2"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-hidden md:gap-2">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <StockChartWorkspace
          key={`${symbol || "none"}-${interval}-${effectiveAdjustment}`}
          symbol={symbol}
          source={chartSource}
          interval={interval}
          priceAdjustment={effectiveAdjustment}
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
          onEventMarkerClick={onEventMarkerClick}
          localEvents={localEventStore.events}
          chartEvents={eventResult.events}
          selectedEventId={selectedEventId}
          seekToTimeSec={eventSeek.time}
          seekToTimeVersion={eventSeek.version}
          toolbarPortalEl={chartToolbarMount}
          settingsPortalEl={mobileLayout ? mobileSettingsMount : null}
          eventViewFilters={eventViewFilters}
          onEventViewFiltersChange={setEventViewFilters}
          forceHideSubPanes={eventShelfOpen}
        />
        {eventShelfOpen ? (
          <MarketsEventShelf
            localEventStore={localEventStore}
            eventResult={eventResult}
            selectedEventId={selectedEventId}
            markerGroupIds={markerGroupIds}
            onCloseMarkerGroup={() => setMarkerGroupIds([])}
            onSelectEvent={setSelectedEventId}
            onLocateEvent={(event) => setEventSeek(prev => ({ time: Math.floor(Date.parse(event.occurredAt) / 1000), version: prev.version + 1 }))}
            onOpenDetail={openEventDetail}
            symbol={symbol}
            viewFilters={eventViewFilters}
            onViewFiltersChange={setEventViewFilters}
            rangeFromSec={eventRangeFromSec}
            rangeToSec={eventRangeToSec}
            trackDate={chartLinkedEventProps.trackDate}
            onResetToSymbolDefault={resetEventFiltersToSymbol}
          />
        ) : null}
        <button
          type="button"
          onClick={() => setEventShelfOpen((v) => !v)}
          className="flex h-7 w-full shrink-0 items-center justify-center gap-1 border-t border-fs-border bg-fs-elevated text-[11px] text-fs-secondary hover:bg-fs-accent-soft hover:text-fs-accent-text"
          aria-expanded={eventShelfOpen}
          aria-label={eventShelfOpen ? "折叠事件筛选器" : "展开事件筛选器"}
        >
          <span aria-hidden>{eventShelfOpen ? "▾" : "▴"}</span>
          {eventShelfOpen ? "折叠事件筛选器" : "展开事件筛选器"}
        </button>
      </div>
      </div>
    </div>
    </MarketsWatchlist>
  );
}
