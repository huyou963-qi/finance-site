import { prisma } from "@/lib/prisma";
import {
  createMarketEvent,
  parseEventContextDate,
  type MarketEventInput,
} from "@/lib/data/marketEvents";

export type MarketEventSeedItem = MarketEventInput & {
  /** 可选幂等键；重复导入时按 content 内 `[seed:key]` 或 title+日期去重 */
  seedKey?: string;
};

export type MarketEventEraSeed = {
  seedKey: string;
  tag: string;
  title: string;
  dateFrom: string;
  dateTo: string;
  cyclePhase?: string;
  defaultExpanded?: boolean;
  wikipediaUrl?: string | null;
  eraSummary: string;
  events: MarketEventSeedItem[];
};

export type MarketEventSeedFileV2 = {
  version: 2;
  description?: string;
  timeline?: { country?: string; anchorStart?: string; anchorEnd?: string };
  eras: MarketEventEraSeed[];
};

export type MarketEventSeedFile = {
  version: 1;
  description?: string;
  events: MarketEventSeedItem[];
};

export type ParsedMarketEventSeed =
  | { version: 1; file: MarketEventSeedFile }
  | { version: 2; file: MarketEventEraSeed[]; description?: string };

function eraMarkersBlock(era: MarketEventEraSeed): string {
  const lines = [
    `[seed:${era.seedKey}]`,
    `[era:tag:${era.tag}]`,
    era.cyclePhase ? `[era:phase:${era.cyclePhase}]` : null,
    `[era:collapse:foldable]`,
    `[era:dateFrom:${era.dateFrom}]`,
    `[era:dateTo:${era.dateTo}]`,
  ].filter(Boolean);
  return lines.join("\n");
}

function eraTitleRange(era: MarketEventEraSeed): string {
  const fromY = era.dateFrom.slice(0, 4);
  const toRaw = era.dateTo.trim();
  const toY =
    toRaw === "present" || toRaw === "今"
      ? String(new Date().getUTCFullYear())
      : toRaw.slice(0, 4);
  return `${fromY}—${toY} ${era.title}`;
}

/** v2 时代树 → 扁平 v1 种子（阶段头 + 子事件） */
export function flattenEraSeedToV1(v2: MarketEventSeedFileV2): MarketEventSeedFile {
  const events: MarketEventSeedItem[] = [];

  for (const era of v2.eras) {
    const summaryBody = era.eraSummary.trim();
    const eraContent = summaryBody.includes("[seed:")
      ? summaryBody
      : `${summaryBody}\n\n${eraMarkersBlock(era)}`;

    events.push({
      seedKey: era.seedKey,
      title: eraTitleRange(era),
      content: eraContent,
      occurredAt: era.dateFrom,
      datePrecision: "DATE",
      importance: "CRITICAL",
      eventType: "时代阶段",
      countries: ["US"],
      industries: ["时代阶段", era.tag],
      assets: [],
      macroKeys: [],
      sourceUrl: era.wikipediaUrl ?? null,
      isPublic: true,
    });

    for (const child of era.events) {
      const base = child.content.trim();
      const parentLine = `[era:parent:${era.seedKey}]`;
      const tagLine = `[era:tag:${era.tag}]`;
      let content = base;
      if (!content.includes(parentLine)) {
        content = `${content}\n\n${parentLine}\n${tagLine}`;
      }
      const industries = [...new Set([...(child.industries ?? []), era.tag])];
      events.push({
        ...child,
        content,
        countries: child.countries?.length ? child.countries : ["US"],
        industries,
      });
    }
  }

  events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  return {
    version: 1,
    description: v2.description ?? "美国历史经济时代时间线（扁平导入）",
    events,
  };
}

export function parseMarketEventSeedFile(raw: unknown): MarketEventSeedFile {
  if (!raw || typeof raw !== "object") throw new Error("种子文件须为 JSON 对象");
  const obj = raw as Record<string, unknown>;

  if (obj.version === 2) {
    if (!Array.isArray(obj.eras)) throw new Error("v2 种子文件缺少 eras 数组");
    return flattenEraSeedToV1({
      version: 2,
      description: typeof obj.description === "string" ? obj.description : undefined,
      timeline:
        obj.timeline && typeof obj.timeline === "object"
          ? (obj.timeline as MarketEventSeedFileV2["timeline"])
          : undefined,
      eras: obj.eras as MarketEventEraSeed[],
    });
  }

  if (obj.version !== 1) throw new Error("种子文件 version 须为 1 或 2");
  if (!Array.isArray(obj.events)) throw new Error("种子文件缺少 events 数组");
  return {
    version: 1,
    description: typeof obj.description === "string" ? obj.description : undefined,
    events: obj.events as MarketEventSeedItem[],
  };
}

export type ImportMarketEventsOptions = {
  dryRun?: boolean;
  skipExisting?: boolean;
  userId?: string;
};

export type ImportMarketEventsResult = {
  total: number;
  created: number;
  skipped: number;
  errors: Array<{ index: number; title: string | null; message: string }>;
};

function dayBoundsUtc(d: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function parseSeedOccurredAt(input: MarketEventInput): Date {
  const raw = input.occurredAt?.trim();
  if (!raw) throw new Error("请填写发生时间");
  const precision = input.datePrecision ?? "DATE";
  if (precision === "DATE") {
    const d = parseEventContextDate(raw.slice(0, 10));
    if (!d) throw new Error("日期格式不正确，请使用 YYYY-MM-DD");
    return d;
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new Error("日期时间格式不正确");
  return new Date(ms);
}

async function resolveSeedUserId(explicit?: string): Promise<string> {
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

async function seedItemExists(
  item: MarketEventSeedItem,
  occurredAt: Date,
): Promise<boolean> {
  const seedKey = item.seedKey?.trim();
  if (seedKey) {
    const byKey = await prisma.marketEvent.findFirst({
      where: { content: { contains: `[seed:${seedKey}]` } },
    });
    if (byKey) return true;
  }

  const title = item.title?.trim() || null;
  const { start, end } = dayBoundsUtc(occurredAt);
  const byTitle = await prisma.marketEvent.findFirst({
    where: {
      title,
      occurredAt: { gte: start, lt: end },
    },
  });
  return Boolean(byTitle);
}

function withSeedMarker(content: string, seedKey?: string): string {
  const key = seedKey?.trim();
  if (!key) return content;
  const marker = `[seed:${key}]`;
  if (content.includes(marker)) return content;
  return `${content.trim()}\n\n${marker}`;
}

export async function importMarketEventsFromSeed(
  seed: MarketEventSeedFile,
  options: ImportMarketEventsOptions = {},
): Promise<ImportMarketEventsResult> {
  const dryRun = options.dryRun ?? false;
  const skipExisting = options.skipExisting ?? true;
  const userId = await resolveSeedUserId(options.userId);

  const result: ImportMarketEventsResult = {
    total: seed.events.length,
    created: 0,
    skipped: 0,
    errors: [],
  };

  for (let i = 0; i < seed.events.length; i++) {
    const item = seed.events[i];
    try {
      const occurredAt = parseSeedOccurredAt(item);
      if (skipExisting && (await seedItemExists(item, occurredAt))) {
        result.skipped++;
        continue;
      }

      const input: MarketEventInput = {
        ...item,
        content: withSeedMarker(item.content, item.seedKey),
      };

      if (dryRun) {
        result.created++;
        continue;
      }

      await createMarketEvent(userId, input);
      result.created++;
    } catch (e) {
      result.errors.push({
        index: i,
        title: item.title?.trim() ?? null,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}
