import { NextRequest, NextResponse } from "next/server";
import {
  drainKlineServerDebugRing,
  isKlineDebugEnabled,
  klineDebugLog,
  logCandleSeriesReport,
} from "@/lib/data/klineDebug";
import { fetchKlinesAutoChain } from "@/lib/data/klinesAutoChain";
import { parsePriceAdjustmentMode } from "@/lib/data/klineAdjustment";
import {
  fetchKlinesWithProvider,
  getRegisteredKlineProvider,
  validateKlineWindowForProvider,
} from "@/lib/data/providers/klineProviderRegistry";
import type { KlineProviderId } from "@/lib/data/providers/klineProviderTypes";
import type { KlineFetchWindowOptions, KlinePayload } from "@/lib/data/types";

/**
 * GET /api/data/klines?source=binance&symbol=BTCUSDT&interval=1d&limit=300
 * GET /api/data/klines?source=auto&symbol=AAPL&interval=1d&limit=300  （auto：策略见 klinesAutoChain）
 * GET /api/data/klines?source=ibkr&symbol=AAPL&interval=1d&limit=300
 * GET ...&before=1690000000  仅拉取早于该 Unix 秒的历史（向左追加）
 * GET ...&fromSec=...&toSec=...  显式区间（与 before 互斥；仅 capabilities.supportsExplicitTimeRange 的提供者支持）
 * GET ...&adjust=forward|backward|none  复权语义由具体提供者 capabilities.honorsPriceAdjustment 决定
 */
export async function GET(req: NextRequest) {
  const source = (req.nextUrl.searchParams.get("source") ?? "binance").toLowerCase();
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "";
  const defaultSymbol = source === "binance" ? "BTCUSDT" : "AAPL";
  const sym = symbol.trim() || defaultSymbol;
  const interval = req.nextUrl.searchParams.get("interval") ?? "1d";
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "300");

  const adjustment = parsePriceAdjustmentMode(
    req.nextUrl.searchParams.get("adjust"),
  );

  const beforeRaw = req.nextUrl.searchParams.get("before");
  const fromRaw = req.nextUrl.searchParams.get("fromSec");
  const toRaw = req.nextUrl.searchParams.get("toSec");

  let windowOpts: KlineFetchWindowOptions = {};

  const hasRange =
    fromRaw != null &&
    fromRaw !== "" &&
    toRaw != null &&
    toRaw !== "";
  const hasBefore = beforeRaw != null && beforeRaw !== "";

  if (hasBefore && hasRange) {
    return NextResponse.json(
      { error: "before 与 fromSec/toSec 不能同时使用" },
      { status: 400 },
    );
  }

  if (hasRange) {
    const fromN = Number(fromRaw);
    const toN = Number(toRaw);
    if (
      !Number.isFinite(fromN) ||
      !Number.isFinite(toN) ||
      fromN <= 0 ||
      toN <= 0 ||
      fromN >= toN
    ) {
      return NextResponse.json(
        { error: "fromSec、toSec 须为正数 Unix 秒且 fromSec < toSec" },
        { status: 400 },
      );
    }
    windowOpts = {
      fromTimeSec: Math.floor(fromN),
      toTimeSec: Math.floor(toN),
    };
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

  function hintPayload(
    payload: KlinePayload,
    note: string | undefined,
  ): KlinePayload {
    if (!note || adjustment === "none") return payload;
    return {
      ...payload,
      attribution: `${payload.attribution ?? ""}${note}`,
    };
  }

  function logApiKlineResponse(
    payload: KlinePayload,
    resolvedSource: string,
  ): KlinePayload {
    logCandleSeriesReport("api", "response", payload.candles, interval, {
      resolvedSource,
      payloadSource: payload.source,
      symbol: payload.symbol,
      hasMoreOlder: payload.hasMoreOlder,
      before: windowOpts.beforeTimeSec ?? null,
      adjust: adjustment,
    });
    return payload;
  }

  klineDebugLog("api", "request", {
    source,
    sym,
    interval,
    limit,
    adjust: adjustment,
    before: windowOpts.beforeTimeSec ?? null,
    fromSec: windowOpts.fromTimeSec ?? null,
    toSec: windowOpts.toTimeSec ?? null,
  });

  try {
    if (source === "auto") {
      const payload = await fetchKlinesAutoChain(sym, interval, limit, {
        beforeTimeSec: windowOpts.beforeTimeSec,
        fromTimeSec: windowOpts.fromTimeSec,
        toTimeSec: windowOpts.toTimeSec,
        adjustment,
      });
      const p = getRegisteredKlineProvider("ibkr");
      return NextResponse.json(
        logApiKlineResponse(
          hintPayload(payload, p?.capabilities.adjustmentBehaviorNote),
          "auto",
        ),
      );
    }

    if (source === "binance" || source === "ibkr") {
      const id = source as KlineProviderId;
      const provider = getRegisteredKlineProvider(id);
      if (!provider) {
        return NextResponse.json(
          { error: `未知 source：${source}` },
          { status: 400 },
        );
      }
      const winErr = validateKlineWindowForProvider(provider, windowOpts);
      if (winErr) {
        return NextResponse.json({ error: winErr }, { status: 400 });
      }
      const payload = await fetchKlinesWithProvider(id, {
        symbol: sym,
        interval,
        limit,
        adjustment,
        window: windowOpts,
      });
      return NextResponse.json(
        logApiKlineResponse(
          hintPayload(payload, provider.capabilities.adjustmentBehaviorNote),
          id,
        ),
      );
    }

    return NextResponse.json(
      {
        error: `未知 source：${source}（支持 binance、ibkr、auto）`,
      },
      { status: 400 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    const clientError =
      message.includes("无效") ||
      message.includes("必须为之一") ||
      message.includes("未配置") ||
      message.includes("unexpected");
    klineDebugLog("api", "route.error", {
      source,
      sym,
      interval,
      message,
    });
    const body: { error: string; klineDebugTrace?: ReturnType<typeof drainKlineServerDebugRing> } =
      { error: message };
    if (isKlineDebugEnabled()) {
      body.klineDebugTrace = drainKlineServerDebugRing();
    }
    return NextResponse.json(body, { status: clientError ? 400 : 502 });
  }
}
