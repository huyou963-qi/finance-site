"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { symbolSearchErrorForUser } from "@/lib/data/symbolSearchUserMessage";
import { normalizeYahooSymbol } from "@/lib/data/yahooSymbol";

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

export function MarketsClient() {
  const dataSource = "ibkr" as const;
  const [symbol, setSymbol] = useState("");
  const [dataHint, setDataHint] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [interval, setKlineInterval] = useState<KlineInterval>("1d");
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

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqIdRef = useRef(0);
  const tabId = useMemo(() => getOrCreateKlineSyncTabId(), []);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const pageSyncRef = useRef(false);

  useEffect(() => {
    pageSyncRef.current = pageSync;
  }, [pageSync]);

  /** 切换标的后丢弃远端区间锚点，避免把上一标的的同步套到新图上 */
  useEffect(() => {
    setRemoteRangeSpecs([]);
    setRemoteRangeSpecsVer(0);
  }, [symbol]);

  useEffect(() => {
    bcRef.current = new BroadcastChannel(KLINE_PAGE_SYNC_CHANNEL);
    return () => {
      bcRef.current?.close();
      bcRef.current = null;
    };
  }, []);

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
  }, []);

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
  }, []);

  const onLocalCrosshairTime = useCallback((time: number | null) => {
    const bc = bcRef.current;
    if (!bc || !pageSyncRef.current) return;
    const msg: KlineSyncMessage = {
      v: 1,
      type: "crosshair",
      tabId: tabId,
      time,
    };
    bc.postMessage(msg);
  }, []);

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

    /** 已选定标的且输入与当前代码一致时不再打联想接口（避免 Massive 无联想命中→Yahoo 失败的红字，与 K 线是否正常无关） */
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
    const s = normalizeYahooSymbol(raw);
    if (!s) return;
    setSymbol(s);
    setQuery(s);
    setPickedName(name ?? displayNameForSymbol(s));
    setOpen(false);
    setHits([]);
  };

  useEffect(() => {
    if (!symbol.trim()) setDataHint(null);
  }, [symbol]);

  const showPanel = open && query.trim().length > 0;

  return (
    <div
      ref={rootRef}
      className="flex h-full min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden px-1 lg:px-2"
    >
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-1.5 py-0">
        <div className="relative min-h-[26px] min-w-[100px] max-w-md flex-1">
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
            className="h-[26px] w-full rounded border border-slate-700 bg-slate-900 py-0 pl-2 pr-2 font-mono text-[10px] leading-[26px] text-slate-100 placeholder:text-slate-500 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600/40"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {showPanel ? (
            <ul className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-72 overflow-auto rounded border border-slate-600 bg-slate-900 py-0.5 shadow-xl">
              {searchLoading ? (
                <li className="px-2 py-1 text-[10px] text-slate-500">搜索中…</li>
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
                <li className="px-2 py-1 text-[10px] text-slate-500">
                  无匹配标的，请换个关键词或选下列交易所常用写法（如 AAPL、MSFT）
                </li>
              ) : null}
              {hits.map((h, idx) => (
                <li key={`${h.symbol}-${idx}`}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0 px-2 py-1 text-left text-[10px] hover:bg-slate-800"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commitSymbol(h.symbol, h.name)}
                  >
                    <span className="font-mono text-amber-200/90">
                      {h.symbol}
                    </span>
                    <span className="line-clamp-2 text-[9px] text-slate-400">
                      <span className="text-slate-300">{h.name}</span>
                      {h.exchange ? (
                        <span className="text-slate-500"> · {h.exchange}</span>
                      ) : null}
                      {h.type ? (
                        <span className="text-slate-600"> · {h.type}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {KLINE_INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => pickInterval(iv)}
              className={`h-[22px] shrink-0 rounded px-1.5 py-0 text-[10px] font-medium leading-none transition ${
                interval === iv
                  ? "bg-amber-600/90 text-white shadow"
                  : "border border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }`}
            >
              {INTERVAL_LABEL[iv]}
            </button>
          ))}
        </div>

        <label className="ml-2 flex shrink-0 cursor-pointer items-center gap-1 text-[9px] text-slate-400">
          <input
            type="checkbox"
            checked={pageSync}
            onChange={(e) => handlePageSyncChange(e.target.checked)}
            className="h-3 w-3 shrink-0 rounded border-slate-600"
          />
          页面同步
        </label>

        <div
          className="min-w-0 flex-1 px-0.5 text-[8px] leading-tight text-slate-500 sm:text-[9px]"
          title={dataHint ?? undefined}
        >
          {dataHint ? (
            <span className="line-clamp-2">{dataHint}</span>
          ) : null}
        </div>

        <div className="ml-auto flex min-w-0 shrink-0 flex-col items-end gap-0 text-right sm:flex-row sm:items-baseline sm:gap-1.5">
          {symbol ? (
            <>
              <span className="font-mono text-[10px] font-semibold leading-none text-slate-100">
                {symbol}
              </span>
              {pickedName ? (
                <span className="max-w-[min(40vw,220px)] truncate text-[10px] leading-none text-slate-500">
                  {pickedName}
                </span>
              ) : null}
              <span className="rounded bg-slate-800 px-1 py-0 font-mono text-[9px] leading-none text-slate-400">
                {INTERVAL_LABEL[interval]}
              </span>
            </>
          ) : (
            <span className="text-[10px] leading-none text-slate-600">
              选择标的后显示
            </span>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <StockChartWorkspace
          key={`${dataSource}-${symbol || "none"}-${interval}`}
          source={dataSource}
          symbol={symbol}
          interval={interval}
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
          onLocalCrosshairTime={onLocalCrosshairTime}
        />
      </div>
    </div>
  );
}
