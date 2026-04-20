"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import type { EChartsType } from "echarts";
import ReactECharts from "echarts-for-react";
import type { MacroChartSlice } from "@/lib/macroChartOption";
import { macroPayloadToChartOption } from "@/lib/macroChartOption";

export type MacroChartPanelProps = {
  slice: MacroChartSlice | null;
  compact?: boolean;
  emptyHint?: string;
  className?: string;
  /**
   * 传给 ECharts 外层容器的固定高度（CSS），解决单图模式下父级只有 min-height 时子元素 height:100% 塌缩。
   * 例：`min(72vh, 880px)` 或 `clamp(28rem, 65vh, 52rem)`
   */
  chartAreaHeight?: string;
  /** 多图联动：由 MacroMultiChartGrid 注册实例并同步 axisPointer */
  cursorLink?: {
    slotIndex: number;
    onRegister: (slot: number, chart: EChartsType | null) => void;
  };
};

export function MacroChartPanel({
  slice,
  compact,
  emptyHint,
  className,
  chartAreaHeight,
  cursorLink,
}: MacroChartPanelProps) {
  /** 避免 cursorLink 对象引用每帧变化导致反复 cleanup→unregister→无限 setState */
  const cursorLinkRef = useRef(cursorLink);
  cursorLinkRef.current = cursorLink;

  useEffect(() => {
    return () => {
      const cl = cursorLinkRef.current;
      if (cl?.slotIndex !== undefined && cl.onRegister) {
        cl.onRegister(cl.slotIndex, null);
      }
    };
    // 仅槽位变化或卸载时需要解除注册；勿依赖整个 cursorLink 对象
  }, [cursorLink?.slotIndex]);

  if (!slice?.series?.length) {
    return (
      <div
        className={`flex h-full min-h-0 flex-col items-center justify-center rounded-lg border border-dashed border-slate-700/90 bg-slate-950/40 px-2 text-center text-[11px] leading-relaxed text-slate-500 ${className ?? ""}`}
      >
        {emptyHint ?? (
          <>
            此图暂无序列
            <br />
            请在左侧勾选指标并选择对应图号
          </>
        )}
      </div>
    );
  }

  const opt = macroPayloadToChartOption(slice, { compact });

  const chartBoxStyle: CSSProperties | undefined = chartAreaHeight
    ? { width: "100%", height: chartAreaHeight, minHeight: chartAreaHeight }
    : undefined;

  return (
    <div className={`flex min-h-0 min-w-0 flex-col ${className ?? ""}`}>
      <div
        className={`min-h-0 w-full flex-1 ${chartAreaHeight ? "" : "h-full"}`}
        style={chartBoxStyle}
      >
        <ReactECharts
          option={opt}
          style={{ width: "100%", height: "100%" }}
          opts={{ renderer: "canvas" }}
          notMerge
          lazyUpdate
          onChartReady={(chart) => {
            if (cursorLink) cursorLink.onRegister(cursorLink.slotIndex, chart);
          }}
        />
      </div>
    </div>
  );
}
