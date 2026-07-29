import type { EventImportance } from "@prisma/client";
import fixture from "../../../.cursor/skills/company-milestone-ingest/templates/example-TSLA.json";
import {
  eventTypeLabel,
  markerColorFor,
  normalizeEventType,
} from "@/lib/data/eventTaxonomy";
import type { MarketEventDto } from "@/lib/data/marketEvents";

export type MilestoneImpact = {
  summary: string;
  channels?: Array<"demand" | "cost" | "capacity" | "margin" | "narrative">;
};

export type TimelineLayer = "local" | "shared" | "sec";

export type CompanyMilestoneKind =
  | "product"
  | "capacity"
  | "policy"
  | "sec"
  | "deal"
  | "other";

export type CompanyMilestone = {
  id: string;
  externalId: string;
  title: string;
  content: string;
  occurredAt: string;
  importance: EventImportance;
  eventType: string;
  scope: string;
  markerLabel: string;
  countries: string[];
  tags: string[];
  sourceUrl: string | null;
  impact: MilestoneImpact;
  color: string;
  typeLabel: string;
  kind: CompanyMilestoneKind;
  layer: TimelineLayer;
};

export type MilestoneFilter =
  | "all"
  | "sec"
  | "product"
  | "capacity"
  | "policy"
  | "deal"
  | "other";

/** 公司类型下的细分（可多选；空数组 = 不限制） */
export type CompanyKindFilter =
  | "sec"
  | "product"
  | "capacity"
  | "deal"
  | "other";

export const COMPANY_KIND_FILTER_LABELS: Record<CompanyKindFilter, string> = {
  sec: "SEC",
  product: "产品",
  capacity: "产能",
  deal: "资本并购",
  other: "其它",
};

export const COMPANY_KIND_FILTERS = Object.keys(
  COMPANY_KIND_FILTER_LABELS,
) as CompanyKindFilter[];

/** 空选 = 全部通过；SEC 同时匹配 kind 与 layer */
export function milestoneMatchesCompanyKinds(
  m: { kind: CompanyMilestoneKind; layer: TimelineLayer },
  selected: readonly CompanyKindFilter[],
): boolean {
  if (selected.length === 0) return true;
  if (selected.includes("sec") && (m.kind === "sec" || m.layer === "sec")) {
    return true;
  }
  return selected.includes(m.kind as CompanyKindFilter);
}

export function kindOf(eventType: string): CompanyMilestoneKind {
  const n = normalizeEventType(eventType) ?? eventType;
  if (
    n === "company.earnings" ||
    n === "company.filing" ||
    n === "company.corp_action"
  ) {
    return "sec";
  }
  if (n === "company.product") return "product";
  if (n === "company.capacity") return "capacity";
  if (n.startsWith("policy.")) return "policy";
  if (
    n === "company.mna" ||
    n === "company.capital" ||
    n === "company.partnership"
  ) {
    return "deal";
  }
  return "other";
}

const IMPORTANCE_SET = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

function mapDraft(
  e: Record<string, unknown>,
  layer: TimelineLayer = "local",
): CompanyMilestone | null {
  const externalId = String(e.externalId ?? e.id ?? "").trim();
  const occurredAt = String(e.occurredAt ?? "").slice(0, 10);
  if (!externalId || !/^\d{4}-\d{2}-\d{2}$/.test(occurredAt)) return null;
  const eventType = String(e.eventType ?? "other");
  const importanceRaw = String(e.importance ?? "MEDIUM");
  const importance = (
    IMPORTANCE_SET.has(importanceRaw) ? importanceRaw : "MEDIUM"
  ) as EventImportance;
  const payload = e.payload as { impact?: MilestoneImpact } | undefined;
  const impact = payload?.impact?.summary
    ? payload.impact
    : { summary: String(e.content ?? e.title ?? "") };
  const layerPrefix = layer === "local" ? "" : `${layer}:`;
  return {
    id: `${layerPrefix}${externalId}`,
    externalId,
    title: String(e.title ?? ""),
    content: String(e.content ?? ""),
    occurredAt,
    importance,
    eventType,
    scope: String(e.scope ?? "COMPANY"),
    markerLabel: String(e.markerLabel ?? "事件").slice(0, 8),
    countries: Array.isArray(e.countries) ? (e.countries as string[]) : [],
    tags: Array.isArray(e.tags) ? (e.tags as string[]) : [],
    sourceUrl: (e.sourceUrl as string | null) ?? null,
    impact,
    color: markerColorFor(eventType, importance),
    typeLabel: eventTypeLabel(eventType),
    kind: kindOf(eventType),
    layer,
  };
}

/** 解析 company-milestone ingest JSON（顶层 events[]） */
export function parseMilestoneIngestJson(raw: unknown): {
  milestones: CompanyMilestone[];
  symbol: string | null;
  errors: string[];
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { milestones: [], symbol: null, errors: ["JSON 根节点必须是对象"] };
  }
  const obj = raw as Record<string, unknown>;
  const query = obj.query as { symbol?: string } | undefined;
  const symbol = query?.symbol?.trim().toUpperCase() ?? null;
  const events = obj.events;
  if (!Array.isArray(events)) {
    return { milestones: [], symbol, errors: ["缺少 events 数组"] };
  }
  const milestones: CompanyMilestone[] = [];
  events.forEach((row, i) => {
    if (!row || typeof row !== "object") {
      errors.push(`events[${i}] 不是对象`);
      return;
    }
    const m = mapDraft(row as Record<string, unknown>, "local");
    if (!m) {
      errors.push(`events[${i}] 缺少有效 externalId 或 occurredAt`);
      return;
    }
    if (!String((row as Record<string, unknown>).title ?? "").trim()) {
      errors.push(`events[${i}] 缺少 title`);
      return;
    }
    if (!String((row as Record<string, unknown>).markerLabel ?? "").trim()) {
      errors.push(`events[${i}] 缺少 markerLabel`);
      return;
    }
    milestones.push(m);
  });
  milestones.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return { milestones, symbol, errors };
}

export function marketEventToMilestone(
  ev: MarketEventDto,
  layer: "shared" | "sec",
): CompanyMilestone | null {
  const eventType = ev.eventType ?? "other";
  const payload = ev.payload as { impact?: MilestoneImpact } | null;
  const impact = payload?.impact?.summary
    ? payload.impact
    : { summary: (ev.content || ev.title || "").slice(0, 240) };
  const externalId = (ev.externalId ?? ev.id).trim();
  const occurredAt = ev.occurredAt.slice(0, 10);
  if (!externalId || !/^\d{4}-\d{2}-\d{2}$/.test(occurredAt)) return null;
  const importance = ev.importance;
  return {
    id: `${layer}:${ev.id}`,
    externalId,
    title: ev.title ?? "",
    content: ev.content,
    occurredAt,
    importance,
    eventType,
    scope: ev.scope,
    markerLabel: (ev.markerLabel ?? "事件").slice(0, 8),
    countries: ev.countries ?? [],
    tags: ev.tags ?? [],
    sourceUrl: ev.sourceUrl,
    impact,
    color: markerColorFor(eventType, importance),
    typeLabel: eventTypeLabel(eventType),
    kind: layer === "sec" ? "sec" : kindOf(eventType),
    layer,
  };
}

function normalizeUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  try {
    const u = new URL(url.trim());
    u.hash = "";
    return u.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function titleApprox(a: string, b: string): boolean {
  const na = a.replace(/\s+/g, "").slice(0, 40);
  const nb = b.replace(/\s+/g, "").slice(0, 40);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** 用户本地 vs 共享/SEC 冲突：同 externalId，或同日+同类型+标题近似/同源 */
export function milestonesConflict(
  a: CompanyMilestone,
  b: CompanyMilestone,
): boolean {
  if (a.externalId && b.externalId && a.externalId === b.externalId) return true;
  if (a.occurredAt.slice(0, 10) !== b.occurredAt.slice(0, 10)) return false;
  const ta = normalizeEventType(a.eventType) ?? a.eventType;
  const tb = normalizeEventType(b.eventType) ?? b.eventType;
  if (ta !== tb) return false;
  const ua = normalizeUrl(a.sourceUrl);
  const ub = normalizeUrl(b.sourceUrl);
  if (ua && ub && ua === ub) return true;
  return titleApprox(a.title, b.title);
}

/**
 * 合并经营轴：用户本地 > 共享 MarketEvent > SEC。
 * 冲突时保留更高优先级层，不删库内数据。
 */
export function mergeCompanyTimeline(
  local: CompanyMilestone[],
  shared: CompanyMilestone[],
  sec: CompanyMilestone[],
): CompanyMilestone[] {
  const out: CompanyMilestone[] = local.map((m) => ({ ...m, layer: "local" as const }));
  const coveredBy = (candidate: CompanyMilestone) =>
    out.some((r) => milestonesConflict(r, candidate));

  for (const m of shared) {
    if (!coveredBy(m)) out.push(m);
  }
  for (const m of sec) {
    if (!coveredBy(m)) out.push(m);
  }
  out.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return out;
}

export function loadDemoMilestones(symbol = "TSLA"): CompanyMilestone[] {
  const { milestones, symbol: q } = parseMilestoneIngestJson(fixture);
  if (symbol.toUpperCase() !== (q ?? "TSLA").toUpperCase()) return [];
  return milestones.map((m) => ({ ...m, layer: "local" as const }));
}

export function filterMilestones(
  items: CompanyMilestone[],
  filter: MilestoneFilter,
  minImportance: EventImportance = "MEDIUM",
): CompanyMilestone[] {
  const order = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
  const min = order[minImportance];
  return items.filter((m) => {
    if (order[m.importance] < min) return false;
    if (filter === "all") return true;
    return m.kind === filter;
  });
}

export const MILESTONE_FILTER_LABELS: Record<MilestoneFilter, string> = {
  all: "全部",
  sec: "披露",
  product: "产品",
  capacity: "产能",
  policy: "政策",
  deal: "资本并购",
  other: "其它",
};

export const CHANNEL_LABELS: Record<string, string> = {
  demand: "需求",
  cost: "成本",
  capacity: "产能",
  margin: "利润",
  narrative: "叙事",
};

const LOCAL_PREFIX = "company-events-local:v1:";
const LEGACY_SESSION_PREFIX = "company-milestones-v1:";

export function localStorageKey(userId: string, symbol: string): string {
  const uid = (userId || "anon").trim() || "anon";
  return `${LOCAL_PREFIX}${uid}:${symbol.trim().toUpperCase()}`;
}

function milestoneToStoredEvent(m: CompanyMilestone): Record<string, unknown> {
  return {
    externalId: m.externalId,
    title: m.title,
    content: m.content,
    occurredAt: m.occurredAt,
    importance: m.importance,
    scope: m.scope,
    eventType: m.eventType,
    countries: m.countries,
    tags: m.tags,
    markerLabel: m.markerLabel,
    sourceUrl: m.sourceUrl,
    payload: { impact: m.impact },
  };
}

/** 读取用户本地公司事件；并一次性迁移旧 sessionStorage 键 */
export function loadLocalCompanyEvents(
  userId: string,
  symbol: string,
): CompanyMilestone[] {
  if (typeof window === "undefined" || !symbol.trim()) return [];
  const sym = symbol.trim().toUpperCase();
  const key = localStorageKey(userId, sym);
  try {
    let raw = localStorage.getItem(key);
    if (!raw) {
      const legacy = sessionStorage.getItem(LEGACY_SESSION_PREFIX + sym);
      if (legacy) {
        raw = legacy;
        localStorage.setItem(key, legacy);
        sessionStorage.removeItem(LEGACY_SESSION_PREFIX + sym);
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const { milestones } = parseMilestoneIngestJson(
      Array.isArray(parsed) ? { events: parsed } : parsed,
    );
    return milestones.map((m) => ({ ...m, layer: "local" as const }));
  } catch {
    return [];
  }
}

export function saveLocalCompanyEvents(
  userId: string,
  symbol: string,
  items: CompanyMilestone[],
): void {
  if (typeof window === "undefined" || !symbol.trim()) return;
  try {
    localStorage.setItem(
      localStorageKey(userId, symbol),
      JSON.stringify({
        mode: "company-milestone",
        query: { symbol: symbol.trim().toUpperCase() },
        events: items
          .filter((m) => m.layer === "local")
          .map(milestoneToStoredEvent),
      }),
    );
  } catch {
    /* quota */
  }
}

/** @deprecated 使用 loadLocalCompanyEvents */
export function loadStoredMilestones(symbol: string): CompanyMilestone[] {
  return loadLocalCompanyEvents("anon", symbol);
}

/** @deprecated 使用 saveLocalCompanyEvents */
export function saveStoredMilestones(
  symbol: string,
  items: CompanyMilestone[],
): void {
  saveLocalCompanyEvents("anon", symbol, items);
}

export function isoDateToUnixSec(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 1000);
}

export function unixSecToIsoDate(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

/** 本地/轴节点 → 详情抽屉可用的 MarketEventDto 形状 */
export function milestoneToMarketEventDto(
  m: CompanyMilestone,
): import("@/lib/data/marketEvents").MarketEventDto {
  const now = new Date().toISOString();
  return {
    id: m.id,
    title: m.title || null,
    content: m.content,
    occurredAt: m.occurredAt.length === 10 ? `${m.occurredAt}T00:00:00.000Z` : m.occurredAt,
    datePrecision: "DATE",
    importance: m.importance,
    eventType: m.eventType,
    scope: (m.scope as "COMPANY" | "COUNTRY" | "INDUSTRY" | "CROSS") || "COMPANY",
    countries: m.countries,
    industries: [],
    assets: [],
    macroKeys: [],
    persons: [],
    institutions: [],
    tags: m.tags,
    payload: { impact: m.impact },
    markerLabel: m.markerLabel,
    sourceKind:
      m.layer === "sec" ? "sec" : m.layer === "local" ? "user_local" : "market_event",
    externalId: m.externalId,
    sourceUrl: m.sourceUrl,
    isPublic: m.layer !== "local",
    createdById: m.layer === "local" ? "local" : "system",
    createdAt: now,
    updatedAt: now,
  };
}
