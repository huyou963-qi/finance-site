"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeTickerSymbol } from "@/lib/data/tickerSymbolNormalize";
import { symbolSearchErrorForUser } from "@/lib/data/symbolSearchUserMessage";

type Hit = { symbol: string; name: string; exchange: string };

/**
 * 个股研究页顶栏：搜索切换标的（走 symbol-search，跳转 /equity/stocks/[symbol]）。
 */
export function StockSymbolSwitcher({ currentSymbol }: { currentSymbol: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      setError(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/data/symbol-search?q=${encodeURIComponent(q)}`)
        .then(async (r) => {
          const j = (await r.json().catch(() => ({}))) as {
            error?: string;
            results?: Hit[];
          };
          if (!r.ok) throw new Error(j.error ?? `${r.status}`);
          return j.results ?? [];
        })
        .then((results) => {
          if (cancelled) return;
          setHits(results.slice(0, 12));
          setError(null);
          setOpen(true);
        })
        .catch((e) => {
          if (cancelled) return;
          setHits([]);
          setError(
            symbolSearchErrorForUser(
              e instanceof Error ? e.message : String(e),
            ),
          );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  const go = (symRaw: string) => {
    const sym = normalizeTickerSymbol(symRaw) || symRaw.trim().toUpperCase();
    if (!sym) return;
    setOpen(false);
    setQuery("");
    if (sym === currentSymbol.toUpperCase()) return;
    router.push(`/equity/stocks/${encodeURIComponent(sym)}`);
  };

  return (
    <div ref={rootRef} className="relative min-w-[10rem] max-w-[14rem] flex-1">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (hits.length) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (hits[0]) go(hits[0].symbol);
            else if (query.trim()) go(query);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="切换标的…"
        aria-label="搜索并切换个股"
        className="h-8 w-full rounded border border-fs-border bg-fs-elevated px-2 text-xs text-fs-text placeholder:text-fs-muted focus:border-fs-accent/60 focus:outline-none"
      />
      {open && (hits.length > 0 || loading || error) ? (
        <ul
          role="listbox"
          className="absolute right-0 z-30 mt-1 max-h-64 w-[min(100vw-2rem,18rem)] overflow-auto rounded-md border border-fs-border bg-fs-bg py-1 shadow-xl"
        >
          {loading ? (
            <li className="px-3 py-2 text-[11px] text-fs-muted">搜索中…</li>
          ) : null}
          {error ? (
            <li className="px-3 py-2 text-[11px] text-amber-500">{error}</li>
          ) : null}
          {hits.map((h) => (
            <li key={h.symbol}>
              <button
                type="button"
                className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-fs-elevated"
                onClick={() => go(h.symbol)}
              >
                <span className="font-mono text-xs text-fs-text">{h.symbol}</span>
                <span className="truncate text-[10px] text-fs-muted">
                  {h.name}
                  {h.exchange ? ` · ${h.exchange}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
