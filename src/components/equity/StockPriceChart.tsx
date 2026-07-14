"use client";

import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { CandlestickChart, BarChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  MarkPointComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  CandlestickChart,
  BarChart,
  DataZoomComponent,
  GridComponent,
  MarkPointComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export type StockPriceBar = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
};

/** K 线上的业绩事件打点（Bloomberg 风格 E 标记） */
export type ChartEarningsMark = {
  /** 披露日 ISO */
  date: string;
  /** hover 文案：如 "2026Q1 · 营收 +15.8% · EPS 0.13" */
  labelZh: string;
};

const UP_COLOR = "#3ecf8e";
const DOWN_COLOR = "#ef6461";

/** 个股日线蜡烛图 + 成交量（数据来自 /api/equity/stocks/[symbol]/prices） */
export function StockPriceChart({
  bars,
  earningsMarks = [],
  height = 360,
}: {
  bars: StockPriceBar[];
  earningsMarks?: ChartEarningsMark[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const option = useMemo(() => {
    const dates = bars.map((b) => b.date);
    // ECharts candlestick 数据序：[open, close, low, high]；缺 OHLC 时退化为 close
    const kline = bars.map((b) => [
      b.open ?? b.close,
      b.close,
      b.low ?? b.close,
      b.high ?? b.close,
    ]);
    const volumes = bars.map((b, i) => ({
      value: b.volume ?? 0,
      itemStyle: {
        color: b.close >= (bars[i]!.open ?? b.close) ? UP_COLOR : DOWN_COLOR,
        opacity: 0.5,
      },
    }));

    // 业绩打点：披露日不是交易日时挂到其后第一根 bar（盘后披露次日反应也在那根上）
    const dateIndex = new Map(dates.map((d, i) => [d, i]));
    const markData = earningsMarks.flatMap((m) => {
      let idx = dateIndex.get(m.date);
      if (idx == null) {
        idx = dates.findIndex((d) => d > m.date);
        if (idx < 0) return [];
      }
      const bar = bars[idx]!;
      return [
        {
          name: m.labelZh,
          coord: [dates[idx]!, bar.high ?? bar.close],
          value: "E",
        },
      ];
    });

    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      grid: [
        { left: 56, right: 16, top: 12, height: "62%" },
        { left: 56, right: 16, top: "78%", height: "14%" },
      ],
      xAxis: [
        {
          type: "category",
          data: dates,
          boundaryGap: true,
          axisLabel: { color: "#9da8b6", fontSize: 10 },
          axisLine: { lineStyle: { color: "#2a3340" } },
        },
        {
          type: "category",
          gridIndex: 1,
          data: dates,
          boundaryGap: true,
          axisLabel: { show: false },
          axisLine: { lineStyle: { color: "#2a3340" } },
        },
      ],
      yAxis: [
        {
          type: "value",
          scale: true,
          axisLabel: { color: "#9da8b6", fontSize: 10 },
          splitLine: { lineStyle: { color: "#1e2630" } },
        },
        {
          type: "value",
          gridIndex: 1,
          axisLabel: { show: false },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: [0, 1], start: 0, end: 100 },
        {
          type: "slider",
          xAxisIndex: [0, 1],
          bottom: 0,
          height: 16,
          borderColor: "#2a3340",
          textStyle: { color: "#9da8b6", fontSize: 10 },
        },
      ],
      series: [
        {
          name: "日K",
          type: "candlestick",
          data: kline,
          itemStyle: {
            color: UP_COLOR,
            color0: DOWN_COLOR,
            borderColor: UP_COLOR,
            borderColor0: DOWN_COLOR,
          },
          markPoint: markData.length
            ? {
                data: markData,
                symbol: "pin",
                symbolSize: 22,
                symbolOffset: [0, -6],
                itemStyle: { color: "#3b82f6", opacity: 0.9 },
                label: { color: "#fff", fontSize: 10, formatter: "E" },
                tooltip: {
                  formatter: (p: { name: string }) => p.name,
                },
              }
            : undefined,
        },
        {
          name: "成交量",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes,
        },
      ],
    };
  }, [bars, earningsMarks]);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption(option);
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [option]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}
