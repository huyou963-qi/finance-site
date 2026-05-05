import type { CandlestickData } from "lightweight-charts";

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
  source: "binance" | "yahoo" | "massive";
  symbol: string;
  interval: string;
  candles: CandlestickData[];
  /** 与 candles 等长；缺失时前端可用价差估算柱高 */
  volumes?: number[];
  attribution?: string;
};
