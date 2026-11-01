"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { SITE } from "@/lib/siteTheme";
import type { FinancialMetric } from "@/lib/equity/industryFinancials";

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

export type FinancialChartSeries = { name: string; color: string; dashed?: boolean; metrics: FinancialMetric[] };

export function IndustryFinancialChart({ periods, series, selectedPeriod, percent = false, onSelect }: {
  periods: string[]; series: FinancialChartSeries[]; selectedPeriod: string;
  percent?: boolean; onSelect: (period: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const chart = echarts.init(element);
    const factor = percent ? 100 : 1e-9;
    chart.setOption({
      animation: false, color: series.map(row => row.color),
      grid: { left: 54, right: 18, top: series.length > 1 ? 40 : 20, bottom: 32 },
      legend: { show: series.length > 1, data: series.map(row => row.name), type: "scroll", top: 0, textStyle: { color: SITE.muted, fontSize: 11 } },
      tooltip: {
        trigger: "axis", confine: true, renderMode: "richText", backgroundColor: SITE.bg, borderColor: SITE.border,
        textStyle: { color: SITE.text, fontSize: 12 },
        formatter: (raw: unknown) => {
          const items = (Array.isArray(raw) ? raw : []) as {
            axisValueLabel: string; seriesName: string; value: number | null;
            data: { sampleCount: number; universeCount: number; weightCoverage: number | null };
          }[];
          return [items[0]?.axisValueLabel ?? "", ...items.filter(item => typeof item.value === "number").map(item =>
            `${item.seriesName}${item.data.weightCoverage != null && item.data.weightCoverage < 0.8 ? "（低覆盖）" : ""}：${item.value!.toFixed(1)}${percent ? "%" : " 十亿美元"}\n有效 ${item.data.sampleCount}/${item.data.universeCount} 家 · 权重覆盖 ${item.data.weightCoverage == null ? "—" : `${(item.data.weightCoverage * 100).toFixed(1)}%`}`,
          )].join("\n");
        },
      },
      xAxis: { type: "category", data: periods, boundaryGap: false, axisTick: { show: false },
        axisLabel: { color: SITE.muted, fontSize: 11, hideOverlap: true }, axisLine: { lineStyle: { color: SITE.border } } },
      yAxis: { type: "value", scale: true, axisLabel: { color: SITE.muted, fontSize: 11 }, splitLine: { lineStyle: { color: SITE.border } } },
      series: series.flatMap((row, index) => [{
        name: row.name, type: "line", connectNulls: false, showSymbol: true, symbol: "circle", symbolSize: 5,
        lineStyle: { color: row.color, width: 2, type: row.dashed ? "dashed" : "solid" },
        itemStyle: { color: row.color },
        data: row.metrics.map(metric => ({
          ...metric, value: metric.value == null || metric.weightCoverage == null || metric.weightCoverage < 0.8 ? null : metric.value * factor,
        })),
        markLine: index === 0 ? { silent: true, symbol: "none", label: { show: false },
          lineStyle: { color: SITE.secondary, type: "dashed", width: 1 }, data: [{ xAxis: selectedPeriod }] } : undefined,
      }, {
        // 低覆盖季度独立显示，不与完整样本连线，避免制造行业营收/利润骤降。
        name: row.name, type: "line", connectNulls: false, symbol: "emptyCircle", symbolSize: 7,
        showSymbol: true, lineStyle: { opacity: 0 }, itemStyle: { color: row.color },
        data: row.metrics.map(metric => ({
          ...metric, value: metric.value != null && metric.weightCoverage != null && metric.weightCoverage < 0.8 ? metric.value * factor : null,
        })),
      }]),
    });
    chart.getZr().on("click", event => {
      const point = [event.offsetX, event.offsetY];
      if (!chart.containPixel("grid", point)) return;
      const converted = chart.convertFromPixel({ gridIndex: 0 }, point) as number[];
      const index = Math.max(0, Math.min(periods.length - 1, Math.round(converted[0]!)));
      if (periods[index]) callback.current(periods[index]);
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => { observer.disconnect(); chart.dispose(); };
  }, [periods, series, selectedPeriod, percent]);

  return <div ref={ref} className="h-56 w-full min-w-0" role="img" aria-label={`${series.map(row => row.name).join("、")}历史趋势，单位${percent ? "百分比" : "十亿美元"}；可用上方报告期控件选择季度`} />;
}
