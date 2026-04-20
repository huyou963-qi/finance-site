import type { CandlestickData } from "lightweight-charts";

/** 单条宏观序列（世界银行序列请带 key 以便多图分配） */
export type MacroSeriesItem = {
  name: string;
  data: (number | null)[];
  /** 如 US:FP.CPI.TOTL.ZG 或 fred:CPIAUCSL */
  key?: string;
};

/** 宏观序列（供 ECharts category 轴） */
export type MacroPayload = {
  title: string;
  source: "worldbank" | "fred" | "unified";
  categories: string[];
  series: MacroSeriesItem[];
  attribution?: string;
};

/** K 线 API 响应 */
export type KlinePayload = {
  source: "binance";
  symbol: string;
  interval: string;
  candles: CandlestickData[];
  attribution?: string;
};
