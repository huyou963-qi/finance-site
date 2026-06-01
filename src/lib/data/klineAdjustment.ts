import type { CandlestickData } from "lightweight-charts";
import {
  isKlineDebugEnabled,
  klineDebugLog,
  logPriceAdjustmentReport,
  snapshotAdjustmentBar,
} from "@/lib/data/klineDebug";
import {
  applyBackwardAdjustment,
  type BackwardAdjustmentOpts,
} from "@/lib/data/klineBackwardAdjustment";

export { applyBackwardAdjustment, type BackwardAdjustmentOpts };
import { applyForwardAdjustment } from "@/lib/data/klineForwardAdjustment";
import { applyIbkrTradesNominalUnadjusted } from "@/lib/data/klineIbkrNominal";
import {
  detectSplitLikeActions,
  postSplitCap,
  type SplitLikeAction,
} from "@/lib/data/klineSplitDetect";

export type { SplitLikeAction } from "@/lib/data/klineSplitDetect";
export { detectSplitLikeActions } from "@/lib/data/klineSplitDetect";

/** 价格复权方式（与 A 股/客户端常用口径一致） */
export type PriceAdjustmentMode = "forward" | "backward" | "none";

export function parsePriceAdjustmentMode(
  raw: string | null | undefined,
): PriceAdjustmentMode {
  const v = (raw ?? "forward").trim().toLowerCase();
  if (v === "forward" || v === "fwd" || v === "前复权") return "forward";
  if (v === "backward" || v === "back" || v === "后复权") return "backward";
  if (v === "none" || v === "raw" || v === "不复权") return "none";
  return "forward";
}

/**
 * 不复权：深拷贝 IB/API 原始 OHLC，数值与数据源一致。
 * 除权日前后价格跳变、同柱高低混刻度（如 6/18 高 210 / 低 50）均不处理，不保证连续。
 */
export function cloneRawCandles(candles: CandlestickData[]): CandlestickData[] {
  return candles.map((c) => ({ ...c }));
}

/** 2025-06 拆股窗（IBKR 4:1，与此前 adjustment 日志对齐） */
const IBKR_SPLIT_PROBE_FROM_SEC = 1750032000; // 2025-06-16 UTC 08:00 附近
const IBKR_SPLIT_PROBE_TO_SEC = 1750780800; // 2025-06-25 UTC 08:00 附近

function logNoneModePassthrough(
  raw: CandlestickData[],
  out: CandlestickData[],
  ctx?: { symbol?: string; interval?: string },
): void {
  klineDebugLog("client", "adjustment.passthrough", {
    mode: "none",
    barCount: raw.length,
    symbol: ctx?.symbol,
    interval: ctx?.interval,
    hint:
      "下方 bars 为 API 原始值。IBKR 时不复权会另做名义价还原（见 adjustment.ibkr_nominal）。",
  });

  const probe: ReturnType<typeof snapshotAdjustmentBar>[] = [];
  let mismatchCount = 0;
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i]!.time as number;
    if (t < IBKR_SPLIT_PROBE_FROM_SEC || t > IBKR_SPLIT_PROBE_TO_SEC) continue;
    const r = snapshotAdjustmentBar(raw, i);
    const o = snapshotAdjustmentBar(out, i);
    if (r) probe.push(r);
    if (r && o) {
      const fields = ["open", "high", "low", "close"] as const;
      for (const f of fields) {
        if (Math.abs(r[f] - o[f]) > 1e-9) mismatchCount++;
      }
    }
  }

  klineDebugLog("client", "adjustment.raw_window", {
    symbol: ctx?.symbol,
    interval: ctx?.interval,
    fromIso: new Date(IBKR_SPLIT_PROBE_FROM_SEC * 1000).toISOString(),
    toIso: new Date(IBKR_SPLIT_PROBE_TO_SEC * 1000).toISOString(),
    bars: probe,
    chartEqualsApi: mismatchCount === 0,
    mismatchLegCount: mismatchCount,
    expectedUnadjusted:
      "理想不复权：6/17 及以前收盘 ~200+，6/18 起 ~50。若 6/16 已是 ~52，为 IB 在除权日前混入拆后成交刻度。",
  });
}

function logAdjustmentIfEnabled(
  raw: CandlestickData[],
  out: CandlestickData[],
  mode: PriceAdjustmentMode,
  actions: SplitLikeAction[],
  ctx?: { symbol?: string; interval?: string },
): void {
  if (!isKlineDebugEnabled() || mode === "none" || !actions.length) return;

  klineDebugLog("client", "adjustment.detected", {
    mode,
    symbol: ctx?.symbol,
    interval: ctx?.interval,
    actionCount: actions.length,
    actions: actions.map((a) => ({
      barIndex: a.barIndex,
      ratio: a.ratio,
      anchorClose:
        a.barIndex >= 1 ? raw[a.barIndex - 1]!.close : undefined,
    })),
  });

  for (const { barIndex: i, ratio } of actions) {
    const anchor = i >= 1 ? raw[i - 1]!.close : undefined;
    const from = Math.max(0, i - 2);
    const to = Math.min(raw.length - 1, i + 3);
    const rawWindow = [];
    const adjWindow = [];
    const backwardFixFlags: Array<{
      index: number;
      needsTransitionFix: boolean;
      postSplitCap?: number;
    }> = [];

    for (let j = from; j <= to; j++) {
      const r = snapshotAdjustmentBar(raw, j);
      const a = snapshotAdjustmentBar(out, j);
      if (r) rawWindow.push(r);
      if (a) adjWindow.push(a);
      if (mode === "backward" && anchor != null && Number.isFinite(anchor)) {
        const cap = postSplitCap(anchor, ratio);
        const legs = [raw[j]!.open, raw[j]!.high, raw[j]!.low, raw[j]!.close];
        const finite = legs.filter((v) => Number.isFinite(v) && v > 0);
        const hi = Math.max(...finite);
        const lo = Math.min(...finite);
        const hasPost = finite.some((v) => v < cap);
        const hasPre = finite.some((v) => v > anchor * 0.82);
        const needsTransitionFix =
          hasPost &&
          (hasPre && hi / lo > 1.22
            ? true
            : hasPost && lo < cap && hi > anchor * 0.9);
        backwardFixFlags.push({
          index: j,
          needsTransitionFix,
          postSplitCap: cap,
        });
      }
    }

    logPriceAdjustmentReport({
      mode,
      symbol: ctx?.symbol,
      interval: ctx?.interval,
      barCount: raw.length,
      actions: [{ barIndex: i, ratio, anchorClose: anchor }],
      rawWindow,
      adjWindow,
      backwardFixFlags:
        mode === "backward" && backwardFixFlags.length ? backwardFixFlags : undefined,
    });
  }
}

function resolveSplitActions(
  candles: CandlestickData[],
  opts?: { adjClose?: number[]; rawClose?: number[] },
): SplitLikeAction[] {
  if (
    opts?.adjClose?.length === candles.length &&
    opts?.rawClose?.length === candles.length
  ) {
    const rawBars: CandlestickData[] = candles.map((cndl, i) => {
      const c = opts.rawClose![i]!;
      return {
        time: cndl.time,
        open: c,
        high: c,
        low: c,
        close: c,
      };
    });
    return detectSplitLikeActions(rawBars);
  }
  return detectSplitLikeActions(candles);
}

/**
 * 对合并后的完整 K 线序列做复权（须在客户端 merge 之后调用）。
 * 三种模式走独立实现，互不共享 multiplier / 过渡柱修复逻辑。
 */
function isIbkrKlineSource(source: string | undefined): boolean {
  const s = (source ?? "").toLowerCase();
  return s === "ibkr" || s === "auto";
}

export function applyKlinePriceAdjustment(
  candles: CandlestickData[],
  mode: PriceAdjustmentMode,
  opts?: {
    adjClose?: number[];
    rawClose?: number[];
    symbol?: string;
    interval?: string;
    /** 行情数据源；IBKR/auto 的不复权需还原 Trades 已拆股调整的历史价 */
    klineSource?: string;
  },
): CandlestickData[] {
  if (candles.length === 0) return [];

  if (mode === "none") {
    if (isIbkrKlineSource(opts?.klineSource)) {
      const actions = resolveSplitActions(candles, opts);
      const out = applyIbkrTradesNominalUnadjusted(candles, actions);
      if (isKlineDebugEnabled()) {
        logNoneModePassthrough(candles, out, opts);
        klineDebugLog("client", "adjustment.ibkr_nominal", {
          symbol: opts?.symbol,
          interval: opts?.interval,
          actionCount: actions.length,
          actions,
          hint:
            "IB Trades 历史价已按拆股向前调整；不复权将拆股日前 close<cap 的柱 ×ratio 还原名义价，除权日混柱压回拆后刻度",
        });
      }
      return out;
    }
    const out = cloneRawCandles(candles);
    if (isKlineDebugEnabled()) {
      logNoneModePassthrough(candles, out, opts);
    }
    return out;
  }

  const actions = resolveSplitActions(candles, opts);

  let out: CandlestickData[];
  if (mode === "forward") {
    out = applyForwardAdjustment(candles, actions);
  } else {
    out = applyBackwardAdjustment(candles, actions, {
      symbol: opts?.symbol,
      ibkrForwardAdjusted: isIbkrKlineSource(opts?.klineSource),
    });
  }

  logAdjustmentIfEnabled(candles, out, mode, actions, {
    symbol: opts?.symbol,
    interval: opts?.interval,
  });
  return out;
}

/** @deprecated 测试兼容；请用 applyForwardAdjustment / applyBackwardAdjustment */
export function adjustOhlcBySplitActions(
  candles: CandlestickData[],
  mode: PriceAdjustmentMode,
  actions?: SplitLikeAction[],
): CandlestickData[] {
  if (mode === "none") return cloneRawCandles(candles);
  if (mode === "forward") return applyForwardAdjustment(candles, actions);
  return applyBackwardAdjustment(candles, actions, {
    ibkrForwardAdjusted: false,
  });
}

/** @deprecated 测试兼容 */
export function adjustOhlcFromAdjRatios(
  candles: CandlestickData[],
  adjClose: number[],
  rawClose: number[],
  mode: PriceAdjustmentMode,
): CandlestickData[] {
  return applyKlinePriceAdjustment(candles, mode, { adjClose, rawClose });
}
