import type { CandlestickData } from "lightweight-charts";

/** GET /api/data/klines 可选查询参数对应的窗口选项 */
export type KlineFetchWindowOptions = {
  /** 仅拉取严格早于该 Unix 秒的 K 线（向左追加一页） */
  beforeTimeSec?: number;
  /** 显式区间起点 Unix 秒（与 before 互斥；可与 toTimeSec 一次拉多年） */
  fromTimeSec?: number;
  /** 显式区间终点 Unix 秒（建议取当日收盘后或区间右端） */
  toTimeSec?: number;
};

/** 单条宏观序列（世界银行序列请带 key 以便多图分配） */
export type MacroSeriesItem = {
  name: string;
  data: (number | null)[];
  /** 如 fmp:GDP 或历史 wb:/fred: 键（若仍使用旧路由） */
  key?: string;
};

/** 宏观序列（供 ECharts category 轴） */
export type MacroPayload = {
  title: string;
  source: "worldbank" | "fred" | "unified" | "fmp" | "mds";
  categories: string[];
  series: MacroSeriesItem[];
  attribution?: string;
};

/** K 线 API 响应 */
export type KlinePayload = {
  source: "binance" | "ibkr";
  symbol: string;
  interval: string;
  candles: CandlestickData[];
  /** 与 candles 等长；缺失时前端可用价差估算柱高 */
  volumes?: number[];
  attribution?: string;
  /** 为 true 时客户端可继续向左请求更早 K 线（`before` 参数） */
  hasMoreOlder?: boolean;
};
