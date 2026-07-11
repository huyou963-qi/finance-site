import { NextRequest, NextResponse } from "next/server";
import {
  drainKlineServerDebugRing,
  isKlineDebugEnabled,
  klineDebugLog,
  logCandleSeriesReport,
} from "@/lib/data/klineDebug";
import { parsePriceAdjustmentMode } from "@/lib/equity/priceAdjustment";
import {
  fetchKlinesWithProvider,
  getRegisteredKlineProvider,
  validateKlineWindowForProvider,
} from "@/lib/data/providers/klineProviderRegistry";
import type { KlineFetchWindowOptions } from "@/lib/data/types";

/**
 * GET /api/data/klines?symbol=AAPL&interval=1d&limit=300
 * GET ...&adjust=forward|backward|none   日线/周线由服务端精确复权（拆股事件 + 分红因子）
 * GET ...&before=1690000000              仅拉取早于该 Unix 秒的历史（向左追加）
 * GET ...&fromSec=...&toSec=...          显式区间（与 before 互斥）
 *
 * 数据源固定 Yahoo Finance（免密钥，覆盖全部美股）；source= 参数仅作兼容校验。
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const source = (sp.get("source") ?? "yahoo").toLowerCase();
  const sym = (sp.get("symbol") ?? "").trim() || "AAPL";
  const interval = sp.get("interval") ?? "1d";
  const limit = Number(sp.get("limit") ?? "300");
  const adjustment = parsePriceAdjustmentMode(sp.get("adjust"));

  const beforeRaw = sp.get("before");
  const fromRaw = sp.get("fromSec");
  const toRaw = sp.get("toSec");

  const hasRange = fromRaw != null && fromRaw !== "" && toRaw != null && toRaw !== "";
  const hasBefore = beforeRaw != null && beforeRaw !== "";

  if (hasBefore && hasRange) {
    return NextResponse.json(
      { error: "before 与 fromSec/toSec 不能同时使用" },
      { status: 400 },
    );
  }

  let windowOpts: KlineFetchWindowOptions = {};
  if (hasRange) {
    const fromN = Number(fromRaw);
    const toN = Number(toRaw);
    if (!Number.isFinite(fromN) || !Number.isFinite(toN) || fromN <= 0 || toN <= 0 || fromN >= toN) {
      return NextResponse.json(
        { error: "fromSec、toSec 须为正数 Unix 秒且 fromSec < toSec" },
        { status: 400 },
      );
    }
    windowOpts = { fromTimeSec: Math.floor(fromN), toTimeSec: Math.floor(toN) };
  } else if (hasBefore) {
    const n = Number(beforeRaw);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json(
        { error: "before 须为正数 Unix 秒时间戳" },
        { status: 400 },
      );
    }
    windowOpts = { beforeTimeSec: Math.floor(n) };
  }

  if (source !== "yahoo") {
    return NextResponse.json(
      { error: `未知 source：${source}（当前仅支持 yahoo）` },
      { status: 400 },
    );
  }

  const provider = getRegisteredKlineProvider("yahoo");
  if (!provider) {
    return NextResponse.json({ error: "yahoo 提供者未注册" }, { status: 500 });
  }

  const winErr = validateKlineWindowForProvider(provider, windowOpts);
  if (winErr) {
    return NextResponse.json({ error: winErr }, { status: 400 });
  }

  klineDebugLog("api", "request", {
    source: "yahoo",
    sym,
    interval,
    limit,
    adjust: adjustment,
    before: windowOpts.beforeTimeSec ?? null,
    fromSec: windowOpts.fromTimeSec ?? null,
    toSec: windowOpts.toTimeSec ?? null,
  });

  try {
    const payload = await fetchKlinesWithProvider("yahoo", {
      symbol: sym,
      interval,
      limit,
      adjustment,
      window: windowOpts,
    });

    logCandleSeriesReport("api", "response", payload.candles, interval, {
      resolvedSource: "yahoo",
      payloadSource: payload.source,
      symbol: payload.symbol,
      hasMoreOlder: payload.hasMoreOlder,
      before: windowOpts.beforeTimeSec ?? null,
      adjust: adjustment,
    });

    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    const clientError =
      message.includes("无效") ||
      message.includes("不支持") ||
      message.includes("未找到") ||
      message.includes("不能为空");
    klineDebugLog("api", "route.error", { source: "yahoo", sym, interval, message });

    const body: {
      error: string;
      klineDebugTrace?: ReturnType<typeof drainKlineServerDebugRing>;
    } = { error: message };
    if (isKlineDebugEnabled()) {
      body.klineDebugTrace = drainKlineServerDebugRing();
    }
    return NextResponse.json(body, { status: clientError ? 400 : 502 });
  }
}
