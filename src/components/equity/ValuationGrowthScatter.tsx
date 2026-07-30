"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import * as echarts from "echarts/core";
import { ScatterChart } from "echarts/charts";
import { GridComponent, TooltipComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([ScatterChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

export type ScatterPoint = {
  symbol: string;
  /** 最新季营收同比（小数） */
  revenueYoY: number;
  peTtm: number;
  marketCap: number | null;
};

/** PE 超过该值的点不入图（极端值会压扁其余分布），在标题备注剔除数 */
const PE_CAP = 120;

/**
 * 估值-成长散点：x=最新季营收同比，y=TTM PE，点面积 ∝ √市值。
 * 中位数十字线把面板分成四象限（右下=高成长低估值）。
 * 点击数据点跳转个股研究页。
 */
export function ValuationGrowthScatter({
  points,
  height = 300,
}: {
  points: ScatterPoint[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { data, medianX, medianY, excluded } = useMemo(() => {
    const usable = points.filter(
      (p) => Number.isFinite(p.revenueYoY) && Number.isFinite(p.peTtm) && p.peTtm > 0,
    );
    const inChart = usable.filter((p) => p.peTtm <= PE_CAP);
    const med = (xs: number[]) => {
      if (!xs.length) return null;
      const s = [...xs].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
    };
    const caps = inChart.map((p) => p.marketCap ?? 0);
    const maxCap = Math.max(1, ...caps);
    return {
      data: inChart.map((p) => ({
        name: p.symbol,
        value: [p.revenueYoY * 100, p.peTtm],
        symbolSize: 6 + 14 * Math.sqrt((p.marketCap ?? 0) / maxCap),
      })),
      medianX: med(inChart.map((p) => p.revenueYoY * 100)),
      medianY: med(inChart.map((p) => p.peTtm)),
      excluded: usable.length - inChart.length,
    };
  }, [points]);

  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        formatter: (p: { name: string; value: [number, number] }) =>
          `<b>${p.name}</b><br/>营收YoY: ${p.value[0].toFixed(1)}%<br/>TTM PE: ${p.value[1].toFixed(1)}<br/><span style="opacity:.7">点击打开个股研究</span>`,
      },
      grid: { left: 48, right: 16, top: 20, bottom: 40 },
      xAxis: {
        type: "value",
        name: "最新季营收同比 %",
        nameLocation: "middle",
        nameGap: 26,
        nameTextStyle: { color: "#9da8b6", fontSize: 10 },
        axisLabel: { color: "#9da8b6", fontSize: 10, formatter: "{value}%" },
        axisLine: { lineStyle: { color: "#2a3340" } },
        splitLine: { lineStyle: { color: "#1e2630" } },
      },
      yAxis: {
        type: "value",
        name: "TTM PE",
        nameTextStyle: { color: "#9da8b6", fontSize: 10 },
        scale: true,
        axisLabel: { color: "#9da8b6", fontSize: 10 },
        splitLine: { lineStyle: { color: "#1e2630" } },
      },
      series: [
        {
          type: "scatter",
          data,
          itemStyle: { color: "#3b82f6", opacity: 0.75 },
          label: {
            show: true,
            position: "top",
            fontSize: 9,
            color: "#9da8b6",
            formatter: (p: { name: string }) => p.name,
          },
          labelLayout: { hideOverlap: true },
          emphasis: { itemStyle: { color: "#f59e0b", opacity: 1 } },
          markLine:
            medianX != null && medianY != null
              ? {
                  silent: true,
                  symbol: "none",
                  label: { show: false },
                  lineStyle: { color: "#4b5563", type: "dashed", width: 1 },
                  data: [{ xAxis: medianX }, { yAxis: medianY }],
                }
              : undefined,
        },
      ],
    });
    const onClick = (params: unknown) => {
      const p = params as { name?: string; data?: { name?: string } | null };
      const sym = p.name || (p.data && typeof p.data === "object" ? p.data.name : undefined);
      if (!sym || typeof sym !== "string") return;
      router.push(`/equity/stocks/${encodeURIComponent(sym)}`);
    };
    chart.on("click", onClick);
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      chart.off("click", onClick);
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [data, medianX, medianY, router]);

  if (data.length < 3) return null;

  return (
    <section className="rounded-md border border-fs-border">
      <div className="flex items-baseline justify-between border-b border-fs-border bg-fs-elevated/40 px-3 py-2">
        <span className="text-sm font-medium text-fs-text">估值 – 成长（虚线为行业中位数）</span>
        <span className="text-[11px] text-fs-muted">
          点击圆点打开个股
          {excluded > 0 ? ` · 已剔除 PE>${PE_CAP} 共 ${excluded} 点` : ""}
        </span>
      </div>
      <div ref={ref} style={{ height }} className="w-full cursor-pointer" />
    </section>
  );
}
