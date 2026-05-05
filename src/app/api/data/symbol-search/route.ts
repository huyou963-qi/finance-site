import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import {
  lookupMassiveTickerBySymbol,
  searchMassiveTickers,
} from "@/lib/data/massiveSymbolSearch";
import {
  symbolSearchErrorForUser,
} from "@/lib/data/symbolSearchUserMessage";
import { rankSymbolSearchHits } from "@/lib/data/symbolSearchRank";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";

const yahooFinance = new YahooFinance();

export type { SymbolSearchItem };

function extractQuotes(raw: unknown, maxItems = 50): SymbolSearchItem[] {
  if (!raw || typeof raw !== "object") return [];
  const quotes = (raw as { quotes?: unknown }).quotes;
  if (!Array.isArray(quotes)) return [];

  const out: SymbolSearchItem[] = [];
  const seen = new Set<string>();

  for (const row of quotes) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const sym =
      typeof r.symbol === "string" ? r.symbol.trim() : "";
    if (!sym || seen.has(sym)) continue;

    const longname = typeof r.longname === "string" ? r.longname : "";
    const shortname = typeof r.shortname === "string" ? r.shortname : "";
    const name = (longname || shortname || sym).trim();
    const exchDisp = typeof r.exchDisp === "string" ? r.exchDisp : "";
    const exchange =
      exchDisp ||
      (typeof r.exchange === "string" ? r.exchange : "") ||
      "";

    const type =
      typeof r.quoteType === "string" ? r.quoteType : undefined;

    seen.add(sym);
    out.push({ symbol: sym, name, exchange, type });
    if (out.length >= maxItems) break;
  }

  return out;
}

/**
 * GET /api/data/symbol-search?q=aapl
 * 联想顺序（固定）：① 已配置 MASSIVE_API_KEY 时先调 Massive reference/tickers；
 * ② 无结果或异常时再调 Yahoo；③ 未配置 Key 时仅 Yahoo。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) {
    return NextResponse.json({ results: [] as SymbolSearchItem[] });
  }

  let results: SymbolSearchItem[] = [];
  let searchErr: string | undefined;
  const massiveKey = process.env.MASSIVE_API_KEY?.trim();

  if (massiveKey) {
    try {
      const tickerLike = /^[A-Za-z][A-Za-z0-9.\-]{0,14}$/.test(q.trim());
      const [poly, exactHit] = await Promise.all([
        searchMassiveTickers(q),
        tickerLike ? lookupMassiveTickerBySymbol(q.trim()) : Promise.resolve(null),
      ]);
      const seen = new Set<string>();
      const merged: SymbolSearchItem[] = [];
      if (exactHit) {
        merged.push(exactHit);
        seen.add(exactHit.symbol);
      }
      for (const it of poly) {
        if (!seen.has(it.symbol)) {
          seen.add(it.symbol);
          merged.push(it);
        }
      }
      if (merged.length > 0) {
        results = rankSymbolSearchHits(q, merged).slice(0, 20);
      }
    } catch {
      /* Massive 失败则落入下方 Yahoo */
    }
  }

  if (results.length === 0) {
    try {
      const raw = await yahooFinance.search(
        q,
        {
          quotesCount: 50,
          newsCount: 0,
          enableNavLinks: false,
          enableFuzzyQuery: true,
          lang: "en-US",
          region: "US",
        },
        { validateResult: false },
      );
      results = rankSymbolSearchHits(q, extractQuotes(raw)).slice(0, 20);
    } catch (e) {
      searchErr =
        e instanceof Error ? e.message : String(e ?? "Yahoo search failed");
    }
  }

  if (results.length > 0) {
    return NextResponse.json({ results });
  }

  const error = symbolSearchErrorForUser(searchErr);
  return NextResponse.json(
    { error, results: [] as SymbolSearchItem[] },
    { status: 502 },
  );
}
