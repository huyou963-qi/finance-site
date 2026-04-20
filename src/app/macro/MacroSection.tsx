"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MacroChartIndicatorAssignment } from "@/components/MacroChartIndicatorAssignment";
import { MacroMultiChartGrid } from "@/components/MacroMultiChartGrid";
import { UnifiedMacroSidebar } from "@/components/UnifiedMacroSidebar";
import type { MacroPayload } from "@/lib/data/types";
import {
  DEFAULT_UNIFIED_SERIES_KEYS,
  serializeUnifiedKeys,
  unifiedSeriesDisplayName,
} from "@/lib/data/macroCatalog";
import type { MacroSlotAssignment } from "@/lib/macroPartition";
import { buildMacroDemoSeries } from "@/lib/sampleSeries";

type MainTab = "selected" | "charts";

const CHART_SETTINGS_MIN_PX = 200;
const CHART_SETTINGS_MAX_FRAC = 0.65;

export function MacroSection() {
  const [mainTab, setMainTab] = useState<MainTab>("selected");
  const [layoutMode, setLayoutMode] = useState<1 | 2 | 3 | 4>(1);

  /** 图表分页：右侧「图形属性」面板，默认折叠；展开宽度可拖拽调节 */
  const [chartSettingsOpen, setChartSettingsOpen] = useState(false);
  const [chartSettingsWidthPx, setChartSettingsWidthPx] = useState<number | null>(null);
  const chartSplitRowRef = useRef<HTMLDivElement | null>(null);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(DEFAULT_UNIFIED_SERIES_KEYS),
  );
  const [slotAssignment, setSlotAssignment] = useState<MacroSlotAssignment>({});

  const [payload, setPayload] = useState<MacroPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const seriesQuery = useMemo(() => {
    return serializeUnifiedKeys(selectedKeys);
  }, [selectedKeys]);

  const resolvedAssignment = useMemo(() => {
    const cap = Math.max(0, layoutMode - 1);
    const out: MacroSlotAssignment = {};
    for (const k of selectedKeys) {
      const raw = slotAssignment[k];
      if (raw === null) {
        out[k] = null;
      } else if (raw === undefined || Number.isNaN(raw)) {
        out[k] = 0;
      } else {
        out[k] = Math.min(cap, Math.max(0, Math.floor(raw)));
      }
    }
    return out;
  }, [selectedKeys, layoutMode, slotAssignment]);

  const onSelectedKeysChange = useCallback(
    (next: Set<string>) => {
      setSlotAssignment((prev) => {
        const n: MacroSlotAssignment = { ...prev };
        for (const key of next) {
          if (!selectedKeys.has(key)) {
            n[key] = n[key] ?? null;
          }
        }
        for (const k of Object.keys(n)) {
          if (!next.has(k)) delete n[k];
        }
        return n;
      });
      setSelectedKeys(next);
    },
    [selectedKeys],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const q = encodeURIComponent(seriesQuery);
    fetch(`/api/data/macro?source=unified&series=${q}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `${r.status}`);
        }
        return r.json() as Promise<MacroPayload>;
      })
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((e) => {
        if (cancelled) return;
        const demo = buildMacroDemoSeries();
        setPayload({
          title: "演示数据（离线）",
          source: "unified",
          categories: demo.categories,
          series: [
            {
              name: "演示序列 A",
              data: demo.inflation as (number | null)[],
              key: "demo:A",
            },
            {
              name: "演示序列 B",
              data: demo.policyRate as (number | null)[],
              key: "demo:B",
            },
          ],
          attribution:
            e instanceof Error
              ? `无法拉取远程数据（${e.message}）。以下为本地演示序列（随机，非真实）。`
              : "无法拉取远程宏观数据，已显示本地演示序列（随机）。",
        });
        setError(
          e instanceof Error
            ? e.message
            : "无法加载数据（请检查网络及本机是否已配置所需 API 密钥）",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [seriesQuery]);

  function assignSlot(key: string, slotIndex: number | null) {
    setSlotAssignment((prev) => ({ ...prev, [key]: slotIndex }));
  }

  useEffect(() => {
    const cap = Math.max(0, layoutMode - 1);
    setSlotAssignment((prev) => {
      const n: MacroSlotAssignment = {};
      for (const [k, v] of Object.entries(prev)) {
        if (v === null) {
          n[k] = null;
        } else if (v === undefined || Number.isNaN(v)) {
          n[k] = 0;
        } else {
          n[k] = Math.min(cap, Math.max(0, Math.floor(v)));
        }
      }
      return n;
    });
  }, [layoutMode]);

  const selectedRows = useMemo(() => {
    return [...selectedKeys]
      .sort((a, b) => a.localeCompare(b))
      .map((key) => {
        const slot = resolvedAssignment[key];
        return {
          key,
          label: unifiedSeriesDisplayName(key),
          slotLabel: slot === null ? ("pool" as const) : ("chart" as const),
          slotIndex: slot === null || slot === undefined ? 0 : slot,
        };
      });
  }, [selectedKeys, resolvedAssignment]);

  useLayoutEffect(() => {
    if (!chartSettingsOpen || chartSettingsWidthPx !== null || !chartSplitRowRef.current) return;
    const w = chartSplitRowRef.current.clientWidth;
    if (w > 0) {
      setChartSettingsWidthPx(Math.round(w * (1 / 3)));
    }
  }, [chartSettingsOpen, chartSettingsWidthPx]);

  const startChartSettingsResize = useCallback(
    (downEvent: React.MouseEvent) => {
      downEvent.preventDefault();
      const row = chartSplitRowRef.current;
      if (!row) return;
      const startX = downEvent.clientX;
      const startW =
        chartSettingsWidthPx ??
        Math.max(CHART_SETTINGS_MIN_PX, Math.round(row.clientWidth * (1 / 3)));

      const onMove = (ev: MouseEvent) => {
        const cw = chartSplitRowRef.current?.clientWidth ?? startW + startX;
        const maxW = Math.floor(cw * CHART_SETTINGS_MAX_FRAC);
        const delta = startX - ev.clientX;
        const next = Math.min(maxW, Math.max(CHART_SETTINGS_MIN_PX, startW + delta));
        setChartSettingsWidthPx(next);
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);

      if (chartSettingsWidthPx === null) {
        setChartSettingsWidthPx(startW);
      }
    },
    [chartSettingsWidthPx],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
      <div className="flex shrink-0 flex-wrap gap-2 border-b border-slate-800/80 px-4 pb-2 pt-2 lg:px-6">
        <button
          type="button"
          onClick={() => setMainTab("selected")}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
            mainTab === "selected"
              ? "border-emerald-600 bg-emerald-950/50 text-emerald-100"
              : "border-transparent bg-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200"
          }`}
        >
          已选指标
        </button>
        <button
          type="button"
          onClick={() => setMainTab("charts")}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
            mainTab === "charts"
              ? "border-emerald-600 bg-emerald-950/50 text-emerald-100"
              : "border-transparent bg-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200"
          }`}
        >
          图表
        </button>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-slate-800/80 lg:flex-row lg:items-stretch lg:border-t-0">
        <aside className="max-h-[40vh] shrink-0 overflow-hidden border-slate-800 bg-slate-950/70 lg:max-h-none lg:w-[min(100%,320px)] lg:border-r lg:border-t-0 xl:w-[340px]">
          <div className="flex h-full max-h-[inherit] flex-col gap-0 overflow-y-auto px-3 py-3 lg:max-h-none lg:px-4 lg:py-4">
            <UnifiedMacroSidebar
              selectedKeys={selectedKeys}
              onChange={onSelectedKeysChange}
              layoutMode={layoutMode}
              slotAssignment={resolvedAssignment}
              onSlotAssignmentChange={assignSlot}
            />
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-950/40 px-3 py-3 lg:min-h-0 lg:px-6 lg:py-4">
          {mainTab === "selected" ? (
            <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              <p className="text-xs text-slate-500">
                当前勾选的序列如下；可在左侧目录增删。显示在本图或「待选集」：待选集中仍请求数据但未绘制。
              </p>
              {selectedRows.length === 0 ? (
                <p className="text-sm text-slate-500">暂无已选指标。</p>
              ) : (
                <ul className="divide-y divide-slate-800/90 rounded-lg border border-slate-800/90 bg-slate-950/60">
                  {selectedRows.map(({ key, label, slotLabel, slotIndex }) => (
                    <li
                      key={key}
                      title={key}
                      className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm"
                    >
                      <span className="text-slate-200">{label}</span>
                      {slotLabel === "chart" ? (
                        <span className="shrink-0 rounded border border-slate-700 px-1.5 py-0 text-[11px] text-slate-400">
                          图 {slotIndex + 1}
                        </span>
                      ) : slotLabel === "pool" ? (
                        <span className="shrink-0 rounded border border-amber-900/60 px-1.5 py-0 text-[11px] text-amber-200/80">
                          待选集
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800/80 pb-3">
                <span className="text-xs font-medium text-slate-500">图表布局</span>
                <div className="flex flex-wrap gap-1.5">
                  {([1, 2, 3, 4] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setLayoutMode(n)}
                      className={`rounded-md border px-2.5 py-1 text-xs transition ${
                        layoutMode === n
                          ? "border-emerald-600 bg-emerald-950/50 text-emerald-100"
                          : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {n === 1 && "单图"}
                      {n === 2 && "2 图（上下）"}
                      {n === 3 && "3 图（纵向）"}
                      {n === 4 && "4 图（田字）"}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="flex min-h-[200px] flex-1 items-center justify-center text-sm text-slate-500">
                  正在加载…
                </div>
              ) : payload ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  {error ? (
                    <div className="shrink-0 rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200/90">
                      {error}
                    </div>
                  ) : null}
                  {payload.attribution ? (
                    <p className="shrink-0 text-xs leading-relaxed text-slate-500">{payload.attribution}</p>
                  ) : null}

                  <div
                    ref={chartSplitRowRef}
                    className="flex min-h-0 min-w-0 flex-1 flex-row items-stretch"
                  >
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <MacroMultiChartGrid
                        key={`macro-grid-${layoutMode}`}
                        payload={payload}
                        layoutMode={layoutMode}
                        slotAssignment={resolvedAssignment}
                      />
                    </div>

                    {chartSettingsOpen ? (
                      <>
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          title="拖拽调节宽度"
                          onMouseDown={startChartSettingsResize}
                          className="group w-1.5 shrink-0 cursor-col-resize border-x border-slate-800 bg-slate-900/90 hover:bg-emerald-950/80"
                        >
                          <span className="mx-auto block h-full w-px bg-slate-600 group-hover:bg-emerald-500" />
                        </div>
                        <aside
                          className="max-w-[65%] flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-slate-800 bg-slate-950/85"
                          style={
                            chartSettingsWidthPx !== null
                              ? { width: chartSettingsWidthPx, flex: "0 0 auto" }
                              : { flex: "0 0 33%", minWidth: CHART_SETTINGS_MIN_PX }
                          }
                        >
                          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
                            <h3 className="text-sm font-medium text-slate-200">图形属性</h3>
                            <button
                              type="button"
                              onClick={() => setChartSettingsOpen(false)}
                              className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400 hover:border-slate-500 hover:text-slate-200"
                            >
                              收起
                            </button>
                          </div>
                          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-xs text-slate-400">
                            <MacroChartIndicatorAssignment
                              layoutMode={layoutMode}
                              selectedKeys={selectedKeys}
                              slotAssignment={resolvedAssignment}
                              onAssign={assignSlot}
                            />
                            <div className="mt-4 border-t border-slate-800 pt-4">
                              <p className="mb-2 leading-relaxed text-slate-500">
                                此处可扩展：线型、颜色、坐标轴、图例与 tooltip 等（对接 ECharts option）。
                              </p>
                              <div className="rounded-md border border-dashed border-slate-700/90 p-3 text-slate-600">
                                占位：后续可把折线平滑、标记点、Y 轴范围等配置项放在这里。
                              </div>
                            </div>
                          </div>
                        </aside>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setChartSettingsOpen(true)}
                        className="flex w-10 shrink-0 flex-col items-center justify-center gap-1 border-l border-slate-800 bg-slate-950/90 py-3 text-[11px] leading-tight text-slate-400 transition hover:bg-slate-900 hover:text-slate-200"
                        title="展开图形属性"
                      >
                        <span>图</span>
                        <span>形</span>
                        <span>属</span>
                        <span>性</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
                  暂无数据
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
