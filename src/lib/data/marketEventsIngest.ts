/**
 * AI Skill / 人工 JSON → 校验与幂等入库。
 * 去重：externalId，以及同日 + sourceUrl / 标题+类型 / 正文指纹 / 评级机构+标的。
 */

import { readFileSync } from "node:fs";
import type { EventImportance, MarketEvent, Prisma } from "@prisma/client";
import {
  EVENT_SCOPES,
  EVENT_TYPE_CODES,
  normalizeEventType,
} from "@/lib/data/eventTaxonomy";
import {
  EVENT_IMPORTANCE_ORDER,
  parseEventContextDate,
  upsertMarketEventByExternalId,
  updateMarketEvent,
  type MarketEventInput,
} from "@/lib/data/marketEvents";
import { prisma } from "@/lib/prisma";

export type IngestEventDraft = {
  externalId: string;
  title: string;
  content: string;
  occurredAt: string;
  datePrecision?: "DATE" | "DATETIME";
  importance?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  scope?: "COUNTRY" | "INDUSTRY" | "COMPANY" | "CROSS";
  eventType: string;
  countries?: string[];
  industries?: string[];
  assets?: string[];
  macroKeys?: string[];
  persons?: string[];
  institutions?: string[];
  tags?: string[];
  markerLabel: string;
  sourceUrl?: string | null;
  payload?: Record<string, unknown>;
  sources?: { url: string; note?: string }[];
};

export type IngestRunOutput = {
  mode: string;
  query?: Record<string, unknown>;
  events: IngestEventDraft[];
  skipped?: { reason: string; hint?: string }[];
};

export type IngestValidationIssue = {
  index: number;
  field?: string;
  message: string;
};

export type IngestValidationResult = {
  ok: boolean;
  issues: IngestValidationIssue[];
  eventCount: number;
  skippedCount: number;
};

const VALID_IMPORTANCE = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const VALID_PRECISION = new Set(["DATE", "DATETIME"]);
const VALID_SCOPE = new Set(EVENT_SCOPES);

export function parseIngestRunOutput(raw: unknown): IngestRunOutput {
  if (!raw || typeof raw !== "object") throw new Error("ingest 文件须为 JSON 对象");
  const obj = raw as Record<string, unknown>;
  if (typeof obj.mode !== "string" || !obj.mode.trim()) {
    throw new Error("缺少 mode");
  }
  if (!Array.isArray(obj.events)) throw new Error("缺少 events 数组");
  return {
    mode: obj.mode.trim(),
    query: obj.query && typeof obj.query === "object" ? (obj.query as Record<string, unknown>) : undefined,
    events: obj.events as IngestEventDraft[],
    skipped: Array.isArray(obj.skipped)
      ? (obj.skipped as IngestRunOutput["skipped"])
      : [],
  };
}

export function validateIngestRun(run: IngestRunOutput): IngestValidationResult {
  const issues: IngestValidationIssue[] = [];
  const seenExt = new Set<string>();

  run.events.forEach((ev, index) => {
    if (!ev.externalId?.trim()) {
      issues.push({ index, field: "externalId", message: "缺少 externalId" });
    } else if (seenExt.has(ev.externalId.trim())) {
      issues.push({ index, field: "externalId", message: "文件内 externalId 重复" });
    } else {
      seenExt.add(ev.externalId.trim());
    }
    if (!ev.title?.trim()) issues.push({ index, field: "title", message: "缺少 title" });
    if (!ev.content?.trim()) issues.push({ index, field: "content", message: "缺少 content" });
    if (!ev.occurredAt?.trim()) {
      issues.push({ index, field: "occurredAt", message: "缺少 occurredAt" });
    }
    if (!ev.markerLabel?.trim()) {
      issues.push({ index, field: "markerLabel", message: "缺少 markerLabel" });
    } else if (ev.markerLabel.trim().length > 16) {
      issues.push({ index, field: "markerLabel", message: "markerLabel 过长（≤16）" });
    }
    if (!ev.eventType?.trim()) {
      issues.push({ index, field: "eventType", message: "缺少 eventType" });
    } else {
      const n = normalizeEventType(ev.eventType);
      if (n && !(EVENT_TYPE_CODES as readonly string[]).includes(n) && n === ev.eventType) {
        if (ev.eventType.includes(".") && !(EVENT_TYPE_CODES as readonly string[]).includes(ev.eventType)) {
          issues.push({
            index,
            field: "eventType",
            message: `未知 eventType: ${ev.eventType}`,
          });
        }
      }
    }
    if (ev.importance && !VALID_IMPORTANCE.has(ev.importance)) {
      issues.push({ index, field: "importance", message: "importance 不合法" });
    }
    if (ev.datePrecision && !VALID_PRECISION.has(ev.datePrecision)) {
      issues.push({ index, field: "datePrecision", message: "datePrecision 不合法" });
    }
    if (ev.scope && !VALID_SCOPE.has(ev.scope)) {
      issues.push({ index, field: "scope", message: "scope 不合法" });
    }
    const scope = ev.scope ?? "CROSS";
    if (scope === "COMPANY" && !(ev.assets?.length)) {
      issues.push({ index, field: "assets", message: "COMPANY 范围须填写 assets" });
    }
  });

  return {
    ok: issues.length === 0,
    issues,
    eventCount: run.events.length,
    skippedCount: run.skipped?.length ?? 0,
  };
}

/** 规范化来源 URL：去跟踪参数、尾斜杠、小写 */
export function normalizeSourceUrl(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    u.hash = "";
    const drop = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
    for (const k of drop) u.searchParams.delete(k);
    let path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`.toLowerCase();
  } catch {
    return s.replace(/\/+$/, "").toLowerCase();
  }
}

export function normalizeTitleKey(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function contentFingerprint(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, "").slice(0, 120).toLowerCase();
}

function dayBoundsUtc(d: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function draftAgency(ev: IngestEventDraft): string | null {
  const p = ev.payload;
  if (p && typeof p.agency === "string" && p.agency.trim()) {
    return p.agency.trim().toLowerCase();
  }
  const inst = ev.institutions?.[0]?.trim();
  return inst ? inst.toLowerCase() : null;
}

function rowAgency(row: MarketEvent): string | null {
  const p = row.payload;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    const agency = (p as Record<string, unknown>).agency;
    if (typeof agency === "string" && agency.trim()) return agency.trim().toLowerCase();
  }
  const inst = row.institutions[0]?.trim();
  return inst ? inst.toLowerCase() : null;
}

function isRatingLike(eventType: string | null | undefined): boolean {
  const n = normalizeEventType(eventType) ?? eventType ?? "";
  return n.startsWith("rating.") || n === "price_target.change";
}

function unionTags(...lists: Array<string[] | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const v of list ?? []) {
      const t = v.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function higherImportance(a: EventImportance, b: EventImportance): EventImportance {
  return EVENT_IMPORTANCE_ORDER[a] >= EVENT_IMPORTANCE_ORDER[b] ? a : b;
}

/**
 * 同日语义去重：sourceUrl / 标题+类型 / 正文指纹 / 评级机构+标的
 */
export async function findSemanticDuplicate(
  ev: IngestEventDraft,
): Promise<MarketEvent | null> {
  const occurred = parseEventContextDate(ev.occurredAt.slice(0, 10));
  if (!occurred) return null;
  const { start, end } = dayBoundsUtc(occurred);

  const candidates = await prisma.marketEvent.findMany({
    where: { occurredAt: { gte: start, lt: end } },
    take: 200,
  });
  if (!candidates.length) return null;

  const url = normalizeSourceUrl(
    ev.sourceUrl?.trim() || ev.sources?.find((s) => s.url)?.url || null,
  );
  const titleKey = normalizeTitleKey(ev.title);
  const typeKey = normalizeEventType(ev.eventType) ?? ev.eventType.trim();
  const fp = contentFingerprint(ev.content);
  const agency = draftAgency(ev);
  const symbol = ev.assets?.[0]?.trim().toUpperCase() || null;
  const ratingLike = isRatingLike(ev.eventType);

  for (const row of candidates) {
    if (url) {
      const rowUrl = normalizeSourceUrl(row.sourceUrl);
      if (rowUrl && rowUrl === url) return row;
    }

    const rowType = normalizeEventType(row.eventType) ?? row.eventType ?? "";
    if (titleKey && normalizeTitleKey(row.title) === titleKey && rowType === typeKey) {
      return row;
    }

    if (fp.length >= 40 && contentFingerprint(row.content) === fp) {
      return row;
    }

    if (ratingLike && agency && symbol) {
      const rowSym = row.assets[0]?.toUpperCase() || null;
      const rowAg = rowAgency(row);
      if (rowSym === symbol && rowAg === agency && isRatingLike(row.eventType)) {
        return row;
      }
    }
  }

  return null;
}

function mergeDraftOntoExisting(
  existing: MarketEvent,
  ev: IngestEventDraft,
): MarketEventInput {
  const draftUrl =
    ev.sourceUrl?.trim() || ev.sources?.find((s) => s.url)?.url || null;
  const draftContent = ev.content.trim();
  const keepContent =
    draftContent.length > existing.content.trim().length + 40 ? draftContent : existing.content;
  const draftTitle = ev.title.trim();
  const keepTitle =
    draftTitle && (!existing.title || draftTitle.length > (existing.title?.length ?? 0) + 8)
      ? draftTitle
      : existing.title;

  return {
    title: keepTitle,
    content: keepContent,
    occurredAt:
      existing.datePrecision === "DATE"
        ? existing.occurredAt.toISOString().slice(0, 10)
        : existing.occurredAt.toISOString(),
    datePrecision: existing.datePrecision,
    importance: higherImportance(existing.importance, ev.importance ?? "MEDIUM"),
    eventType: existing.eventType ?? normalizeEventType(ev.eventType) ?? ev.eventType,
    scope: existing.scope,
    countries: unionTags(existing.countries, ev.countries),
    industries: unionTags(existing.industries, ev.industries),
    assets: unionTags(existing.assets, ev.assets),
    macroKeys: unionTags(existing.macroKeys, ev.macroKeys),
    persons: unionTags(existing.persons, ev.persons),
    institutions: unionTags(existing.institutions, ev.institutions),
    tags: unionTags(existing.tags, ev.tags),
    payload: (ev.payload as Prisma.InputJsonValue | undefined) ?? existing.payload ?? undefined,
    markerLabel: existing.markerLabel || ev.markerLabel.trim() || null,
    sourceUrl: existing.sourceUrl || draftUrl,
    sourceKind: existing.sourceKind || "ai_skill",
    externalId: existing.externalId || ev.externalId.trim(),
    isPublic: existing.isPublic,
  };
}

function draftToInput(ev: IngestEventDraft): MarketEventInput {
  const sourceUrl =
    ev.sourceUrl?.trim() ||
    ev.sources?.find((s) => s.url)?.url ||
    null;
  return {
    title: ev.title,
    content: ev.content,
    occurredAt: ev.occurredAt,
    datePrecision: ev.datePrecision ?? "DATE",
    importance: ev.importance ?? "MEDIUM",
    scope: ev.scope ?? "CROSS",
    eventType: normalizeEventType(ev.eventType) ?? ev.eventType,
    countries: ev.countries ?? [],
    industries: ev.industries ?? [],
    assets: ev.assets ?? [],
    macroKeys: ev.macroKeys ?? [],
    persons: ev.persons ?? [],
    institutions: ev.institutions ?? [],
    tags: ev.tags ?? [],
    markerLabel: ev.markerLabel,
    payload: ev.payload,
    sourceUrl,
    sourceKind: "ai_skill",
    externalId: ev.externalId.trim(),
    isPublic: true,
  };
}

async function resolveIngestUserId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const admin = await prisma.user.findFirst({
    where: { role: "admin" },
    orderBy: { createdAt: "asc" },
  });
  if (admin) return admin.id;
  const any = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!any) throw new Error("数据库无用户，无法设置 createdById");
  return any.id;
}

export type ImportIngestResult = {
  total: number;
  created: number;
  updated: number;
  /** 因同日语义命中而合并到已有行（非 externalId） */
  merged: number;
  errors: Array<{ index: number; externalId: string; message: string }>;
};

export async function importIngestRun(
  run: IngestRunOutput,
  options: { dryRun?: boolean; userId?: string } = {},
): Promise<ImportIngestResult> {
  const validation = validateIngestRun(run);
  if (!validation.ok) {
    throw new Error(
      `校验失败：${validation.issues
        .slice(0, 5)
        .map((i) => `[${i.index}] ${i.message}`)
        .join("; ")}`,
    );
  }

  const userId = await resolveIngestUserId(options.userId);
  const result: ImportIngestResult = {
    total: run.events.length,
    created: 0,
    updated: 0,
    merged: 0,
    errors: [],
  };

  for (let i = 0; i < run.events.length; i++) {
    const ev = run.events[i]!;
    try {
      const byExt = await prisma.marketEvent.findFirst({
        where: { sourceKind: "ai_skill", externalId: ev.externalId.trim() },
      });

      if (options.dryRun) {
        if (byExt) {
          result.updated++;
        } else {
          const semantic = await findSemanticDuplicate(ev);
          if (semantic) result.merged++;
          else result.created++;
        }
        continue;
      }

      if (byExt) {
        const merged = mergeDraftOntoExisting(byExt, ev);
        await updateMarketEvent(byExt.id, merged);
        result.updated++;
        continue;
      }

      const semantic = await findSemanticDuplicate(ev);
      if (semantic) {
        const merged = mergeDraftOntoExisting(semantic, ev);
        await updateMarketEvent(semantic.id, merged);
        result.merged++;
        result.updated++;
        continue;
      }

      await upsertMarketEventByExternalId(userId, draftToInput(ev));
      result.created++;
    } catch (e) {
      result.errors.push({
        index: i,
        externalId: ev.externalId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}

export function loadIngestRunFromFile(path: string): IngestRunOutput {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  return parseIngestRunOutput(JSON.parse(text) as unknown);
}
