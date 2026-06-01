"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MacroChartIndicatorAssignment } from "@/components/MacroChartIndicatorAssignment";
import { MacroTemplateFolderSection } from "@/components/MacroTemplateFolderSection";
import { MacroChartDrawingToolbar } from "@/components/MacroChartDrawingToolbar";
import { MacroMultiChartGrid } from "@/components/MacroMultiChartGrid";
import type { MacroDrawing, MacroDrawingTool } from "@/lib/macroChartDrawing";
import { UnifiedMacroSidebar } from "@/components/UnifiedMacroSidebar";
import type { MacroPayload } from "@/lib/data/types";
import {
  DEFAULT_UNIFIED_SERIES_KEYS,
  MACRO_MAX_SERIES,
  serializeUnifiedKeys,
  unifiedSeriesDisplayName,
  type UnifiedCatalogCountry,
} from "@/lib/data/macroCatalog";
import type { BuiltinTemplateOverride, MacroChartPrefs } from "@/lib/data/macroChartPrefs";
import { mergeBuiltinTemplateOverride } from "@/lib/data/macroChartPrefs";
import {
  BUILTIN_DEBT_CAPACITY_TEMPLATE,
  BUILTIN_CHINA_OVERVIEW_TEMPLATE,
  BUILTIN_JAPAN_OVERVIEW_TEMPLATE,
  BUILTIN_US_OVERVIEW_TEMPLATE,
  resolveBuiltinTemplate,
  type MacroDerivedCalc,
  type MacroDerivedCalcOp,
  type MacroFrequencyAdjust,
  type MacroResampleMethod,
  type MacroSeriesCalcConfig,
  type MacroSeriesCalcConfigMap,
  type MacroSeriesCalcOp,
  type MacroChartTemplate,
  type MacroTemplateFolder,
  type MacroUnitAdjust,
} from "@/lib/data/macroPresetTemplates";
import { createMacroTemplateFolder, foldersForScope } from "@/lib/macroTemplateFolders";
import type { MacroSlotAssignment } from "@/lib/macroPartition";
import type {
  MacroChartDisplayConfig,
  MacroSeriesVisualConfig,
  MacroSeriesVisualConfigMap,
} from "@/lib/macroChartOption";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";
import { buildMacroDemoSeries } from "@/lib/sampleSeries";
import {
  getOrCreateMacroSyncTabId,
  MACRO_PAGE_SYNC_CHANNEL,
  type MacroSyncMessage,
} from "@/lib/macroPageSyncChannel";

type MainTab = "selected" | "charts" | "templates";

const CHART_SETTINGS_MIN_PX = 200;
const CHART_SETTINGS_MAX_FRAC = 0.65;

type MdsIndicatorAttrs = {
  country: string;
  unit: string;
  frequency: string;
  source: string;
  updatedAt: string;
  range: string;
};

const COUNTRY_ZH_BY_CODE: Record<string, string> = {
  CN: "中国",
  US: "美国",
  JP: "日本",
  DE: "德国",
  GB: "英国",
  FR: "法国",
  IN: "印度",
  BR: "巴西",
  KR: "韩国",
  RU: "俄罗斯",
  IT: "意大利",
  CA: "加拿大",
  AU: "澳大利亚",
  ES: "西班牙",
  MX: "墨西哥",
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

function buildExtractQueryFromKeys(
  keys: string[],
  allowlist: Set<string> | null,
): string {
  const fromAllowlist = serializeUnifiedKeys(new Set(keys), allowlist);
  if (fromAllowlist) return fromAllowlist;
  const prefixed = [
    ...new Set(
      keys
        .map((k) => k.trim())
        .filter((k) => /^(fred:|wb:|mds:)/.test(k)),
    ),
  ].slice(0, MACRO_MAX_SERIES);
  return prefixed.join(",");
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

function fmtIsoDate(input: string | null | undefined): string {
  if (!input) return "-";
  const t = Date.parse(input);
  if (!Number.isFinite(t)) return input.slice(0, 10);
  return new Date(t).toLocaleDateString("zh-CN");
}

function countryNameByCode(code: string | null | undefined): string {
  if (!code) return "-";
  const normalized = code.trim().toUpperCase();
  return COUNTRY_ZH_BY_CODE[normalized] ?? normalized;
}

function mdsRangeTextFromMetadata(meta: Record<string, unknown>): string {
  const tr = meta.timeRange;
  if (tr && typeof tr === "object" && !Array.isArray(tr)) {
    const start = typeof (tr as { start?: unknown }).start === "string" ? (tr as { start: string }).start : "";
    const end = typeof (tr as { end?: unknown }).end === "string" ? (tr as { end: string }).end : "";
    if (start || end) return `${start || "-"} ~ ${end || "-"}`;
  }
  return "-";
}

const DEFAULT_SERIES_CALC_CONFIG: MacroSeriesCalcConfig = {
  op: "none",
  frequency: "keep",
  unit: "keep",
  resampleMethod: "end",
};

function applyUnitAdjust(value: number | null, unit: MacroUnitAdjust): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (unit === "x0.01") return value * 0.01;
  if (unit === "x100") return value * 100;
  return value;
}

function applySeriesOp(values: (number | null)[], op: MacroSeriesCalcOp): (number | null)[] {
  if (op === "none") return [...values];
  if (op === "cumsum") {
    let acc = 0;
    return values.map((v) => {
      if (v == null || !Number.isFinite(v)) return null;
      acc += v;
      return acc;
    });
  }
  return values.map((v, idx) => {
    if (v == null || !Number.isFinite(v)) return null;
    const prev = idx > 0 ? values[idx - 1] : null;
    if (op === "diff") {
      if (prev == null || !Number.isFinite(prev)) return null;
      return v - prev;
    }
    if (op === "pctChange") {
      if (prev == null || !Number.isFinite(prev) || prev === 0) return null;
      return ((v - prev) / Math.abs(prev)) * 100;
    }
    if (op === "yoy") {
      const back = idx >= 12 ? values[idx - 12] : null;
      if (back == null || !Number.isFinite(back) || back === 0) return null;
      return ((v - back) / Math.abs(back)) * 100;
    }
    return v;
  });
}

function periodLabelFromDateLabel(label: string, target: MacroFrequencyAdjust): string {
  const ms = parseDateLabelToUtcMs(label);
  if (ms == null) return label;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  if (target === "year") return `${y}`;
  if (target === "quarter") return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function toSortTimestamp(label: string): number {
  const q = /^(\d{4})-Q([1-4])$/i.exec(label);
  if (q) return Date.UTC(Number(q[1]), (Number(q[2]) - 1) * 3, 1);
  const ms = parseDateLabelToUtcMs(label);
  if (ms != null) return ms;
  return Number.NaN;
}

function compareLabelsChrono(a: string, b: string): number {
  const ta = toSortTimestamp(a);
  const tb = toSortTimestamp(b);
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
  if (Number.isFinite(ta)) return -1;
  if (Number.isFinite(tb)) return 1;
  return a.localeCompare(b, "zh-CN");
}

function sortLabelsChrono(labels: string[]): string[] {
  return [...labels].sort(compareLabelsChrono);
}

/** 估算文本在 12px 表格中的显示宽度（CJK 计 2 单位，其余 1 单位） */
function estimateTableTextWidthUnits(text: string): number {
  let units = 0;
  for (const ch of text) {
    units += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1;
  }
  return units;
}

function tableCellDisplayText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value);
}

function tableColumnWidthPx(units: number, minPx = 72, maxPx = 360): number {
  const px = Math.ceil(units * 6.5) + 16;
  return Math.min(maxPx, Math.max(minPx, px));
}

type SeriesWorking = {
  key: string;
  name: string;
  categories: string[];
  data: (number | null)[];
};

function resampleSeries(
  categories: string[],
  data: (number | null)[],
  target: MacroFrequencyAdjust,
  method: MacroResampleMethod,
): { categories: string[]; data: (number | null)[] } {
  if (target === "keep") return { categories: [...categories], data: [...data] };
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < categories.length; i++) {
    const v = data[i];
    if (v == null || !Number.isFinite(v)) continue;
    const bucket = periodLabelFromDateLabel(categories[i]!, target);
    const arr = buckets.get(bucket) ?? [];
    arr.push(v);
    buckets.set(bucket, arr);
  }
  const outCats = sortLabelsChrono([...buckets.keys()]);
  return {
    categories: outCats,
    data: outCats.map((x) => {
      const vals = buckets.get(x) ?? [];
      if (vals.length === 0) return null;
      if (method === "start") return vals[0] ?? null;
      if (method === "avg") {
        const sum = vals.reduce((acc, n) => acc + n, 0);
        return sum / vals.length;
      }
      return vals[vals.length - 1] ?? null;
    }),
  };
}

function deriveSeries(
  left: SeriesWorking,
  right: SeriesWorking,
  op: MacroDerivedCalcOp,
  name: string,
  key: string,
): SeriesWorking {
  const cats = sortLabelsChrono([...new Set([...left.categories, ...right.categories])]);
  const lm = new Map(left.categories.map((c, i) => [c, left.data[i] ?? null]));
  const rm = new Map(right.categories.map((c, i) => [c, right.data[i] ?? null]));
  const vals = cats.map((c) => {
    const a = lm.get(c) ?? null;
    const b = rm.get(c) ?? null;
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (op === "add") return a + b;
    if (op === "sub" || op === "spread") return a - b;
    if (op === "mul") return a * b;
    if ((op === "div" || op === "ratio") && b !== 0) return a / b;
    return null;
  });
  return { key, name, categories: cats, data: vals };
}

export function MacroSection() {
  const searchParams = useSearchParams();

  const [mainTab, setMainTab] = useState<MainTab>("selected");
  const [layoutMode, setLayoutMode] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [macroDrawTool, setMacroDrawTool] = useState<MacroDrawingTool>("cursor");
  const [macroDrawingsBySlot, setMacroDrawingsBySlot] = useState<
    Record<number, MacroDrawing[]>
  >({});

  const onMacroDrawingsChange = useCallback((slotIndex: number, drawings: MacroDrawing[]) => {
    setMacroDrawingsBySlot((prev) => ({ ...prev, [slotIndex]: drawings }));
  }, []);

  const clearMacroDrawings = useCallback(() => {
    setMacroDrawingsBySlot({});
  }, []);

  /** 图表分页：右侧「图形属性」面板，默认折叠；展开宽度可拖拽调节 */
  const [chartSettingsOpen, setChartSettingsOpen] = useState(false);
  const [chartSettingsWidthPx, setChartSettingsWidthPx] = useState<number | null>(null);
  const chartSplitRowRef = useRef<HTMLDivElement | null>(null);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(DEFAULT_UNIFIED_SERIES_KEYS),
  );
  const [slotAssignment, setSlotAssignment] = useState<MacroSlotAssignment>({});
  const [seriesVisualMap, setSeriesVisualMap] = useState<MacroSeriesVisualConfigMap>({});
  const [displayConfig, setDisplayConfig] = useState<MacroChartDisplayConfig>(
    DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
  );
  const [savedTemplates, setSavedTemplates] = useState<MacroChartTemplate[]>([]);
  const [templateFolders, setTemplateFolders] = useState<MacroTemplateFolder[]>([]);
  const [systemBuiltinFolders, setSystemBuiltinFolders] = useState<MacroTemplateFolder[]>([]);
  const [builtinTemplateFolderIds, setBuiltinTemplateFolderIds] = useState<
    Record<string, string | null>
  >({});
  const [newTemplateFolderId, setNewTemplateFolderId] = useState<string>("");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [seriesCalcConfigMap, setSeriesCalcConfigMap] = useState<MacroSeriesCalcConfigMap>({});
  const [derivedCalcs, setDerivedCalcs] = useState<MacroDerivedCalc[]>([]);
  const [calcTargetKey, setCalcTargetKey] = useState("");
  const [calcDraft, setCalcDraft] = useState<MacroSeriesCalcConfig>(DEFAULT_SERIES_CALC_CONFIG);
  const [derivedLeftKey, setDerivedLeftKey] = useState("");
  const [derivedRightKey, setDerivedRightKey] = useState("");
  const [derivedOp, setDerivedOp] = useState<MacroDerivedCalcOp>("ratio");
  const [derivedName, setDerivedName] = useState("");
  const [templateNameDialogOpen, setTemplateNameDialogOpen] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [templateSaveMode, setTemplateSaveMode] = useState<"user" | "builtin">("user");
  const [isAdmin, setIsAdmin] = useState(false);
  const [builtinTemplateOverrides, setBuiltinTemplateOverrides] = useState<
    Record<string, BuiltinTemplateOverride>
  >({});
  const [pageSyncEnabled, setPageSyncEnabled] = useState(false);
  const [remoteCrosshairTimeLabel, setRemoteCrosshairTimeLabel] = useState<string | null>(null);
  const [remoteCrosshairVersion, setRemoteCrosshairVersion] = useState(0);
  const [remoteVisibleRange, setRemoteVisibleRange] = useState<{
    startPct: number;
    endPct: number;
    fromLabel: string | null;
    toLabel: string | null;
  } | null>(null);
  const [remoteVisibleRangeVersion, setRemoteVisibleRangeVersion] = useState(0);

  const [payload, setPayload] = useState<MacroPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestedQuery, setRequestedQuery] = useState<string | null>(null);
  /** URL `?mds=` 或程序化加载本地库序列时使用 */
  const [requestedMdsInstruments, setRequestedMdsInstruments] = useState<string | null>(null);
  const [extractedSet, setExtractedSet] = useState<Set<string>>(new Set());
  const [tableTimeSort, setTableTimeSort] = useState<"asc" | "desc">("asc");
  const [sidebarLocateKey, setSidebarLocateKey] = useState<string | null>(null);

  const [catalogCountries, setCatalogCountries] = useState<UnifiedCatalogCountry[] | null>(null);
  const [catalogAllowlist, setCatalogAllowlist] = useState<Set<string> | null>(null);
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const [mdsAttrsByKey, setMdsAttrsByKey] = useState<Map<string, MdsIndicatorAttrs>>(new Map());
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const tabId = useMemo(() => getOrCreateMacroSyncTabId(), []);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const pageSyncEnabledRef = useRef(false);

  useEffect(() => {
    pageSyncEnabledRef.current = pageSyncEnabled;
  }, [pageSyncEnabled]);

  useEffect(() => {
    syncChannelRef.current = new BroadcastChannel(MACRO_PAGE_SYNC_CHANNEL);
    return () => {
      syncChannelRef.current?.close();
      syncChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ch = syncChannelRef.current;
    if (!ch) return;
    const onMsg = (ev: MessageEvent<MacroSyncMessage>) => {
      const msg = ev.data;
      if (!msg || msg.v !== 1) return;
      if (msg.tabId === tabId) return;
      if (!pageSyncEnabledRef.current) return;
      if (msg.type === "crosshair") {
        setRemoteCrosshairTimeLabel(msg.timeLabel);
        setRemoteCrosshairVersion((v) => v + 1);
      }
      if (msg.type === "visible-range") {
        setRemoteVisibleRange({
          startPct: msg.startPct,
          endPct: msg.endPct,
          fromLabel: msg.fromLabel,
          toLabel: msg.toLabel,
        });
        setRemoteVisibleRangeVersion((v) => v + 1);
      }
    };
    ch.addEventListener("message", onMsg);
    return () => ch.removeEventListener("message", onMsg);
  }, [tabId]);

  const onLocalCrosshairTimeLabel = useCallback(
    (timeLabel: string | null) => {
      const ch = syncChannelRef.current;
      if (!ch || !pageSyncEnabledRef.current) return;
      const msg: MacroSyncMessage = {
        v: 1,
        type: "crosshair",
        tabId,
        timeLabel,
      };
      ch.postMessage(msg);
    },
    [tabId],
  );

  const onLocalVisibleRange = useCallback(
    (payload: {
      startPct: number;
      endPct: number;
      fromLabel: string | null;
      toLabel: string | null;
    }) => {
      const ch = syncChannelRef.current;
      if (!ch || !pageSyncEnabledRef.current) return;
      const msg: MacroSyncMessage = {
        v: 1,
        type: "visible-range",
        tabId,
        startPct: payload.startPct,
        endPct: payload.endPct,
        fromLabel: payload.fromLabel,
        toLabel: payload.toLabel,
      };
      ch.postMessage(msg);
    },
    [tabId],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tools/macro-chart-prefs", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401)
          return {
            prefs: null as MacroChartPrefs | null,
            builtinTemplateOverrides: {} as Record<string, BuiltinTemplateOverride>,
            builtinTemplateFolders: [] as MacroTemplateFolder[],
            builtinTemplateFolderIds: {} as Record<string, string | null>,
            isAdmin: false,
          };
        const j = (await r.json().catch(() => ({}))) as {
          prefs?: MacroChartPrefs | null;
          builtinTemplateOverrides?: Record<string, BuiltinTemplateOverride>;
          builtinTemplateFolders?: MacroTemplateFolder[];
          builtinTemplateFolderIds?: Record<string, string | null>;
          user?: { role?: string };
        };
        return {
          prefs: j.prefs ?? null,
          builtinTemplateOverrides: j.builtinTemplateOverrides ?? {},
          builtinTemplateFolders: j.builtinTemplateFolders ?? [],
          builtinTemplateFolderIds: j.builtinTemplateFolderIds ?? {},
          isAdmin: j.user?.role === "admin",
        };
      })
      .then(
        ({
          prefs,
          builtinTemplateOverrides: overrides,
          builtinTemplateFolders,
          builtinTemplateFolderIds: systemFolderIds,
          isAdmin: admin,
        }) => {
        if (cancelled) return;
        setIsAdmin(admin);
        setBuiltinTemplateOverrides(overrides);
        setSystemBuiltinFolders(builtinTemplateFolders);
        setBuiltinTemplateFolderIds(systemFolderIds);
        if (prefs) {
          if ([1, 2, 3, 4, 5, 6].includes(prefs.layoutMode)) setLayoutMode(prefs.layoutMode);
          if (Array.isArray(prefs.selectedKeys) && prefs.selectedKeys.length > 0) {
            setSelectedKeys(new Set(prefs.selectedKeys));
          }
          if (prefs.slotAssignment && typeof prefs.slotAssignment === "object") {
            setSlotAssignment(prefs.slotAssignment);
          }
          if (prefs.seriesVisualMap && typeof prefs.seriesVisualMap === "object") {
            setSeriesVisualMap(prefs.seriesVisualMap);
          }
          if (prefs.displayConfig && typeof prefs.displayConfig === "object") {
            setDisplayConfig({
              ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
              ...prefs.displayConfig,
            });
          }
          if (prefs.seriesCalcConfigMap && typeof prefs.seriesCalcConfigMap === "object") {
            setSeriesCalcConfigMap(prefs.seriesCalcConfigMap);
          }
          if (Array.isArray(prefs.derivedCalcs)) {
            setDerivedCalcs(prefs.derivedCalcs);
          }
          if (Array.isArray(prefs.templates)) {
            setSavedTemplates(prefs.templates);
          }
          if (Array.isArray(prefs.templateFolders)) {
            setTemplateFolders(prefs.templateFolders.filter((f) => f.scope === "user"));
          }
          if (typeof prefs.activeTemplateId === "string" && prefs.activeTemplateId.trim()) {
            setActiveTemplateId(prefs.activeTemplateId.trim());
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
      version: 2,
      layoutMode,
      selectedKeys: [...selectedKeys],
      slotAssignment,
      seriesVisualMap,
      displayConfig,
      seriesCalcConfigMap,
      derivedCalcs,
      templates: savedTemplates,
      templateFolders,
      activeTemplateId,
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
  }, [
    prefsHydrated,
    layoutMode,
    selectedKeys,
    slotAssignment,
    seriesVisualMap,
    displayConfig,
    seriesCalcConfigMap,
    derivedCalcs,
    savedTemplates,
    templateFolders,
    activeTemplateId,
  ]);

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
      patch: Partial<MacroSeriesVisualConfig>,
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

  const builtInTemplates = useMemo<MacroChartTemplate[]>(() => {
    const base = [
      BUILTIN_DEBT_CAPACITY_TEMPLATE,
      BUILTIN_US_OVERVIEW_TEMPLATE,
      BUILTIN_CHINA_OVERVIEW_TEMPLATE,
      BUILTIN_JAPAN_OVERVIEW_TEMPLATE,
    ];
    return base.map((tpl) => mergeBuiltinTemplateOverride(tpl, builtinTemplateOverrides[tpl.id]));
  }, [builtinTemplateOverrides]);

  const allTemplates = useMemo<MacroChartTemplate[]>(
    () => [...builtInTemplates, ...savedTemplates],
    [builtInTemplates, savedTemplates],
  );

  const activeTemplate = useMemo(
    () => allTemplates.find((t) => t.id === activeTemplateId) ?? null,
    [allTemplates, activeTemplateId],
  );

  const catalogLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    if (!catalogCountries) return m;
    for (const country of catalogCountries) {
      for (const category of country.categories) {
        for (const item of category.items) {
          m.set(item.key, item.label);
        }
      }
    }
    return m;
  }, [catalogCountries]);

  const resolveTemplateConfig = useCallback(
    (tpl: MacroChartTemplate): MacroChartTemplate =>
      resolveBuiltinTemplate(tpl, catalogAllowlist, catalogLabelByKey),
    [catalogAllowlist, catalogLabelByKey],
  );

  const applyTemplate = useCallback(
    (tpl: MacroChartTemplate) => {
      const resolvedTpl = resolveTemplateConfig(tpl);
      const templateKeys = resolvedTpl.selectedKeys;
      setLayoutMode(resolvedTpl.layoutMode);
      setSelectedKeys(new Set(templateKeys));
      setSlotAssignment({ ...resolvedTpl.slotAssignment });
      setSeriesVisualMap({ ...resolvedTpl.seriesVisualMap });
      setDisplayConfig({
        ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
        ...(resolvedTpl.displayConfig ?? {}),
      });
      setSeriesCalcConfigMap({ ...(resolvedTpl.seriesCalcConfigMap ?? {}) });
      setDerivedCalcs([...(resolvedTpl.derivedCalcs ?? [])]);
      setActiveTemplateId(resolvedTpl.id);
    },
    [resolveTemplateConfig],
  );

  /** 应用模板 → 提取数据 → 跳转图表（与顶部「提取数据」一致，但用模板内指标） */
  const applyTemplateAndExtract = useCallback(
    (tpl: MacroChartTemplate) => {
      const resolvedTpl = resolveTemplateConfig(tpl);
      const templateKeys = resolvedTpl.selectedKeys;
      applyTemplate({
        ...resolvedTpl,
        selectedKeys: templateKeys,
      });

      const query = buildExtractQueryFromKeys(templateKeys, catalogAllowlist);
      if (!query) {
        setError(
          tpl.id === BUILTIN_US_OVERVIEW_TEMPLATE.id
            ? "数据库中暂无 US_Overview 数据。"
            : tpl.id === BUILTIN_CHINA_OVERVIEW_TEMPLATE.id
              ? "数据库中暂无 China_Overview 数据。"
              : tpl.id === BUILTIN_JAPAN_OVERVIEW_TEMPLATE.id
                ? "数据库中暂无 Japan_Overview 数据。"
            : "模板内没有可提取的指标",
        );
        setPayload(null);
        setRequestedQuery(null);
        setRequestedMdsInstruments(null);
        setExtractedSet(new Set());
        setMainTab("charts");
        return;
      }

      const extractedKeys = new Set(
        query
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );

      setError(null);
      setRequestedMdsInstruments(null);
      setExtractedSet(extractedKeys);
      setMainTab("charts");

      // 与上次相同 query 时仍触发重新拉取
      setRequestedQuery(null);
      window.setTimeout(() => {
        setRequestedQuery(query);
      }, 0);
    },
    [applyTemplate, catalogAllowlist, resolveTemplateConfig],
  );

  const builtinFolders = useMemo(() => systemBuiltinFolders, [systemBuiltinFolders]);

  const userFolders = useMemo(
    () => foldersForScope(templateFolders, "user"),
    [templateFolders],
  );

  const persistSystemBuiltinTemplateLayout = useCallback(
    async (
      folders: MacroTemplateFolder[],
      folderIds: Record<string, string | null>,
    ) => {
      if (!isAdmin) return;
      const res = await fetch("/api/tools/macro-chart-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemMacroChartPrefs: {
            version: 1,
            builtinTemplateFolders: folders,
            builtinTemplateFolderIds: folderIds,
          },
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `保存系统文件夹失败 (${res.status})`);
      }
      const j = (await res.json()) as {
        builtinTemplateFolders?: MacroTemplateFolder[];
        builtinTemplateFolderIds?: Record<string, string | null>;
      };
      if (Array.isArray(j.builtinTemplateFolders)) {
        setSystemBuiltinFolders(j.builtinTemplateFolders);
      } else {
        setSystemBuiltinFolders(folders);
      }
      if (j.builtinTemplateFolderIds) {
        setBuiltinTemplateFolderIds(j.builtinTemplateFolderIds);
      } else {
        setBuiltinTemplateFolderIds(folderIds);
      }
    },
    [isAdmin],
  );

  const addUserTemplateFolder = useCallback((name: string) => {
    setTemplateFolders((prev) => [...prev, createMacroTemplateFolder(name, "user")]);
  }, []);

  const addBuiltinTemplateFolder = useCallback(
    (name: string) => {
      if (!isAdmin) return;
      const folder = createMacroTemplateFolder(name, "builtin");
      const nextFolders = [...systemBuiltinFolders, folder];
      setSystemBuiltinFolders(nextFolders);
      void persistSystemBuiltinTemplateLayout(nextFolders, builtinTemplateFolderIds).catch(
        (e) => window.alert(e instanceof Error ? e.message : "保存失败"),
      );
    },
    [builtinTemplateFolderIds, isAdmin, persistSystemBuiltinTemplateLayout, systemBuiltinFolders],
  );

  const renameUserTemplateFolder = useCallback((folderId: string, name: string) => {
    setTemplateFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name } : f)));
  }, []);

  const renameBuiltinTemplateFolder = useCallback(
    (folderId: string, name: string) => {
      if (!isAdmin) return;
      const nextFolders = systemBuiltinFolders.map((f) =>
        f.id === folderId ? { ...f, name } : f,
      );
      setSystemBuiltinFolders(nextFolders);
      void persistSystemBuiltinTemplateLayout(nextFolders, builtinTemplateFolderIds).catch(
        (e) => window.alert(e instanceof Error ? e.message : "保存失败"),
      );
    },
    [builtinTemplateFolderIds, isAdmin, persistSystemBuiltinTemplateLayout, systemBuiltinFolders],
  );

  const deleteUserTemplateFolder = useCallback((folderId: string) => {
    setTemplateFolders((prev) => prev.filter((f) => f.id !== folderId));
    setSavedTemplates((prev) =>
      prev.map((t) => (t.folderId === folderId ? { ...t, folderId: null } : t)),
    );
    setNewTemplateFolderId((prev) => (prev === folderId ? "" : prev));
  }, []);

  const deleteBuiltinTemplateFolder = useCallback(
    (folderId: string) => {
      if (!isAdmin) return;
      const nextFolders = systemBuiltinFolders.filter((f) => f.id !== folderId);
      const nextIds: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(builtinTemplateFolderIds)) {
        nextIds[k] = v === folderId ? null : v;
      }
      setSystemBuiltinFolders(nextFolders);
      setBuiltinTemplateFolderIds(nextIds);
      void persistSystemBuiltinTemplateLayout(nextFolders, nextIds).catch((e) =>
        window.alert(e instanceof Error ? e.message : "保存失败"),
      );
    },
    [builtinTemplateFolderIds, isAdmin, persistSystemBuiltinTemplateLayout, systemBuiltinFolders],
  );

  const assignBuiltinTemplateFolder = useCallback(
    (templateId: string, folderId: string | null) => {
      if (!isAdmin) return;
      const validFolderId =
        folderId && systemBuiltinFolders.some((f) => f.id === folderId) ? folderId : null;
      const nextIds = { ...builtinTemplateFolderIds, [templateId]: validFolderId };
      setBuiltinTemplateFolderIds(nextIds);
      void persistSystemBuiltinTemplateLayout(systemBuiltinFolders, nextIds).catch((e) =>
        window.alert(e instanceof Error ? e.message : "保存失败"),
      );
    },
    [
      builtinTemplateFolderIds,
      isAdmin,
      persistSystemBuiltinTemplateLayout,
      systemBuiltinFolders,
    ],
  );

  const assignUserTemplateFolder = useCallback(
    (templateId: string, folderId: string | null) => {
      setSavedTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, folderId } : t)),
      );
    },
    [],
  );

  const persistBuiltinTemplateOverrides = useCallback(
    async (next: Record<string, BuiltinTemplateOverride>) => {
      const res = await fetch("/api/tools/macro-chart-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ builtinTemplateOverrides: next }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `保存失败 (${res.status})`);
      }
      const j = (await res.json()) as {
        builtinTemplateOverrides?: Record<string, BuiltinTemplateOverride>;
      };
      if (j.builtinTemplateOverrides) {
        setBuiltinTemplateOverrides(j.builtinTemplateOverrides);
      } else {
        setBuiltinTemplateOverrides(next);
      }
    },
    [],
  );

  const saveBuiltinTemplateOverride = useCallback(
    async (nameInput?: string) => {
      if (!isAdmin || !activeTemplate?.builtIn) return;
      const trimmed = (nameInput ?? activeTemplate.name).trim();
      if (!trimmed) return;
      const override: BuiltinTemplateOverride = {
        name: trimmed,
        description: activeTemplate.description,
        selectedKeys: [...selectedKeys],
        layoutMode,
        slotAssignment: { ...slotAssignment },
        seriesVisualMap: { ...seriesVisualMap },
        displayConfig: { ...displayConfig },
        seriesCalcConfigMap: { ...seriesCalcConfigMap },
        derivedCalcs: [...derivedCalcs],
        updatedAtIso: new Date().toISOString(),
      };
      const next = { ...builtinTemplateOverrides, [activeTemplate.id]: override };
      await persistBuiltinTemplateOverrides(next);
      setActiveTemplateId(activeTemplate.id);
      setMainTab("templates");
    },
    [
      activeTemplate,
      builtinTemplateOverrides,
      derivedCalcs,
      displayConfig,
      isAdmin,
      layoutMode,
      persistBuiltinTemplateOverrides,
      selectedKeys,
      seriesCalcConfigMap,
      seriesVisualMap,
      slotAssignment,
    ],
  );

  const saveCurrentAsTemplate = useCallback((nameInput?: string, folderId?: string | null) => {
    const trimmed = (nameInput ?? window.prompt("模板名称", activeTemplate?.name ?? "") ?? "").trim();
    if (!trimmed) return;
    const id = `tpl-${Date.now().toString(36)}`;
    const validFolderId =
      folderId && userFolders.some((f) => f.id === folderId) ? folderId : null;
    const next: MacroChartTemplate = {
      id,
      name: trimmed,
      selectedKeys: [...selectedKeys],
      layoutMode,
      slotAssignment: { ...slotAssignment },
      seriesVisualMap: { ...seriesVisualMap },
      displayConfig: { ...displayConfig },
      seriesCalcConfigMap: { ...seriesCalcConfigMap },
      derivedCalcs: [...derivedCalcs],
      createdAtIso: new Date().toISOString(),
      folderId: validFolderId,
    };
    setSavedTemplates((prev) => [next, ...prev].slice(0, 30));
    setActiveTemplateId(id);
    setNewTemplateName("");
  }, [
    activeTemplate?.name,
    derivedCalcs,
    displayConfig,
    layoutMode,
    selectedKeys,
    seriesCalcConfigMap,
    seriesVisualMap,
    slotAssignment,
    userFolders,
  ]);

  const createNewTemplateDraft = useCallback(() => {
    if (!window.confirm("新建模板会清空当前模板配置，继续？")) return;
    setActiveTemplateId(null);
    setNewTemplateName("");
    setLayoutMode(1);
    setSelectedKeys(new Set());
    setSlotAssignment({});
    setSeriesVisualMap({});
    setDisplayConfig({ ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG });
    setSeriesCalcConfigMap({});
    setDerivedCalcs([]);
    setCalcTargetKey("");
    setCalcDraft(DEFAULT_SERIES_CALC_CONFIG);
    setDerivedLeftKey("");
    setDerivedRightKey("");
    setDerivedOp("ratio");
    setDerivedName("");
    setExtractedSet(new Set());
    setPayload(null);
    setError(null);
    setRequestedQuery(null);
    setRequestedMdsInstruments(null);
    setMainTab("selected");
  }, []);

  const quickSaveTemplateToMine = useCallback(() => {
    if (isAdmin && activeTemplate?.builtIn) {
      setTemplateSaveMode("builtin");
      setTemplateNameDraft(activeTemplate.name);
    } else {
      setTemplateSaveMode("user");
      const defaultName =
        newTemplateName.trim() ||
        (!activeTemplate?.builtIn && activeTemplate?.name ? activeTemplate.name : "我的新模板");
      setTemplateNameDraft(defaultName);
    }
    setTemplateNameDialogOpen(true);
  }, [activeTemplate?.builtIn, activeTemplate?.name, isAdmin, newTemplateName]);

  const confirmSaveTemplateByDialog = useCallback(async () => {
    const trimmed = templateNameDraft.trim();
    if (!trimmed) return;
    if (templateSaveMode === "builtin" && isAdmin && activeTemplate?.builtIn) {
      try {
        await saveBuiltinTemplateOverride(trimmed);
        setTemplateNameDialogOpen(false);
        setTemplateNameDraft("");
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "保存系统模板失败");
      }
      return;
    }
    saveCurrentAsTemplate(
      trimmed,
      newTemplateFolderId.trim() ? newTemplateFolderId.trim() : null,
    );
    setTemplateNameDialogOpen(false);
    setTemplateNameDraft("");
    setMainTab("templates");
  }, [
    activeTemplate?.builtIn,
    isAdmin,
    newTemplateFolderId,
    saveBuiltinTemplateOverride,
    saveCurrentAsTemplate,
    templateNameDraft,
    templateSaveMode,
  ]);

  const cancelSaveTemplateDialog = useCallback(() => {
    setTemplateNameDialogOpen(false);
    setTemplateNameDraft("");
  }, []);

  const deleteActiveTemplate = useCallback(() => {
    if (!activeTemplate || activeTemplate.builtIn) return;
    if (!window.confirm(`删除模板「${activeTemplate.name}」？`)) return;
    setSavedTemplates((prev) => prev.filter((x) => x.id !== activeTemplate.id));
    setActiveTemplateId(null);
  }, [activeTemplate]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/data/fmp-catalog")
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as {
          countries?: UnifiedCatalogCountry[];
          allowlistKeys?: string[];
          error?: string;
        };
        if (!r.ok) throw new Error(j.error ?? `${r.status}`);
        return j;
      })
      .then((j) => {
        if (cancelled) return;
        if (Array.isArray(j.countries) && Array.isArray(j.allowlistKeys)) {
          setCatalogCountries(j.countries);
          setCatalogAllowlist(new Set(j.allowlistKeys));
          setCatalogLoadError(null);
        } else {
          throw new Error("目录响应格式异常");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setCatalogCountries(null);
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

  const selectedKeyOptions = useMemo(
    () =>
      [...selectedKeys].sort((a, b) => a.localeCompare(b)).map((key) => ({
        key,
        label: catalogLabelByKey.get(key) ?? unifiedSeriesDisplayName(key),
      })),
    [catalogLabelByKey, selectedKeys],
  );

  useEffect(() => {
    if (selectedKeyOptions.length === 0) {
      setCalcTargetKey("");
      setDerivedLeftKey("");
      setDerivedRightKey("");
      return;
    }
    if (!calcTargetKey || !selectedKeys.has(calcTargetKey)) {
      setCalcTargetKey(selectedKeyOptions[0]!.key);
    }
    if (!derivedLeftKey || !selectedKeys.has(derivedLeftKey)) {
      setDerivedLeftKey(selectedKeyOptions[0]!.key);
    }
    if (!derivedRightKey || !selectedKeys.has(derivedRightKey)) {
      setDerivedRightKey(selectedKeyOptions[Math.min(1, selectedKeyOptions.length - 1)]!.key);
    }
  }, [calcTargetKey, derivedLeftKey, derivedRightKey, selectedKeyOptions, selectedKeys]);

  useEffect(() => {
    if (!calcTargetKey) return;
    setCalcDraft({
      ...DEFAULT_SERIES_CALC_CONFIG,
      ...(seriesCalcConfigMap[calcTargetKey] ?? {}),
    });
  }, [calcTargetKey, seriesCalcConfigMap]);

  const rawPayload = payload;

  const displayPayload = useMemo<MacroPayload | null>(() => {
    if (!rawPayload) return null;

    const work: SeriesWorking[] = rawPayload.series
      .map((s) => {
        const key = s.key?.trim();
        if (!key) return null;
        const cfg = { ...DEFAULT_SERIES_CALC_CONFIG, ...(seriesCalcConfigMap[key] ?? {}) };
        const scaled = s.data.map((v) => applyUnitAdjust(v, cfg.unit));
        const transformed = applySeriesOp(scaled, cfg.op);
        const sampled = resampleSeries(
          rawPayload.categories,
          transformed,
          cfg.frequency,
          cfg.resampleMethod,
        );
        const label = catalogLabelByKey.get(key) ?? s.name;
        const suffix: string[] = [];
        if (cfg.op !== "none") {
          suffix.push(
            cfg.op === "pctChange"
              ? "环比%"
              : cfg.op === "yoy"
                ? "同比%"
                : cfg.op === "diff"
                  ? "差分"
                  : "累计",
          );
        }
        if (cfg.frequency !== "keep") {
          const freqLabel =
            cfg.frequency === "month" ? "月频" : cfg.frequency === "quarter" ? "季频" : "年频";
          const methodLabel =
            cfg.resampleMethod === "avg"
              ? "平均"
              : cfg.resampleMethod === "start"
                ? "期初"
                : "期末";
          suffix.push(`${freqLabel}-${methodLabel}`);
        }
        if (cfg.unit !== "keep") {
          suffix.push(cfg.unit === "x0.01" ? "x0.01" : "x100");
        }
        return {
          key,
          name: suffix.length > 0 ? `${label}（${suffix.join(" · ")}）` : label,
          categories: sampled.categories,
          data: sampled.data,
        } as SeriesWorking;
      })
      .filter((x): x is SeriesWorking => Boolean(x));

    if (work.length === 0) {
      return { ...rawPayload, categories: [], series: [] };
    }

    const byKey = new Map(work.map((x) => [x.key, x]));
    const derivedSeries: SeriesWorking[] = [];
    for (const calc of derivedCalcs) {
      const left = byKey.get(calc.leftKey);
      const right = byKey.get(calc.rightKey);
      if (!left || !right) continue;
      const key = `calc:${calc.id}`;
      derivedSeries.push(deriveSeries(left, right, calc.op, calc.name, key));
    }

    const allSeries = [...work, ...derivedSeries];
    const allCategories = sortLabelsChrono(
      [...new Set(allSeries.flatMap((s) => s.categories))].filter(Boolean),
    );
    const finalSeries = allSeries.map((s) => {
      const m = new Map(s.categories.map((c, i) => [c, s.data[i] ?? null]));
      return {
        key: s.key,
        name: s.name,
        data: allCategories.map((c) => m.get(c) ?? null),
      };
    });
    return {
      ...rawPayload,
      categories: allCategories,
      series: finalSeries,
    };
  }, [catalogLabelByKey, derivedCalcs, rawPayload, seriesCalcConfigMap]);

  const extractedAssignment = useMemo(() => {
    const out: MacroSlotAssignment = {};
    const keysFromDisplay =
      displayPayload?.series.map((s) => s.key).filter(Boolean) as string[] | undefined;
    const base = keysFromDisplay && keysFromDisplay.length > 0 ? keysFromDisplay : [...extractedSet];
    for (const key of base) {
      out[key] = slotAssignment[key] ?? (key.startsWith("calc:") ? 0 : null);
    }
    return out;
  }, [displayPayload, extractedSet, slotAssignment]);

  const chartPropertyKeys = useMemo(() => {
    const out = new Set<string>(selectedKeys);
    if (displayPayload?.series) {
      for (const s of displayPayload.series) {
        if (s.key) out.add(s.key);
      }
    }
    return out;
  }, [displayPayload, selectedKeys]);

  const resolvedAssignment = useMemo(() => {
    const cap = Math.max(0, layoutMode - 1);
    const out: MacroSlotAssignment = {};
    for (const k of chartPropertyKeys) {
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
  }, [chartPropertyKeys, layoutMode, slotAssignment]);

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

  function locateIndicatorInSidebar(key: string) {
    if (key.startsWith("calc:")) return;
    setSidebarLocateKey(key);
  }

  function removeSelectedKey(key: string) {
    const next = new Set(selectedKeys);
    next.delete(key);
    onSelectedKeysChange(next);
    setSeriesCalcConfigMap((prev) => {
      const out = { ...prev };
      delete out[key];
      return out;
    });
    setDerivedCalcs((prev) => prev.filter((x) => x.leftKey !== key && x.rightKey !== key));
  }

  function assignSlot(key: string, slotIndex: number | null) {
    setSlotAssignment((prev) => ({ ...prev, [key]: slotIndex }));
  }

  function applyCalcConfigToKey() {
    const key = calcTargetKey.trim();
    if (!key) return;
    setSeriesCalcConfigMap((prev) => ({
      ...prev,
      [key]: { ...DEFAULT_SERIES_CALC_CONFIG, ...calcDraft },
    }));
  }

  function resetCalcConfigForKey(key: string) {
    setSeriesCalcConfigMap((prev) => {
      const out = { ...prev };
      delete out[key];
      return out;
    });
  }

  function addDerivedCalc() {
    const left = derivedLeftKey.trim();
    const right = derivedRightKey.trim();
    if (!left || !right || left === right) return;
    const leftLabel = selectedKeyOptions.find((x) => x.key === left)?.label ?? left;
    const rightLabel = selectedKeyOptions.find((x) => x.key === right)?.label ?? right;
    const opLabel =
      derivedOp === "add"
        ? "+"
        : derivedOp === "sub"
          ? "-"
          : derivedOp === "mul"
            ? "×"
            : derivedOp === "div"
              ? "÷"
              : derivedOp === "ratio"
                ? "比值"
                : "差值";
    const name =
      derivedName.trim() ||
      (derivedOp === "ratio"
        ? `${leftLabel}/${rightLabel}`
        : derivedOp === "spread"
          ? `${leftLabel}-${rightLabel}`
          : `${leftLabel} ${opLabel} ${rightLabel}`);
    const id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setDerivedCalcs((prev) => [{ id, leftKey: left, rightKey: right, op: derivedOp, name }, ...prev].slice(0, 60));
    setDerivedName("");
  }

  function removeDerivedCalc(id: string) {
    setDerivedCalcs((prev) => prev.filter((x) => x.id !== id));
    const key = `calc:${id}`;
    setSlotAssignment((prev) => {
      if (!(key in prev)) return prev;
      const out = { ...prev };
      delete out[key];
      return out;
    });
    setSeriesVisualMap((prev) => {
      if (!(key in prev)) return prev;
      const out = { ...prev };
      delete out[key];
      return out;
    });
  }

  function renameDerivedCalc(id: string) {
    const current = derivedCalcs.find((x) => x.id === id);
    if (!current) return;
    const next = window.prompt("运算指标名称", current.name)?.trim();
    if (!next) return;
    setDerivedCalcs((prev) => prev.map((x) => (x.id === id ? { ...x, name: next } : x)));
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

  useEffect(() => {
    const mdsCodes = [...selectedKeys]
      .filter((k) => k.startsWith("mds:"))
      .map((k) => k.slice(4))
      .filter(Boolean);
    if (mdsCodes.length === 0) {
      setMdsAttrsByKey(new Map());
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      kind: "MACRO_SERIES",
      limit: String(Math.max(100, mdsCodes.length + 20)),
      codes: mdsCodes.join(","),
    });
    fetch(`/api/data/instruments?${params.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return { items: [] as Array<Record<string, unknown>> };
        const j = (await r.json().catch(() => ({}))) as {
          items?: Array<Record<string, unknown>>;
        };
        return { items: Array.isArray(j.items) ? j.items : [] };
      })
      .then(({ items }) => {
        if (cancelled) return;
        const next = new Map<string, MdsIndicatorAttrs>();
        for (const item of items) {
          const code = typeof item.code === "string" ? item.code : "";
          if (!code) continue;
          const metadata =
            item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
              ? (item.metadata as Record<string, unknown>)
              : {};
          const countryCode =
            typeof metadata.countryCode === "string" ? metadata.countryCode : undefined;
          const countryNameZh =
            typeof metadata.countryNameZh === "string" ? metadata.countryNameZh.trim() : "";
          const source =
            (typeof metadata.source === "string" && metadata.source.trim()) ||
            (typeof metadata.sourceTag === "string" && metadata.sourceTag.trim()) ||
            "-";
          const updatedAt =
            typeof metadata.dataLastObsDateIso === "string"
              ? metadata.dataLastObsDateIso
              : typeof metadata.workbookUpdatedAtIso === "string"
                ? metadata.workbookUpdatedAtIso
                : typeof item.updatedAt === "string"
                  ? item.updatedAt
                  : null;
          const unit =
            typeof item.unit === "string" && item.unit.trim()
              ? item.unit.trim()
              : typeof metadata.unit === "string" && metadata.unit.trim()
                ? metadata.unit.trim()
                : "-";
          const frequency =
            typeof item.freqLabel === "string" && item.freqLabel.trim()
              ? item.freqLabel.trim()
              : typeof metadata.freqLabel === "string" && metadata.freqLabel.trim()
                ? metadata.freqLabel.trim()
                : "-";
          next.set(`mds:${code}`, {
            country: countryNameZh || countryNameByCode(countryCode),
            unit,
            frequency,
            source,
            updatedAt: fmtIsoDate(updatedAt),
            range: mdsRangeTextFromMetadata(metadata),
          });
        }
        setMdsAttrsByKey(next);
      })
      .catch(() => {
        if (!cancelled) setMdsAttrsByKey(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [selectedKeys]);

  const catalogMetaByKey = useMemo(() => {
    const m = new Map<string, { frequency: string }>();
    if (!catalogCountries) return m;
    for (const country of catalogCountries) {
      for (const category of country.categories) {
        for (const item of category.items) {
          m.set(item.key, { frequency: item.frequency });
        }
      }
    }
    return m;
  }, [catalogCountries]);

  const extractedMetaByKey = useMemo(() => {
    const m = new Map<string, { frequency: string; range: string }>();
    if (!displayPayload) return m;
    for (const s of displayPayload.series) {
      if (!s.key) continue;
      const validLabels = displayPayload.categories.filter((_, idx) => {
        const v = s.data[idx];
        return v !== null && Number.isFinite(v);
      });
      m.set(s.key, {
        frequency: inferFrequencyFromLabels(validLabels),
        range: seriesRange(displayPayload.categories, s.data),
      });
    }
    return m;
  }, [displayPayload]);

  const selectedRows = useMemo(() => {
    return [...selectedKeys]
      .sort((a, b) => a.localeCompare(b))
      .map((key) => {
        const mdsAttrs = mdsAttrsByKey.get(key);
        const extracted = extractedMetaByKey.get(key);
        return {
          key,
          label: catalogLabelByKey.get(key) ?? unifiedSeriesDisplayName(key),
          frequency: extracted?.frequency ?? mdsAttrs?.frequency ?? catalogMetaByKey.get(key)?.frequency ?? "-",
          range: extracted?.range ?? mdsAttrs?.range ?? "-",
          unit: mdsAttrs?.unit ?? "-",
          country: mdsAttrs?.country ?? "-",
          updatedAt: mdsAttrs?.updatedAt ?? "-",
          source: mdsAttrs?.source ?? "-",
        };
      });
  }, [selectedKeys, catalogLabelByKey, catalogMetaByKey, extractedMetaByKey, mdsAttrsByKey]);

  const derivedKeySet = useMemo(
    () => new Set(derivedCalcs.map((x) => `calc:${x.id}`)),
    [derivedCalcs],
  );

  useEffect(() => {
    setSlotAssignment((prev) => {
      let changed = false;
      const out: MacroSlotAssignment = {};
      for (const [k, v] of Object.entries(prev)) {
        if (k.startsWith("calc:") && !derivedKeySet.has(k)) {
          changed = true;
          continue;
        }
        out[k] = v;
      }
      return changed ? out : prev;
    });
    setSeriesVisualMap((prev) => {
      let changed = false;
      const out: MacroSeriesVisualConfigMap = {};
      for (const [k, v] of Object.entries(prev)) {
        if (k.startsWith("calc:") && !derivedKeySet.has(k)) {
          changed = true;
          continue;
        }
        out[k] = v;
      }
      return changed ? out : prev;
    });
  }, [derivedKeySet]);

  const extractedKeyOrder = useMemo(() => {
    if (displayPayload?.series.length) {
      return displayPayload.series.map((s) => s.key).filter(Boolean) as string[];
    }
    return requestedQuery
      ? requestedQuery
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  }, [displayPayload, requestedQuery]);

  const seriesDisplayLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    if (!displayPayload?.series) return m;
    for (const s of displayPayload.series) {
      if (s.key) m.set(s.key, s.name);
    }
    return m;
  }, [displayPayload]);

  const chartSettingsLabelByKey = useMemo(() => {
    const m = new Map<string, string>(catalogLabelByKey);
    for (const [k, v] of seriesDisplayLabelByKey) {
      m.set(k, v);
    }
    return m;
  }, [catalogLabelByKey, seriesDisplayLabelByKey]);

  const tableColumns = useMemo(() => {
    const order = extractedKeyOrder.length > 0 ? extractedKeyOrder : [...extractedSet];
    return order.map((key) => ({
      key,
      label: seriesDisplayLabelByKey.get(key) ?? unifiedSeriesDisplayName(key),
    }));
  }, [extractedKeyOrder, extractedSet, seriesDisplayLabelByKey]);

  const tableValueByKey = useMemo(() => {
    const m = new Map<string, (number | null)[]>();
    if (!displayPayload) return m;
    for (const s of displayPayload.series) {
      if (s.key) m.set(s.key, s.data);
    }
    return m;
  }, [displayPayload]);

  const sortedTableRowIndices = useMemo(() => {
    if (!displayPayload) return [];
    const categories = displayPayload.categories;
    const indices = categories.map((_, i) => i);
    indices.sort((ia, ib) => {
      const cmp = compareLabelsChrono(categories[ia]!, categories[ib]!);
      return tableTimeSort === "asc" ? cmp : -cmp;
    });
    return indices;
  }, [displayPayload, tableTimeSort]);

  const tableColumnWidths = useMemo(() => {
    if (!displayPayload) {
      return { time: 88, columns: new Map<string, number>() };
    }

    const timeHeaderUnits = estimateTableTextWidthUnits("时间 ↓");
    let timeDataUnits = 0;
    for (const cat of displayPayload.categories) {
      timeDataUnits = Math.max(timeDataUnits, estimateTableTextWidthUnits(cat));
    }
    const time = tableColumnWidthPx(Math.max(timeHeaderUnits, timeDataUnits), 80, 120);

    const columns = new Map<string, number>();
    for (const col of tableColumns) {
      let maxUnits = estimateTableTextWidthUnits(col.label);
      const values = tableValueByKey.get(col.key);
      if (values) {
        for (const v of values) {
          const text = tableCellDisplayText(v);
          if (text) {
            maxUnits = Math.max(maxUnits, estimateTableTextWidthUnits(text));
          }
        }
      }
      columns.set(col.key, tableColumnWidthPx(maxUnits));
    }

    return { time, columns };
  }, [displayPayload, tableColumns, tableValueByKey]);

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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 lg:min-h-full">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800/80 px-4 pb-1.5 pt-1 lg:px-6">
        <button
          type="button"
          onClick={handleExtractData}
          disabled={loading || selectedKeys.size === 0}
          className="rounded-md border border-emerald-700/80 bg-emerald-950/45 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          提取数据
        </button>
        <div
          className="flex shrink-0 items-center gap-1 rounded-md border border-slate-700/90 bg-slate-950/50 p-0.5"
          role="tablist"
          aria-label="功能模块"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === "selected"}
            onClick={() => setMainTab("selected")}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold tracking-wide transition ${
              mainTab === "selected"
                ? "border-emerald-600 bg-emerald-950/50 text-emerald-100"
                : "border-transparent bg-transparent text-slate-200 hover:border-slate-600 hover:bg-slate-900/40"
            }`}
          >
            已选指标
          </button>
          <span className="h-5 w-px shrink-0 bg-slate-700/90" aria-hidden />
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === "charts"}
            onClick={() => setMainTab("charts")}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold tracking-wide transition ${
              mainTab === "charts"
                ? "border-emerald-600 bg-emerald-950/50 text-emerald-100"
                : "border-transparent bg-transparent text-slate-200 hover:border-slate-600 hover:bg-slate-900/40"
            }`}
          >
            图表
          </button>
          <span className="h-5 w-px shrink-0 bg-slate-700/90" aria-hidden />
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === "templates"}
            onClick={() => setMainTab("templates")}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold tracking-wide transition ${
              mainTab === "templates"
                ? "border-emerald-600 bg-emerald-950/50 text-emerald-100"
                : "border-transparent bg-transparent text-slate-200 hover:border-slate-600 hover:bg-slate-900/40"
            }`}
          >
            模板库
          </button>
          <span className="h-5 w-px shrink-0 bg-slate-700/90" aria-hidden />
          <button
            type="button"
            onClick={createNewTemplateDraft}
            className="rounded-md border border-transparent px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-900/60"
            title="清空当前配置并新建模板草稿"
          >
            新建模板
          </button>
          <button
            type="button"
            onClick={quickSaveTemplateToMine}
            className="rounded-md border border-transparent px-2.5 py-1.5 text-xs font-medium text-cyan-100 transition hover:border-cyan-700/60 hover:bg-cyan-950/25"
            title={
              isAdmin && activeTemplate?.builtIn
                ? "将当前配置更新保存到系统模板"
                : "命名后保存到我的模板"
            }
          >
            {isAdmin && activeTemplate?.builtIn ? "更新系统模板" : "保存模板"}
          </button>
        </div>
        {mainTab === "charts" ? (
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
            <MacroChartDrawingToolbar
              tool={macroDrawTool}
              onToolChange={setMacroDrawTool}
              onClear={clearMacroDrawings}
            />
            <label className="flex shrink-0 flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              <span className="shrink-0">图表布局</span>
              <select
                value={layoutMode}
                onChange={(e) =>
                  setLayoutMode(Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6)
                }
                className="min-w-[10rem] rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600/40"
              >
                <option value={1}>单图</option>
                <option value={2}>2 图（上下）</option>
                <option value={3}>3 图（纵向）</option>
                <option value={4}>4 图（田字）</option>
                <option value={5}>5 图（2x3）</option>
                <option value={6}>6 图（2x3）</option>
              </select>
            </label>
            <div className="group relative shrink-0">
              <label
                className="flex cursor-pointer items-center gap-1 rounded-md border border-slate-700 bg-slate-950/45 px-2 py-1.5 text-xs text-slate-300 hover:border-slate-500"
              >
                <input
                  type="checkbox"
                  checked={pageSyncEnabled}
                  onChange={(e) => setPageSyncEnabled(e.target.checked)}
                  className="h-3 w-3 shrink-0 rounded border-slate-600"
                  aria-label="页面同步"
                  aria-describedby="macro-page-sync-tip"
                />
                页面同步
              </label>
              <div
                id="macro-page-sync-tip"
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 hidden w-max max-w-[14rem] rounded-md border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-[11px] leading-snug text-slate-200 shadow-lg group-hover:block"
              >
                多显示器多窗口时，数据同步展示。
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-slate-800/80 lg:flex-row lg:items-stretch lg:border-t-0">
        <aside className="flex max-h-[40vh] min-h-0 shrink-0 flex-col overflow-hidden border-slate-800 bg-slate-950/70 lg:max-h-none lg:min-h-0 lg:w-[min(100%,320px)] lg:border-r lg:border-t-0 xl:w-[340px]">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 lg:px-4 lg:py-4">
            <UnifiedMacroSidebar
              selectedKeys={selectedKeys}
              onChange={onSelectedKeysChange}
              catalogCountries={catalogCountries}
              catalogError={catalogLoadError}
              locateKey={sidebarLocateKey}
              onLocateKeyHandled={() => setSidebarLocateKey(null)}
            />
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-950/40 px-3 py-3 lg:min-h-0 lg:px-6 lg:py-4">
          {mainTab === "selected" ? (
            <section className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
              <div className="shrink-0 border-b border-slate-800/80 pb-2">
                <div className="rounded-md border border-slate-800/90 bg-slate-950/50 px-2 py-1.5">
                  <div className="flex flex-wrap items-end gap-x-2 gap-y-1 text-[11px]">
                    <span className="shrink-0 self-center text-[10px] font-medium text-slate-500">
                      单指标
                    </span>
                    <label className="text-slate-500">
                      指标
                      <select
                        value={calcTargetKey}
                        onChange={(e) => setCalcTargetKey(e.target.value)}
                        className="ml-1 max-w-[9rem] rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-100"
                      >
                        {selectedKeyOptions.map((x) => (
                          <option key={x.key} value={x.key}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-slate-500">
                      运算
                      <select
                        value={calcDraft.op}
                        onChange={(e) =>
                          setCalcDraft((prev) => ({ ...prev, op: e.target.value as MacroSeriesCalcOp }))
                        }
                        className="ml-1 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-100"
                      >
                        <option value="none">原始</option>
                        <option value="pctChange">环比%</option>
                        <option value="yoy">同比%</option>
                        <option value="diff">差分</option>
                        <option value="cumsum">累计</option>
                      </select>
                    </label>
                    <label className="text-slate-500">
                      频率
                      <select
                        value={calcDraft.frequency}
                        onChange={(e) =>
                          setCalcDraft((prev) => ({
                            ...prev,
                            frequency: e.target.value as MacroFrequencyAdjust,
                          }))
                        }
                        className="ml-1 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-100"
                      >
                        <option value="keep">原始</option>
                        <option value="month">月</option>
                        <option value="quarter">季</option>
                        <option value="year">年</option>
                      </select>
                    </label>
                    <label className="text-slate-500">
                      变频
                      <select
                        value={calcDraft.resampleMethod}
                        onChange={(e) =>
                          setCalcDraft((prev) => ({
                            ...prev,
                            resampleMethod: e.target.value as MacroResampleMethod,
                          }))
                        }
                        className="ml-1 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-100"
                      >
                        <option value="avg">平均</option>
                        <option value="start">期初</option>
                        <option value="end">期末</option>
                      </select>
                    </label>
                    <label className="text-slate-500">
                      单位
                      <select
                        value={calcDraft.unit}
                        onChange={(e) =>
                          setCalcDraft((prev) => ({ ...prev, unit: e.target.value as MacroUnitAdjust }))
                        }
                        className="ml-1 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-100"
                      >
                        <option value="keep">原始</option>
                        <option value="x0.01">x0.01</option>
                        <option value="x100">x100</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={applyCalcConfigToKey}
                      className="rounded border border-cyan-700/80 bg-cyan-950/35 px-2 py-0.5 text-[11px] text-cyan-100 hover:border-cyan-500"
                    >
                      应用
                    </button>
                    <button
                      type="button"
                      onClick={() => calcTargetKey && resetCalcConfigForKey(calcTargetKey)}
                      className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:border-slate-500"
                    >
                      重置
                    </button>

                    <span
                      className="mx-0.5 hidden h-6 w-px shrink-0 self-center bg-slate-700/80 sm:inline-block"
                      aria-hidden
                    />

                    <span className="shrink-0 self-center text-[10px] font-medium text-slate-500">
                      指标间
                    </span>
                    <label className="text-slate-500">
                      左
                      <select
                        value={derivedLeftKey}
                        onChange={(e) => setDerivedLeftKey(e.target.value)}
                        className="ml-1 max-w-[9rem] rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-100"
                      >
                        {selectedKeyOptions.map((x) => (
                          <option key={`l-${x.key}`} value={x.key}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-slate-500">
                      运算
                      <select
                        value={derivedOp}
                        onChange={(e) => setDerivedOp(e.target.value as MacroDerivedCalcOp)}
                        className="ml-1 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-100"
                      >
                        <option value="ratio">A/B</option>
                        <option value="spread">A-B</option>
                        <option value="add">A+B</option>
                        <option value="sub">A-B</option>
                        <option value="mul">A×B</option>
                        <option value="div">A÷B</option>
                      </select>
                    </label>
                    <label className="text-slate-500">
                      右
                      <select
                        value={derivedRightKey}
                        onChange={(e) => setDerivedRightKey(e.target.value)}
                        className="ml-1 max-w-[9rem] rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-100"
                      >
                        {selectedKeyOptions.map((x) => (
                          <option key={`r-${x.key}`} value={x.key}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-slate-500">
                      名称
                      <input
                        type="text"
                        value={derivedName}
                        onChange={(e) => setDerivedName(e.target.value)}
                        placeholder="自动"
                        className="ml-1 w-24 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-100 placeholder:text-slate-600"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={addDerivedCalc}
                      className="rounded border border-emerald-700/80 bg-emerald-950/35 px-2 py-0.5 text-[11px] text-emerald-100 hover:border-emerald-500"
                    >
                      添加
                    </button>
                  </div>
                  {derivedCalcs.length > 0 ? (
                    <ul className="mt-1 flex flex-wrap gap-1 border-t border-slate-800/70 pt-1">
                      {derivedCalcs.map((x) => (
                        <li
                          key={x.id}
                          className="flex items-center gap-1 rounded border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-300"
                        >
                          <span>{x.name}</span>
                          <button
                            type="button"
                            onClick={() => renameDerivedCalc(x.id)}
                            className="rounded border border-slate-700 px-1 text-[10px] text-slate-300 hover:border-slate-500"
                          >
                            改名
                          </button>
                          <button
                            type="button"
                            onClick={() => removeDerivedCalc(x.id)}
                            className="rounded border border-rose-900/70 px-1 text-[10px] text-rose-200/90 hover:border-rose-700"
                          >
                            删
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-0 flex-[1_1_50%] flex-col border-b border-slate-800/80">
                <div className="shrink-0 border-b border-slate-800/60 px-2 py-1 text-[11px] font-medium text-slate-500">
                  已选指标
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-t-lg border border-b-0 border-slate-800/90 bg-slate-950/60">
                  {selectedRows.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-slate-500">暂无已选指标。</p>
                  ) : (
                    <ul className="divide-y divide-slate-800/80">
                      {selectedRows.map(
                        ({ key, label, frequency, range, unit, country, updatedAt, source }) => {
                        const rangeText = range !== "-" ? range : "—";
                        return (
                        <li
                          key={key}
                          title={`${key}\n国家：${country}\n单位：${unit}\n更新时间：${updatedAt}\n频率：${frequency}\n来源：${source}\n范围：${rangeText}\n双击定位到左侧指标树`}
                          className="flex cursor-pointer items-center gap-2 px-2 py-1 hover:bg-slate-900/50"
                          onDoubleClick={(e) => {
                            if ((e.target as HTMLElement).closest("button, a")) return;
                            locateIndicatorInSidebar(key);
                          }}
                        >
                          <span className="min-w-0 max-w-[42%] shrink truncate text-xs text-slate-300">
                            {label}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-right text-[10px] leading-tight text-slate-500 tabular-nums">
                            <span className="text-slate-600">国家</span>：{country}
                            <span className="mx-1.5 text-slate-700">|</span>
                            <span className="text-slate-600">单位</span>：{unit}
                            <span className="mx-1.5 text-slate-700">|</span>
                            <span className="text-slate-600">更新时间</span>：{updatedAt}
                            <span className="mx-1.5 text-slate-700">|</span>
                            <span className="text-slate-600">频率</span>：{frequency}
                            <span className="mx-1.5 text-slate-700">|</span>
                            <span className="text-slate-600">来源</span>：{source}
                            <span className="mx-1.5 text-slate-700">|</span>
                            <span className="text-slate-600">范围</span>：{rangeText}
                          </span>
                          <Link
                            href={`/tools/statistical-analysis?series=${encodeURIComponent(key)}&label=${encodeURIComponent(label)}`}
                            className="shrink-0 rounded border border-cyan-800/70 px-1.5 py-0 text-[10px] text-cyan-200/90 hover:border-cyan-600"
                            title="跳转到统计分析页面"
                          >
                            统计分析
                          </Link>
                          <button
                            type="button"
                            onClick={() => removeSelectedKey(key)}
                            className="shrink-0 rounded border border-rose-900/70 px-1.5 py-0 text-[10px] text-rose-200/90 hover:border-rose-700"
                          >
                            删除
                          </button>
                        </li>
                        );
                      },
                      )}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex min-h-0 flex-[1_1_50%] flex-col">
                <div className="shrink-0 border-b border-slate-800/60 px-2 py-1 text-[11px] font-medium text-slate-500">
                  提取数据
                </div>
                <div
                  className="min-h-0 flex-1 overflow-hidden rounded-b-lg border border-slate-800/90 bg-slate-950/60"
                  suppressHydrationWarning
                >
                  {displayPayload ? (
                    <div className="h-full overflow-auto">
                      <table className="w-max max-w-none border-collapse text-xs table-fixed">
                        <colgroup>
                          <col style={{ width: tableColumnWidths.time }} />
                          {tableColumns.map((c) => (
                            <col
                              key={c.key}
                              style={{ width: tableColumnWidths.columns.get(c.key) ?? 120 }}
                            />
                          ))}
                        </colgroup>
                        <thead className="sticky top-0 z-[1] bg-slate-900/95 text-slate-300">
                          <tr>
                            <th
                              className="border-b border-r border-slate-800 px-2 py-1 text-left font-medium"
                              style={{ width: tableColumnWidths.time }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setTableTimeSort((prev) => (prev === "asc" ? "desc" : "asc"))
                                }
                                className="inline-flex items-center gap-1 text-slate-300 hover:text-cyan-200"
                                title={
                                  tableTimeSort === "asc"
                                    ? "按时间升序，点击切换为降序"
                                    : "按时间降序，点击切换为升序"
                                }
                                aria-label={
                                  tableTimeSort === "asc"
                                    ? "时间升序，点击切换为降序"
                                    : "时间降序，点击切换为升序"
                                }
                              >
                                时间
                                <span
                                  className="text-[10px] text-cyan-400/90"
                                  aria-hidden
                                >
                                  {tableTimeSort === "asc" ? "↑" : "↓"}
                                </span>
                              </button>
                            </th>
                            {tableColumns.map((c) => (
                              <th
                                key={c.key}
                                className="border-b border-r border-slate-800 px-2 py-1 text-left font-medium whitespace-nowrap"
                                style={{ width: tableColumnWidths.columns.get(c.key) }}
                                title={c.label}
                              >
                                {c.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedTableRowIndices.map((idx) => {
                            const time = displayPayload.categories[idx]!;
                            return (
                            <tr
                              key={`${time}-${idx}`}
                              className="odd:bg-slate-950 even:bg-slate-900/35"
                            >
                              <td className="whitespace-nowrap border-b border-r border-slate-800 px-2 py-0.5 text-slate-400 tabular-nums">
                                {time}
                              </td>
                              {tableColumns.map((c) => (
                                <td
                                  key={`${c.key}-${idx}`}
                                  className="whitespace-nowrap border-b border-r border-slate-800 px-2 py-0.5 text-slate-200 tabular-nums"
                                >
                                  {tableCellDisplayText(tableValueByKey.get(c.key)?.[idx])}
                                </td>
                              ))}
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="px-3 py-6 text-center text-xs text-slate-500">
                      点击「提取数据」后，各指标数值将显示在此处。
                    </p>
                  )}
                </div>
              </div>
            </section>
          ) : mainTab === "charts" ? (
            <section className="flex min-h-0 flex-1 flex-col gap-2">
              {loading ? (
                <div className="flex min-h-[200px] flex-1 items-center justify-center text-sm text-slate-500">
                  正在加载…
                </div>
              ) : displayPayload ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  {error ? (
                    <div className="shrink-0 rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200/90">
                      {error}
                    </div>
                  ) : null}
                  <div
                    ref={chartSplitRowRef}
                    className="flex min-h-0 min-w-0 flex-1 flex-row items-stretch"
                  >
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <MacroMultiChartGrid
                        key={`macro-grid-${layoutMode}`}
                        payload={displayPayload}
                        layoutMode={layoutMode}
                        slotAssignment={extractedAssignment}
                        seriesVisualMap={seriesVisualMap}
                        displayConfig={displayConfig}
                        pageSyncEnabled={pageSyncEnabled}
                        remoteCrosshairTimeLabel={remoteCrosshairTimeLabel}
                        remoteCrosshairVersion={remoteCrosshairVersion}
                        onLocalCrosshairTimeLabel={onLocalCrosshairTimeLabel}
                        remoteVisibleRange={remoteVisibleRange}
                        remoteVisibleRangeVersion={remoteVisibleRangeVersion}
                        onLocalVisibleRange={onLocalVisibleRange}
                        drawTool={macroDrawTool}
                        drawingsBySlot={macroDrawingsBySlot}
                        onDrawingsChange={onMacroDrawingsChange}
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
                              selectedKeys={chartPropertyKeys}
                              displayLabelByKey={chartSettingsLabelByKey}
                              slotAssignment={resolvedAssignment}
                              onAssign={assignSlot}
                              seriesVisualMap={seriesVisualMap}
                              onUpdateSeriesVisual={updateSeriesVisual}
                              displayConfig={displayConfig}
                              onUpdateDisplayConfig={(patch) =>
                                setDisplayConfig((prev) => ({ ...prev, ...patch }))
                              }
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
          ) : (
            <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              <div className="rounded-lg border border-slate-800/90 bg-slate-950/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-slate-200">系统模板</h3>
                  {!isAdmin ? (
                    <span className="text-[10px] text-slate-600">文件夹由管理员统一维护</span>
                  ) : null}
                </div>
                <MacroTemplateFolderSection
                  templates={builtInTemplates}
                  folders={builtinFolders}
                  getFolderId={(tpl) => builtinTemplateFolderIds[tpl.id] ?? null}
                  onAssignFolder={assignBuiltinTemplateFolder}
                  onCreateFolder={addBuiltinTemplateFolder}
                  onRenameFolder={renameBuiltinTemplateFolder}
                  onDeleteFolder={deleteBuiltinTemplateFolder}
                  disabled={loading || !isAdmin}
                  emptyText="暂无系统模板。"
                  renderActions={(tpl) => (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => applyTemplateAndExtract(tpl)}
                      className="rounded border border-emerald-700/80 bg-emerald-950/35 text-emerald-100 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      加载
                    </button>
                  )}
                />
              </div>

              <div className="rounded-lg border border-slate-800/90 bg-slate-950/60 p-3">
                <h3 className="text-sm font-medium text-slate-200">我的模板</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="模板名称"
                    className="min-w-[10rem] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-100 placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      saveCurrentAsTemplate(
                        newTemplateName,
                        newTemplateFolderId.trim() ? newTemplateFolderId.trim() : null,
                      )
                    }
                    className="rounded border border-cyan-700/80 bg-cyan-950/35 px-2 py-0.5 text-[10px] font-medium text-cyan-100 hover:border-cyan-500"
                  >
                    保存当前配置
                  </button>
                </div>

                <MacroTemplateFolderSection
                  templates={savedTemplates}
                  folders={userFolders}
                  getFolderId={(tpl) => tpl.folderId ?? null}
                  onAssignFolder={assignUserTemplateFolder}
                  onCreateFolder={addUserTemplateFolder}
                  onRenameFolder={renameUserTemplateFolder}
                  onDeleteFolder={deleteUserTemplateFolder}
                  emptyText="还没有自定义模板。"
                  renderActions={(tpl) => (
                    <>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => applyTemplateAndExtract(tpl)}
                        className="rounded border border-emerald-700/80 bg-emerald-950/35 text-emerald-100 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        加载
                      </button>
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTemplateId(tpl.id);
                            if (window.confirm(`用当前配置覆盖模板「${tpl.name}」？`)) {
                              setSavedTemplates((prev) =>
                                prev.map((x) =>
                                  x.id === tpl.id
                                    ? {
                                        ...x,
                                        selectedKeys: [...selectedKeys],
                                        layoutMode,
                                        slotAssignment: { ...slotAssignment },
                                        seriesVisualMap: { ...seriesVisualMap },
                                        displayConfig: { ...displayConfig },
                                        seriesCalcConfigMap: { ...seriesCalcConfigMap },
                                        derivedCalcs: [...derivedCalcs],
                                        createdAtIso: new Date().toISOString(),
                                      }
                                    : x,
                                ),
                              );
                            }
                          }}
                          className="flex-1 rounded border border-slate-700 text-slate-300 hover:border-slate-500"
                        >
                          覆盖
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTemplateId(tpl.id);
                            if (window.confirm(`删除模板「${tpl.name}」？`)) {
                              setSavedTemplates((prev) => prev.filter((x) => x.id !== tpl.id));
                              setActiveTemplateId((prev) => (prev === tpl.id ? null : prev));
                            }
                          }}
                          className="flex-1 rounded border border-rose-900/70 text-rose-200/90 hover:border-rose-700"
                        >
                          删除
                        </button>
                      </div>
                    </>
                  )}
                />
              </div>
            </section>
          )}
        </div>
      </div>

      {templateNameDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4">
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-2xl">
            <h3 className="text-sm font-medium text-slate-100">
              {templateSaveMode === "builtin" && isAdmin && activeTemplate?.builtIn
                ? "更新系统模板"
                : "保存模板"}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {templateSaveMode === "builtin" && isAdmin && activeTemplate?.builtIn
                ? `将当前图表配置写回系统模板「${activeTemplate.name}」，对所有用户生效。`
                : "请输入模板名称后点击确认。"}
            </p>
            <form
              className="mt-3 flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                confirmSaveTemplateByDialog();
              }}
            >
              <input
                type="text"
                value={templateNameDraft}
                onChange={(e) => setTemplateNameDraft(e.target.value)}
                placeholder="例如：美国总览-利率通胀版"
                autoFocus
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none"
              />
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <span className="shrink-0">保存到文件夹</span>
                <select
                  value={newTemplateFolderId}
                  onChange={(e) => setNewTemplateFolderId(e.target.value)}
                  className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                  disabled={templateSaveMode === "builtin"}
                >
                  <option value="">未分类</option>
                  {userFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelSaveTemplateDialog}
                  className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!templateNameDraft.trim()}
                  className="rounded border border-cyan-700/80 bg-cyan-950/35 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {templateSaveMode === "builtin" && isAdmin && activeTemplate?.builtIn
                    ? "确认更新"
                    : "确认保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
