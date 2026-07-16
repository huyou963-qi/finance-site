/**
 * 事件类型 / 范围 / 缩略标记词表（单一事实来源）。
 * Skill 文档引用本文件；UI 与 ingest 校验共用。
 */

import type { EventImportance } from "@prisma/client";
import type { GicsSector } from "@/lib/equity/gicsCatalog";
import { GICS_SECTOR_DEFS } from "@/lib/equity/gicsCatalog";

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
  ...GICS_SECTOR_DEFS.map((d) => GICS_SECTOR_CODES[d.sector]),
  ...GICS_SECTOR_DEFS.map((d) => d.nameZh),
  "制造业",
  "科技",
  "消费",
  "医药",
  "交通运输",
] as const;

export function normalizeIndustryTag(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^\d{2}(\d{2})?(\d{2})?$/.test(t)) return t;
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
