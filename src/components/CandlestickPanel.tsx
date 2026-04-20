"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  type CandlestickData,
  type IChartApi,
} from "lightweight-charts";
import type { KlinePayload } from "@/lib/data/types";
import { buildCandleDemo } from "@/lib/sampleSeries";

export type CandlestickPanelProps = {
  symbol?: string;
  interval?: string;
};

export function CandlestickPanel({
  symbol = "BTCUSDT",
  interval = "1d",
}: CandlestickPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [candles, setCandles] = useState<CandlestickData[] | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCandles(null);
    setHint(null);

    const qs = new URLSearchParams({
      symbol,
      interval,
      limit: "320",
    });

    fetch(`/api/data/klines?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `${r.status}`);
        }
        return r.json() as Promise<KlinePayload>;
      })
      .then((payload) => {
        if (cancelled) return;
        setHint(payload.attribution ?? null);
        setCandles(payload.candles);
      })
      .catch(() => {
        if (cancelled) return;
        setHint(
          "无法从 Binance 获取 K 线（网络、地区限制或服务不可用），已使用本地随机演示数据。",
        );
        setCandles(buildCandleDemo(220));
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  useEffect(() => {
    if (!candles?.length) return;
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { color: "#020617" },
        textColor: "#e2e8f0",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#334155" },
      timeScale: {
        borderColor: "#334155",
        timeVisible: interval !== "1d" && interval !== "1w",
        secondsVisible: false,
      },
      width: el.clientWidth,
      height: 440,
    });

    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    series.setData(candles);

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, interval]);

  if (!candles) {
    return (
      <div className="flex h-[440px] items-center justify-center text-sm text-slate-500">
        正在加载 K 线…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {hint ? <p className="text-xs leading-relaxed text-slate-500">{hint}</p> : null}
      <div ref={containerRef} className="h-[440px] w-full min-w-0" />
    </div>
  );
}
