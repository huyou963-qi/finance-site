import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";

/** Massive v3 reference/tickers?search=… — Yahoo 不可用时的联想备用（需 MASSIVE_API_KEY） */
export async function searchMassiveTickers(
  q: string,
): Promise<SymbolSearchItem[]> {
  const key = process.env.MASSIVE_API_KEY?.trim();
  if (!key || q.length < 1) return [];

  const url = new URL("https://api.massive.com/v3/reference/tickers");
  url.searchParams.set("search", q);
  url.searchParams.set("active", "true");
  url.searchParams.set("limit", "100");
  url.searchParams.set("apiKey", key);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) return [];

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return [];
  }

  if (!data || typeof data !== "object") return [];
  const results = (data as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];

  const out: SymbolSearchItem[] = [];
  const seen = new Set<string>();

  for (const row of results) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const ticker =
      typeof r.ticker === "string" ? r.ticker.trim() : "";
    if (!ticker || seen.has(ticker)) continue;

    const name = typeof r.name === "string" ? r.name.trim() : ticker;
    const primary =
      typeof r.primary_exchange === "string"
        ? r.primary_exchange.trim()
        : "";
    const market = typeof r.market === "string" ? r.market.trim() : "";
    const exchange = primary || market;
    const type = typeof r.type === "string" ? r.type : undefined;

    seen.add(ticker);
    out.push({ symbol: ticker, name: name || ticker, exchange, type });
    if (out.length >= 100) break;
  }

  return out;
}

/** 按 ticker 精确拉取单条（用于 META 等代码优先出现在联想列表） */
export async function lookupMassiveTickerBySymbol(
  raw: string,
): Promise<SymbolSearchItem | null> {
  const key = process.env.MASSIVE_API_KEY?.trim();
  if (!key) return null;
  const t = raw.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(t)) return null;

  const url = new URL(
    `https://api.massive.com/v3/reference/tickers/${encodeURIComponent(t)}`,
  );
  url.searchParams.set("apiKey", key);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;
  const rowRaw = obj.results;
  const row =
    rowRaw && typeof rowRaw === "object"
      ? (rowRaw as Record<string, unknown>)
      : obj;

  const ticker =
    typeof row.ticker === "string" ? row.ticker.trim().toUpperCase() : "";
  if (!ticker || ticker !== t) return null;

  const name = typeof row.name === "string" ? row.name.trim() : ticker;
  const primary =
    typeof row.primary_exchange === "string"
      ? row.primary_exchange.trim()
      : "";
  const market =
    typeof row.market === "string" ? row.market.trim() : "";
  const exchange = primary || market;
  const type = typeof row.type === "string" ? row.type : undefined;

  return { symbol: ticker, name: name || ticker, exchange, type };
}
