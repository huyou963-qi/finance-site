import { prisma } from "@/lib/prisma";
import { getPublishedArticleBySlug } from "@/lib/articles/articleStore";
import { getMarketEventById } from "@/lib/data/marketEvents";
import { getWeeklyReportById, listWeeklyReports } from "@/lib/data/weeklyReports";
import { MarketError } from "@/lib/market/schema";
import { absoluteUrl } from "@/lib/seo/siteUrl";

export const contentFeatures = { article: "articles", weekly: "weekly", event: "events" } as const;
export type ResearchContent = keyof typeof contentFeatures;

const matches = (query: string) => ({ contains: query, mode: "insensitive" as const });
const articleUrl = (slug: string) => absoluteUrl(`/articles/${encodeURIComponent(slug)}`);
const weeklyUrl = (id: string) => absoluteUrl(`/weekly?report=${encodeURIComponent(id)}`);
const eventUrl = () => absoluteUrl("/events");

export async function searchResearchContent(kind: ResearchContent, query: string, limit: number, offset: number) {
  if (kind === "article") {
    const rows = await prisma.article.findMany({
      where: { status: "published", OR: [{ title: matches(query) }, { summary: matches(query) }, { tags: { has: query } }] },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }], skip: offset, take: limit + 1,
      select: { slug: true, title: true, summary: true, publishedAt: true, category: true },
    });
    return {
      kind, hasMore: rows.length > limit,
      items: rows.slice(0, limit).map(row => ({ id: row.slug, title: row.title, summary: row.summary.slice(0, 400),
        publishedAt: row.publishedAt, category: row.category, websiteUrl: articleUrl(row.slug) })),
    };
  }

  if (kind === "weekly") {
    const { reports, total } = await listWeeklyReports({ query, limit, offset });
    return {
      kind, hasMore: offset + reports.length < total,
      items: reports.map(row => ({ id: row.id, title: row.meta.title, summary: row.meta.summaryOneLiner.slice(0, 400),
        weekEnding: row.weekEnding, websiteUrl: weeklyUrl(row.id) })),
    };
  }

  const rows = await prisma.marketEvent.findMany({
    where: { isPublic: true, OR: [{ title: matches(query) }, { content: matches(query) }, { tags: { has: query } }] },
    orderBy: [{ occurredAt: "desc" }, { id: "asc" }], skip: offset, take: limit + 1,
    select: { id: true, title: true, occurredAt: true, eventType: true, importance: true },
  });
  return { kind, hasMore: rows.length > limit, items: rows.slice(0, limit).map(row => ({ ...row, websiteUrl: eventUrl() })) };
}

function bodyPage(body: string, offset: number) {
  const end = Math.min(body.length, offset + 12000);
  // Keep a Unicode surrogate pair in the same page.
  const boundary = /[\uD800-\uDBFF]/.test(body[end - 1] ?? "") && end < body.length ? end - 1 : end;
  return { offset, body: body.slice(offset, boundary), nextOffset: boundary < body.length ? boundary : null };
}

export async function getResearchContent(kind: ResearchContent, id: string, offset: number) {
  if (kind === "article") {
    const row = await getPublishedArticleBySlug(id);
    if (!row) throw new MarketError("NOT_FOUND", "研究内容不存在");
    return { kind, id, title: row.title, publishedAt: row.publishedAt, dataCutoff: row.dataCutoff,
      ...bodyPage(row.bodyMarkdown, offset), websiteUrl: articleUrl(row.slug) };
  }

  if (kind === "weekly") {
    const row = await getWeeklyReportById(id);
    if (!row) throw new MarketError("NOT_FOUND", "研究内容不存在");
    return { kind, id, title: row.meta.title, weekEnding: row.weekEnding,
      ...bodyPage(row.bodyMarkdown, offset), websiteUrl: weeklyUrl(row.id) };
  }

  const row = await getMarketEventById(id);
  if (!row) throw new MarketError("NOT_FOUND", "研究内容不存在");
  return { kind, id, title: row.title, occurredAt: row.occurredAt, eventType: row.eventType, importance: row.importance,
    ...bodyPage(row.content, offset), websiteUrl: eventUrl() };
}
