import type { EventDatePrecision, EventImportance, MarketEvent, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MACRO_COUNTRIES } from "@/lib/data/macroCatalog";

export type { EventDatePrecision, EventImportance };

export const EVENT_IMPORTANCE_LABELS: Record<EventImportance, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
  CRITICAL: "关键",
};

export const EVENT_IMPORTANCE_ORDER: Record<EventImportance, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export const EVENT_TYPE_SUGGESTIONS = [
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
] as const;

export const EVENT_INDUSTRY_SUGGESTIONS = [
  "制造业",
  "金融",
  "能源",
  "科技",
  "消费",
  "房地产",
  "医药",
  "原材料",
  "公用事业",
  "交通运输",
] as const;

export type MarketEventDto = {
  id: string;
  title: string | null;
  content: string;
  occurredAt: string;
  datePrecision: EventDatePrecision;
  importance: EventImportance;
  eventType: string | null;
  countries: string[];
  industries: string[];
  assets: string[];
  macroKeys: string[];
  sourceUrl: string | null;
  isPublic: boolean;
  createdById: string;
  createdByUsername?: string;
  createdAt: string;
  updatedAt: string;
  relevanceScore?: number;
};

export type MarketEventInput = {
  title?: string | null;
  content: string;
  occurredAt: string;
  datePrecision?: EventDatePrecision;
  importance?: EventImportance;
  eventType?: string | null;
  countries?: string[];
  industries?: string[];
  assets?: string[];
  macroKeys?: string[];
  sourceUrl?: string | null;
  isPublic?: boolean;
};

export type ListMarketEventsParams = {
  q?: string;
  from?: string;
  to?: string;
  countries?: string[];
  industries?: string[];
  assets?: string[];
  importance?: EventImportance[];
  limit?: number;
  offset?: number;
};

export type EventContextParams = {
  date: string;
  lookbackDays?: number;
  lookaheadDays?: number;
  countries?: string[];
  industries?: string[];
  assets?: string[];
  macroKeys?: string[];
  limit?: number;
};

const VALID_IMPORTANCE = new Set<EventImportance>(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const VALID_PRECISION = new Set<EventDatePrecision>(["DATE", "DATETIME"]);
const COUNTRY_CODES = new Set(MACRO_COUNTRIES.map((c) => c.code));

function toDto(
  row: MarketEvent & { createdBy?: { username: string } },
  relevanceScore?: number,
): MarketEventDto {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    occurredAt: row.occurredAt.toISOString(),
    datePrecision: row.datePrecision,
    importance: row.importance,
    eventType: row.eventType,
    countries: row.countries,
    industries: row.industries,
    assets: row.assets.map(normalizeAssetTag),
    macroKeys: row.macroKeys,
    sourceUrl: row.sourceUrl,
    isPublic: row.isPublic,
    createdById: row.createdById,
    createdByUsername: row.createdBy?.username,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    relevanceScore,
  };
}

export function normalizeAssetTag(raw: string): string {
  return raw.trim().toUpperCase();
}

export function normalizeTagList(values: string[] | undefined, upper = false): string[] {
  if (!values?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const t = (upper ? normalizeAssetTag(v) : v.trim()).replace(/\s+/g, " ");
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function normalizeCountries(values: string[] | undefined): string[] {
  return normalizeTagList(values, true).filter((c) => COUNTRY_CODES.has(c));
}

/** 解析宏观/行情上下文日期标签 → UTC 日界中点 */
export function parseEventContextDate(label: string): Date | null {
  const s = label.trim();
  if (/^\d{4}$/.test(s)) return new Date(Date.UTC(Number(s), 0, 1, 12, 0, 0));
  if (/^\d{4}-\d{2}$/.test(s)) {
    return new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, 1, 12, 0, 0));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(
      Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)), 12, 0, 0),
    );
  }
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
}

export function unixSecToContextDate(sec: number): string {
  const d = new Date(sec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 宏观图横轴标签 → API 用的 YYYY-MM-DD */
export function contextDateFromTimeLabel(label: string | null): string | null {
  if (!label?.trim()) return null;
  const s = label.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  const d = parseEventContextDate(s);
  return d ? d.toISOString().slice(0, 10) : null;
}

export function extractCountriesFromMacroKeys(keys: string[]): string[] {
  const out = new Set<string>();
  for (const key of keys) {
    const parts = key.split(":");
    if (parts[0] === "wb" && parts[1] && COUNTRY_CODES.has(parts[1].toUpperCase())) {
      out.add(parts[1].toUpperCase());
      continue;
    }
    if (parts[0] === "fred") out.add("US");
    if (parts[0] === "mds" && parts[1] && COUNTRY_CODES.has(parts[1].toUpperCase())) {
      out.add(parts[1].toUpperCase());
    }
  }
  return [...out];
}

function parseOccurredAt(input: string, precision: EventDatePrecision): Date {
  const raw = input.trim();
  if (!raw) throw new Error("请填写发生时间");
  if (precision === "DATE") {
    const d = parseEventContextDate(raw.slice(0, 10));
    if (!d) throw new Error("日期格式不正确，请使用 YYYY-MM-DD");
    return d;
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new Error("日期时间格式不正确");
  return new Date(ms);
}

function sanitizeEventInput(input: MarketEventInput) {
  const content = input.content?.trim();
  if (!content) throw new Error("请填写事件内容");
  if (content.length > 20000) throw new Error("事件内容过长");

  const title = input.title?.trim() || null;
  if (title && title.length > 256) throw new Error("标题过长");

  const datePrecision = input.datePrecision ?? "DATE";
  if (!VALID_PRECISION.has(datePrecision)) throw new Error("时间精度不合法");

  const importance = input.importance ?? "MEDIUM";
  if (!VALID_IMPORTANCE.has(importance)) throw new Error("重要性等级不合法");

  const sourceUrl = input.sourceUrl?.trim() || null;
  if (sourceUrl && sourceUrl.length > 512) throw new Error("来源链接过长");

  return {
    title,
    content,
    occurredAt: parseOccurredAt(input.occurredAt, datePrecision),
    datePrecision,
    importance,
    eventType: input.eventType?.trim() || null,
    countries: normalizeCountries(input.countries),
    industries: normalizeTagList(input.industries),
    assets: normalizeTagList(input.assets, true),
    macroKeys: normalizeTagList(input.macroKeys),
    sourceUrl,
    isPublic: input.isPublic ?? true,
  };
}

function intersects(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  return b.some((x) => set.has(x));
}

function assetMatch(eventAssets: string[], contextAssets: string[]): boolean {
  if (contextAssets.length === 0) return true;
  if (eventAssets.length === 0) return true;
  const ctx = new Set(contextAssets.map(normalizeAssetTag));
  return eventAssets.some((a) => ctx.has(normalizeAssetTag(a)));
}

function countryMatch(eventCountries: string[], contextCountries: string[]): boolean {
  if (contextCountries.length === 0) return true;
  if (eventCountries.length === 0) return true;
  return intersects(eventCountries, contextCountries);
}

function industryMatch(eventIndustries: string[], contextIndustries: string[]): boolean {
  if (contextIndustries.length === 0) return true;
  if (eventIndustries.length === 0) return true;
  return intersects(eventIndustries, contextIndustries);
}

function macroKeyMatch(eventKeys: string[], contextKeys: string[]): boolean {
  if (contextKeys.length === 0) return true;
  if (eventKeys.length === 0) return true;
  return intersects(eventKeys, contextKeys);
}

export function scoreEventForContext(
  event: MarketEvent,
  ctx: {
    center: Date;
    countries: string[];
    industries: string[];
    assets: string[];
    macroKeys: string[];
  },
): number {
  if (!countryMatch(event.countries, ctx.countries)) return -1;
  if (!industryMatch(event.industries, ctx.industries)) return -1;
  if (!assetMatch(event.assets, ctx.assets)) return -1;
  if (!macroKeyMatch(event.macroKeys, ctx.macroKeys)) return -1;

  const dayMs = 86400000;
  const diffDays = Math.abs(event.occurredAt.getTime() - ctx.center.getTime()) / dayMs;
  let score = 100 - Math.min(60, diffDays * 4);

  if (event.assets.length > 0 && ctx.assets.length > 0 && intersects(event.assets, ctx.assets)) {
    score += 25;
  }
  if (event.macroKeys.length > 0 && ctx.macroKeys.length > 0 && intersects(event.macroKeys, ctx.macroKeys)) {
    score += 20;
  }
  if (event.countries.length > 0 && ctx.countries.length > 0 && intersects(event.countries, ctx.countries)) {
    score += 10;
  }
  score += EVENT_IMPORTANCE_ORDER[event.importance] * 3;
  return score;
}

export async function listMarketEvents(params: ListMarketEventsParams): Promise<{
  events: MarketEventDto[];
  total: number;
}> {
  const where: Prisma.MarketEventWhereInput = { isPublic: true };
  if (params.q?.trim()) {
    where.OR = [
      { content: { contains: params.q.trim(), mode: "insensitive" } },
      { title: { contains: params.q.trim(), mode: "insensitive" } },
    ];
  }
  if (params.from || params.to) {
    where.occurredAt = {};
    if (params.from) {
      const d = parseEventContextDate(params.from);
      if (d) where.occurredAt.gte = d;
    }
    if (params.to) {
      const d = parseEventContextDate(params.to);
      if (d) {
        d.setUTCDate(d.getUTCDate() + 1);
        where.occurredAt.lt = d;
      }
    }
  }
  if (params.countries?.length) {
    where.countries = { hasSome: normalizeCountries(params.countries) };
  }
  if (params.industries?.length) {
    where.industries = { hasSome: normalizeTagList(params.industries) };
  }
  if (params.assets?.length) {
    where.assets = { hasSome: normalizeTagList(params.assets, true) };
  }
  if (params.importance?.length) {
    where.importance = { in: params.importance.filter((x) => VALID_IMPORTANCE.has(x)) };
  }

  const limit = Math.min(2000, Math.max(1, params.limit ?? 50));
  const offset = Math.max(0, params.offset ?? 0);

  const eraHeaderWhere: Prisma.MarketEventWhereInput = {
    isPublic: true,
    eventType: "时代阶段",
  };
  if (params.countries?.length) {
    eraHeaderWhere.countries = { hasSome: normalizeCountries(params.countries) };
  }

  const [rows, eraHeaders, total] = await Promise.all([
    prisma.marketEvent.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { importance: "desc" }],
      take: limit,
      skip: offset,
      include: { createdBy: { select: { username: true } } },
    }),
    prisma.marketEvent.findMany({
      where: eraHeaderWhere,
      include: { createdBy: { select: { username: true } } },
    }),
    prisma.marketEvent.count({ where }),
  ]);

  const byId = new Map<string, MarketEvent & { createdBy?: { username: string } }>();
  for (const r of eraHeaders) byId.set(r.id, r);
  for (const r of rows) byId.set(r.id, r);

  return { events: [...byId.values()].map((r) => toDto(r)), total };
}

export async function queryEventsByContext(params: EventContextParams): Promise<MarketEventDto[]> {
  const center = parseEventContextDate(params.date);
  if (!center) return [];

  const lookback = Math.min(365, Math.max(0, params.lookbackDays ?? 7));
  const lookahead = Math.min(365, Math.max(0, params.lookaheadDays ?? 7));
  const from = new Date(center);
  from.setUTCDate(from.getUTCDate() - lookback);
  const to = new Date(center);
  to.setUTCDate(to.getUTCDate() + lookahead + 1);

  const ctx = {
    center,
    countries: normalizeCountries(params.countries),
    industries: normalizeTagList(params.industries),
    assets: normalizeTagList(params.assets, true),
    macroKeys: normalizeTagList(params.macroKeys),
  };

  const rows = await prisma.marketEvent.findMany({
    where: {
      isPublic: true,
      occurredAt: { gte: from, lt: to },
    },
    include: { createdBy: { select: { username: true } } },
  });

  const scored = rows
    .map((row) => {
      const score = scoreEventForContext(row, ctx);
      return score >= 0 ? { row, score } : null;
    })
    .filter((x): x is { row: MarketEvent & { createdBy: { username: string } }; score: number } => x !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const imp = EVENT_IMPORTANCE_ORDER[b.row.importance] - EVENT_IMPORTANCE_ORDER[a.row.importance];
      if (imp !== 0) return imp;
      return b.row.occurredAt.getTime() - a.row.occurredAt.getTime();
    });

  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const picked = scored.slice(0, limit).map(({ row, score }) => toDto(row, score));

  const eraHeaderWhere: Prisma.MarketEventWhereInput = {
    isPublic: true,
    eventType: "时代阶段",
  };
  if (ctx.countries.length) {
    eraHeaderWhere.countries = { hasSome: ctx.countries };
  }
  const eraHeaders = await prisma.marketEvent.findMany({
    where: eraHeaderWhere,
    include: { createdBy: { select: { username: true } } },
  });

  const byId = new Map(picked.map((e) => [e.id, e]));
  for (const row of eraHeaders) {
    if (!byId.has(row.id)) byId.set(row.id, toDto(row));
  }
  return [...byId.values()];
}

export async function getMarketEventById(id: string): Promise<MarketEventDto | null> {
  const row = await prisma.marketEvent.findFirst({
    where: { id, isPublic: true },
    include: { createdBy: { select: { username: true } } },
  });
  return row ? toDto(row) : null;
}

export async function createMarketEvent(
  userId: string,
  input: MarketEventInput,
): Promise<MarketEventDto> {
  const data = sanitizeEventInput(input);
  const row = await prisma.marketEvent.create({
    data: {
      ...data,
      createdById: userId,
    },
    include: { createdBy: { select: { username: true } } },
  });
  return toDto(row);
}

export async function updateMarketEvent(
  id: string,
  input: Partial<MarketEventInput>,
): Promise<MarketEventDto> {
  const existing = await prisma.marketEvent.findUnique({ where: { id } });
  if (!existing) throw new Error("事件不存在");

  const merged: MarketEventInput = {
    title: input.title !== undefined ? input.title : existing.title,
    content: input.content ?? existing.content,
    occurredAt:
      input.occurredAt ??
      (existing.datePrecision === "DATE"
        ? existing.occurredAt.toISOString().slice(0, 10)
        : existing.occurredAt.toISOString()),
    datePrecision: input.datePrecision ?? existing.datePrecision,
    importance: input.importance ?? existing.importance,
    eventType: input.eventType !== undefined ? input.eventType : existing.eventType,
    countries: input.countries ?? existing.countries,
    industries: input.industries ?? existing.industries,
    assets: input.assets ?? existing.assets,
    macroKeys: input.macroKeys ?? existing.macroKeys,
    sourceUrl: input.sourceUrl !== undefined ? input.sourceUrl : existing.sourceUrl,
    isPublic: input.isPublic ?? existing.isPublic,
  };

  const data = sanitizeEventInput(merged);
  const row = await prisma.marketEvent.update({
    where: { id },
    data,
    include: { createdBy: { select: { username: true } } },
  });
  return toDto(row);
}

export async function deleteMarketEvent(id: string): Promise<void> {
  await prisma.marketEvent.delete({ where: { id } });
}

export function formatEventOccurredAt(dto: MarketEventDto): string {
  if (dto.datePrecision === "DATE") return dto.occurredAt.slice(0, 10);
  const d = new Date(dto.occurredAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
