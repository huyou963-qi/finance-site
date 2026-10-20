import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";

// Public download explicitly offered by Nasdaq Trader's Symbol Directory.
// https://www.nasdaqtrader.com/Trader.aspx?id=symbollookup
// https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs
const BASE = "https://www.nasdaqtrader.com/dynamic/SymDir/";
const FILES = ["nasdaqlisted.txt", "otherlisted.txt"];
const EXCHANGES: Record<string, string> = { N: "NYSE", A: "NYSE American", P: "NYSE Arca", Z: "Cboe", V: "IEX" };

export function parseNasdaqSymbolDirectory(text: string): SymbolSearchItem[] {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const fields = header.split("|");
  const nasdaq = fields.includes("Symbol");
  const symbolIndex = fields.indexOf(nasdaq ? "Symbol" : "ACT Symbol");
  const nameIndex = fields.indexOf("Security Name");
  const testIndex = fields.indexOf("Test Issue");
  const etfIndex = fields.indexOf("ETF");
  if ([symbolIndex, nameIndex, testIndex, etfIndex].some(index => index < 0)) throw new Error("证券目录格式异常");
  return lines.flatMap(line => {
    const row = line.split("|");
    const symbol = row[symbolIndex]?.trim();
    const name = row[nameIndex]?.trim();
    // Keep ordinary shares, class shares and ETFs. Source-specific preferred/warrant
    // punctuation is not a reliable Yahoo code; do not guess a conversion.
    if (!symbol || !name || row[testIndex] !== "N" || !/^[A-Z][A-Z0-9]*(?:\.[A-Z])?$/.test(symbol)) return [];
    return [{ symbol: symbol.replace(".", "-"), name,
      exchange: nasdaq ? "Nasdaq" : EXCHANGES[row[fields.indexOf("Exchange")]] ?? "US",
      type: row[etfIndex] === "Y" ? "ETF" : undefined }];
  });
}

let cache: { until: number; rows: SymbolSearchItem[] } | null = null;
let pending: Promise<SymbolSearchItem[]> | null = null;
let retryAt = 0;

export async function loadNasdaqSymbolDirectory(): Promise<SymbolSearchItem[]> {
  if (cache && cache.until > Date.now()) return cache.rows;
  if (pending) return pending;
  if (Date.now() < retryAt) return cache?.rows ?? [];
  pending = (async () => {
    const results = await Promise.allSettled(FILES.map(async file => {
      const response = await fetch(`${BASE}${file}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`证券目录 HTTP ${response.status}`);
      const rows = parseNasdaqSymbolDirectory(await response.text());
      if (!rows.length) throw new Error("证券目录为空");
      return rows;
    }));
    const rows = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
    if (results.every(result => result.status === "fulfilled")) {
      cache = { until: Date.now() + 24 * 3600_000, rows };
      return rows;
    }
    retryAt = Date.now() + 5 * 60_000;
    const merged = new Map([...(cache?.rows ?? []), ...rows].map(row => [row.symbol, row]));
    cache = { until: retryAt, rows: [...merged.values()] };
    return cache.rows;
  })();
  try { return await pending; } finally { pending = null; }
}
