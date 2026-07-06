"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  MacroChartIndicatorAssignment,
  type MacroChartPropsTab,
} from "@/components/MacroChartIndicatorAssignment";
import { MacroTemplateFolderSection } from "@/components/MacroTemplateFolderSection";
import { MacroChartDrawingToolbar } from "@/components/MacroChartDrawingToolbar";
import { MacroMultiChartGrid } from "@/components/MacroMultiChartGrid";
import { EventChartSidePanel } from "@/components/events/EventChartSidePanel";
import { MacroMainToolbar } from "@/components/macro/MacroMainToolbar";
import { MacroTemplateIntroPanel } from "@/components/macro/MacroTemplateIntroPanel";
import type {
  MacroDrawing,
  MacroDrawingStyle,
  MacroDrawingTool,
} from "@/lib/macroChartDrawing";
import {
  DEFAULT_MACRO_DRAWING_STYLE,
  patchDrawing,
} from "@/lib/macroChartDrawing";
import {
  contextDateFromTimeLabel,
  extractCountriesFromMacroKeys,
} from "@/lib/data/marketEvents";
import { SelectedIndicatorsList } from "@/components/SelectedIndicatorsList";
import { UnifiedMacroSidebar } from "@/components/UnifiedMacroSidebar";
import type { MacroPayload } from "@/lib/data/types";
import {
  capSelectedKeys,
  DEFAULT_UNIFIED_SERIES_KEYS,
  MACRO_MAX_SERIES,
  resolveMacroSeriesLabel,
  serializeUnifiedKeys,
  type UnifiedCatalogCountry,
} from "@/lib/data/macroCatalog";
import {
  fredCatalogBaseKey,
  fredInstrumentCodeFromKey,
  unifiedKeyInAllowlist,
} from "@/lib/data/fredCatalog";
import type { BuiltinTemplateOverride, MacroChartPrefs } from "@/lib/data/macroChartPrefs";
import { mergeBuiltinTemplateOverride } from "@/lib/data/macroChartPrefs";
import {
  BUILTIN_DEBT_CAPACITY_TEMPLATE,
  BUILTIN_CHINA_OVERVIEW_TEMPLATE,
  BUILTIN_GOLD_ANALYSIS_TEMPLATE,
  BUILTIN_JAPAN_OVERVIEW_TEMPLATE,
  BUILTIN_US_CPI_DRIVERS_TEMPLATE,
  BUILTIN_US_CPI_OVERVIEW_TEMPLATE,
  BUILTIN_US_ECON_DEMAND_TEMPLATE,
  BUILTIN_US_ECON_OVERVIEW_TEMPLATE,
  BUILTIN_US_FISCAL_HIGHFREQ_TEMPLATE,
  BUILTIN_US_FISCAL_OVERVIEW_TEMPLATE,
  BUILTIN_US_FISCAL_STRUCTURE_TEMPLATE,
  BUILTIN_US_LABOR_DRIVERS_TEMPLATE,
  BUILTIN_US_LABOR_OVERVIEW_TEMPLATE,
  BUILTIN_US_MONETARY_CONDITIONS_TEMPLATE,
  BUILTIN_US_MONETARY_OVERVIEW_TEMPLATE,
  BUILTIN_US_HOUSING_ACTIVITY_TEMPLATE,
  BUILTIN_US_HOUSING_PRICE_FINANCE_TEMPLATE,
  BUILTIN_US_OVERVIEW_TEMPLATE,
  HARDCODED_BUILTIN_TEMPLATE_IDS,
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
import { CPI_VIRTUAL_KEY_LABELS } from "@/lib/data/cpiAnalysisLayout";
import { FISCAL_VIRTUAL_KEY_LABELS } from "@/lib/data/fiscalAnalysisLayout";
import { LABOR_VIRTUAL_KEY_LABELS } from "@/lib/data/laborAnalysisLayout";
import { OVERVIEW_VIRTUAL_KEY_LABELS } from "@/lib/data/overviewAnalysisLayout";
import { MONETARY_VIRTUAL_KEY_LABELS } from "@/lib/data/monetaryAnalysisLayout";
import { HOUSING_VIRTUAL_KEY_LABELS } from "@/lib/data/housingAnalysisLayout";
import { createMacroTemplateFolder, foldersForScope } from "@/lib/macroTemplateFolders";
import type { MacroSlotAssignment } from "@/lib/macroPartition";
import type {
  MacroChartDisplayConfig,
  MacroSeriesVisualConfig,
  MacroSeriesVisualConfigMap,
} from "@/lib/macroChartOption";
import {
  DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
  extractYearsFromCategories,
} from "@/lib/macroChartOption";
import { buildMacroDemoSeries } from "@/lib/sampleSeries";
import {
  getOrCreateMacroSyncTabId,
  MACRO_PAGE_SYNC_CHANNEL,
  type MacroSyncMessage,
} from "@/lib/macroPageSyncChannel";
import {
  buildMacroExportMatrix,
  downloadMacroCsv,
  downloadMacroXlsx,
  macroExportFilename,
} from "@/lib/macroDataExport";
import {
  buildMacroSeriesCalcSuffix,
  decorateMacroSeriesDisplayName,
  effectiveMacroSeriesUnit,
} from "@/lib/macroSeriesDisplayName";
import { formatMacroDisplayNumber } from "@/lib/formatMacroValue";
import {
  compareMacroPeriodLabels,
  formatMacroPeriodDisplay,
  macroAlignPeriodKey,
  macroPeriodKeyFromDateLabel,
  sortMacroPeriodLabels,
} from "@/lib/macroPeriodLabel";
import {
  createDividerItem,
  keysFromListItems,
  listItemsFromKeys,
  listItemsFromTemplate,
  setFromListItems,
  syncListWithKeys,
  type MacroSelectedListItem,
} from "@/lib/macroSelectedList";

type MainTab = "selected" | "charts" | "templates";

type ChartSidePanelTab = "settings" | "events" | "intro";

const INTRO_WORKSPACE_TEMPLATE_ID = "__workspace__";

const INTRO_DESCRIPTION_MAX_LEN = 8000;

function buildBuiltinOverrideFromTemplate(
  tpl: MacroChartTemplate,
  patch: Partial<BuiltinTemplateOverride> = {},
): BuiltinTemplateOverride {
  return {
    name: tpl.name,
    description: tpl.description,
    selectedKeys: [...tpl.selectedKeys],
    selectedListItems: tpl.selectedListItems,
    layoutMode: tpl.layoutMode,
    slotAssignment: { ...tpl.slotAssignment },
    seriesVisualMap: { ...tpl.seriesVisualMap },
    displayConfig: tpl.displayConfig,
    seriesCalcConfigMap: tpl.seriesCalcConfigMap,
    derivedCalcs: tpl.derivedCalcs,
    chartIntroNotes: tpl.chartIntroNotes,
    indicatorIntroNotes: tpl.indicatorIntroNotes,
    updatedAtIso: new Date().toISOString(),
    ...patch,
  };
}

const CHART_SETTINGS_MIN_PX = 200;
const CHART_SETTINGS_MAX_FRAC = 0.65;

const SIDEBAR_DEFAULT_PX = 320;
const SIDEBAR_MIN_PX = 200;
const SIDEBAR_MAX_PX = 520;

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
    const bucket = macroPeriodKeyFromDateLabel(categories[i]!, target);
    const arr = buckets.get(bucket) ?? [];
    arr.push(v);
    buckets.set(bucket, arr);
  }
  const outCats = sortMacroPeriodLabels([...buckets.keys()]);
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

function seriesToAlignedValueMap(
  categories: string[],
  data: (number | null)[],
): Map<string, number | null> {
  const m = new Map<string, number | null>();
  for (let i = 0; i < categories.length; i++) {
    const v = data[i];
    if (v == null || !Number.isFinite(v)) continue;
    m.set(macroAlignPeriodKey(categories[i]!), v);
  }
  return m;
}

function collectAlignedPeriodKeys(seriesList: SeriesWorking[]): string[] {
  const keys = new Set<string>();
  for (const s of seriesList) {
    for (let i = 0; i < s.categories.length; i++) {
      const v = s.data[i];
      if (v == null || !Number.isFinite(v)) continue;
      keys.add(macroAlignPeriodKey(s.categories[i]!));
    }
  }
  return sortMacroPeriodLabels([...keys]);
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
  return formatMacroDisplayNumber(value);
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

function deriveSeries(
  left: SeriesWorking,
  right: SeriesWorking,
  op: MacroDerivedCalcOp,
  name: string,
  key: string,
): SeriesWorking {
  const leftMap = seriesToAlignedValueMap(left.categories, left.data);
  const rightMap = seriesToAlignedValueMap(right.categories, right.data);
  const cats = collectAlignedPeriodKeys([left, right]);
  const vals = cats.map((c) => {
    const a = leftMap.get(c) ?? null;
    const b = rightMap.get(c) ?? null;
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (op === "add") return a + b;
    if (op === "sub" || op === "spread") return a - b;
    if (op === "mul") return a * b;
    if ((op === "div" || op === "ratio") && b !== 0) return a / b;
    return null;
  });
  return { key, name, categories: cats, data: vals };
}

function readMacroReplaceKey(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("replace") !== "1") return null;
  const key = params.get("key")?.trim();
  return key || null;
}

export function MacroSection() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mainTab, setMainTab] = useState<MainTab>("selected");
  const [layoutMode, setLayoutMode] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [macroDrawTool, setMacroDrawTool] = useState<MacroDrawingTool>("cursor");
  const [macroDrawStyle, setMacroDrawStyle] = useState<MacroDrawingStyle>(
    DEFAULT_MACRO_DRAWING_STYLE,
  );
  const [macroDrawingsBySlot, setMacroDrawingsBySlot] = useState<
    Record<number, MacroDrawing[]>
  >({});
  const [selectedDrawingBySlot, setSelectedDrawingBySlot] = useState<
    Record<number, string | null>
  >({});
  const [activeDrawSlot, setActiveDrawSlot] = useState(0);

  const onMacroDrawingsChange = useCallback((slotIndex: number, drawings: MacroDrawing[]) => {
    setMacroDrawingsBySlot((prev) => ({ ...prev, [slotIndex]: drawings }));
  }, []);

  const onMacroSelectDrawing = useCallback((slotIndex: number, id: string | null) => {
    setActiveDrawSlot(slotIndex);
    setSelectedDrawingBySlot((prev) => ({ ...prev, [slotIndex]: id }));
  }, []);

  const onMacroDrawInteraction = useCallback((slotIndex: number) => {
    setActiveDrawSlot(slotIndex);
  }, []);

  const selectedMacroDrawing = useMemo(() => {
    const id = selectedDrawingBySlot[activeDrawSlot];
    if (!id) return null;
    return (macroDrawingsBySlot[activeDrawSlot] ?? []).find((d) => d.id === id) ?? null;
  }, [selectedDrawingBySlot, activeDrawSlot, macroDrawingsBySlot]);

  const onMacroSelectedStyleChange = useCallback(
    (patch: Partial<MacroDrawingStyle>) => {
      const id = selectedDrawingBySlot[activeDrawSlot];
      if (!id) return;
      const drawings = macroDrawingsBySlot[activeDrawSlot] ?? [];
      onMacroDrawingsChange(
        activeDrawSlot,
        patchDrawing(drawings, id, { style: patch } as Partial<MacroDrawing>),
      );
    },
    [selectedDrawingBySlot, activeDrawSlot, macroDrawingsBySlot, onMacroDrawingsChange],
  );

  const onMacroSelectedTextChange = useCallback(
    (text: string) => {
      const id = selectedDrawingBySlot[activeDrawSlot];
      if (!id) return;
      const drawings = macroDrawingsBySlot[activeDrawSlot] ?? [];
      onMacroDrawingsChange(
        activeDrawSlot,
        patchDrawing(drawings, id, { text } as Partial<MacroDrawing>),
      );
    },
    [selectedDrawingBySlot, activeDrawSlot, macroDrawingsBySlot, onMacroDrawingsChange],
  );

  const deleteSelectedMacroDrawing = useCallback(() => {
    const id = selectedDrawingBySlot[activeDrawSlot];
    if (!id) return;
    const drawings = macroDrawingsBySlot[activeDrawSlot] ?? [];
    onMacroDrawingsChange(
      activeDrawSlot,
      drawings.filter((d) => d.id !== id),
    );
    setSelectedDrawingBySlot((prev) => ({ ...prev, [activeDrawSlot]: null }));
  }, [selectedDrawingBySlot, activeDrawSlot, macroDrawingsBySlot, onMacroDrawingsChange]);

  const clearMacroDrawings = useCallback(() => {
    setMacroDrawingsBySlot({});
    setSelectedDrawingBySlot({});
  }, []);

  useEffect(() => {
    if (mainTab !== "charts") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (!selectedDrawingBySlot[activeDrawSlot]) return;
      deleteSelectedMacroDrawing();
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mainTab, activeDrawSlot, selectedDrawingBySlot, deleteSelectedMacroDrawing]);

  /** 图表页右侧：图形设置 / 事件记录 */
  const [chartSettingsOpen, setChartSettingsOpen] = useState(false);
  const [chartSidePanelTab, setChartSidePanelTab] = useState<ChartSidePanelTab>("settings");
  const [chartPropsTab, setChartPropsTab] = useState<MacroChartPropsTab>("global");
  const [chartSettingsWidthPx, setChartSettingsWidthPx] = useState<number | null>(null);
  const chartSplitRowRef = useRef<HTMLDivElement | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidthPx, setSidebarWidthPx] = useState<number | null>(null);
  const macroLayoutRowRef = useRef<HTMLDivElement | null>(null);
  const [macroCrosshairTimeLabel, setMacroCrosshairTimeLabel] = useState<string | null>(null);
  const [macroVisibleFromLabel, setMacroVisibleFromLabel] = useState<string | null>(null);
  const [macroVisibleToLabel, setMacroVisibleToLabel] = useState<string | null>(null);

  const [selectedListItems, setSelectedListItems] = useState<MacroSelectedListItem[]>(() => {
    const replaceKey = readMacroReplaceKey();
    if (replaceKey) return listItemsFromKeys([replaceKey]);
    return listItemsFromKeys(DEFAULT_UNIFIED_SERIES_KEYS);
  });
  const selectedKeys = useMemo(
    () => setFromListItems(selectedListItems),
    [selectedListItems],
  );
  const orderedSelectedKeys = useMemo(
    () => keysFromListItems(selectedListItems),
    [selectedListItems],
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
  const [templateIndicatorNotes, setTemplateIndicatorNotes] = useState<
    Record<string, Record<string, string>>
  >({});
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
  const [customBuiltinTemplates, setCustomBuiltinTemplates] = useState<MacroChartTemplate[]>([]);
  const [hiddenBuiltinTemplateIds, setHiddenBuiltinTemplateIds] = useState<string[]>([]);
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
  const [tableTimeSort, setTableTimeSort] = useState<"asc" | "desc">("desc");
  const [sidebarLocateKey, setSidebarLocateKey] = useState<string | null>(null);

  const [catalogCountries, setCatalogCountries] = useState<UnifiedCatalogCountry[] | null>(null);
  const [catalogAllowlist, setCatalogAllowlist] = useState<Set<string> | null>(null);
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const [mdsAttrsByKey, setMdsAttrsByKey] = useState<Map<string, MdsIndicatorAttrs>>(new Map());
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const introDescSaveTimerRef = useRef<number | null>(null);
  const introDescPendingSaveRef = useRef<
    | { kind: "hardcoded"; overrides: Record<string, BuiltinTemplateOverride> }
    | { kind: "custom"; templates: MacroChartTemplate[] }
    | null
  >(null);
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
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return false;
        const j = (await r.json().catch(() => ({}))) as { user?: { role?: string } };
        return String(j.user?.role ?? "").trim().toLowerCase() === "admin";
      })
      .then((admin) => {
        if (!cancelled) setIsAdmin(admin);
      })
      .catch(() => {
        /* 保留 macro-chart-prefs 或其他来源已设置的 admin 状态 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tools/macro-chart-prefs", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401)
          return {
            prefs: null as MacroChartPrefs | null,
            builtinTemplateOverrides: {} as Record<string, BuiltinTemplateOverride>,
            customBuiltinTemplates: [] as MacroChartTemplate[],
            hiddenBuiltinTemplateIds: [] as string[],
            builtinTemplateFolders: [] as MacroTemplateFolder[],
            builtinTemplateFolderIds: {} as Record<string, string | null>,
            isAdmin: false,
          };
        const j = (await r.json().catch(() => ({}))) as {
          prefs?: MacroChartPrefs | null;
          builtinTemplateOverrides?: Record<string, BuiltinTemplateOverride>;
          customBuiltinTemplates?: MacroChartTemplate[];
          hiddenBuiltinTemplateIds?: string[];
          builtinTemplateFolders?: MacroTemplateFolder[];
          builtinTemplateFolderIds?: Record<string, string | null>;
          user?: { role?: string };
        };
        return {
          prefs: j.prefs ?? null,
          builtinTemplateOverrides: j.builtinTemplateOverrides ?? {},
          customBuiltinTemplates: j.customBuiltinTemplates ?? [],
          hiddenBuiltinTemplateIds: j.hiddenBuiltinTemplateIds ?? [],
          builtinTemplateFolders: j.builtinTemplateFolders ?? [],
          builtinTemplateFolderIds: j.builtinTemplateFolderIds ?? {},
          isAdmin: String(j.user?.role ?? "").trim().toLowerCase() === "admin",
        };
      })
      .then(
        ({
          prefs,
          builtinTemplateOverrides: overrides,
          customBuiltinTemplates: customBuiltins,
          hiddenBuiltinTemplateIds: hiddenIds,
          builtinTemplateFolders,
          builtinTemplateFolderIds: systemFolderIds,
          isAdmin: adminFromPrefs,
        }) => {
        if (cancelled) return;
        if (adminFromPrefs) setIsAdmin(true);
        setBuiltinTemplateOverrides(overrides);
        setCustomBuiltinTemplates(customBuiltins);
        setHiddenBuiltinTemplateIds(hiddenIds);
        setSystemBuiltinFolders(builtinTemplateFolders);
        setBuiltinTemplateFolderIds(systemFolderIds);
        if (prefs) {
          if ([1, 2, 3, 4, 5, 6].includes(prefs.layoutMode)) setLayoutMode(prefs.layoutMode);
          const replaceKey = readMacroReplaceKey();
          if (!replaceKey) {
            if (Array.isArray(prefs.selectedListItems) && prefs.selectedListItems.length > 0) {
              setSelectedListItems(prefs.selectedListItems);
            } else if (Array.isArray(prefs.selectedKeys) && prefs.selectedKeys.length > 0) {
              setSelectedListItems(
                listItemsFromKeys(prefs.selectedKeys.slice(0, MACRO_MAX_SERIES)),
              );
            }
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
          if (prefs.templateIndicatorNotes && typeof prefs.templateIndicatorNotes === "object") {
            setTemplateIndicatorNotes(prefs.templateIndicatorNotes);
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
    const key = searchParams.get("key")?.trim();
    if (!key || searchParams.get("replace") !== "1") return;

    setSelectedListItems(listItemsFromKeys([key]));
    setSlotAssignment({ [key]: null });
    setSeriesVisualMap((prev) => (prev[key] ? { [key]: prev[key] } : {}));
    setSeriesCalcConfigMap((prev) => (prev[key] ? { [key]: prev[key] } : {}));
    setDerivedCalcs([]);
    setActiveTemplateId(null);
    setMainTab("selected");
    router.replace("/macro", { scroll: false });
  }, [prefsHydrated, router, searchParams]);

  useEffect(() => {
    if (!prefsHydrated) return;
    const prefs: MacroChartPrefs = {
      version: 2,
      layoutMode,
      selectedKeys: orderedSelectedKeys,
      selectedListItems,
      slotAssignment,
      seriesVisualMap,
      displayConfig,
      seriesCalcConfigMap,
      derivedCalcs,
      templates: savedTemplates,
      templateFolders,
      activeTemplateId,
      templateIndicatorNotes,
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
    orderedSelectedKeys,
    selectedListItems,
    slotAssignment,
    seriesVisualMap,
    displayConfig,
    seriesCalcConfigMap,
    derivedCalcs,
    savedTemplates,
    templateFolders,
    activeTemplateId,
    templateIndicatorNotes,
  ]);

  const onSelectedKeysChange = useCallback(
    (next: Set<string>) => {
      const capped = capSelectedKeys(selectedKeys, next);
      const truncated = capped.size < next.size;
      setSlotAssignment((prev) => {
        const n: MacroSlotAssignment = { ...prev };
        for (const key of capped) {
          if (!selectedKeys.has(key)) {
            n[key] = n[key] ?? null;
          }
        }
        for (const k of Object.keys(n)) {
          if (!capped.has(k)) delete n[k];
        }
        return n;
      });
      setSelectedListItems((prev) => syncListWithKeys(prev, capped));
      setSeriesVisualMap((prev) => {
        const out: MacroSeriesVisualConfigMap = {};
        for (const key of capped) {
          if (prev[key]) out[key] = prev[key];
        }
        return out;
      });
      if (truncated) {
        window.alert(`最多只能选择 ${MACRO_MAX_SERIES} 个指标`);
      }
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
      BUILTIN_GOLD_ANALYSIS_TEMPLATE,
      BUILTIN_US_ECON_OVERVIEW_TEMPLATE,
      BUILTIN_US_ECON_DEMAND_TEMPLATE,
      BUILTIN_US_CPI_OVERVIEW_TEMPLATE,
      BUILTIN_US_CPI_DRIVERS_TEMPLATE,
      BUILTIN_US_LABOR_OVERVIEW_TEMPLATE,
      BUILTIN_US_LABOR_DRIVERS_TEMPLATE,
      BUILTIN_US_FISCAL_OVERVIEW_TEMPLATE,
      BUILTIN_US_FISCAL_STRUCTURE_TEMPLATE,
      BUILTIN_US_FISCAL_HIGHFREQ_TEMPLATE,
      BUILTIN_US_MONETARY_OVERVIEW_TEMPLATE,
      BUILTIN_US_MONETARY_CONDITIONS_TEMPLATE,
      BUILTIN_US_HOUSING_ACTIVITY_TEMPLATE,
      BUILTIN_US_HOUSING_PRICE_FINANCE_TEMPLATE,
    ];
    const hidden = new Set(hiddenBuiltinTemplateIds);
    const hardcoded = base
      .map((tpl) => mergeBuiltinTemplateOverride(tpl, builtinTemplateOverrides[tpl.id]))
      .filter((tpl) => !hidden.has(tpl.id));
    return [...hardcoded, ...customBuiltinTemplates];
  }, [builtinTemplateOverrides, customBuiltinTemplates, hiddenBuiltinTemplateIds]);

  const hiddenHardcodedBuiltinTemplates = useMemo(() => {
    const hidden = new Set(hiddenBuiltinTemplateIds);
    const base = [
      BUILTIN_DEBT_CAPACITY_TEMPLATE,
      BUILTIN_US_OVERVIEW_TEMPLATE,
      BUILTIN_CHINA_OVERVIEW_TEMPLATE,
      BUILTIN_JAPAN_OVERVIEW_TEMPLATE,
      BUILTIN_GOLD_ANALYSIS_TEMPLATE,
      BUILTIN_US_ECON_OVERVIEW_TEMPLATE,
      BUILTIN_US_ECON_DEMAND_TEMPLATE,
      BUILTIN_US_CPI_OVERVIEW_TEMPLATE,
      BUILTIN_US_CPI_DRIVERS_TEMPLATE,
      BUILTIN_US_LABOR_OVERVIEW_TEMPLATE,
      BUILTIN_US_LABOR_DRIVERS_TEMPLATE,
      BUILTIN_US_FISCAL_OVERVIEW_TEMPLATE,
      BUILTIN_US_FISCAL_STRUCTURE_TEMPLATE,
      BUILTIN_US_FISCAL_HIGHFREQ_TEMPLATE,
      BUILTIN_US_MONETARY_OVERVIEW_TEMPLATE,
      BUILTIN_US_MONETARY_CONDITIONS_TEMPLATE,
      BUILTIN_US_HOUSING_ACTIVITY_TEMPLATE,
      BUILTIN_US_HOUSING_PRICE_FINANCE_TEMPLATE,
    ];
    return base
      .filter((tpl) => hidden.has(tpl.id))
      .map((tpl) => mergeBuiltinTemplateOverride(tpl, builtinTemplateOverrides[tpl.id]));
  }, [builtinTemplateOverrides, hiddenBuiltinTemplateIds]);

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

  const macroSeriesLabelByKey = useMemo(() => {
    const m = new Map<string, string>([
      ...CPI_VIRTUAL_KEY_LABELS,
      ...FISCAL_VIRTUAL_KEY_LABELS,
      ...LABOR_VIRTUAL_KEY_LABELS,
      ...OVERVIEW_VIRTUAL_KEY_LABELS,
      ...MONETARY_VIRTUAL_KEY_LABELS,
      ...HOUSING_VIRTUAL_KEY_LABELS,
    ]);
    for (const [k, v] of catalogLabelByKey) {
      if (!m.has(k)) m.set(k, v);
    }
    for (const d of derivedCalcs) {
      m.set(`calc:${d.id}`, d.name);
    }
    return m;
  }, [catalogLabelByKey, derivedCalcs]);

  const resolveSeriesLabel = useCallback(
    (key: string, extractLabels?: ReadonlyMap<string, string>) =>
      resolveMacroSeriesLabel(key, {
        catalogLabelByKey,
        overrides: extractLabels ?? macroSeriesLabelByKey,
      }),
    [catalogLabelByKey, macroSeriesLabelByKey],
  );

  const resolveTemplateConfig = useCallback(
    (tpl: MacroChartTemplate): MacroChartTemplate =>
      resolveBuiltinTemplate(tpl, catalogAllowlist, catalogLabelByKey),
    [catalogAllowlist, catalogLabelByKey],
  );

  const applyTemplate = useCallback(
    (tpl: MacroChartTemplate) => {
      const resolvedTpl = resolveTemplateConfig(tpl);
      const templateKeys = resolvedTpl.selectedKeys.slice(0, MACRO_MAX_SERIES);
      if (resolvedTpl.selectedKeys.length > MACRO_MAX_SERIES) {
        window.alert(
          `模板包含 ${resolvedTpl.selectedKeys.length} 个指标，已截断为最多 ${MACRO_MAX_SERIES} 个`,
        );
      }
      setLayoutMode(resolvedTpl.layoutMode);
      setSelectedListItems(
        listItemsFromTemplate(templateKeys, resolvedTpl.selectedListItems),
      );
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

  const persistSystemTemplateData = useCallback(
    async (patch: {
      builtinTemplateOverrides?: Record<string, BuiltinTemplateOverride>;
      customBuiltinTemplates?: MacroChartTemplate[];
      hiddenBuiltinTemplateIds?: string[];
      builtinTemplateFolderIds?: Record<string, string | null>;
    }) => {
      if (!isAdmin) {
        throw new Error("仅管理员可修改系统模板");
      }
      const res = await fetch("/api/tools/macro-chart-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemMacroChartPrefs: {
            version: 1,
            ...patch,
          },
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `保存系统模板失败 (${res.status})`);
      }
      const j = (await res.json()) as {
        builtinTemplateOverrides?: Record<string, BuiltinTemplateOverride>;
        customBuiltinTemplates?: MacroChartTemplate[];
        hiddenBuiltinTemplateIds?: string[];
        builtinTemplateFolderIds?: Record<string, string | null>;
      };
      if (j.builtinTemplateOverrides !== undefined) {
        setBuiltinTemplateOverrides(j.builtinTemplateOverrides);
      }
      if (j.customBuiltinTemplates !== undefined) {
        setCustomBuiltinTemplates(j.customBuiltinTemplates);
      }
      if (j.hiddenBuiltinTemplateIds !== undefined) {
        setHiddenBuiltinTemplateIds(j.hiddenBuiltinTemplateIds);
      }
      if (j.builtinTemplateFolderIds !== undefined) {
        setBuiltinTemplateFolderIds(j.builtinTemplateFolderIds);
      }
    },
    [isAdmin],
  );

  const saveCurrentAsSystemTemplate = useCallback(
    async (nameInput: string, folderId?: string | null) => {
      if (!isAdmin) return;
      const trimmed = nameInput.trim();
      if (!trimmed) return;

      const validFolderId =
        folderId && systemBuiltinFolders.some((f) => f.id === folderId) ? folderId : null;

      const templatePayload = {
        name: trimmed,
        selectedKeys: [...orderedSelectedKeys],
        selectedListItems: selectedListItems.map((i) =>
          i.type === "divider"
            ? { type: "divider" as const, id: i.id, ...(i.label ? { label: i.label } : {}) }
            : { type: "series" as const, key: i.key },
        ),
        layoutMode,
        slotAssignment: { ...slotAssignment },
        seriesVisualMap: { ...seriesVisualMap },
        displayConfig: { ...displayConfig },
        seriesCalcConfigMap: { ...seriesCalcConfigMap },
        derivedCalcs: [...derivedCalcs],
        createdAtIso: new Date().toISOString(),
        builtIn: true as const,
      };

      const nameMatchHardcoded = builtInTemplates.find(
        (t) => t.name.trim() === trimmed && HARDCODED_BUILTIN_TEMPLATE_IDS.has(t.id),
      );
      const nameMatchCustom = customBuiltinTemplates.find((t) => t.name.trim() === trimmed);

      let targetId: string | null = null;
      if (activeTemplate?.builtIn && HARDCODED_BUILTIN_TEMPLATE_IDS.has(activeTemplate.id)) {
        targetId = activeTemplate.id;
      } else if (
        activeTemplate?.builtIn &&
        activeTemplate.id.startsWith("builtin-custom-")
      ) {
        targetId = activeTemplate.id;
      } else if (nameMatchHardcoded) {
        targetId = nameMatchHardcoded.id;
      } else if (nameMatchCustom) {
        targetId = nameMatchCustom.id;
      }

      const isSameTemplate = activeTemplate?.id === targetId;
      if (
        targetId &&
        !isSameTemplate &&
        !window.confirm(`已存在同名系统模板「${trimmed}」，是否覆盖？`)
      ) {
        return;
      }

      const nextFolderIds = { ...builtinTemplateFolderIds };

      if (targetId && HARDCODED_BUILTIN_TEMPLATE_IDS.has(targetId)) {
        const override: BuiltinTemplateOverride = {
          name: trimmed,
          description: activeTemplate?.description,
          selectedKeys: templatePayload.selectedKeys,
          selectedListItems: templatePayload.selectedListItems,
          layoutMode: templatePayload.layoutMode,
          slotAssignment: templatePayload.slotAssignment,
          seriesVisualMap: templatePayload.seriesVisualMap,
          displayConfig: templatePayload.displayConfig,
          seriesCalcConfigMap: templatePayload.seriesCalcConfigMap,
          derivedCalcs: templatePayload.derivedCalcs,
          updatedAtIso: new Date().toISOString(),
        };
        nextFolderIds[targetId] = validFolderId;
        await persistSystemTemplateData({
          builtinTemplateOverrides: { ...builtinTemplateOverrides, [targetId]: override },
          builtinTemplateFolderIds: nextFolderIds,
        });
        setActiveTemplateId(targetId);
        setMainTab("templates");
        return;
      }

      let nextCustom: MacroChartTemplate[];
      if (targetId?.startsWith("builtin-custom-")) {
        nextCustom = customBuiltinTemplates.map((t) =>
          t.id === targetId
            ? {
                ...t,
                ...templatePayload,
                id: targetId,
                description: t.description,
              }
            : t,
        );
      } else {
        const id = `builtin-custom-${Date.now().toString(36)}`;
        nextCustom = [
          {
            id,
            ...templatePayload,
          },
          ...customBuiltinTemplates,
        ].slice(0, 30);
        targetId = id;
      }

      nextFolderIds[targetId] = validFolderId;
      await persistSystemTemplateData({
        customBuiltinTemplates: nextCustom,
        builtinTemplateFolderIds: nextFolderIds,
      });
      setActiveTemplateId(targetId);
      setMainTab("templates");
    },
    [
      activeTemplate?.builtIn,
      activeTemplate?.description,
      activeTemplate?.id,
      builtinTemplateFolderIds,
      builtinTemplateOverrides,
      builtInTemplates,
      customBuiltinTemplates,
      derivedCalcs,
      displayConfig,
      isAdmin,
      layoutMode,
      orderedSelectedKeys,
      persistSystemTemplateData,
      selectedListItems,
      seriesCalcConfigMap,
      seriesVisualMap,
      slotAssignment,
      systemBuiltinFolders,
    ],
  );

  const saveCurrentAsTemplate = useCallback((nameInput?: string, folderId?: string | null) => {
    const trimmed = (nameInput ?? window.prompt("模板名称", activeTemplate?.name ?? "") ?? "").trim();
    if (!trimmed) return;

    const existing = savedTemplates.find((t) => t.name.trim() === trimmed);
    const validFolderId =
      folderId && userFolders.some((f) => f.id === folderId) ? folderId : null;
    const introId = activeTemplateId ?? INTRO_WORKSPACE_TEMPLATE_ID;
    const mergedIntroForSave = {
      ...(activeTemplate?.indicatorIntroNotes ?? {}),
      ...(templateIndicatorNotes[introId] ?? {}),
    };
    const indicatorIntroNotes: Record<string, string> = {};
    for (const key of orderedSelectedKeys) {
      const text = mergedIntroForSave[key]?.trim();
      if (text) indicatorIntroNotes[key] = text;
    }
    const payload = {
      name: trimmed,
      selectedKeys: [...orderedSelectedKeys],
      selectedListItems: selectedListItems.map((i) =>
        i.type === "divider"
          ? { type: "divider" as const, id: i.id, ...(i.label ? { label: i.label } : {}) }
          : { type: "series" as const, key: i.key },
      ),
      layoutMode,
      slotAssignment: { ...slotAssignment },
      seriesVisualMap: { ...seriesVisualMap },
      displayConfig: { ...displayConfig },
      seriesCalcConfigMap: { ...seriesCalcConfigMap },
      derivedCalcs: [...derivedCalcs],
      ...(Object.keys(indicatorIntroNotes).length > 0 ? { indicatorIntroNotes } : {}),
      createdAtIso: new Date().toISOString(),
    };

    if (existing) {
      const isSameTemplate = activeTemplate?.id === existing.id && !activeTemplate.builtIn;
      if (!isSameTemplate && !window.confirm(`已存在同名模板「${trimmed}」，是否覆盖？`)) {
        return;
      }
      setSavedTemplates((prev) =>
        prev.map((x) =>
          x.id === existing.id
            ? {
                ...x,
                ...payload,
                folderId: validFolderId ?? x.folderId ?? null,
              }
            : x,
        ),
      );
      setActiveTemplateId(existing.id);
      setNewTemplateName("");
      return;
    }

    const id = `tpl-${Date.now().toString(36)}`;
    const next: MacroChartTemplate = {
      id,
      ...payload,
      folderId: validFolderId,
    };
    setSavedTemplates((prev) => [next, ...prev].slice(0, 30));
    setActiveTemplateId(id);
    setNewTemplateName("");
  }, [
    activeTemplate?.id,
    activeTemplate?.builtIn,
    activeTemplate?.indicatorIntroNotes,
    activeTemplate?.name,
    activeTemplateId,
    derivedCalcs,
    displayConfig,
    layoutMode,
    orderedSelectedKeys,
    savedTemplates,
    selectedListItems,
    seriesCalcConfigMap,
    seriesVisualMap,
    slotAssignment,
    templateIndicatorNotes,
    userFolders,
  ]);

  const createNewTemplateDraft = useCallback(() => {
    if (!window.confirm("新建模板会清空当前模板配置，继续？")) return;
    setActiveTemplateId(null);
    setNewTemplateName("");
    setLayoutMode(1);
    setSelectedListItems([]);
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

  const openSaveTemplateDialog = useCallback(
    (opts?: { defaultMode?: "user" | "builtin"; defaultName?: string }) => {
      const defaultMode =
        opts?.defaultMode ?? (isAdmin && activeTemplate?.builtIn ? "builtin" : "user");
      setTemplateSaveMode(defaultMode);
      const defaultName =
        opts?.defaultName?.trim() ||
        newTemplateName.trim() ||
        (activeTemplate?.name ? activeTemplate.name : defaultMode === "builtin" ? "系统新模板" : "我的新模板");
      setTemplateNameDraft(defaultName);
      if (defaultMode === "builtin" && activeTemplate?.builtIn) {
        setNewTemplateFolderId(builtinTemplateFolderIds[activeTemplate.id] ?? "");
      } else if (defaultMode === "user" && activeTemplate && !activeTemplate.builtIn) {
        setNewTemplateFolderId(activeTemplate.folderId ?? "");
      } else {
        setNewTemplateFolderId("");
      }
      setTemplateNameDialogOpen(true);
    },
    [
      activeTemplate,
      builtinTemplateFolderIds,
      isAdmin,
      newTemplateName,
    ],
  );

  const quickSaveTemplateToMine = useCallback(() => {
    openSaveTemplateDialog();
  }, [openSaveTemplateDialog]);

  const confirmSaveTemplateByDialog = useCallback(async () => {
    const trimmed = templateNameDraft.trim();
    if (!trimmed) return;
    if (templateSaveMode === "builtin" && isAdmin) {
      try {
        await saveCurrentAsSystemTemplate(
          trimmed,
          newTemplateFolderId.trim() ? newTemplateFolderId.trim() : null,
        );
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
    isAdmin,
    newTemplateFolderId,
    saveCurrentAsSystemTemplate,
    saveCurrentAsTemplate,
    templateNameDraft,
    templateSaveMode,
  ]);

  const cancelSaveTemplateDialog = useCallback(() => {
    setTemplateNameDialogOpen(false);
    setTemplateNameDraft("");
  }, []);

  const deleteSystemTemplate = useCallback(
    async (tpl: MacroChartTemplate) => {
      if (!tpl.builtIn) return;
      if (!isAdmin) {
        window.alert("仅管理员可删除系统模板");
        return;
      }
      const isHardcoded = HARDCODED_BUILTIN_TEMPLATE_IDS.has(tpl.id);
      const msg = isHardcoded
        ? `从系统模板列表中移除「${tpl.name}」？（内置模板将从全员列表隐藏，管理员覆盖配置一并清除）`
        : `删除系统模板「${tpl.name}」？删除后所有用户将无法再加载。`;
      if (!window.confirm(msg)) return;

      const nextFolderIds = { ...builtinTemplateFolderIds };
      delete nextFolderIds[tpl.id];

      try {
        if (tpl.id.startsWith("builtin-custom-")) {
          const nextCustom = customBuiltinTemplates.filter((t) => t.id !== tpl.id);
          setCustomBuiltinTemplates(nextCustom);
          setBuiltinTemplateFolderIds(nextFolderIds);
          await persistSystemTemplateData({
            customBuiltinTemplates: nextCustom,
            builtinTemplateFolderIds: nextFolderIds,
          });
        } else {
          const nextOverrides = { ...builtinTemplateOverrides };
          delete nextOverrides[tpl.id];
          const nextHidden = [...new Set([...hiddenBuiltinTemplateIds, tpl.id])];
          setBuiltinTemplateOverrides(nextOverrides);
          setHiddenBuiltinTemplateIds(nextHidden);
          setBuiltinTemplateFolderIds(nextFolderIds);
          await persistSystemTemplateData({
            builtinTemplateOverrides: nextOverrides,
            hiddenBuiltinTemplateIds: nextHidden,
            builtinTemplateFolderIds: nextFolderIds,
          });
        }
        if (activeTemplateId === tpl.id) setActiveTemplateId(null);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "删除系统模板失败");
      }
    },
    [
      activeTemplateId,
      builtinTemplateFolderIds,
      builtinTemplateOverrides,
      customBuiltinTemplates,
      hiddenBuiltinTemplateIds,
      isAdmin,
      persistSystemTemplateData,
    ],
  );

  const deleteActiveTemplate = useCallback(() => {
    if (!activeTemplate) return;
    if (activeTemplate.builtIn) {
      void deleteSystemTemplate(activeTemplate);
      return;
    }
    if (!window.confirm(`删除模板「${activeTemplate.name}」？`)) return;
    setSavedTemplates((prev) => prev.filter((x) => x.id !== activeTemplate.id));
    setActiveTemplateId(null);
  }, [activeTemplate, deleteSystemTemplate]);

  const restoreSystemTemplate = useCallback(
    async (templateId: string) => {
      if (!isAdmin) {
        window.alert("仅管理员可恢复系统模板");
        return;
      }
      const nextHidden = hiddenBuiltinTemplateIds.filter((id) => id !== templateId);
      setHiddenBuiltinTemplateIds(nextHidden);
      try {
        await persistSystemTemplateData({ hiddenBuiltinTemplateIds: nextHidden });
      } catch (e) {
        setHiddenBuiltinTemplateIds(hiddenBuiltinTemplateIds);
        window.alert(e instanceof Error ? e.message : "恢复系统模板失败");
      }
    },
    [hiddenBuiltinTemplateIds, isAdmin, persistSystemTemplateData],
  );

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
    const kept = orderedSelectedKeys.filter((k) => unifiedKeyInAllowlist(k, catalogAllowlist));
    const unchanged =
      kept.length === selectedKeys.size && kept.every((k) => selectedKeys.has(k));
    if (unchanged) return;
    const defaults = DEFAULT_UNIFIED_SERIES_KEYS.filter((k) => catalogAllowlist.has(k));
    const fallback = defaults.length > 0 ? defaults : [...catalogAllowlist].slice(0, 3);
    const next = kept.length > 0 ? new Set(kept) : new Set(fallback);
    onSelectedKeysChange(next);
  }, [catalogAllowlist, onSelectedKeysChange, orderedSelectedKeys, selectedKeys]);

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
    return serializeUnifiedKeys(orderedSelectedKeys, catalogAllowlist);
  }, [orderedSelectedKeys, catalogAllowlist]);

  const selectedKeyOptions = useMemo(
    () =>
      orderedSelectedKeys.map((key) => ({
        key,
        label: resolveSeriesLabel(key),
      })),
    [orderedSelectedKeys, resolveSeriesLabel],
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

  const mdsUnitByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const [k, attrs] of mdsAttrsByKey) {
      if (attrs.unit && attrs.unit !== "-") m.set(k, attrs.unit);
    }
    return m;
  }, [mdsAttrsByKey]);

  const displayPayload = useMemo<MacroPayload | null>(() => {
    if (!rawPayload) return null;

    const work: SeriesWorking[] = rawPayload.series
      .map((s) => {
        const key = s.key?.trim();
        if (!key) return null;
        const cfg = { ...DEFAULT_SERIES_CALC_CONFIG, ...(seriesCalcConfigMap[key] ?? {}) };
        const scaled = s.data.map((v) => applyUnitAdjust(v, cfg.unit));
        // 先重采样再算 YoY/环比：unified 拉取会把日频（WTI）与月频（CPI）并到同一
        // 时间轴；若在日频轴上 idx-12 做同比，1986 年后 WTI 插入日点后会全部失效。
        let outCategories = rawPayload.categories;
        let outValues = scaled;
        if (cfg.frequency !== "keep") {
          const sampled = resampleSeries(
            outCategories,
            outValues,
            cfg.frequency,
            cfg.resampleMethod,
          );
          outCategories = sampled.categories;
          outValues = sampled.data;
        }
        const transformed = applySeriesOp(outValues, cfg.op);
        const label = catalogLabelByKey.get(key) ?? resolveSeriesLabel(key) ?? s.name;
        const suffix = buildMacroSeriesCalcSuffix(cfg);
        const baseName = suffix ? `${label}（${suffix}）` : label;
        const unit = effectiveMacroSeriesUnit(key, cfg, mdsUnitByKey);
        const axis = seriesVisualMap[key]?.axis;
        return {
          key,
          name: decorateMacroSeriesDisplayName(baseName, { unit, axis }),
          categories: outCategories,
          data: transformed,
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
      derivedSeries.push(
        deriveSeries(left, right, calc.op, calc.name, key),
      );
      const derived = derivedSeries[derivedSeries.length - 1]!;
      derived.name = decorateMacroSeriesDisplayName(calc.name, {
        axis: seriesVisualMap[key]?.axis,
      });
    }

    const allSeries = [...work, ...derivedSeries];
    const allCategories = collectAlignedPeriodKeys(allSeries);
    const finalSeries = allSeries.map((s) => {
      const m = seriesToAlignedValueMap(s.categories, s.data);
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
  }, [
    catalogLabelByKey,
    derivedCalcs,
    mdsUnitByKey,
    rawPayload,
    resolveSeriesLabel,
    seriesCalcConfigMap,
    seriesVisualMap,
  ]);

  const chartAvailableYears = useMemo(
    () => extractYearsFromCategories(displayPayload?.categories ?? []),
    [displayPayload?.categories],
  );

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
    const fredCodes = [...selectedKeys]
      .map((k) => fredInstrumentCodeFromKey(k))
      .filter((c): c is string => Boolean(c));
    const instrumentCodes = [...new Set([...mdsCodes, ...fredCodes])];
    if (instrumentCodes.length === 0) {
      setMdsAttrsByKey(new Map());
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      kind: "MACRO_SERIES",
      limit: String(Math.max(100, instrumentCodes.length + 20)),
      codes: instrumentCodes.join(","),
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
          const attrs: MdsIndicatorAttrs = {
            country: countryNameZh || countryNameByCode(countryCode),
            unit,
            frequency,
            source,
            updatedAt: fmtIsoDate(updatedAt),
            range: mdsRangeTextFromMetadata(metadata),
          };
          next.set(`mds:${code}`, attrs);
          if (code.startsWith("sched_fred_")) {
            const fredId = code.slice("sched_fred_".length);
            if (fredId) next.set(`fred:${fredId}`, attrs);
          }
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

  const seriesDisplayLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    if (!displayPayload?.series) return m;
    for (const s of displayPayload.series) {
      if (s.key) m.set(s.key, s.name);
    }
    return m;
  }, [displayPayload]);

  const selectedRowByKey = useMemo(() => {
    const m = new Map<
      string,
      {
        key: string;
        label: string;
        frequency: string;
        range: string;
        unit: string;
        country: string;
        updatedAt: string;
        source: string;
      }
    >();
    for (const key of orderedSelectedKeys) {
      const attrLookupKey = key.startsWith("fred:") ? fredCatalogBaseKey(key) : key;
      const mdsAttrs = mdsAttrsByKey.get(key) ?? mdsAttrsByKey.get(attrLookupKey);
      const extracted = extractedMetaByKey.get(key);
      m.set(key, {
        key,
        label: resolveSeriesLabel(key, seriesDisplayLabelByKey),
        frequency:
          extracted?.frequency ??
          mdsAttrs?.frequency ??
          catalogMetaByKey.get(attrLookupKey)?.frequency ??
          catalogMetaByKey.get(key)?.frequency ??
          "-",
        range: extracted?.range ?? mdsAttrs?.range ?? "-",
        unit: mdsAttrs?.unit ?? "-",
        country: mdsAttrs?.country ?? "-",
        updatedAt: mdsAttrs?.updatedAt ?? "-",
        source: mdsAttrs?.source ?? "-",
      });
    }
    return m;
  }, [
    orderedSelectedKeys,
    catalogMetaByKey,
    extractedMetaByKey,
    mdsAttrsByKey,
    resolveSeriesLabel,
    seriesDisplayLabelByKey,
  ]);

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
    if (requestedQuery) {
      return requestedQuery
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return orderedSelectedKeys;
  }, [displayPayload, orderedSelectedKeys, requestedQuery]);

  const macroEventContextDate = useMemo(
    () => contextDateFromTimeLabel(macroCrosshairTimeLabel),
    [macroCrosshairTimeLabel],
  );

  const macroEventRangeFrom = useMemo(
    () => contextDateFromTimeLabel(macroVisibleFromLabel),
    [macroVisibleFromLabel],
  );

  const macroEventRangeTo = useMemo(
    () => contextDateFromTimeLabel(macroVisibleToLabel),
    [macroVisibleToLabel],
  );

  const macroEventContextCountries = useMemo(
    () => extractCountriesFromMacroKeys(orderedSelectedKeys),
    [orderedSelectedKeys],
  );

  const macroEventContextMacroKeys = useMemo(
    () => orderedSelectedKeys.slice(0, 12),
    [orderedSelectedKeys],
  );

  const onMacroCrosshairTimeLabel = useCallback((timeLabel: string | null) => {
    setMacroCrosshairTimeLabel(timeLabel);
  }, []);

  const onMacroVisibleRangeLabels = useCallback(
    (payload: { fromLabel: string | null; toLabel: string | null }) => {
      setMacroVisibleFromLabel(payload.fromLabel);
      setMacroVisibleToLabel(payload.toLabel);
    },
    [],
  );

  const chartSettingsLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const key of chartPropertyKeys) {
      const cfg = { ...DEFAULT_SERIES_CALC_CONFIG, ...(seriesCalcConfigMap[key] ?? {}) };
      let base = macroSeriesLabelByKey.get(key) ?? resolveSeriesLabel(key, macroSeriesLabelByKey);
      if (key.startsWith("calc:")) {
        const calcId = key.slice(5);
        const calc = derivedCalcs.find((c) => c.id === calcId);
        if (calc) base = calc.name;
      } else if (rawPayload) {
        const rawSeries = rawPayload.series.find((s) => s.key === key);
        if (rawSeries) {
          const label = catalogLabelByKey.get(key) ?? resolveSeriesLabel(key) ?? rawSeries.name;
          const suffix = buildMacroSeriesCalcSuffix(cfg);
          base = suffix ? `${label}（${suffix}）` : label;
        }
      }
      const unit = effectiveMacroSeriesUnit(key, cfg, mdsUnitByKey);
      const axis = seriesVisualMap[key]?.axis;
      m.set(key, decorateMacroSeriesDisplayName(base, { unit, axis }));
    }
    return m;
  }, [
    catalogLabelByKey,
    chartPropertyKeys,
    derivedCalcs,
    macroSeriesLabelByKey,
    mdsUnitByKey,
    rawPayload,
    resolveSeriesLabel,
    seriesCalcConfigMap,
    seriesVisualMap,
  ]);

  const introTemplateId = activeTemplateId ?? INTRO_WORKSPACE_TEMPLATE_ID;

  const introTemplateMeta = useMemo(() => {
    if (!activeTemplate) {
      return {
        name: null as string | null,
        description: null as string | null,
        keys: orderedSelectedKeys,
      };
    }
    const resolved = resolveTemplateConfig(activeTemplate);
    return {
      name: resolved.name,
      description: resolved.description ?? null,
      keys: resolved.selectedKeys.length > 0 ? resolved.selectedKeys : orderedSelectedKeys,
    };
  }, [activeTemplate, orderedSelectedKeys, resolveTemplateConfig]);

  const introIndicators = useMemo(
    () =>
      introTemplateMeta.keys.map((key) => ({
        key,
        label: resolveSeriesLabel(key, chartSettingsLabelByKey),
      })),
    [chartSettingsLabelByKey, introTemplateMeta.keys, resolveSeriesLabel],
  );

  const introChartSections = useMemo(() => {
    if (!activeTemplate) return null;
    const resolved = resolveTemplateConfig(activeTemplate);
    const chartIntro = resolved.chartIntroNotes;
    if (!chartIntro || Object.keys(chartIntro).length === 0) return null;
    const slotTitles = resolved.displayConfig?.slotTitles ?? {};
    const slots = Object.keys(chartIntro)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    return slots.map((slot) => ({
      slotKey: String(slot),
      title: slotTitles[slot] ?? `图 ${slot + 1}`,
    }));
  }, [activeTemplate, resolveTemplateConfig]);

  const mergedIntroNotes = useMemo(() => {
    const user = templateIndicatorNotes[introTemplateId] ?? {};
    if (activeTemplate) {
      const resolved = resolveTemplateConfig(activeTemplate);
      if (resolved.chartIntroNotes && Object.keys(resolved.chartIntroNotes).length > 0) {
        return { ...resolved.chartIntroNotes, ...user };
      }
      const base = resolved.indicatorIntroNotes ?? {};
      return { ...base, ...user };
    }
    return { ...user };
  }, [
    activeTemplate,
    introTemplateId,
    resolveTemplateConfig,
    templateIndicatorNotes,
  ]);

  const onIntroNoteChange = useCallback(
    (key: string, text: string) => {
      setTemplateIndicatorNotes((prev) => {
        const row = { ...(prev[introTemplateId] ?? {}) };
        const trimmed = text.trim();
        if (trimmed) row[key] = text.slice(0, 8000);
        else delete row[key];
        if (Object.keys(row).length === 0) {
          if (!(introTemplateId in prev)) return prev;
          const next = { ...prev };
          delete next[introTemplateId];
          return next;
        }
        return { ...prev, [introTemplateId]: row };
      });
    },
    [introTemplateId],
  );

  const flushIntroDescriptionSave = useCallback(async () => {
    if (!isAdmin) return;
    const pending = introDescPendingSaveRef.current;
    if (!pending) return;
    introDescPendingSaveRef.current = null;
    try {
      if (pending.kind === "hardcoded") {
        await persistBuiltinTemplateOverrides(pending.overrides);
      } else {
        await persistSystemTemplateData({ customBuiltinTemplates: pending.templates });
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "保存总介绍失败");
    }
  }, [isAdmin, persistBuiltinTemplateOverrides, persistSystemTemplateData]);

  const onIntroDescriptionChange = useCallback(
    (text: string) => {
      if (!isAdmin || !activeTemplate?.builtIn) return;
      const templateId = activeTemplate.id;
      const trimmed = text.trim();
      const nextDescription = trimmed
        ? text.slice(0, INTRO_DESCRIPTION_MAX_LEN)
        : undefined;

      if (HARDCODED_BUILTIN_TEMPLATE_IDS.has(templateId)) {
        setBuiltinTemplateOverrides((prev) => {
          const base =
            prev[templateId] ?? buildBuiltinOverrideFromTemplate(activeTemplate);
          const merged: BuiltinTemplateOverride = {
            ...base,
            description: nextDescription,
            updatedAtIso: new Date().toISOString(),
          };
          const next = { ...prev, [templateId]: merged };
          introDescPendingSaveRef.current = { kind: "hardcoded", overrides: next };
          return next;
        });
      } else if (templateId.startsWith("builtin-custom-")) {
        setCustomBuiltinTemplates((prev) => {
          const next = prev.map((t) =>
            t.id === templateId ? { ...t, description: nextDescription } : t,
          );
          introDescPendingSaveRef.current = { kind: "custom", templates: next };
          return next;
        });
      } else {
        return;
      }

      if (introDescSaveTimerRef.current) window.clearTimeout(introDescSaveTimerRef.current);
      introDescSaveTimerRef.current = window.setTimeout(() => {
        void flushIntroDescriptionSave();
      }, 450);
    },
    [activeTemplate, flushIntroDescriptionSave, isAdmin],
  );

  useEffect(() => {
    return () => {
      if (introDescSaveTimerRef.current) {
        window.clearTimeout(introDescSaveTimerRef.current);
        introDescSaveTimerRef.current = null;
      }
      void flushIntroDescriptionSave();
    };
  }, [activeTemplateId, flushIntroDescriptionSave]);

  const tableColumns = useMemo(() => {
    const order = extractedKeyOrder.length > 0 ? extractedKeyOrder : [...extractedSet];
    return order.map((key) => ({
      key,
      label: resolveSeriesLabel(key, chartSettingsLabelByKey),
    }));
  }, [chartSettingsLabelByKey, extractedKeyOrder, extractedSet, resolveSeriesLabel]);

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
      const cmp = compareMacroPeriodLabels(categories[ia]!, categories[ib]!);
      return tableTimeSort === "asc" ? cmp : -cmp;
    });
    return indices.filter((idx) =>
      tableColumns.some((col) => {
        const v = tableValueByKey.get(col.key)?.[idx];
        return v != null && Number.isFinite(v);
      }),
    );
  }, [displayPayload, tableColumns, tableTimeSort, tableValueByKey]);

  const tableColumnWidths = useMemo(() => {
    if (!displayPayload) {
      return { time: 88, columns: new Map<string, number>() };
    }

    const timeHeaderUnits = estimateTableTextWidthUnits("时间 ↓");
    let timeDataUnits = 0;
    for (const cat of displayPayload.categories) {
      timeDataUnits = Math.max(
        timeDataUnits,
        estimateTableTextWidthUnits(
          formatMacroPeriodDisplay(cat, displayPayload.categories),
        ),
      );
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

  const exportExtractedData = useCallback(
    (format: "csv" | "xlsx") => {
      if (!displayPayload) return;
      const matrix = buildMacroExportMatrix(
        displayPayload.categories,
        tableColumns,
        tableValueByKey,
        sortedTableRowIndices,
      );
      const filename = macroExportFilename(format);
      if (format === "csv") {
        downloadMacroCsv(matrix, filename);
        return;
      }
      void downloadMacroXlsx(matrix, filename);
    },
    [displayPayload, sortedTableRowIndices, tableColumns, tableValueByKey],
  );

  const startSidebarResize = useCallback(
    (downEvent: React.MouseEvent) => {
      downEvent.preventDefault();
      const row = macroLayoutRowRef.current;
      if (!row) return;
      const startX = downEvent.clientX;
      const startW = sidebarWidthPx ?? SIDEBAR_DEFAULT_PX;

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const next = Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, startW + delta));
        setSidebarWidthPx(next);
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

      if (sidebarWidthPx === null) {
        setSidebarWidthPx(startW);
      }
    },
    [sidebarWidthPx],
  );

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
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-fs-border px-4 pb-1.5 pt-1 lg:px-6">
        <MacroMainToolbar
          mainTab={mainTab}
          onMainTabChange={setMainTab}
          onExtractData={handleExtractData}
          extractDisabled={loading || selectedKeys.size === 0}
          onCreateTemplate={createNewTemplateDraft}
          onSaveTemplate={quickSaveTemplateToMine}
          isAdmin={isAdmin}
          canDeleteActiveTemplate={Boolean(activeTemplate && (activeTemplate.builtIn ? isAdmin : true))}
          onDeleteActiveTemplate={deleteActiveTemplate}
        />
        {mainTab === "charts" ? (
          <>
            <span
              className="hidden h-5 w-px shrink-0 bg-fs-border/90 sm:block"
              aria-hidden
            />
            <MacroChartDrawingToolbar
              tool={macroDrawTool}
              onToolChange={setMacroDrawTool}
              onClear={clearMacroDrawings}
              drawStyle={macroDrawStyle}
              onDrawStyleChange={(patch) =>
                setMacroDrawStyle((prev) => ({ ...prev, ...patch }))
              }
              selectedDrawing={selectedMacroDrawing}
              onSelectedStyleChange={onMacroSelectedStyleChange}
              onSelectedTextChange={onMacroSelectedTextChange}
              onDeleteSelected={deleteSelectedMacroDrawing}
            />
          <label className="flex shrink-0 flex-wrap items-center gap-2 text-xs font-medium text-fs-muted">
            <span className="shrink-0">图表布局</span>
            <select
              value={layoutMode}
              onChange={(e) =>
                setLayoutMode(Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6)
              }
              className="min-w-[10rem] rounded-md border border-fs-border bg-fs-bg px-2 py-1.5 text-xs text-fs-text focus:border-fs-accent focus:outline-none focus:ring-1 focus:ring-fs-accent/30"
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
            <label className="flex cursor-pointer items-center gap-1 rounded-md border border-fs-border bg-fs-bg/45 px-2 py-1.5 text-xs text-fs-secondary hover:border-fs-border">
              <input
                type="checkbox"
                checked={pageSyncEnabled}
                onChange={(e) => setPageSyncEnabled(e.target.checked)}
                className="h-3 w-3 shrink-0 rounded border-fs-border"
                aria-label="页面同步"
                aria-describedby="macro-page-sync-tip"
              />
              页面同步
            </label>
            <div
              id="macro-page-sync-tip"
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 hidden w-max max-w-[14rem] rounded-md border border-fs-border bg-fs-elevated px-2.5 py-1.5 text-[11px] leading-snug text-fs-text shadow-lg group-hover:block"
            >
              多显示器多窗口时，数据同步展示。
            </div>
          </div>
          </>
        ) : null}
      </div>

      <div
        ref={macroLayoutRowRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-fs-border lg:flex-row lg:items-stretch lg:border-t-0"
      >
        {sidebarCollapsed ? (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="hidden w-9 shrink-0 flex-col items-center justify-center gap-0.5 border-r border-fs-border bg-fs-bg/90 py-3 text-[11px] leading-tight text-fs-muted transition hover:bg-fs-elevated hover:text-fs-text lg:flex"
            title="展开指标树"
          >
            <span>指</span>
            <span>标</span>
            <span>树</span>
          </button>
        ) : (
          <>
            <aside
              className="flex max-h-[40vh] min-h-0 w-full shrink-0 flex-col overflow-hidden border-fs-border bg-fs-elevated lg:max-h-none lg:min-h-0 lg:w-auto lg:border-r lg:border-t-0"
              style={{
                flex: "0 0 auto",
                width: `min(100%, ${sidebarWidthPx ?? SIDEBAR_DEFAULT_PX}px)`,
                maxWidth: SIDEBAR_MAX_PX,
              }}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-fs-border px-3 py-1.5 lg:px-4">
                <span className="text-xs font-medium text-fs-muted">指标目录</span>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(true)}
                  className="hidden rounded border border-fs-border/80 px-1.5 py-0.5 text-[10px] text-fs-muted transition hover:border-fs-border hover:text-fs-text lg:inline-block"
                  title="折叠指标树"
                >
                  折叠
                </button>
              </div>
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
            <div
              role="separator"
              aria-orientation="vertical"
              title="拖拽调节指标树宽度"
              onMouseDown={startSidebarResize}
              className="group hidden w-1.5 shrink-0 cursor-col-resize border-x border-fs-border bg-fs-elevated/90 hover:bg-fs-accent-soft lg:block"
            >
              <span className="mx-auto block h-full w-px bg-fs-border group-hover:bg-fs-accent" />
            </div>
          </>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-fs-bg/40 px-3 py-3 lg:min-h-0 lg:px-6 lg:py-4">
          {mainTab === "selected" ? (
            <section className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
              <div className="shrink-0 border-b border-fs-border pb-2">
                <div className="rounded-md border border-fs-border/90 bg-fs-elevated px-2 py-1.5">
                  <div className="flex flex-wrap items-end gap-x-2 gap-y-1 text-[11px]">
                    <span className="shrink-0 self-center text-[10px] font-medium text-fs-muted">
                      单指标
                    </span>
                    <label className="text-fs-muted">
                      指标
                      <select
                        value={calcTargetKey}
                        onChange={(e) => setCalcTargetKey(e.target.value)}
                        className="ml-1 max-w-[9rem] rounded border border-fs-border bg-fs-elevated px-1.5 py-0.5 text-[11px] text-fs-text"
                      >
                        {selectedKeyOptions.map((x) => (
                          <option key={x.key} value={x.key}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-fs-muted">
                      运算
                      <select
                        value={calcDraft.op}
                        onChange={(e) =>
                          setCalcDraft((prev) => ({ ...prev, op: e.target.value as MacroSeriesCalcOp }))
                        }
                        className="ml-1 rounded border border-fs-border bg-fs-elevated px-1.5 py-0.5 text-[11px] text-fs-text"
                      >
                        <option value="none">原始</option>
                        <option value="pctChange">环比%</option>
                        <option value="yoy">同比%</option>
                        <option value="diff">差分</option>
                        <option value="cumsum">累计</option>
                      </select>
                    </label>
                    <label className="text-fs-muted">
                      频率
                      <select
                        value={calcDraft.frequency}
                        onChange={(e) =>
                          setCalcDraft((prev) => ({
                            ...prev,
                            frequency: e.target.value as MacroFrequencyAdjust,
                          }))
                        }
                        className="ml-1 rounded border border-fs-border bg-fs-elevated px-1.5 py-0.5 text-[11px] text-fs-text"
                      >
                        <option value="keep">原始</option>
                        <option value="month">月</option>
                        <option value="quarter">季</option>
                        <option value="year">年</option>
                      </select>
                    </label>
                    <label className="text-fs-muted">
                      变频
                      <select
                        value={calcDraft.resampleMethod}
                        onChange={(e) =>
                          setCalcDraft((prev) => ({
                            ...prev,
                            resampleMethod: e.target.value as MacroResampleMethod,
                          }))
                        }
                        className="ml-1 rounded border border-fs-border bg-fs-elevated px-1.5 py-0.5 text-[11px] text-fs-text"
                      >
                        <option value="avg">平均</option>
                        <option value="start">期初</option>
                        <option value="end">期末</option>
                      </select>
                    </label>
                    <label className="text-fs-muted">
                      单位
                      <select
                        value={calcDraft.unit}
                        onChange={(e) =>
                          setCalcDraft((prev) => ({ ...prev, unit: e.target.value as MacroUnitAdjust }))
                        }
                        className="ml-1 rounded border border-fs-border bg-fs-elevated px-1.5 py-0.5 text-[11px] text-fs-text"
                      >
                        <option value="keep">原始</option>
                        <option value="x0.01">x0.01</option>
                        <option value="x100">x100</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={applyCalcConfigToKey}
                      className="rounded border border-fs-accent/50 bg-fs-accent-soft px-2 py-0.5 text-[11px] font-medium text-fs-accent-text hover:border-fs-accent"
                    >
                      应用
                    </button>
                    <button
                      type="button"
                      onClick={() => calcTargetKey && resetCalcConfigForKey(calcTargetKey)}
                      className="rounded border border-fs-border px-2 py-0.5 text-[11px] text-fs-secondary hover:border-fs-border"
                    >
                      重置
                    </button>

                    <span
                      className="mx-0.5 hidden h-6 w-px shrink-0 self-center bg-fs-border/80 sm:inline-block"
                      aria-hidden
                    />

                    <span className="shrink-0 self-center text-[10px] font-medium text-fs-muted">
                      指标间
                    </span>
                    <label className="text-fs-muted">
                      左
                      <select
                        value={derivedLeftKey}
                        onChange={(e) => setDerivedLeftKey(e.target.value)}
                        className="ml-1 max-w-[9rem] rounded border border-fs-border bg-fs-elevated px-1.5 py-0.5 text-[11px] text-fs-text"
                      >
                        {selectedKeyOptions.map((x) => (
                          <option key={`l-${x.key}`} value={x.key}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-fs-muted">
                      运算
                      <select
                        value={derivedOp}
                        onChange={(e) => setDerivedOp(e.target.value as MacroDerivedCalcOp)}
                        className="ml-1 rounded border border-fs-border bg-fs-elevated px-1.5 py-0.5 text-[11px] text-fs-text"
                      >
                        <option value="ratio">A/B</option>
                        <option value="spread">A-B</option>
                        <option value="add">A+B</option>
                        <option value="sub">A-B</option>
                        <option value="mul">A×B</option>
                        <option value="div">A÷B</option>
                      </select>
                    </label>
                    <label className="text-fs-muted">
                      右
                      <select
                        value={derivedRightKey}
                        onChange={(e) => setDerivedRightKey(e.target.value)}
                        className="ml-1 max-w-[9rem] rounded border border-fs-border bg-fs-elevated px-1.5 py-0.5 text-[11px] text-fs-text"
                      >
                        {selectedKeyOptions.map((x) => (
                          <option key={`r-${x.key}`} value={x.key}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-fs-muted">
                      名称
                      <input
                        type="text"
                        value={derivedName}
                        onChange={(e) => setDerivedName(e.target.value)}
                        placeholder="自动"
                        className="ml-1 w-24 rounded border border-fs-border bg-fs-elevated px-1.5 py-0.5 text-[11px] text-fs-text placeholder:text-fs-secondary"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={addDerivedCalc}
                      className="rounded border border-fs-accent/30 bg-fs-accent-soft px-2 py-0.5 text-[11px] text-fs-accent-text hover:border-fs-accent"
                    >
                      添加
                    </button>
                  </div>
                  {derivedCalcs.length > 0 ? (
                    <ul className="mt-1 flex flex-wrap gap-1 border-t border-fs-border/70 pt-1">
                      {derivedCalcs.map((x) => (
                        <li
                          key={x.id}
                          className="flex items-center gap-1 rounded border border-fs-border bg-fs-elevated px-2 py-0.5 text-[10px] text-fs-secondary"
                        >
                          <span>{x.name}</span>
                          <button
                            type="button"
                            onClick={() => renameDerivedCalc(x.id)}
                            className="rounded border border-fs-border px-1 text-[10px] text-fs-secondary hover:border-fs-border"
                          >
                            改名
                          </button>
                          <button
                            type="button"
                            onClick={() => removeDerivedCalc(x.id)}
                            className="rounded border border-fs-negative/50 bg-white px-1 text-[10px] font-medium text-fs-negative hover:border-fs-negative hover:bg-red-50"
                          >
                            删
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-0 flex-[1_1_50%] flex-col border-b border-fs-border">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-fs-border px-2 py-1 text-[11px] font-medium text-fs-muted">
                  <span>
                    已选指标
                    <span className="ml-2 font-normal text-fs-secondary">
                      {selectedKeys.size}/{MACRO_MAX_SERIES}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={selectedListItems.length === 0}
                    onClick={() =>
                      setSelectedListItems((prev) => [
                        ...prev,
                        createDividerItem(),
                      ])
                    }
                    className="rounded border border-fs-accent/50 bg-fs-accent-soft px-1.5 py-0 text-[10px] font-medium text-fs-accent-text hover:border-fs-accent disabled:opacity-40"
                    title="在列表末尾添加分割线"
                  >
                    添加分割线
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-t-lg border border-b-0 border-fs-border/90 bg-fs-bg/60">
                  <SelectedIndicatorsList
                    items={selectedListItems}
                    rowByKey={selectedRowByKey}
                    onChange={setSelectedListItems}
                    onRemoveKey={removeSelectedKey}
                    onLocateKey={locateIndicatorInSidebar}
                  />
                </div>
              </div>

              <div className="flex min-h-0 flex-[1_1_50%] flex-col">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-fs-border px-2 py-1 text-[11px] font-medium text-fs-muted">
                  <span>提取数据</span>
                  <div className="flex items-center gap-1">
                    <span className="font-normal text-fs-secondary">导出</span>
                    <button
                      type="button"
                      disabled={!displayPayload}
                      onClick={() => exportExtractedData("csv")}
                      title="导出为 CSV"
                      className="rounded border border-fs-accent/50 bg-fs-accent-soft px-1.5 py-0 text-[10px] font-medium text-fs-accent-text hover:border-fs-accent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      CSV
                    </button>
                    <button
                      type="button"
                      disabled={!displayPayload}
                      onClick={() => exportExtractedData("xlsx")}
                      title="导出为 Excel"
                      className="rounded border border-fs-accent/50 bg-fs-accent-soft px-1.5 py-0 text-[10px] font-medium text-fs-accent-text hover:border-fs-accent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      XLSX
                    </button>
                  </div>
                </div>
                <div
                  className="min-h-0 flex-1 overflow-hidden rounded-b-lg border border-fs-border/90 bg-fs-bg/60"
                  suppressHydrationWarning
                >
                  {displayPayload ? (
                    <div className="h-full overflow-auto">
                      <table className="w-max max-w-none border-separate border-spacing-0 text-xs table-fixed">
                        <colgroup>
                          <col style={{ width: tableColumnWidths.time }} />
                          {tableColumns.map((c) => (
                            <col
                              key={c.key}
                              style={{ width: tableColumnWidths.columns.get(c.key) ?? 120 }}
                            />
                          ))}
                        </colgroup>
                        <thead className="sticky top-0 z-10 bg-fs-elevated text-fs-secondary">
                          <tr>
                            <th
                              className="sticky left-0 z-20 border-b border-r border-fs-border bg-fs-elevated px-2 py-1 text-left font-medium"
                              style={{
                                width: tableColumnWidths.time,
                                minWidth: tableColumnWidths.time,
                              }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setTableTimeSort((prev) => (prev === "asc" ? "desc" : "asc"))
                                }
                                className="inline-flex items-center gap-1 text-fs-secondary hover:text-fs-accent-text"
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
                                  className="text-[10px] text-fs-accent-text"
                                  aria-hidden
                                >
                                  {tableTimeSort === "asc" ? "↑" : "↓"}
                                </span>
                              </button>
                            </th>
                            {tableColumns.map((c) => (
                              <th
                                key={c.key}
                                className="border-b border-r border-fs-border bg-fs-elevated px-2 py-1 text-left font-medium whitespace-nowrap"
                                style={{ width: tableColumnWidths.columns.get(c.key) }}
                                title={c.label}
                              >
                                {c.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedTableRowIndices.map((idx, rowIdx) => {
                            const time = displayPayload.categories[idx]!;
                            const stickyTimeBg =
                              rowIdx % 2 === 0 ? "bg-fs-bg" : "bg-fs-elevated/35";
                            return (
                            <tr
                              key={`${time}-${idx}`}
                              className="odd:bg-fs-bg even:bg-fs-elevated/35"
                            >
                              <td
                                className={`sticky left-0 z-[5] whitespace-nowrap border-b border-r border-fs-border px-2 py-0.5 text-fs-muted tabular-nums ${stickyTimeBg}`}
                                style={{ minWidth: tableColumnWidths.time }}
                              >
                                {formatMacroPeriodDisplay(
                                  time,
                                  displayPayload.categories,
                                )}
                              </td>
                              {tableColumns.map((c) => (
                                <td
                                  key={`${c.key}-${idx}`}
                                  className="whitespace-nowrap border-b border-r border-fs-border px-2 py-0.5 text-fs-text tabular-nums"
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
                    <p className="px-3 py-6 text-center text-xs text-fs-muted">
                      点击「提取数据」后，各指标数值将显示在此处。
                    </p>
                  )}
                </div>
              </div>
            </section>
          ) : mainTab === "charts" ? (
            <section className="flex min-h-0 flex-1 flex-col gap-2">
              {loading ? (
                <div className="flex min-h-[200px] flex-1 items-center justify-center text-sm text-fs-muted">
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
                        drawStyle={macroDrawStyle}
                        drawingsBySlot={macroDrawingsBySlot}
                        selectedDrawingBySlot={selectedDrawingBySlot}
                        onDrawingsChange={onMacroDrawingsChange}
                        onSelectDrawing={onMacroSelectDrawing}
                        onDrawInteraction={onMacroDrawInteraction}
                        onCrosshairTimeLabel={onMacroCrosshairTimeLabel}
                        onVisibleRangeLabels={onMacroVisibleRangeLabels}
                      />
                    </div>

                    {chartSettingsOpen ? (
                      <>
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          title="拖拽调节宽度"
                          onMouseDown={startChartSettingsResize}
                          className="group w-1.5 shrink-0 cursor-col-resize border-x border-fs-border bg-fs-elevated/90 hover:bg-fs-accent-soft"
                        >
                          <span className="mx-auto block h-full w-px bg-fs-border group-hover:bg-fs-accent" />
                        </div>
                        <aside
                          className="max-w-[65%] flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-fs-border bg-fs-bg/85"
                          style={
                            chartSettingsWidthPx !== null
                              ? { width: chartSettingsWidthPx, flex: "0 0 auto" }
                              : { flex: "0 0 33%", minWidth: CHART_SETTINGS_MIN_PX }
                          }
                        >
                          <div className="flex shrink-0 flex-col gap-2 border-b border-fs-border px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 flex-1 gap-0.5 rounded-md border border-fs-border/90 bg-fs-elevated p-0.5">
                                {(
                                  [
                                    { id: "settings" as const, label: "图形设置" },
                                    { id: "events" as const, label: "事件记录" },
                                    { id: "intro" as const, label: "模板介绍" },
                                  ] as const
                                ).map(({ id, label }) => (
                                  <button
                                    key={id}
                                    type="button"
                                    onClick={() => setChartSidePanelTab(id)}
                                    className={`flex-1 rounded px-2 py-0.5 text-[11px] font-medium transition ${
                                      chartSidePanelTab === id
                                        ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
                                        : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
                                    }`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => setChartSettingsOpen(false)}
                                className="shrink-0 rounded border border-fs-border px-2 py-0.5 text-[11px] text-fs-muted hover:border-fs-border hover:text-fs-text"
                              >
                                收起
                              </button>
                            </div>
                            {chartSidePanelTab === "settings" ? (
                              <div className="flex min-w-0 gap-0.5 rounded-md border border-fs-border/90 bg-fs-elevated p-0.5">
                                {(
                                  [
                                    { id: "global" as const, label: "全图设置" },
                                    { id: "single" as const, label: "单图设置" },
                                    { id: "axis" as const, label: "轴设置" },
                                  ] as const
                                ).map(({ id, label }) => (
                                  <button
                                    key={id}
                                    type="button"
                                    onClick={() => setChartPropsTab(id)}
                                    className={`flex-1 rounded px-2 py-0.5 text-[11px] font-medium transition ${
                                      chartPropsTab === id
                                        ? "bg-fs-elevated text-fs-text ring-1 ring-fs-border"
                                        : "text-fs-muted hover:bg-fs-elevated hover:text-fs-secondary"
                                    }`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <div
                            className={`min-h-0 flex-1 text-xs text-fs-muted ${
                              chartSidePanelTab === "events" || chartSidePanelTab === "intro"
                                ? "flex flex-col overflow-hidden px-2 py-2"
                                : "overflow-y-auto px-2 py-2"
                            }`}
                          >
                            {chartSidePanelTab === "events" ? (
                              <EventChartSidePanel
                                variant="embedded"
                                rangeFrom={macroEventRangeFrom}
                                rangeTo={macroEventRangeTo}
                                trackDate={macroEventContextDate}
                                contextCountries={macroEventContextCountries}
                                contextMacroKeys={macroEventContextMacroKeys}
                                className="h-full min-h-[12rem]"
                              />
                            ) : chartSidePanelTab === "intro" ? (
                              <MacroTemplateIntroPanel
                                templateName={introTemplateMeta.name}
                                templateDescription={introTemplateMeta.description}
                                chartSections={introChartSections ?? undefined}
                                indicators={introChartSections ? [] : introIndicators}
                                notes={mergedIntroNotes}
                                onNoteChange={onIntroNoteChange}
                                onDescriptionChange={
                                  isAdmin && activeTemplate?.builtIn
                                    ? onIntroDescriptionChange
                                    : undefined
                                }
                                editable={isAdmin}
                                className="h-full min-h-[12rem]"
                              />
                            ) : (
                              <>
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
                              availableYears={chartAvailableYears}
                              chartPayload={displayPayload}
                              tab={chartPropsTab}
                            />
                            {chartPropsTab === "global" ? (
                              <div className="mt-3 border-t border-fs-border pt-3">
                                <p className="mb-2 text-[10px] leading-relaxed text-fs-muted">
                                  常见金融分析图形已支持：折线、虚线、面积、阶梯线、柱状、散点、饼图、季节图；季节图仅支持单指标（月度/季度），默认近 5 年并叠加前 N-1 年均值线；饼图可切换数据年份；并支持任意序列切到右轴。
                                </p>
                                <div className="rounded-md border border-fs-border/90 bg-fs-elevated/80 p-2 text-[10px] text-fs-muted">
                                  建议：同比增速/利率用左轴，价格指数或规模量用右轴；离散事件点可用散点，结构变化可用柱状。
                                </div>
                              </div>
                            ) : null}
                              </>
                            )}
                          </div>
                        </aside>
                      </>
                    ) : (
                      <div className="flex w-10 shrink-0 flex-col border-l border-fs-border bg-fs-bg/90">
                        <button
                          type="button"
                          onClick={() => {
                            setChartSidePanelTab("settings");
                            setChartSettingsOpen(true);
                          }}
                          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-3 text-[11px] leading-tight text-fs-muted transition hover:bg-fs-elevated hover:text-fs-text"
                          title="展开图形设置"
                        >
                          <span>图</span>
                          <span>形</span>
                          <span>设</span>
                          <span>置</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setChartSidePanelTab("events");
                            setChartSettingsOpen(true);
                          }}
                          className="flex flex-1 flex-col items-center justify-center gap-0.5 border-t border-fs-border py-3 text-[11px] leading-tight text-fs-muted transition hover:bg-fs-elevated hover:text-fs-text"
                          title="展开事件记录"
                        >
                          <span>事</span>
                          <span>件</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setChartSidePanelTab("intro");
                            setChartSettingsOpen(true);
                          }}
                          className="flex flex-1 flex-col items-center justify-center gap-0.5 border-t border-fs-border py-2 text-[11px] leading-tight text-fs-muted transition hover:bg-fs-elevated hover:text-fs-text"
                          title="展开模板介绍"
                        >
                          <span>模</span>
                          <span>板</span>
                          <span>介</span>
                          <span>绍</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-fs-border p-8 text-center text-sm text-fs-muted">
                  暂无数据
                </div>
              )}
            </section>
          ) : (
            <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              <div className="rounded-lg border border-fs-border/90 bg-fs-bg/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-fs-text">系统模板</h3>
                  {isAdmin ? (
                    <span className="text-[10px] text-fs-muted">
                      管理员可删除；代码内置模板删除后为全员隐藏，可下方恢复
                    </span>
                  ) : (
                    <span className="text-[10px] text-fs-secondary">文件夹由管理员统一维护</span>
                  )}
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
                    <div className="flex w-full flex-col gap-0.5">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => applyTemplateAndExtract(tpl)}
                        className="w-full rounded border border-fs-accent/30 bg-fs-accent-soft text-fs-accent-text hover:border-fs-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        加载
                      </button>
                      {isAdmin ? (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => deleteSystemTemplate(tpl)}
                          className="w-full rounded border border-fs-negative/50 bg-white px-1.5 py-0.5 text-[10px] font-medium text-fs-negative hover:border-fs-negative hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          删除
                        </button>
                      ) : null}
                    </div>
                  )}
                />
                {isAdmin && hiddenHardcodedBuiltinTemplates.length > 0 ? (
                  <div className="mt-3 rounded border border-fs-border bg-fs-bg/40 px-2 py-2">
                    <p className="text-[10px] font-medium text-fs-muted">已隐藏的内置系统模板</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {hiddenHardcodedBuiltinTemplates.map((tpl) => (
                        <li key={tpl.id}>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => restoreSystemTemplate(tpl.id)}
                            className="rounded border border-fs-border px-2 py-0.5 text-[10px] text-fs-secondary hover:border-fs-accent/40 hover:text-fs-accent-text disabled:opacity-40"
                            title={`恢复「${tpl.name}」到系统模板列表`}
                          >
                            恢复「{tpl.name}」
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-fs-border/90 bg-fs-bg/60 p-3">
                <h3 className="text-sm font-medium text-fs-text">我的模板</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="模板名称"
                    className="min-w-[10rem] flex-1 rounded border border-fs-border bg-fs-elevated px-2 py-0.5 text-[11px] text-fs-text placeholder:text-fs-secondary focus:border-fs-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      isAdmin
                        ? openSaveTemplateDialog({
                            defaultMode: "user",
                            defaultName: newTemplateName,
                          })
                        : saveCurrentAsTemplate(
                            newTemplateName,
                            newTemplateFolderId.trim() ? newTemplateFolderId.trim() : null,
                          )
                    }
                    className="rounded border border-fs-accent/50 bg-fs-accent-soft px-2 py-0.5 text-[10px] font-medium text-fs-accent-text hover:border-fs-accent"
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
                        className="rounded border border-fs-accent/30 bg-fs-accent-soft text-fs-accent-text hover:border-fs-accent disabled:cursor-not-allowed disabled:opacity-40"
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
                                        selectedKeys: [...orderedSelectedKeys],
                                        selectedListItems: selectedListItems.map((i) =>
                                          i.type === "divider"
                                            ? {
                                                type: "divider" as const,
                                                id: i.id,
                                                ...(i.label ? { label: i.label } : {}),
                                              }
                                            : { type: "series" as const, key: i.key },
                                        ),
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
                          className="flex-1 rounded border border-fs-border text-fs-secondary hover:border-fs-border"
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
                          className="flex-1 rounded border border-fs-negative/50 bg-white font-medium text-fs-negative hover:border-fs-negative hover:bg-red-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-fs-bg/75 px-4">
          <div className="w-full max-w-md rounded-lg border border-fs-border bg-fs-elevated p-4 shadow-2xl">
            <h3 className="text-sm font-medium text-fs-text">保存模板</h3>
            <p className="mt-1 text-xs text-fs-muted">
              {templateSaveMode === "builtin" && isAdmin
                ? "保存为系统模板后，所有用户均可在「系统模板」中加载。"
                : "保存为我的模板，仅自己可见。"}
            </p>
            {isAdmin ? (
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-fs-secondary">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="template-save-mode"
                    checked={templateSaveMode === "user"}
                    onChange={() => {
                      setTemplateSaveMode("user");
                      if (activeTemplate && !activeTemplate.builtIn) {
                        setNewTemplateFolderId(activeTemplate.folderId ?? "");
                      } else {
                        setNewTemplateFolderId("");
                      }
                    }}
                    className="h-3 w-3 border-fs-border"
                  />
                  我的模板
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="template-save-mode"
                    checked={templateSaveMode === "builtin"}
                    onChange={() => {
                      setTemplateSaveMode("builtin");
                      if (activeTemplate?.builtIn) {
                        setNewTemplateFolderId(builtinTemplateFolderIds[activeTemplate.id] ?? "");
                      } else {
                        setNewTemplateFolderId("");
                      }
                    }}
                    className="h-3 w-3 border-fs-border"
                  />
                  系统模板
                </label>
              </div>
            ) : null}
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
                className="rounded border border-fs-border bg-fs-bg px-2 py-1.5 text-sm text-fs-text placeholder:text-fs-muted focus:border-fs-accent focus:outline-none"
              />
              <label className="flex items-center gap-2 text-xs text-fs-muted">
                <span className="shrink-0">保存到文件夹</span>
                <select
                  value={newTemplateFolderId}
                  onChange={(e) => setNewTemplateFolderId(e.target.value)}
                  className="min-w-0 flex-1 rounded border border-fs-border bg-fs-bg px-2 py-1.5 text-xs text-fs-text"
                >
                  <option value="">未分类</option>
                  {(templateSaveMode === "builtin" ? builtinFolders : userFolders).map((f) => (
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
                  className="rounded border border-fs-border px-3 py-1.5 text-xs text-fs-secondary hover:border-fs-border"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!templateNameDraft.trim()}
                  className="rounded border border-fs-accent/50 bg-fs-accent-soft px-3 py-1.5 text-xs font-medium text-fs-accent-text hover:border-fs-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {templateSaveMode === "builtin" && isAdmin ? "保存为系统模板" : "保存为我的模板"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
