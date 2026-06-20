import type { Prisma } from "@prisma/client";
import type { MacroSlotAssignment } from "@/lib/macroPartition";
import type { MacroChartDisplayConfig, MacroSeriesVisualConfigMap } from "@/lib/macroChartOption";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroDerivedCalc,
  MacroFrequencyAdjust,
  MacroResampleMethod,
  MacroSeriesCalcConfig,
  MacroSeriesCalcOp,
  MacroSeriesCalcConfigMap,
  MacroTemplateFolder,
  MacroTemplateFolderScope,
  MacroUnitAdjust,
} from "@/lib/data/macroPresetTemplates";
import {
  DEFAULT_BUILTIN_TEMPLATE_FOLDERS,
  DEFAULT_BUILTIN_TEMPLATE_FOLDER_IDS,
} from "@/lib/data/macroPresetTemplates";
import { sanitizeSelectedListItems, type MacroSelectedListItem } from "@/lib/macroSelectedList";
import { prisma } from "@/lib/prisma";

export type MacroChartPrefs = {
  version: 2;
  layoutMode: 1 | 2 | 3 | 4 | 5 | 6;
  selectedKeys: string[];
  /** 已选指标列表（含分界线），顺序即展示与提取顺序 */
  selectedListItems?: MacroSelectedListItem[];
  slotAssignment: MacroSlotAssignment;
  seriesVisualMap: MacroSeriesVisualConfigMap;
  displayConfig: MacroChartDisplayConfig;
  seriesCalcConfigMap: MacroSeriesCalcConfigMap;
  derivedCalcs: MacroDerivedCalc[];
  templates?: MacroChartTemplate[];
  /** 仅保存 scope=user 的个人模板文件夹 */
  templateFolders?: MacroTemplateFolder[];
  activeTemplateId?: string | null;
  /** 用户对各模板指标的解读笔记：templateId → indicatorKey → 文本 */
  templateIndicatorNotes?: Record<string, Record<string, string>>;
};

/** 管理员覆盖的系统内置模板配置（按 template id 索引） */
export type BuiltinTemplateOverride = {
  name?: string;
  description?: string;
  indicatorIntroNotes?: Record<string, string>;
  chartIntroNotes?: Record<string, string>;
  selectedKeys: string[];
  selectedListItems?: MacroSelectedListItem[];
  layoutMode: 1 | 2 | 3 | 4 | 5 | 6;
  slotAssignment: MacroSlotAssignment;
  seriesVisualMap: MacroSeriesVisualConfigMap;
  displayConfig?: MacroChartDisplayConfig;
  seriesCalcConfigMap?: MacroSeriesCalcConfigMap;
  derivedCalcs?: MacroDerivedCalc[];
  updatedAtIso?: string;
};

export type SystemMacroChartPrefsPayload = {
  version: 1;
  builtinTemplateOverrides: Record<string, BuiltinTemplateOverride>;
  /** 管理员创建的自定义系统模板（全员可见） */
  customBuiltinTemplates?: MacroChartTemplate[];
  /** 全局系统模板文件夹（所有用户可见） */
  builtinTemplateFolders?: MacroTemplateFolder[];
  /** 全局系统模板 → 文件夹映射 */
  builtinTemplateFolderIds?: Record<string, string | null>;
  /** 管理员隐藏的内置系统模板 id（代码内置模板无法从代码删除，仅从列表隐藏） */
  hiddenBuiltinTemplateIds?: string[];
};

const SERIES_OPS = new Set<MacroSeriesCalcOp>(["none", "pctChange", "yoy", "diff", "cumsum"]);
const FREQ_OPS = new Set<MacroFrequencyAdjust>(["keep", "month", "quarter", "year"]);
const UNIT_OPS = new Set<MacroUnitAdjust>(["keep", "x0.01", "x100"]);
const RESAMPLE_METHODS = new Set<MacroResampleMethod>(["avg", "start", "end"]);
const DERIVED_OPS = new Set<MacroDerivedCalc["op"]>([
  "add",
  "sub",
  "mul",
  "div",
  "ratio",
  "spread",
]);
const FOLDER_SCOPES = new Set<MacroTemplateFolderScope>(["builtin", "user"]);

function sanitizeIndicatorIntroNotes(input: unknown, maxKeys = 80): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    const k = key.trim();
    if (!k) continue;
    const text = String(val ?? "").trim().slice(0, 8000);
    if (text) out[k] = text;
    if (Object.keys(out).length >= maxKeys) break;
  }
  return out;
}

function sanitizeTemplateIndicatorNotes(
  input: unknown,
  maxTemplates = 40,
): Record<string, Record<string, string>> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [templateId, row] of Object.entries(input as Record<string, unknown>)) {
    const tid = templateId.trim();
    if (!tid) continue;
    const notes = sanitizeIndicatorIntroNotes(row);
    if (Object.keys(notes).length > 0) out[tid] = notes;
    if (Object.keys(out).length >= maxTemplates) break;
  }
  return out;
}

function sanitizeTemplateFolders(input: unknown): MacroTemplateFolder[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const x = row as Record<string, unknown>;
      const id = String(x.id ?? "").trim();
      const name = String(x.name ?? "").trim();
      const scope = String(x.scope ?? "").trim() as MacroTemplateFolderScope;
      if (!id || !name || !FOLDER_SCOPES.has(scope)) return null;
      return { id, name, scope } as MacroTemplateFolder;
    })
    .filter((x): x is MacroTemplateFolder => Boolean(x))
    .slice(0, 40);
}

function sanitizeBuiltinTemplateFolderIds(input: unknown): Record<string, string | null> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = k.trim();
    if (!key) continue;
    if (v === null || v === undefined || v === "") {
      out[key] = null;
    } else {
      const id = String(v).trim();
      out[key] = id || null;
    }
  }
  return out;
}

function sanitizeSeriesCalcConfigMap(input: unknown): MacroSeriesCalcConfigMap {
  if (!input || typeof input !== "object") return {};
  const out: MacroSeriesCalcConfigMap = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!k.trim() || !v || typeof v !== "object") continue;
    const row = v as Record<string, unknown>;
    const op = String(row.op ?? "").trim() as MacroSeriesCalcOp;
    const frequency = String(row.frequency ?? "").trim() as MacroFrequencyAdjust;
    const unit = String(row.unit ?? "").trim() as MacroUnitAdjust;
    const resampleMethod = String(row.resampleMethod ?? "").trim() as MacroResampleMethod;
    const cfg: MacroSeriesCalcConfig = {
      op: SERIES_OPS.has(op) ? op : "none",
      frequency: FREQ_OPS.has(frequency) ? frequency : "keep",
      unit: UNIT_OPS.has(unit) ? unit : "keep",
      resampleMethod: RESAMPLE_METHODS.has(resampleMethod) ? resampleMethod : "end",
    };
    out[k] = cfg;
  }
  return out;
}

function sanitizeMacroChartTemplates(input: unknown, max = 30): MacroChartTemplate[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const t = row as Record<string, unknown>;
      const id = String(t.id ?? "").trim();
      const name = String(t.name ?? "").trim();
      if (!id || !name) return null;
      const lm = Number(t.layoutMode);
      const layoutMode =
        lm === 1 || lm === 2 || lm === 3 || lm === 4 || lm === 5 || lm === 6 ? lm : 1;
      const selectedKeys = Array.isArray(t.selectedKeys)
        ? t.selectedKeys.map((x) => String(x).trim()).filter(Boolean)
        : [];
      const selectedListItems = sanitizeSelectedListItems(t.selectedListItems);
      const slotAssignment =
        t.slotAssignment && typeof t.slotAssignment === "object"
          ? (t.slotAssignment as MacroSlotAssignment)
          : {};
      const seriesVisualMap =
        t.seriesVisualMap && typeof t.seriesVisualMap === "object"
          ? (t.seriesVisualMap as MacroSeriesVisualConfigMap)
          : {};
      const displayConfig = {
        ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
        ...(t.displayConfig && typeof t.displayConfig === "object"
          ? (t.displayConfig as Partial<MacroChartDisplayConfig>)
          : {}),
      };
      const seriesCalcConfigMap = sanitizeSeriesCalcConfigMap(t.seriesCalcConfigMap);
      const derivedCalcs = Array.isArray(t.derivedCalcs)
        ? t.derivedCalcs
            .map((row) => {
              if (!row || typeof row !== "object") return null;
              const x = row as Record<string, unknown>;
              const did = String(x.id ?? "").trim();
              const leftKey = String(x.leftKey ?? "").trim();
              const rightKey = String(x.rightKey ?? "").trim();
              const op = String(x.op ?? "").trim() as MacroDerivedCalc["op"];
              const dname = String(x.name ?? "").trim();
              if (!did || !leftKey || !rightKey || !dname || !DERIVED_OPS.has(op)) return null;
              return { id: did, leftKey, rightKey, op, name: dname } as MacroDerivedCalc;
            })
            .filter((x): x is MacroDerivedCalc => Boolean(x))
            .slice(0, 60)
        : [];
      const createdAtIso = String(t.createdAtIso ?? "").trim() || new Date().toISOString();
      const description =
        typeof t.description === "string" && t.description.trim()
          ? t.description.trim()
          : undefined;
      const builtIn = t.builtIn === true;
      const folderIdRaw = t.folderId;
      const folderId =
        folderIdRaw === null || folderIdRaw === undefined || folderIdRaw === ""
          ? undefined
          : String(folderIdRaw).trim() || undefined;
      const indicatorIntroNotes = sanitizeIndicatorIntroNotes(t.indicatorIntroNotes);
      const chartIntroNotes = sanitizeIndicatorIntroNotes(t.chartIntroNotes, 12);
      return {
        id,
        name,
        description,
        indicatorIntroNotes:
          Object.keys(indicatorIntroNotes).length > 0 ? indicatorIntroNotes : undefined,
        chartIntroNotes:
          Object.keys(chartIntroNotes).length > 0 ? chartIntroNotes : undefined,
        selectedKeys,
        selectedListItems:
          selectedListItems.length > 0 ? selectedListItems : undefined,
        layoutMode,
        slotAssignment,
        seriesVisualMap,
        displayConfig,
        seriesCalcConfigMap,
        derivedCalcs,
        createdAtIso,
        builtIn: builtIn || undefined,
        folderId,
      } as MacroChartTemplate;
    })
    .filter((x): x is MacroChartTemplate => Boolean(x))
    .slice(0, max);
}

function sanitize(input: unknown): MacroChartPrefs | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const lm = Number(o.layoutMode);
  const layoutMode = lm === 1 || lm === 2 || lm === 3 || lm === 4 || lm === 5 || lm === 6 ? lm : 1;
  const selectedKeys = Array.isArray(o.selectedKeys)
    ? o.selectedKeys.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const selectedListItems = sanitizeSelectedListItems(o.selectedListItems);
  const slotAssignment =
    o.slotAssignment && typeof o.slotAssignment === "object"
      ? (o.slotAssignment as MacroSlotAssignment)
      : {};
  const seriesVisualMap =
    o.seriesVisualMap && typeof o.seriesVisualMap === "object"
      ? (o.seriesVisualMap as MacroSeriesVisualConfigMap)
      : {};
  const displayConfig = {
    ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
    ...(o.displayConfig && typeof o.displayConfig === "object"
      ? (o.displayConfig as Partial<MacroChartDisplayConfig>)
      : {}),
  };
  const seriesCalcConfigMap = sanitizeSeriesCalcConfigMap(o.seriesCalcConfigMap);
  const derivedCalcs = Array.isArray(o.derivedCalcs)
    ? o.derivedCalcs
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const x = row as Record<string, unknown>;
          const id = String(x.id ?? "").trim();
          const leftKey = String(x.leftKey ?? "").trim();
          const rightKey = String(x.rightKey ?? "").trim();
          const op = String(x.op ?? "").trim() as MacroDerivedCalc["op"];
          const name = String(x.name ?? "").trim();
          if (!id || !leftKey || !rightKey || !name || !DERIVED_OPS.has(op)) return null;
          return { id, leftKey, rightKey, op, name } as MacroDerivedCalc;
        })
        .filter((x): x is MacroDerivedCalc => Boolean(x))
        .slice(0, 60)
    : [];
  const templates = sanitizeMacroChartTemplates(o.templates);
  const activeTemplateId =
    typeof o.activeTemplateId === "string" && o.activeTemplateId.trim()
      ? o.activeTemplateId.trim()
      : null;
  const templateFolders = sanitizeTemplateFolders(o.templateFolders).filter(
    (f) => f.scope === "user",
  );
  const templateIndicatorNotes = sanitizeTemplateIndicatorNotes(o.templateIndicatorNotes);
  return {
    version: 2,
    layoutMode,
    selectedKeys,
    selectedListItems: selectedListItems.length > 0 ? selectedListItems : undefined,
    slotAssignment,
    seriesVisualMap,
    displayConfig,
    seriesCalcConfigMap,
    derivedCalcs,
    templates,
    templateFolders,
    activeTemplateId,
    templateIndicatorNotes:
      Object.keys(templateIndicatorNotes).length > 0 ? templateIndicatorNotes : undefined,
  };
}

function sanitizeBuiltinTemplateOverride(input: unknown): BuiltinTemplateOverride | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const lm = Number(o.layoutMode);
  const layoutMode = lm === 1 || lm === 2 || lm === 3 || lm === 4 || lm === 5 || lm === 6 ? lm : 1;
  const selectedKeys = Array.isArray(o.selectedKeys)
    ? o.selectedKeys.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (selectedKeys.length === 0) return null;
  const selectedListItems = sanitizeSelectedListItems(o.selectedListItems);
  const slotAssignment =
    o.slotAssignment && typeof o.slotAssignment === "object"
      ? (o.slotAssignment as MacroSlotAssignment)
      : {};
  const seriesVisualMap =
    o.seriesVisualMap && typeof o.seriesVisualMap === "object"
      ? (o.seriesVisualMap as MacroSeriesVisualConfigMap)
      : {};
  const displayConfig =
    o.displayConfig && typeof o.displayConfig === "object"
      ? {
          ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
          ...(o.displayConfig as Partial<MacroChartDisplayConfig>),
        }
      : undefined;
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : undefined;
  const description =
    typeof o.description === "string" && o.description.trim() ? o.description.trim() : undefined;
  const updatedAtIso =
    typeof o.updatedAtIso === "string" && o.updatedAtIso.trim()
      ? o.updatedAtIso.trim()
      : undefined;
  const indicatorIntroNotes = sanitizeIndicatorIntroNotes(o.indicatorIntroNotes);
  const chartIntroNotes = sanitizeIndicatorIntroNotes(o.chartIntroNotes, 12);
  return {
    name,
    description,
    indicatorIntroNotes:
      Object.keys(indicatorIntroNotes).length > 0 ? indicatorIntroNotes : undefined,
    chartIntroNotes:
      Object.keys(chartIntroNotes).length > 0 ? chartIntroNotes : undefined,
    selectedKeys,
    selectedListItems: selectedListItems.length > 0 ? selectedListItems : undefined,
    layoutMode,
    slotAssignment,
    seriesVisualMap,
    displayConfig,
    seriesCalcConfigMap: sanitizeSeriesCalcConfigMap(o.seriesCalcConfigMap),
    derivedCalcs: Array.isArray(o.derivedCalcs)
      ? o.derivedCalcs
          .map((row) => {
            if (!row || typeof row !== "object") return null;
            const x = row as Record<string, unknown>;
            const id = String(x.id ?? "").trim();
            const leftKey = String(x.leftKey ?? "").trim();
            const rightKey = String(x.rightKey ?? "").trim();
            const op = String(x.op ?? "").trim() as MacroDerivedCalc["op"];
            const dname = String(x.name ?? "").trim();
            if (!id || !leftKey || !rightKey || !dname || !DERIVED_OPS.has(op)) return null;
            return { id, leftKey, rightKey, op, name: dname } as MacroDerivedCalc;
          })
          .filter((x): x is MacroDerivedCalc => Boolean(x))
          .slice(0, 60)
      : undefined,
    updatedAtIso,
  };
}

function sanitizeSystemMacroChartPrefs(input: unknown): SystemMacroChartPrefsPayload {
  const out: Record<string, BuiltinTemplateOverride> = {};
  if (!input || typeof input !== "object") {
    return {
      version: 1,
      builtinTemplateOverrides: out,
      customBuiltinTemplates: [],
      builtinTemplateFolders: [],
      builtinTemplateFolderIds: {},
      hiddenBuiltinTemplateIds: [],
    };
  }
  const o = input as Record<string, unknown>;
  const raw =
    o.builtinTemplateOverrides && typeof o.builtinTemplateOverrides === "object"
      ? (o.builtinTemplateOverrides as Record<string, unknown>)
      : {};
  for (const [id, row] of Object.entries(raw)) {
    const key = id.trim();
    if (!key) continue;
    const parsed = sanitizeBuiltinTemplateOverride(row);
    if (parsed) out[key] = parsed;
  }
  const customBuiltinTemplates = sanitizeMacroChartTemplates(o.customBuiltinTemplates)
    .filter((t) => t.id.startsWith("builtin-custom-"))
    .map((t) => ({ ...t, builtIn: true as const }));
  const builtinTemplateFolders = sanitizeTemplateFolders(o.builtinTemplateFolders).filter(
    (f) => f.scope === "builtin",
  );
  const builtinTemplateFolderIds = sanitizeBuiltinTemplateFolderIds(o.builtinTemplateFolderIds);
  const hiddenBuiltinTemplateIds = Array.isArray(o.hiddenBuiltinTemplateIds)
    ? [...new Set(o.hiddenBuiltinTemplateIds.map((x) => String(x).trim()).filter(Boolean))]
    : [];
  return {
    version: 1,
    builtinTemplateOverrides: out,
    customBuiltinTemplates,
    builtinTemplateFolders,
    builtinTemplateFolderIds,
    hiddenBuiltinTemplateIds,
  };
}

export function mergeBuiltinTemplateOverride(
  base: MacroChartTemplate,
  override: BuiltinTemplateOverride | undefined,
): MacroChartTemplate {
  if (!override) return base;
  return {
    ...base,
    name: override.name?.trim() || base.name,
    description: override.description ?? base.description,
    indicatorIntroNotes: override.indicatorIntroNotes ?? base.indicatorIntroNotes,
    chartIntroNotes: override.chartIntroNotes ?? base.chartIntroNotes,
    selectedKeys: [...override.selectedKeys],
    selectedListItems: override.selectedListItems,
    layoutMode: override.layoutMode,
    slotAssignment: { ...override.slotAssignment },
    seriesVisualMap: { ...override.seriesVisualMap },
    displayConfig: override.displayConfig ?? base.displayConfig,
    seriesCalcConfigMap: override.seriesCalcConfigMap ?? base.seriesCalcConfigMap,
    derivedCalcs: override.derivedCalcs ?? base.derivedCalcs,
    builtIn: true,
  };
}

export async function loadMacroChartPrefsForUser(
  userId: string,
): Promise<MacroChartPrefs | null> {
  const row = await prisma.userMacroChartPrefs.findUnique({
    where: { userId },
  });
  if (!row) return null;
  return sanitize(row.prefs as unknown);
}

export async function saveMacroChartPrefsForUser(
  userId: string,
  input: unknown,
): Promise<MacroChartPrefs> {
  const prefs = sanitize(input);
  if (!prefs) throw new Error("图形配置格式不合法");
  const json = prefs as unknown as Prisma.InputJsonValue;
  await prisma.userMacroChartPrefs.upsert({
    where: { userId },
    create: { userId, prefs: json },
    update: { prefs: json },
  });
  return prefs;
}

function mergeDefaultBuiltinTemplateFolders(
  prefs: SystemMacroChartPrefsPayload,
): SystemMacroChartPrefsPayload {
  const existingFolders = prefs.builtinTemplateFolders ?? [];
  const existingIds = new Set(existingFolders.map((f) => f.id));
  const folders = [...existingFolders];
  for (const def of DEFAULT_BUILTIN_TEMPLATE_FOLDERS) {
    if (!existingIds.has(def.id)) folders.push(def);
  }
  const folderIds = { ...DEFAULT_BUILTIN_TEMPLATE_FOLDER_IDS, ...(prefs.builtinTemplateFolderIds ?? {}) };
  return { ...prefs, builtinTemplateFolders: folders, builtinTemplateFolderIds: folderIds };
}

export async function loadSystemMacroChartPrefs(): Promise<SystemMacroChartPrefsPayload> {
  const row = await prisma.systemMacroChartPrefs.findUnique({ where: { id: "default" } });
  if (!row) {
    return mergeDefaultBuiltinTemplateFolders({
      version: 1,
      builtinTemplateOverrides: {},
      customBuiltinTemplates: [],
      builtinTemplateFolders: [],
      builtinTemplateFolderIds: {},
      hiddenBuiltinTemplateIds: [],
    });
  }
  return mergeDefaultBuiltinTemplateFolders(sanitizeSystemMacroChartPrefs(row.prefs as unknown));
}

export async function saveSystemMacroChartPrefs(
  patch: Partial<SystemMacroChartPrefsPayload>,
): Promise<SystemMacroChartPrefsPayload> {
  const current = await loadSystemMacroChartPrefs();
  const merged = sanitizeSystemMacroChartPrefs({
    version: 1,
    builtinTemplateOverrides:
      patch.builtinTemplateOverrides ?? current.builtinTemplateOverrides,
    customBuiltinTemplates:
      patch.customBuiltinTemplates ?? current.customBuiltinTemplates,
    builtinTemplateFolders: patch.builtinTemplateFolders ?? current.builtinTemplateFolders,
    builtinTemplateFolderIds:
      patch.builtinTemplateFolderIds ?? current.builtinTemplateFolderIds,
    hiddenBuiltinTemplateIds:
      patch.hiddenBuiltinTemplateIds ?? current.hiddenBuiltinTemplateIds,
  });
  const json = merged as unknown as Prisma.InputJsonValue;
  await prisma.systemMacroChartPrefs.upsert({
    where: { id: "default" },
    create: { id: "default", prefs: json },
    update: { prefs: json },
  });
  return mergeDefaultBuiltinTemplateFolders(merged);
}

export async function loadBuiltinTemplateOverrides(): Promise<
  Record<string, BuiltinTemplateOverride>
> {
  const parsed = await loadSystemMacroChartPrefs();
  return parsed.builtinTemplateOverrides;
}

export async function saveBuiltinTemplateOverrides(
  input: unknown,
): Promise<Record<string, BuiltinTemplateOverride>> {
  if (input && typeof input === "object" && "builtinTemplateOverrides" in input) {
    const merged = await saveSystemMacroChartPrefs(input as Partial<SystemMacroChartPrefsPayload>);
    return merged.builtinTemplateOverrides;
  }
  const overrides: Record<string, BuiltinTemplateOverride> = {};
  if (input && typeof input === "object") {
    for (const [id, row] of Object.entries(input as Record<string, unknown>)) {
      const key = id.trim();
      if (!key) continue;
      const parsed = sanitizeBuiltinTemplateOverride(row);
      if (parsed) overrides[key] = parsed;
    }
  }
  const merged = await saveSystemMacroChartPrefs({ builtinTemplateOverrides: overrides });
  return merged.builtinTemplateOverrides;
}
