import { fetchYahooQuote } from "@/lib/equity/yahooChart";
import { resolveEastmoneyInstrument } from "./eastmoneySymbols";
import { makeMarketQuote, type MarketQuote } from "./marketQuote";
import { normalizeTickerSymbol } from "./tickerSymbolNormalize";
import { findMarketInstrument } from "./marketInstruments";
import { loadYieldObservations } from "./providers/macroYieldKlineProvider";

const cache = new Map<string, { until: number; value: MarketQuote | null }>();
const pending = new Map<string, Promise<MarketQuote | null>>();

export async function fetchMarketQuote(symbol: string): Promise<MarketQuote | null> {
  symbol = normalizeTickerSymbol(symbol);
  const cached = cache.get(symbol);
  if (cached && cached.until > Date.now()) return cached.value;
  const running = pending.get(symbol);
  if (running) return running;
  const task = (async () => {
    const regional = resolveEastmoneyInstrument(symbol);
    let quote: MarketQuote | null;
    if (findMarketInstrument(symbol)?.fredSeriesId) {
      const points = await loadYieldObservations(symbol);
      const last = points.at(-1);
      quote = last ? makeMarketQuote(symbol, { price: last.value, previousClose: points.at(-2)?.value,
        time: last.time, currency: "%（日度收益率）" }) : null;
    } else if (regional) {
      const url = new URL("https://push2.eastmoney.com/api/qt/stock/get");
      url.search = new URLSearchParams({ secid: regional.secid, fltt: "2", fields: "f43,f60,f124" }).toString();
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("行情暂不可用");
      const json = await response.json() as { rc?: number; data?: { f43?: unknown; f60?: unknown; f124?: unknown } | null };
      if (json.rc !== 0) throw new Error("行情返回异常");
      quote = makeMarketQuote(symbol, { price: json.data?.f43, previousClose: json.data?.f60, time: json.data?.f124, currency: regional.currency });
    } else {
      quote = makeMarketQuote(symbol, await fetchYahooQuote(symbol));
    }
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(symbol, { until: Date.now() + 30_000, value: quote });
    return quote;
  })();
  pending.set(symbol, task);
  try { return await task; } finally { pending.delete(symbol); }
}
