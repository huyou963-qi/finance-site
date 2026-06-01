import type { CandlestickData } from "lightweight-charts";
import type { SeriesMarker, SeriesMarkerPricePosition, Time } from "lightweight-charts";

/** 与 K 线标注、组合面板、Flex 导入共用 */
export type ChartExecutionTrade = {
  tradeTimeSec: number;
  price: number;
  size: number;
  /** IBKR 常为 B/S；其它源可扩展 */
  side: string;
  /** Flex 导入时有值，用于按图表标的筛选 */
  symbol?: string;
  source?: "gateway" | "flex" | "portfolio";
  /** Gateway execution_id / Flex transactionID / 合成键，合并去重用 */
  dedupeKey?: string;
};

/** 侧栏「交易记录」表格行 */
export type TradeRecordRow = {
  executionId: string;
  side: string;
  tradeTimeSec: number;
  size: number;
  price: number;
};

export const EXECUTION_MARKER_PLUGIN_OPTIONS = {
  autoScale: true,
  zOrder: "top" as const,
};

function fmtQty(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (abs === Math.floor(abs)) return String(Math.floor(abs));
  return n.toFixed(4).replace(/\.?0+$/, "");
}

function fmtPriceShort(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 100) return n.toFixed(2);
  if (abs >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

/** 最后一根满足 candle.time <= tradeSec 的 K 线时间（与图上柱对齐） */
export function barOpenTimeForTradeSec(
  tradeSec: number,
  candles: CandlestickData[],
): number | null {
  if (!candles.length || !Number.isFinite(tradeSec)) return null;
  let best: number | null = null;
  for (const c of candles) {
    const ct = c.time as number;
    if (ct <= tradeSec) best = ct;
    else break;
  }
  return best;
}

function candleForBarTime(
  barT: number,
  candles: CandlestickData[],
): CandlestickData | undefined {
  for (const c of candles) {
    if ((c.time as number) === barT) return c;
  }
  return undefined;
}

function isBuySide(side: string): boolean {
  const u = side.toUpperCase();
  return (
    u.startsWith("B") ||
    u === "BUY" ||
    u === "BOT" ||
    u.includes("BUY")
  );
}

export function chartExecutionTradesToTradeRows(
  trades: ChartExecutionTrade[],
): TradeRecordRow[] {
  return [...trades]
    .sort((a, b) => b.tradeTimeSec - a.tradeTimeSec)
    .map((t, i) => ({
      executionId:
        t.dedupeKey?.trim() ||
        `${t.tradeTimeSec}|${t.price}|${t.size}|${t.side}|${i}`,
      side: t.side,
      tradeTimeSec: t.tradeTimeSec,
      size: t.size,
      price: t.price,
    }));
}

function barPriceSpan(c: CandlestickData): number {
  const raw = c.high - c.low;
  const ref = Math.abs(c.close) * 0.0015;
  return Math.max(raw, ref, 0.01);
}

/**
 * 成交标注：买卖分列 K 线上下；同柱多笔按时间递增错位，避免文字与实体重叠。
 */
export function executionTradesToSeriesMarkers(
  trades: ChartExecutionTrade[],
  candles: CandlestickData[],
): SeriesMarker<Time>[] {
  if (!trades.length || !candles.length) return [];

  type Item = {
    trade: ChartExecutionTrade;
    barT: number;
    candle: CandlestickData;
  };
  const byBar = new Map<number, Item[]>();

  for (const t of trades) {
    const barT = barOpenTimeForTradeSec(t.tradeTimeSec, candles);
    if (barT == null) continue;
    const candle = candleForBarTime(barT, candles);
    if (!candle) continue;
    const list = byBar.get(barT) ?? [];
    list.push({ trade: t, barT, candle });
    byBar.set(barT, list);
  }

  const out: SeriesMarker<Time>[] = [];

  for (const [, group] of byBar) {
    group.sort((a, b) => a.trade.tradeTimeSec - b.trade.tradeTimeSec);
    const candle = group[0]!.candle;
    const step = barPriceSpan(candle) * 0.14;
    let buyStack = 0;
    let sellStack = 0;

    for (const { trade: t, barT } of group) {
      const buy = isBuySide(t.side);
      let position: SeriesMarkerPricePosition;
      let markerPrice: number;
      if (buy) {
        position = "atPriceTop";
        buyStack += 1;
        markerPrice = candle.high + step * buyStack;
      } else {
        position = "atPriceBottom";
        sellStack += 1;
        markerPrice = candle.low - step * sellStack;
      }

      out.push({
        time: barT as Time,
        position,
        price: markerPrice,
        shape: buy ? "arrowUp" : "arrowDown",
        color: buy ? "#4ade80" : "#fb7185",
        text: `${buy ? "买" : "卖"} ${fmtQty(t.size)} · ${fmtPriceShort(t.price)}`,
        size: 0.85,
      });
    }
  }

  out.sort((a, b) => (a.time as number) - (b.time as number));
  return out;
}
