"use client";

import { useEffect, useState } from "react";
import type { MarketQuote } from "@/lib/data/marketQuote";

export function useMarketQuotes(symbols: string[], enabled: boolean) {
  const key = symbols.join(",");
  const [quotes, setQuotes] = useState<Record<string, MarketQuote | null>>({});
  useEffect(() => {
    if (!enabled || !key) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const requested = key.split(",");
    const refresh = async () => {
      if (document.visibilityState === "hidden") {
        timer = setTimeout(refresh, 30_000);
        return;
      }
      for (let i = 0; i < requested.length; i += 30) {
        const batch = requested.slice(i, i + 30);
        let values: Record<string, MarketQuote | null>;
        try {
          const response = await fetch(`/api/data/quotes?symbols=${encodeURIComponent(batch.join(","))}`, { signal: controller.signal });
          if (!response.ok) throw new Error("行情暂不可用");
          const json = await response.json() as { quotes: Record<string, MarketQuote | null> };
          values = json.quotes;
        } catch {
          values = Object.fromEntries(batch.map(symbol => [symbol, null]));
        }
        if (controller.signal.aborted) return;
        setQuotes(previous => ({ ...previous, ...values }));
      }
      timer = setTimeout(refresh, 30_000);
    };
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [key, enabled]);
  return quotes;
}
