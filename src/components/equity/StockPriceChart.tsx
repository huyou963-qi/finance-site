"use client";

import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { CandlestickChart, BarChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  CandlestickChart,
  BarChart,
  DataZoomComponent,
  GridComponent,
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

const UP_COLOR = "#3ecf8e";
const DOWN_COLOR = "#ef6461";

/** 个股日线蜡烛图 + 成交量（数据来自 /api/equity/stocks/[symbol]/prices） */
export function StockPriceChart({
  bars,
  height = 360,
}: {
  bars: StockPriceBar[];
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
  }, [bars]);

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
