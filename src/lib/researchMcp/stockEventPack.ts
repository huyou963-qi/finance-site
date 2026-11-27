import { z } from "zod";
import { EVENT_SCOPES, EVENT_TYPE_CODES } from "@/lib/data/eventTaxonomy";
import { validateIngestRun } from "@/lib/data/marketEventsIngest";
import { parseMilestoneIngestJson } from "@/lib/equity/companyMilestones";
import { prepareEventPackImport, resolveEventPackFileMetadata, selectLocalPackEvents } from "@/lib/equity/localEventPacks";
import { day, MarketError } from "@/lib/market/schema";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const publicUrl = z.url({ protocol: /^https?$/ }).max(2048);
const source = z.looseObject({
  url: publicUrl,
  title: z.string().max(200).optional(),
  note: z.string().max(400).optional(),
});
const researchEvent = z.looseObject({
  externalId: z.string().trim().min(1).max(180).describe("稳定 ID，重做同一事件时保持不变"),
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(1200),
  occurredAt: z.string().max(40).describe("事件当地日期 YYYY-MM-DD；确知时刻时用带时区的 ISO 8601"),
  datePrecision: z.enum(["DATE", "DATETIME"]).default("DATE"),
  eventType: z.enum(EVENT_TYPE_CODES),
  importance: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  scope: z.enum(EVENT_SCOPES).optional(),
  markerLabel: z.string().trim().min(1).max(16),
  color: color.optional(),
  assets: z.array(z.string().trim().min(1).max(32)).max(30).optional().describe("事件实际关联的标的；COMPANY 类型必须提供"),
  sourceUrl: publicUrl.nullable().optional(),
  readingLinks: z.array(source).max(6).optional(),
  sources: z.array(source).min(1).max(6).describe("外部 AI 已查证的公开证据链接；优先保留原始来源"),
  payload: z.looseObject({
    impact: z.looseObject({
      summary: z.string().trim().min(1).max(480),
    }),
  }),
});
const ticker = z.string().trim().min(1).max(16);
export const researchEventPackInput = z.strictObject({
  mode: z.literal("company-milestone").default("company-milestone"),
  schemaVersion: z.literal(2).default(2),
  pack: z.strictObject({
    id: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(120),
    version: z.string().trim().min(1).max(40).optional(),
    color: color.optional(),
    symbols: z.array(ticker).min(1).max(24).optional(),
  }),
  query: z.strictObject({
    symbol: ticker.optional(),
    importTarget: z.enum(["symbol", "all-assets"]).default("symbol"),
    topic: z.string().max(160).optional(),
    from: day.optional(),
    to: day.optional(),
  }).optional(),
  events: z.array(researchEvent).min(1).max(24),
  skipped: z.array(z.looseObject({ reason: z.string().trim().min(1).max(300) })).max(24).optional(),
});

export function prepareResearchEventPack(raw: z.output<typeof researchEventPackInput>, symbol: string) {
  const eventsWithEvidence = raw.events.map(event => ({
    ...event,
    scope: event.scope ?? "CROSS" as const,
    sourceUrl: event.sourceUrl ?? event.sources[0].url,
  }));
  const checked = { ...raw, events: eventsWithEvidence };
  const parsed = parseMilestoneIngestJson(checked);
  if (parsed.errors.length) throw new MarketError("INVALID_INPUT", parsed.errors.join("；"));
  const validation = validateIngestRun(checked);
  if (!validation.ok) {
    const message = validation.issues.map(issue => `events[${issue.index}].${issue.field}: ${issue.message}`).join("；");
    throw new MarketError("INVALID_INPUT", message);
  }
  try {
    const { target, metadata } = resolveEventPackFileMetadata(raw, "event-pack.json", parsed.importTarget, parsed.symbol, "file");
    const { pack } = prepareEventPackImport([], parsed.milestones, target, symbol, metadata);
    const { events } = selectLocalPackEvents([pack], symbol);
    if (!events.length) throw new Error("事件包的显示范围未包含当前标的");
    const query = pack.target === "all-assets"
      ? { ...raw.query, importTarget: "all-assets", symbol: undefined }
      : { ...raw.query, importTarget: "symbol", symbol };
    const document = {
      ...raw, query,
      pack: { ...raw.pack, symbols: pack.target === "all-assets" ? undefined : pack.symbols },
      events: pack.events,
    };
    return { events, document };
  } catch (error) {
    throw new MarketError("INVALID_INPUT", error instanceof Error ? error.message : String(error));
  }
}
