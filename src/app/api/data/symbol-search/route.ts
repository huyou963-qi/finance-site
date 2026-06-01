import { NextRequest, NextResponse } from "next/server";
import { isIbkrCpMode, isIbkrTwsMode } from "@/lib/data/ibkrApiConfig";
import { searchIbkrSymbolsForAutocomplete } from "@/lib/data/ibkrKlines";
import { readIbkrCpCookie } from "@/lib/data/ibkrCpSession";
import { symbolSearchErrorForUser } from "@/lib/data/symbolSearchUserMessage";
import { rankSymbolSearchHits } from "@/lib/data/symbolSearchRank";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";

export type { SymbolSearchItem };

/**
 * GET /api/data/symbol-search?q=aapl
 * IBKR 联想：`IBKR_API_MODE=tws` 走 TWS；`cp` 走 Gateway（需 Cookie）。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) {
    return NextResponse.json({ results: [] as SymbolSearchItem[] });
  }

  let results: SymbolSearchItem[] = [];
  let searchErr: string | undefined;

  if (isIbkrCpMode() && !readIbkrCpCookie()) {
    searchErr =
      "未检测到 IB Gateway 会话：请先登录 Client Portal Gateway，或通过本站保存 Cookie 后再使用联想搜索。";
  } else {
    try {
      const ib = await searchIbkrSymbolsForAutocomplete(q);
      if (ib.length > 0) {
        results = rankSymbolSearchHits(q, ib).slice(0, 20);
      }
    } catch (e) {
      searchErr =
        e instanceof Error ? e.message : String(e ?? "IBKR search failed");
    }
  }

  if (results.length > 0) {
    return NextResponse.json({ results });
  }

  const hint =
    searchErr ??
    (isIbkrTwsMode() || readIbkrCpCookie()
      ? "未找到匹配结果，可尝试英文关键词或直接输入完整代码。"
      : undefined);
  const error = symbolSearchErrorForUser(hint);
  return NextResponse.json(
    { error, results: [] as SymbolSearchItem[] },
    { status: 502 },
  );
}
