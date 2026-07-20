/**
 * 事件类型 / 范围 / 缩略标记词表（单一事实来源）。
 * Skill 文档引用本文件；UI 与 ingest 校验共用。
 */

import type { EventImportance } from "@prisma/client";
import type { GicsSector } from "@/lib/equity/gicsCatalog";
import { GICS_SECTOR_DEFS } from "@/lib/equity/gicsCatalog";
import {
  getIndustryByCode,
  GICS_SUB_INDUSTRIES,
} from "@/lib/equity/gicsIndustryCatalog";

export const EVENT_SCOPES = ["COUNTRY", "INDUSTRY", "COMPANY", "CROSS"] as const;
export type EventScopeCode = (typeof EVENT_SCOPES)[number];

export const EVENT_SCOPE_LABELS: Record<EventScopeCode, string> = {
  COUNTRY: "国家",
  INDUSTRY: "行业",
  COMPANY: "公司",
  CROSS: "跨市场",
};

/** 点分受控 eventType（含遗留中文别名兼容见 LEGACY_EVENT_TYPE_ALIASES） */
export const EVENT_TYPE_CODES = [
  "policy.fiscal",
  "policy.monetary",
  "policy.regulatory",
  "policy.trade",
  "macro.release",
  "macro.geopolitics",
  "macro.disaster",
  "company.earnings",
  "company.guidance",
  "company.corp_action",
  "company.filing",
  "company.ops_news",
  "company.management",
  "speech.official",
  "speech.executive",
  "speech.investor",
  "rating.initiate",
  "rating.upgrade",
  "rating.downgrade",
  "rating.maintain",
  "price_target.change",
  "market.anomaly",
  "era",
  "other",
] as const;

export type EventTypeCode = (typeof EVENT_TYPE_CODES)[number];

export const EVENT_TYPE_LABELS: Record<EventTypeCode, string> = {
  "policy.fiscal": "财政政策",
  "policy.monetary": "货币政策",
  "policy.regulatory": "监管政策",
  "policy.trade": "贸易政策",
  "macro.release": "数据发布",
  "macro.geopolitics": "地缘政治",
  "macro.disaster": "自然灾害",
  "company.earnings": "财报",
  "company.guidance": "业绩指引",
  "company.corp_action": "公司行动",
  "company.filing": "监管披露",
  "company.ops_news": "经营新闻",
  "company.management": "管理层变动",
  "speech.official": "官员讲话",
  "speech.executive": "高管讲话",
  "speech.investor": "投资人讲话",
  "rating.initiate": "首次覆盖",
  "rating.upgrade": "评级上调",
  "rating.downgrade": "评级下调",
  "rating.maintain": "评级维持",
  "price_target.change": "目标价调整",
  "market.anomaly": "市场异动",
  era: "时代阶段",
  other: "其他",
};

/** 图上默认缩略字（≤4） */
export const EVENT_TYPE_MARKER_LABELS: Record<EventTypeCode, string> = {
  "policy.fiscal": "财政",
  "policy.monetary": "货币",
  "policy.regulatory": "监管",
  "policy.trade": "贸易",
  "macro.release": "数据",
  "macro.geopolitics": "地缘",
  "macro.disaster": "灾害",
  "company.earnings": "财报",
  "company.guidance": "指引",
  "company.corp_action": "行动",
  "company.filing": "披露",
  "company.ops_news": "经营",
  "company.management": "高管",
  "speech.official": "讲话",
  "speech.executive": "高管说",
  "speech.investor": "投资人",
  "rating.initiate": "覆盖",
  "rating.upgrade": "上调",
  "rating.downgrade": "下调",
  "rating.maintain": "维持",
  "price_target.change": "目标价",
  "market.anomaly": "异动",
  era: "时代",
  other: "事件",
};

/** UI 下拉：点分码 + 遗留中文（写入时可仍选中文，normalize 时映射） */
export const EVENT_TYPE_SUGGESTIONS: readonly string[] = [
  ...EVENT_TYPE_CODES.map((c) => c),
  "时代阶段",
  "政策",
  "央行决议",
  "财报",
  "地缘",
  "自然灾害",
  "市场异动",
  "监管",
  "战争",
  "条约",
  "其他",
];

export const LEGACY_EVENT_TYPE_ALIASES: Record<string, EventTypeCode> = {
  时代阶段: "era",
  政策: "policy.fiscal",
  央行决议: "policy.monetary",
  财报: "company.earnings",
  地缘: "macro.geopolitics",
  自然灾害: "macro.disaster",
  市场异动: "market.anomaly",
  监管: "policy.regulatory",
  战争: "macro.geopolitics",
  条约: "policy.trade",
  其他: "other",
};

export function normalizeEventType(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if ((EVENT_TYPE_CODES as readonly string[]).includes(t)) return t;
  return LEGACY_EVENT_TYPE_ALIASES[t] ?? t;
}

/** 侧栏类型族（多选；默认全选 = 不限制类型） */
export const EVENT_TYPE_FAMILY_IDS = [
  "policy",
  "macro",
  "company",
  "speech",
  "rating",
  "market",
  "era",
  "other",
] as const;

export type EventTypeFamilyId = (typeof EVENT_TYPE_FAMILY_IDS)[number];

export type EventTypeFamilyDef = {
  id: EventTypeFamilyId;
  label: string;
  /** 精确码 */
  codes: readonly string[];
  /** 前缀（如 policy → policy.*） */
  prefixes: readonly string[];
};

export const EVENT_TYPE_FAMILIES: readonly EventTypeFamilyDef[] = [
  {
    id: "policy",
    label: "政策",
    codes: [],
    prefixes: ["policy"],
  },
  {
    id: "macro",
    label: "宏观",
    codes: [],
    prefixes: ["macro"],
  },
  {
    id: "company",
    label: "公司",
    codes: [],
    prefixes: ["company"],
  },
  {
    id: "speech",
    label: "讲话",
    codes: [],
    prefixes: ["speech"],
  },
  {
    id: "rating",
    label: "评级",
    codes: ["price_target.change"],
    prefixes: ["rating"],
  },
  {
    id: "market",
    label: "异动",
    codes: ["market.anomaly"],
    prefixes: [],
  },
  {
    id: "era",
    label: "时代",
    codes: ["era"],
    prefixes: [],
  },
  {
    id: "other",
    label: "其他",
    codes: ["other"],
    prefixes: [],
  },
] as const;

export const ALL_EVENT_TYPE_FAMILY_IDS: EventTypeFamilyId[] = [...EVENT_TYPE_FAMILY_IDS];

export function familyIdForEventType(
  eventType: string | null | undefined,
): EventTypeFamilyId {
  const n = normalizeEventType(eventType) ?? "";
  if (!n) return "other";
  for (const f of EVENT_TYPE_FAMILIES) {
    if (f.id === "other") continue;
    if (f.codes.includes(n)) return f.id;
    if (f.prefixes.some((p) => n === p || n.startsWith(`${p}.`))) return f.id;
  }
  if ((EVENT_TYPE_CODES as readonly string[]).includes(n)) {
    // 已知码但未归入上表时仍走 other
    return "other";
  }
  return "other";
}

/**
 * 类型族多选匹配。全选或空选 = 不限制。
 * 与 chart-markers typeFilterOk 一致：normalize + 前缀。
 */
export function eventTypeMatchesFamilies(
  eventType: string | null | undefined,
  selected: readonly EventTypeFamilyId[] | null | undefined,
): boolean {
  if (!selected?.length) return true;
  if (selected.length >= EVENT_TYPE_FAMILY_IDS.length) return true;
  const family = familyIdForEventType(eventType);
  return selected.includes(family);
}

/** 单码/前缀列表匹配（供图表 types= 与旧逻辑复用） */
export function eventTypeMatchesSelection(
  eventType: string | null | undefined,
  types?: readonly string[] | null,
): boolean {
  if (!types?.length) return true;
  const eventTypeNorm = normalizeEventType(eventType) ?? eventType ?? "";
  if (!eventTypeNorm) return false;
  return types.some((t) => {
    const want = normalizeEventType(t) ?? t;
    return (
      eventTypeNorm === want ||
      eventTypeNorm.startsWith(`${want}.`) ||
      want.startsWith(`${eventTypeNorm}.`)
    );
  });
}

export function isEraEventType(eventType: string | null | undefined): boolean {
  const n = normalizeEventType(eventType) ?? eventType ?? "";
  return n === "era" || n === "时代阶段";
}

export function eventTypeLabel(code: string | null | undefined): string {
  if (!code) return "事件";
  const n = normalizeEventType(code) ?? code;
  if (n in EVENT_TYPE_LABELS) return EVENT_TYPE_LABELS[n as EventTypeCode];
  return code;
}

export function defaultMarkerLabel(eventType: string | null | undefined): string {
  const n = normalizeEventType(eventType);
  if (n && n in EVENT_TYPE_MARKER_LABELS) {
    return EVENT_TYPE_MARKER_LABELS[n as EventTypeCode];
  }
  return "事件";
}

/** GICS sector 两位码 */
export const GICS_SECTOR_CODES: Record<GicsSector, string> = {
  Energy: "10",
  Materials: "15",
  Industrials: "20",
  "Consumer Discretionary": "25",
  "Consumer Staples": "30",
  "Health Care": "35",
  Financials: "40",
  "Information Technology": "45",
  "Communication Services": "50",
  Utilities: "55",
  "Real Estate": "60",
};

const ZH_TO_GICS_CODE: Record<string, string> = Object.fromEntries(
  GICS_SECTOR_DEFS.map((d) => [d.nameZh, GICS_SECTOR_CODES[d.sector]]),
);

/** 旧中文行业建议 → 仍可用于 UI；入库时尽量规范为 GICS code */
export const EVENT_INDUSTRY_SUGGESTIONS = [
  ...GICS_SECTOR_DEFS.map((d) => d.nameZh),
  "制造业",
  "科技",
  "消费",
  "医药",
  "交通运输",
] as const;

/** 侧栏快捷添加：仅 11 大类中文名（存库仍规范为两位码） */
export const EVENT_INDUSTRY_QUICK_SUGGESTIONS: readonly string[] =
  GICS_SECTOR_DEFS.map((d) => d.nameZh);

const GICS_CODE_TO_SECTOR_ZH: Record<string, string> = Object.fromEntries(
  GICS_SECTOR_DEFS.map((d) => [GICS_SECTOR_CODES[d.sector], d.nameZh]),
);

const INDUSTRY_GROUP_NAME_BY_CODE = (() => {
  const m = new Map<string, string>();
  for (const row of GICS_SUB_INDUSTRIES) {
    if (!m.has(row.industryGroupCode)) {
      m.set(row.industryGroupCode, row.industryGroup);
    }
  }
  return m;
})();

const SUB_INDUSTRY_NAME_BY_CODE = (() => {
  const m = new Map<string, string>();
  for (const row of GICS_SUB_INDUSTRIES) {
    m.set(row.subIndustryCode, row.subIndustry);
  }
  return m;
})();

/**
 * UI 展示用行业标签：优先中文大类名 / 行业组与行业英文名，避免只显示 GICS 数字码。
 * 存储值仍可为 code（normalizeIndustryTag）。
 */
export function formatIndustryTagLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  // 已是中文大类名
  if (ZH_TO_GICS_CODE[trimmed] || GICS_SECTOR_DEFS.some((d) => d.nameZh === trimmed)) {
    return trimmed;
  }
  const code = normalizeIndustryTag(trimmed);
  if (/^\d{2}$/.test(code)) {
    return GICS_CODE_TO_SECTOR_ZH[code] ?? code;
  }
  if (/^\d{4}$/.test(code)) {
    const group = INDUSTRY_GROUP_NAME_BY_CODE.get(code);
    const sectorZh = GICS_CODE_TO_SECTOR_ZH[code.slice(0, 2)];
    if (group && sectorZh) return `${sectorZh} · ${group}`;
    if (group) return group;
  }
  if (/^\d{6}$/.test(code)) {
    const ind = getIndustryByCode(code);
    const sectorZh = GICS_CODE_TO_SECTOR_ZH[code.slice(0, 2)];
    if (ind && sectorZh) return `${sectorZh} · ${ind.nameEn}`;
    if (ind) return ind.nameEn;
  }
  if (/^\d{8}$/.test(code)) {
    const sub = SUB_INDUSTRY_NAME_BY_CODE.get(code);
    const sectorZh = GICS_CODE_TO_SECTOR_ZH[code.slice(0, 2)];
    if (sub && sectorZh) return `${sectorZh} · ${sub}`;
    if (sub) return sub;
  }
  return trimmed;
}

export function normalizeIndustryTag(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^\d{2}(\d{2})?(\d{2})?(\d{2})?$/.test(t)) return t;
  if (ZH_TO_GICS_CODE[t]) return ZH_TO_GICS_CODE[t];
  const fromLegacy: Record<string, string> = {
    制造业: "20",
    金融: "40",
    能源: "10",
    科技: "45",
    消费: "25",
    房地产: "60",
    医药: "35",
    原材料: "15",
    公用事业: "55",
    交通运输: "20",
  };
  return fromLegacy[t] ?? t;
}

export function industriesMatch(eventIndustries: string[], contextIndustries: string[]): boolean {
  if (!contextIndustries.length || !eventIndustries.length) return true;
  const ctx = contextIndustries.map(normalizeIndustryTag);
  return eventIndustries.some((ei) => {
    const e = normalizeIndustryTag(ei);
    return ctx.some((c) => e === c || e.startsWith(c) || c.startsWith(e));
  });
}

export const EVENT_IMPORTANCE_MIN_ORDER: Record<EventImportance, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function markerColorFor(
  eventType: string | null | undefined,
  importance: EventImportance,
): string {
  const n = normalizeEventType(eventType) ?? "";
  if (n.startsWith("rating.upgrade") || n === "price_target.change") return "#34d399";
  if (n.startsWith("rating.downgrade")) return "#f87171";
  if (n.startsWith("policy") || n.startsWith("macro")) return "#38bdf8";
  if (n.startsWith("company.earnings") || n.startsWith("company.filing")) return "#fbbf24";
  if (n.startsWith("speech")) return "#c084fc";
  if (importance === "CRITICAL") return "#fb7185";
  if (importance === "HIGH") return "#f59e0b";
  return "#94a3b8";
}

export type MarkerShape = "circle" | "square" | "arrowUp" | "arrowDown";

export function markerShapeFor(eventType: string | null | undefined): MarkerShape {
  const n = normalizeEventType(eventType) ?? "";
  if (n.includes("upgrade") || n === "price_target.change") return "arrowUp";
  if (n.includes("downgrade")) return "arrowDown";
  if (n.startsWith("company.")) return "square";
  return "circle";
}
