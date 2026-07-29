import type { EventImportance } from "@prisma/client";
import fixture from "../../../.cursor/skills/company-milestone-ingest/templates/example-TSLA.json";
import {
  eventTypeLabel,
  markerColorFor,
  normalizeEventType,
} from "@/lib/data/eventTaxonomy";

export type MilestoneImpact = {
  summary: string;
  channels?: Array<"demand" | "cost" | "capacity" | "margin" | "narrative">;
};

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
  kind: "product" | "capacity" | "policy" | "other";
};

export type MilestoneFilter = "all" | "product" | "capacity" | "policy";

function kindOf(eventType: string): CompanyMilestone["kind"] {
  const n = normalizeEventType(eventType) ?? eventType;
  if (n === "company.product") return "product";
  if (n === "company.capacity") return "capacity";
  if (n.startsWith("policy.")) return "policy";
  return "other";
}

const IMPORTANCE_SET = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

function mapDraft(e: Record<string, unknown>): CompanyMilestone | null {
  const externalId = String(e.externalId ?? "").trim();
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
  return {
    id: externalId,
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
    const m = mapDraft(row as Record<string, unknown>);
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

export function loadDemoMilestones(symbol = "TSLA"): CompanyMilestone[] {
  const { milestones, symbol: q } = parseMilestoneIngestJson(fixture);
  if (symbol.toUpperCase() !== (q ?? "TSLA").toUpperCase()) return [];
  return milestones;
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
  product: "产品",
  capacity: "产能",
  policy: "政策",
};

export const CHANNEL_LABELS: Record<string, string> = {
  demand: "需求",
  cost: "成本",
  capacity: "产能",
  margin: "利润",
  narrative: "叙事",
};

const STORAGE_PREFIX = "company-milestones-v1:";

export function loadStoredMilestones(symbol: string): CompanyMilestone[] {
  if (typeof window === "undefined" || !symbol.trim()) return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + symbol.toUpperCase());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const { milestones } = parseMilestoneIngestJson(
      Array.isArray(parsed) ? { events: parsed } : parsed,
    );
    return milestones;
  } catch {
    return [];
  }
}

export function saveStoredMilestones(symbol: string, items: CompanyMilestone[]): void {
  if (typeof window === "undefined" || !symbol.trim()) return;
  try {
    sessionStorage.setItem(
      STORAGE_PREFIX + symbol.toUpperCase(),
      JSON.stringify({
        mode: "company-milestone",
        query: { symbol: symbol.toUpperCase() },
        events: items.map((m) => ({
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
        })),
      }),
    );
  } catch {
    /* quota */
  }
}

export function isoDateToUnixSec(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 1000);
}
