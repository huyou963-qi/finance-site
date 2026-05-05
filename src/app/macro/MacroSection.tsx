"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MacroChartIndicatorAssignment } from "@/components/MacroChartIndicatorAssignment";
import { MacroMultiChartGrid } from "@/components/MacroMultiChartGrid";
import { UnifiedMacroSidebar } from "@/components/UnifiedMacroSidebar";
import type { MacroPayload } from "@/lib/data/types";
import {
  DEFAULT_UNIFIED_SERIES_KEYS,
  serializeUnifiedKeys,
  unifiedSeriesDisplayName,
  type UnifiedCatalogGroup,
} from "@/lib/data/macroCatalog";
import type { MacroSlotAssignment } from "@/lib/macroPartition";
import type {
  MacroSeriesAxis,
  MacroSeriesChartType,
  MacroSeriesVisualConfigMap,
} from "@/lib/macroChartOption";
import { buildMacroDemoSeries } from "@/lib/sampleSeries";

type MainTab = "selected" | "charts";

const CHART_SETTINGS_MIN_PX = 200;
const CHART_SETTINGS_MAX_FRAC = 0.65;

type MacroChartPrefs = {
  version: 1;
  layoutMode: 1 | 2 | 3 | 4;
  selectedKeys: string[];
  slotAssignment: MacroSlotAssignment;
  seriesVisualMap: MacroSeriesVisualConfigMap;
};

function parseDateLabelToUtcMs(label: string): number | null {
  if (/^\d{4}$/.test(label)) return Date.UTC(Number(label), 0, 1);
  if (/^\d{4}-\d{2}$/.test(label)) {
    const y = Number(label.slice(0, 4));
    const m = Number(label.slice(5, 7)) - 1;
    return Date.UTC(y, m, 1);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const y = Number(label.slice(0, 4));
    const m = Number(label.slice(5, 7)) - 1;
    const d = Number(label.slice(8, 10));
    return Date.UTC(y, m, d);
  }
  return null;
}

function inferFrequencyFromLabels(labels: string[]): "日" | "周" | "月" | "季度" | "年" {
  if (labels.length < 2) return "月";
  const stamps = labels
    .map(parseDateLabelToUtcMs)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  if (stamps.length < 2) return "月";
  const days: number[] = [];
  for (let i = 1; i < stamps.length; i++) {
    days.push((stamps[i] - stamps[i - 1]) / 86_400_000);
  }
  if (days.length === 0) return "月";
  const median = days[Math.floor(days.length / 2)];
  if (median <= 2) return "日";
  if (median <= 10) return "周";
  if (median <= 45) return "月";
  if (median <= 135) return "季度";
  return "年";
}

function seriesRange(categories: string[], values: (number | null)[]): string {
  let first = -1;
  let last = -1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0 || last < 0) return "-";
  const start = categories[first] ?? "-";
  const end = categories[last] ?? "-";
  return `${start} ~ ${end}`;
}

export function MacroSection() {
  const searchParams = useSearchParams();

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
  const [seriesVisualMap, setSeriesVisualMap] = useState<MacroSeriesVisualConfigMap>({});

  const [payload, setPayload] = useState<MacroPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestedQuery, setRequestedQuery] = useState<string | null>(null);
  /** URL `?mds=` 或程序化加载本地库序列时使用 */
  const [requestedMdsInstruments, setRequestedMdsInstruments] = useState<string | null>(null);
  const [extractedSet, setExtractedSet] = useState<Set<string>>(new Set());

  const [catalogGroups, setCatalogGroups] = useState<UnifiedCatalogGroup[] | null>(null);
  const [catalogAllowlist, setCatalogAllowlist] = useState<Set<string> | null>(null);
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tools/macro-chart-prefs", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) return { prefs: null as MacroChartPrefs | null };
        const j = (await r.json().catch(() => ({}))) as { prefs?: MacroChartPrefs | null };
        return { prefs: j.prefs ?? null };
      })
      .then(({ prefs }) => {
        if (cancelled) return;
        if (prefs) {
          if ([1, 2, 3, 4].includes(prefs.layoutMode)) setLayoutMode(prefs.layoutMode);
          if (Array.isArray(prefs.selectedKeys) && prefs.selectedKeys.length > 0) {
            setSelectedKeys(new Set(prefs.selectedKeys));
          }
          if (prefs.slotAssignment && typeof prefs.slotAssignment === "object") {
            setSlotAssignment(prefs.slotAssignment);
          }
          if (prefs.seriesVisualMap && typeof prefs.seriesVisualMap === "object") {
            setSeriesVisualMap(prefs.seriesVisualMap);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setPrefsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!prefsHydrated) return;
    const prefs: MacroChartPrefs = {
      version: 1,
      layoutMode,
      selectedKeys: [...selectedKeys],
      slotAssignment,
      seriesVisualMap,
    };
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      fetch("/api/tools/macro-chart-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs }),
      }).catch(() => {});
    }, 450);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [prefsHydrated, layoutMode, selectedKeys, slotAssignment, seriesVisualMap]);

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
      setSeriesVisualMap((prev) => {
        const out: MacroSeriesVisualConfigMap = {};
        for (const key of next) {
          if (prev[key]) out[key] = prev[key];
        }
        return out;
      });
    },
    [selectedKeys],
  );

  const updateSeriesVisual = useCallback(
    (
      key: string,
      patch: { axis?: MacroSeriesAxis; chartType?: MacroSeriesChartType },
    ) => {
      setSeriesVisualMap((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          ...patch,
        },
      }));
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/data/fmp-catalog")
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as {
          groups?: UnifiedCatalogGroup[];
          allowlistKeys?: string[];
          error?: string;
        };
        if (!r.ok) throw new Error(j.error ?? `${r.status}`);
        return j;
      })
      .then((j) => {
        if (cancelled) return;
        if (Array.isArray(j.groups) && Array.isArray(j.allowlistKeys)) {
          setCatalogGroups(j.groups);
          setCatalogAllowlist(new Set(j.allowlistKeys));
          setCatalogLoadError(null);
        } else {
          throw new Error("目录响应格式异常");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setCatalogGroups(null);
        setCatalogAllowlist(null);
        setCatalogLoadError(e instanceof Error ? e.message : "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!catalogAllowlist) return;
    const kept = [...selectedKeys].filter((k) => catalogAllowlist.has(k));
    const unchanged =
      kept.length === selectedKeys.size && kept.every((k) => selectedKeys.has(k));
    if (unchanged) return;
    const defaults = DEFAULT_UNIFIED_SERIES_KEYS.filter((k) => catalogAllowlist.has(k));
    const fallback = defaults.length > 0 ? defaults : [...catalogAllowlist].slice(0, 3);
    const next = kept.length > 0 ? new Set(kept) : new Set(fallback);
    onSelectedKeysChange(next);
  }, [catalogAllowlist, selectedKeys, onSelectedKeysChange]);

  useEffect(() => {
    const raw = searchParams.get("mds");
    if (raw?.trim()) {
      setRequestedMdsInstruments(raw.trim());
      setRequestedQuery(null);
    } else {
      setRequestedMdsInstruments(null);
    }
  }, [searchParams]);

  const seriesQuery = useMemo(() => {
    return serializeUnifiedKeys(selectedKeys, catalogAllowlist);
  }, [selectedKeys, catalogAllowlist]);

  const extractedAssignment = useMemo(() => {
    const out: MacroSlotAssignment = {};
    for (const key of extractedSet) {
      out[key] = slotAssignment[key] ?? null;
    }
    return out;
  }, [extractedSet, slotAssignment]);

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

  useEffect(() => {
    const mdsRaw = requestedMdsInstruments?.trim();
    const unifiedRaw = requestedQuery?.trim();
    if (!mdsRaw && !unifiedRaw) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = mdsRaw
      ? `/api/data/macro?source=mds&instruments=${encodeURIComponent(mdsRaw)}`
      : `/api/data/macro?source=unified&series=${encodeURIComponent(unifiedRaw!)}`;

    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `${r.status}`);
        }
        return r.json() as Promise<MacroPayload>;
      })
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        if (data.source === "mds") {
          const keys = data.series.map((s) => s.key).filter(Boolean) as string[];
          if (keys.length > 0) setExtractedSet(new Set(keys));
        }
      })
      .catch((e) => {
        if (cancelled) return;
        if (mdsRaw) {
          setPayload(null);
          setError(
            e instanceof Error
              ? e.message
              : "无法加载本地宏观数据",
          );
          return;
        }
        const demo = buildMacroDemoSeries();
        setPayload({
          title: "演示数据（离线）",
          source: "fmp",
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
            : "无法加载数据（请检查网络或上游服务）",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestedMdsInstruments, requestedQuery]);

  function handleExtractData() {
    if (!seriesQuery) {
      setError("请先选择至少一个指标");
      setPayload(null);
      setRequestedQuery(null);
      setRequestedMdsInstruments(null);
      setExtractedSet(new Set());
      return;
    }
    setRequestedMdsInstruments(null);
    const extractedKeys = new Set(
      seriesQuery
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    setExtractedSet(extractedKeys);
    setRequestedQuery(seriesQuery);
  }

  function removeSelectedKey(key: string) {
    const next = new Set(selectedKeys);
    next.delete(key);
    onSelectedKeysChange(next);
  }

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

  const catalogMetaByKey = useMemo(() => {
    const m = new Map<string, { frequency: string }>();
    if (!catalogGroups) return m;
    for (const g of catalogGroups) {
      for (const item of g.items) {
        m.set(item.key, { frequency: item.frequency });
      }
    }
    return m;
  }, [catalogGroups]);

  const extractedMetaByKey = useMemo(() => {
    const m = new Map<string, { frequency: string; range: string }>();
    if (!payload) return m;
    for (const s of payload.series) {
      if (!s.key) continue;
      const validLabels = payload.categories.filter((_, idx) => {
        const v = s.data[idx];
        return v !== null && Number.isFinite(v);
      });
      m.set(s.key, {
        frequency: inferFrequencyFromLabels(validLabels),
        range: seriesRange(payload.categories, s.data),
      });
    }
    return m;
  }, [payload]);

  const selectedRows = useMemo(() => {
    return [...selectedKeys]
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({
        key,
        label: unifiedSeriesDisplayName(key),
        frequency:
          extractedMetaByKey.get(key)?.frequency ??
          catalogMetaByKey.get(key)?.frequency ??
          "-",
        range: extractedMetaByKey.get(key)?.range ?? "-",
      }));
  }, [selectedKeys, catalogMetaByKey, extractedMetaByKey]);

  const extractedKeyOrder = useMemo(() => {
    if (payload?.source === "mds" && payload.series.length > 0) {
      return payload.series.map((s) => s.key).filter(Boolean) as string[];
    }
    return requestedQuery
      ? requestedQuery
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  }, [payload, requestedQuery]);

  const seriesDisplayLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    if (!payload?.series) return m;
    for (const s of payload.series) {
      if (s.key) m.set(s.key, s.name);
    }
    return m;
  }, [payload]);

  const tableColumns = useMemo(() => {
    const order = extractedKeyOrder.length > 0 ? extractedKeyOrder : [...extractedSet];
    return order.map((key) => ({
      key,
      label: seriesDisplayLabelByKey.get(key) ?? unifiedSeriesDisplayName(key),
    }));
  }, [extractedKeyOrder, extractedSet, seriesDisplayLabelByKey]);

  const tableValueByKey = useMemo(() => {
    const m = new Map<string, (number | null)[]>();
    if (!payload) return m;
    for (const s of payload.series) {
      if (s.key) m.set(s.key, s.data);
    }
    return m;
  }, [payload]);

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
      <div className="flex shrink-0 flex-wrap gap-2 border-b border-slate-800/80 px-4 pb-1.5 pt-1 lg:px-6">
        <button
          type="button"
          onClick={handleExtractData}
          disabled={loading || selectedKeys.size === 0}
          className="rounded-md border border-emerald-700/80 bg-emerald-950/45 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          提取数据
        </button>
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
              catalogGroups={catalogGroups}
              catalogError={catalogLoadError}
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
                  {selectedRows.map(({ key, label, frequency, range }) => (
                    <li
                      key={key}
                      title={key}
                      className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-slate-200">{label}</div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          频率：{frequency}　时间范围：{range}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSelectedKey(key)}
                        className="shrink-0 rounded border border-rose-900/70 px-2 py-0.5 text-[11px] text-rose-200/90 hover:border-rose-700"
                      >
                        删除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {payload ? (
                <section className="mt-2 rounded-lg border border-slate-800/80 bg-slate-950/60">
                  <div className="border-b border-slate-800/80 px-3 py-2 text-xs text-slate-400">
                    提取结果（表格）
                  </div>
                  <div className="max-h-[28vh] overflow-auto">
                    <table className="min-w-full border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-900/95 text-slate-300">
                        <tr>
                          <th className="border-b border-r border-slate-800 px-2 py-1 text-left font-medium">
                            时间
                          </th>
                          {tableColumns.map((c) => (
                            <th
                              key={c.key}
                              className="border-b border-r border-slate-800 px-2 py-1 text-left font-medium"
                            >
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {payload.categories.map((time, idx) => (
                          <tr key={`${time}-${idx}`} className="odd:bg-slate-950 even:bg-slate-900/35">
                            <td className="whitespace-nowrap border-b border-r border-slate-800 px-2 py-1 text-slate-400">
                              {time}
                            </td>
                            {tableColumns.map((c) => (
                              <td
                                key={`${c.key}-${idx}`}
                                className="whitespace-nowrap border-b border-r border-slate-800 px-2 py-1 text-slate-200"
                              >
                                {tableValueByKey.get(c.key)?.[idx] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
            </section>
          ) : (
            <section className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800/80 pb-3">
                <label className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                  <span className="shrink-0">图表布局</span>
                  <select
                    value={layoutMode}
                    onChange={(e) =>
                      setLayoutMode(Number(e.target.value) as 1 | 2 | 3 | 4)
                    }
                    className="min-w-[10rem] rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600/40"
                  >
                    <option value={1}>单图</option>
                    <option value={2}>2 图（上下）</option>
                    <option value={3}>3 图（纵向）</option>
                    <option value={4}>4 图（田字）</option>
                  </select>
                </label>
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
                        slotAssignment={extractedAssignment}
                        seriesVisualMap={seriesVisualMap}
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
                              seriesVisualMap={seriesVisualMap}
                              onUpdateSeriesVisual={updateSeriesVisual}
                            />
                            <div className="mt-4 border-t border-slate-800 pt-4">
                              <p className="mb-2 leading-relaxed text-slate-500">
                                常见金融分析图形已支持：折线、虚线、面积、阶梯线、柱状、散点；并支持任意序列切到右轴，便于不同量级对比。
                              </p>
                              <div className="rounded-md border border-slate-700/90 bg-slate-900/50 p-3 text-slate-500">
                                建议：同比增速/利率用左轴，价格指数或规模量用右轴；离散事件点可用散点，结构变化可用柱状。
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
