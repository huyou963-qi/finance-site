/**
 * 美股常见拆股日历（自上市至最近拆股日的累积乘数）。
 * IB CP/TWS 的 Trades 历史 K 线均为「前复权」尺度（最新价≈现价）；
 * 后复权 = 整条序列 × 累积拆股因子（AAPL 约 224×，最新价约 7 万量级）。
 *
 * 来源：Apple 投资者 FAQ、交易所公开拆股记录（2/3/4/5/7/10 等整数拆）。
 */

export type UsStockSplitEvent = {
  /** 除权生效日（美东日历日，UTC 比对时按当日 20:00 UTC 落 bar） */
  exDate: string;
  /** N 拆 1 → ratio = N */
  ratio: number;
};

const AAPL_SPLITS: UsStockSplitEvent[] = [
  { exDate: "1987-06-16", ratio: 2 },
  { exDate: "2000-06-21", ratio: 2 },
  { exDate: "2005-02-28", ratio: 2 },
  { exDate: "2014-06-09", ratio: 7 },
  { exDate: "2020-08-31", ratio: 4 },
];

const MSFT_SPLITS: UsStockSplitEvent[] = [
  { exDate: "1987-09-21", ratio: 2 },
  { exDate: "1990-04-16", ratio: 2 },
  { exDate: "1991-06-26", ratio: 1.5 },
  { exDate: "1992-06-15", ratio: 1.5 },
  { exDate: "1994-05-23", ratio: 2 },
  { exDate: "1996-02-23", ratio: 2 },
  { exDate: "1998-03-06", ratio: 2 },
  { exDate: "1999-03-08", ratio: 2 },
  { exDate: "2003-02-18", ratio: 2 },
];

const GOOGL_SPLITS: UsStockSplitEvent[] = [
  { exDate: "2014-04-03", ratio: 2 },
  { exDate: "2022-07-18", ratio: 20 },
];

const AMZN_SPLITS: UsStockSplitEvent[] = [
  { exDate: "1999-09-02", ratio: 2 },
  { exDate: "2022-06-06", ratio: 20 },
];

const NVDA_SPLITS: UsStockSplitEvent[] = [
  { exDate: "2001-09-10", ratio: 2 },
  { exDate: "2006-04-07", ratio: 2 },
  { exDate: "2007-09-11", ratio: 1.5 },
  { exDate: "2021-07-20", ratio: 4 },
  { exDate: "2024-06-10", ratio: 10 },
];

const TSLA_SPLITS: UsStockSplitEvent[] = [
  { exDate: "2020-08-31", ratio: 5 },
  { exDate: "2022-08-25", ratio: 3 },
];

const CALENDAR: Record<string, UsStockSplitEvent[]> = {
  AAPL: AAPL_SPLITS,
  MSFT: MSFT_SPLITS,
  GOOGL: GOOGL_SPLITS,
  GOOG: GOOGL_SPLITS,
  AMZN: AMZN_SPLITS,
  NVDA: NVDA_SPLITS,
  TSLA: TSLA_SPLITS,
};

function productSplitRatios(events: UsStockSplitEvent[]): number {
  let p = 1;
  for (const { ratio } of events) {
    if (Number.isFinite(ratio) && ratio > 1) p *= ratio;
  }
  return p;
}

const CUMULATIVE_CACHE = new Map<string, number>();

/** 上市至今累积拆股乘数（后复权相对 IB 前复权 Trades 价的总倍数） */
export function cumulativeUsSplitFactor(symbol: string | undefined): number | null {
  if (!symbol?.trim()) return null;
  const key = symbol.trim().toUpperCase().split(".")[0]!;
  const cached = CUMULATIVE_CACHE.get(key);
  if (cached != null) return cached;

  const events = CALENDAR[key];
  if (!events?.length) return null;

  const factor = productSplitRatios(events);
  if (!Number.isFinite(factor) || factor <= 1) return null;
  CUMULATIVE_CACHE.set(key, factor);
  return factor;
}

export function listUsSplitEvents(symbol: string): UsStockSplitEvent[] | null {
  const key = symbol.trim().toUpperCase().split(".")[0]!;
  return CALENDAR[key] ?? null;
}
