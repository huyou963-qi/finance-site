"use client";

import { useEffect, useRef, useState } from "react";
import { StockChartWorkspace } from "@/components/StockChartWorkspace";
import {
  KLINE_INTERVALS,
  type KlineInterval,
} from "@/lib/data/klineShared";
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
  const dataSource = "massive" as const;
  const [symbol, setSymbol] = useState("");
  const [dataHint, setDataHint] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [interval, setInterval] = useState<KlineInterval>("1d");
  const [hits, setHits] = useState<SymbolHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pickedName, setPickedName] = useState<string | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      setSearchError(null);
      setSearchLoading(false);
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
  }, [query]);

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
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 py-0.5">
        <div className="relative min-h-[40px] min-w-[120px] max-w-md flex-1">
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
            className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 pl-3 pr-3 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600/40"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {showPanel ? (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border border-slate-600 bg-slate-900 py-1 shadow-xl">
              {searchLoading ? (
                <li className="px-3 py-2 text-xs text-slate-500">搜索中…</li>
              ) : null}
              {searchError ? (
                <li className="px-3 py-2 text-xs text-rose-300">
                  {symbolSearchErrorForUser(searchError)}
                </li>
              ) : null}
              {!searchLoading &&
              !searchError &&
              hits.length === 0 &&
              query.trim().length > 0 ? (
                <li className="px-3 py-2 text-xs text-slate-500">
                  无匹配标的，请换个关键词或选下列交易所常用写法（如 AAPL、MSFT）
                </li>
              ) : null}
              {hits.map((h, idx) => (
                <li key={`${h.symbol}-${idx}`}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-slate-800"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commitSymbol(h.symbol, h.name)}
                  >
                    <span className="font-mono text-amber-200/90">
                      {h.symbol}
                    </span>
                    <span className="line-clamp-2 text-xs text-slate-400">
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

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {KLINE_INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => setInterval(iv)}
              className={`shrink-0 rounded px-2.5 py-1.5 text-xs font-medium transition ${
                interval === iv
                  ? "bg-amber-600/90 text-white shadow"
                  : "border border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }`}
            >
              {INTERVAL_LABEL[iv]}
            </button>
          ))}
        </div>

        <div
          className="min-w-0 flex-1 px-1 text-[10px] leading-snug text-slate-500 sm:text-[11px]"
          title={dataHint ?? undefined}
        >
          {dataHint ? (
            <span className="line-clamp-2">{dataHint}</span>
          ) : null}
        </div>

        <div className="ml-auto flex min-w-0 shrink-0 flex-col items-end gap-0.5 text-right sm:flex-row sm:items-baseline sm:gap-2">
          {symbol ? (
            <>
              <span className="font-mono text-sm font-semibold text-slate-100">
                {symbol}
              </span>
              {pickedName ? (
                <span className="max-w-[min(40vw,220px)] truncate text-sm text-slate-500">
                  {pickedName}
                </span>
              ) : null}
              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">
                {INTERVAL_LABEL[interval]}
              </span>
            </>
          ) : (
            <span className="text-xs text-slate-600">选择标的后显示</span>
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
        />
      </div>
    </div>
  );
}
