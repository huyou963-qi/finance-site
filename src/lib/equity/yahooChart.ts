/**
 * Yahoo Finance v8 chart API（免密钥）统一抓取层。
 *
 * 口径（重要）：
 * - `quote.{open,high,low,close}` 与 `volume`：**已按拆股回溯调整**，未含现金分红。
 * - `adjclose`：拆股 + 现金分红均已调整（总收益口径），最新一根 adjClose == close。
 * - `events.splits`：精确拆股事件（date 为除权生效日，当日价格已是拆后刻度）。
 *
 * 三种复权由 priceAdjustment.ts 依据以上口径精确还原，不做启发式猜测。
 */

const YAHOO_UA =
  "Mozilla/5.0 (compatible; finance-site/1.0; +https://localhost)";

export type YahooBar = {
  /** Yahoo 原始时间戳秒（日线为当日开盘时刻） */
  time: number;
  open: number | null;
  high: number | null;
  low: number | null;
  /** 拆股调整后收盘（未含分红） */
  close: number;
  /** 拆股 + 分红调整后收盘 */
  adjClose: number;
  volume: number | null;
};

export type YahooSplit = {
  /** 除权生效日 YYYY-MM-DD（UTC） */
  exDate: string;
  ratio: number;
  numerator: number;
  denominator: number;
};

export type YahooDividend = { exDate: string; amount: number };

export type YahooChartResult = {
  symbol: string;
  bars: YahooBar[];
  splits: YahooSplit[];
  dividends: YahooDividend[];
};

type RawResult = {
  meta?: { symbol?: string; dataGranularity?: string };
  timestamp?: number[];
  events?: {
    splits?: Record<
      string,
      { date?: number; numerator?: number; denominator?: number }
    >;
    dividends?: Record<string, { date?: number; amount?: number }>;
  };
  indicators?: {
    quote?: Array<{
      open?: (number | null)[];
      high?: (number | null)[];
      low?: (number | null)[];
      close?: (number | null)[];
      volume?: (number | null)[];
    }>;
    adjclose?: Array<{ adjclose?: (number | null)[] }>;
  };
};

type RawChart = {
  chart?: {
    result?: RawResult[];
    error?: { code?: string; description?: string } | null;
  };
};

export class YahooSymbolNotFoundError extends Error {
  constructor(symbol: string) {
    super(`Yahoo 无此标的：${symbol}`);
    this.name = "YahooSymbolNotFoundError";
  }
}

/**
 * Yahoo 会对某些参数组合**静默降采样**（如 range=max&interval=1d 实际返回 1mo），
 * 若不校验就会把月线写进日线表。粒度不符时直接失败。
 */
export class YahooGranularityError extends Error {
  constructor(symbol: string, want: string, got: string) {
    super(`Yahoo ${symbol} 粒度不符：请求 ${want}，返回 ${got}`);
    this.name = "YahooGranularityError";
  }
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function utcDate(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

export type YahooFetchOpts = {
  /** 显式区间（Unix 秒）；与 range 互斥。取全量历史用 period1=0 —— 勿用 range=max（会被降采样成月线） */
  period1?: number;
  period2?: number;
  /** 如 "1mo" | "1y"；未给 period 时使用，默认 1y */
  range?: string;
  /** 日线 "1d"、周线 "1wk"、盘中 "15m"/"1h" */
  interval?: string;
};

/** 取全量日线历史的区间参数（period1=0 → 上市首日） */
export const FULL_HISTORY_PERIOD1 = 0;

async function fetchChart(symbol: string, opts: YahooFetchOpts): Promise<RawChart> {
  const sym = symbol.trim().toUpperCase();
  const interval = opts.interval ?? "1d";
  const params = new URLSearchParams({ interval, events: "div|split" });
  if (opts.period1 != null && opts.period2 != null) {
    params.set("period1", String(Math.floor(opts.period1)));
    params.set("period2", String(Math.floor(opts.period2)));
  } else {
    params.set("range", opts.range ?? "1y");
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?${params}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
    // 懒回补同步阻塞页面加载，网络卡住不能无限等——快速失败走既有空态兜底
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text().catch(() => "");

  if (res.status === 404) throw new YahooSymbolNotFoundError(sym);
  if (!res.ok) {
    throw new Error(`Yahoo ${sym} HTTP ${res.status} ${text.slice(0, 120)}`);
  }

  let json: RawChart;
  try {
    json = JSON.parse(text) as RawChart;
  } catch {
    throw new Error(`Yahoo ${sym} 返回非 JSON`);
  }
  const code = json.chart?.error?.code;
  if (code === "Not Found") throw new YahooSymbolNotFoundError(sym);
  if (code) {
    throw new Error(`Yahoo ${sym} ${code}: ${json.chart?.error?.description ?? ""}`);
  }
  return json;
}

function parseSplits(raw: RawResult): YahooSplit[] {
  const splits = raw.events?.splits ?? {};
  const out: YahooSplit[] = [];
  for (const key of Object.keys(splits)) {
    const s = splits[key]!;
    const date = num(s.date);
    const numerator = num(s.numerator);
    const denominator = num(s.denominator);
    if (date == null || !numerator || !denominator) continue;
    const ratio = numerator / denominator;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    out.push({ exDate: utcDate(date), ratio, numerator, denominator });
  }
  out.sort((a, b) => (a.exDate < b.exDate ? -1 : 1));
  return out;
}

/**
 * 拉取日线（或指定周期）K 线 + 拆股 + 分红。
 * 抛 YahooSymbolNotFoundError 表示标的不存在（调用方应缓存该结论）。
 */
export async function fetchYahooChart(
  symbol: string,
  opts: YahooFetchOpts = {},
): Promise<YahooChartResult> {
  const wantInterval = opts.interval ?? "1d";
  const json = await fetchChart(symbol, opts);
  const result = json.chart?.result?.[0];
  if (!result) throw new YahooSymbolNotFoundError(symbol);

  const granularity = result.meta?.dataGranularity;
  if (granularity && granularity !== wantInterval) {
    throw new YahooGranularityError(symbol, wantInterval, granularity);
  }

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose ?? [];

  const bars: YahooBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    if (typeof t !== "number" || !Number.isFinite(t)) continue;
    const closeRaw = num(quote.close?.[i]);
    const adjRaw = num(adj[i]);
    // 有效价：close 或 adjClose 任一为正。期货/外汇/指数在美股节假日 Yahoo 常返回
    // O/H/L/C 全 0 的占位行，整根丢弃，避免脏 0 落库污染 BOLL/MA 等指标。
    const px =
      closeRaw != null && closeRaw > 0
        ? closeRaw
        : adjRaw != null && adjRaw > 0
          ? adjRaw
          : null;
    if (px == null) continue;
    const close = closeRaw != null && closeRaw > 0 ? closeRaw : px;
    const adjClose = adjRaw != null && adjRaw > 0 ? adjRaw : close;
    // 单腿 ≤0 视为脏值，钳到 close；null 保留（下游按 close 兜底）。
    const leg = (v: number | null): number | null =>
      v != null && Number.isFinite(v) && v <= 0 ? close : v;
    bars.push({
      time: Math.floor(t),
      open: leg(num(quote.open?.[i])),
      high: leg(num(quote.high?.[i])),
      low: leg(num(quote.low?.[i])),
      close,
      adjClose,
      volume: num(quote.volume?.[i]),
    });
  }
  bars.sort((a, b) => a.time - b.time);

  const dividends: YahooDividend[] = [];
  const divRaw = result.events?.dividends ?? {};
  for (const key of Object.keys(divRaw)) {
    const d = divRaw[key]!;
    const date = num(d.date);
    const amount = num(d.amount);
    if (date == null || amount == null) continue;
    dividends.push({ exDate: utcDate(date), amount });
  }
  dividends.sort((a, b) => (a.exDate < b.exDate ? -1 : 1));

  return {
    symbol: result.meta?.symbol?.toUpperCase() ?? symbol.trim().toUpperCase(),
    bars,
    splits: parseSplits(result),
    dividends,
  };
}
