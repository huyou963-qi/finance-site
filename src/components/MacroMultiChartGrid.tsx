"use client";

import type { EChartsType } from "echarts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MacroPayload } from "@/lib/data/types";
import { MacroChartPanel } from "@/components/MacroChartPanel";
import { MacroTimeRangeNavigator } from "@/components/MacroTimeRangeNavigator";
import { partitionMacroSeries, type MacroSlotAssignment } from "@/lib/macroPartition";
import type { MacroChartSlice } from "@/lib/macroChartOption";
import { indicesFromDataZoomPct } from "@/lib/timeRangeSlice";
import { dataIndexFromConvert } from "@/lib/timeCursor";

export type MacroMultiChartGridProps = {
  payload: MacroPayload;
  layoutMode: 1 | 2 | 3 | 4;
  slotAssignment: MacroSlotAssignment;
  /** 单图模式 ECharts 容器高度（CSS）；默认填满父级（宏观页父级为一屏高度链） */
  singleChartHeight?: string;
};

/**
 * 多图十字线联动：在 ZRender 层监听 mousemove，用 convertFromPixel 得到当前横轴数据下标，
 * 再对其余图 dispatch updateAxisPointer + showTip。不依赖 echarts.connect（与 axisPointer 组合时易失效）。
 */
export function MacroMultiChartGrid({
  payload,
  layoutMode,
  slotAssignment,
  singleChartHeight,
}: MacroMultiChartGridProps) {
  const buckets = useMemo(
    () => partitionMacroSeries(payload, layoutMode, slotAssignment),
    [payload, layoutMode, slotAssignment],
  );
  const compact = layoutMode > 1;

  /** 底部导航条：0–100，与全量类目对齐；切片后所有子图共用同一时间窗 */
  const [rangePct, setRangePct] = useState({ start: 0, end: 100 });

  const categoriesFingerprint = useMemo(
    () =>
      `${payload.categories.length}:${payload.categories[0] ?? ""}:${payload.categories[payload.categories.length - 1] ?? ""}`,
    [payload.categories],
  );

  useEffect(() => {
    setRangePct({ start: 0, end: 100 });
  }, [categoriesFingerprint]);

  const { i0, i1, visibleCategories } = useMemo(() => {
    const len = payload.categories.length;
    const { i0: a, i1: b } = indicesFromDataZoomPct(rangePct.start, rangePct.end, len);
    return {
      i0: a,
      i1: b,
      visibleCategories: len === 0 ? [] : payload.categories.slice(a, b + 1),
    };
  }, [payload.categories, rangePct.start, rangePct.end]);

  const onRangePctChange = useCallback((next: { start: number; end: number }) => {
    setRangePct((prev) => {
      if (
        Math.abs(prev.start - next.start) < 0.02 &&
        Math.abs(prev.end - next.end) < 0.02
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const chartSlots = useRef<(EChartsType | null)[]>([null, null, null, null]);
  const [registerRev, setRegisterRev] = useState(0);

  const onRegisterChart = useCallback((slot: number, chart: EChartsType | null) => {
    if (chartSlots.current[slot] === chart) return;
    chartSlots.current[slot] = chart;
    setRegisterRev((r) => r + 1);
  }, []);

  const sliceForSlot = useCallback(
    (index: number): MacroChartSlice | null => {
      const series = buckets[index] ?? [];
      if (series.length === 0) return null;
      const slicedSeries = series.map((s) => ({
        ...s,
        data: s.data.slice(i0, i1 + 1),
      }));
      return {
        categories: visibleCategories,
        series: slicedSeries,
        title: layoutMode === 1 ? payload.title : `图 ${index + 1}`,
      };
    },
    [buckets, i0, i1, layoutMode, payload.title, visibleCategories],
  );

  useEffect(() => {
    if (layoutMode <= 1) return undefined;

    const charts: EChartsType[] = [];
    for (let s = 0; s < layoutMode; s++) {
      const c = chartSlots.current[s];
      if (c && !c.isDisposed()) charts.push(c);
    }
    if (charts.length < 2) return undefined;

    const categories = visibleCategories;
    let linking = false;

    const cleanups: (() => void)[] = [];

    const hideAll = () => {
      charts.forEach((c) => {
        if (!c.isDisposed()) c.dispatchAction({ type: "hideTip" });
      });
    };

    charts.forEach((source, si) => {
      const zr = source.getZr();
      let raf = 0;

      const onMove = (e: { offsetX?: number; offsetY?: number }) => {
        if (linking) return;
        const ox = e.offsetX ?? 0;
        const oy = e.offsetY ?? 0;

        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          if (source.isDisposed()) return;
          try {
            if (!source.containPixel({ gridIndex: 0 }, [ox, oy])) return;
          } catch {
            return;
          }

          let dataIndex: number | null = null;
          try {
            const conv = source.convertFromPixel({ seriesIndex: 0 }, [ox, oy]);
            dataIndex = dataIndexFromConvert(conv, categories);
          } catch {
            return;
          }
          if (dataIndex === null) return;

          linking = true;
          try {
            charts.forEach((target, ti) => {
              if (ti === si || target.isDisposed()) return;
              target.dispatchAction({
                type: "updateAxisPointer",
                currTrigger: "mousemove",
                seriesIndex: 0,
                dataIndex,
              });
              target.dispatchAction({
                type: "showTip",
                seriesIndex: 0,
                dataIndex,
              });
            });
          } finally {
            queueMicrotask(() => {
              linking = false;
            });
          }
        });
      };

      zr.on("mousemove", onMove as never);
      cleanups.push(() => {
        cancelAnimationFrame(raf);
        zr.off("mousemove", onMove as never);
      });

      zr.on("globalout", hideAll);
      cleanups.push(() => zr.off("globalout", hideAll));
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [layoutMode, registerRev, visibleCategories]);

  const navigator = (
    <MacroTimeRangeNavigator
      categories={payload.categories}
      previewData={payload.series[0]?.data ?? []}
      rangePct={rangePct}
      onRangePctChange={onRangePctChange}
    />
  );

  if (layoutMode === 1) {
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <MacroChartPanel
            slice={sliceForSlot(0)}
            compact={false}
            chartAreaHeight={singleChartHeight ?? "100%"}
            className="h-full min-h-0 w-full"
          />
        </div>
        {navigator}
      </div>
    );
  }

  const gridClass =
    layoutMode === 2
      ? `grid min-h-0 w-full flex-1 grid-rows-2 gap-2`
      : layoutMode === 3
        ? `grid min-h-0 w-full flex-1 grid-rows-3 gap-2`
        : `grid min-h-0 w-full flex-1 grid-cols-2 grid-rows-2 gap-2`;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-1 overflow-hidden">
      <div className={`${gridClass} min-h-0 min-w-0 flex-1 overflow-hidden`}>
        {Array.from({ length: layoutMode }, (_, i) => {
          const slice = sliceForSlot(i);
          return (
            <div
              key={`${layoutMode}-slot-${i}`}
              className="min-h-0 min-w-0 overflow-hidden"
            >
              <MacroChartPanel
                slice={slice}
                compact={compact}
                className="h-full min-h-0"
                cursorLink={
                  slice
                    ? {
                        slotIndex: i,
                        onRegister: onRegisterChart,
                      }
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
      {navigator}
    </div>
  );
}
