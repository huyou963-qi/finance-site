import { prisma } from "@/lib/prisma";
import { PRODUCT_USAGE_AUDIENCES } from "@/lib/analytics/usageTypes";
import { extractArticleSlug } from "@/lib/analytics/usagePath";
import {
  addShanghaiDays,
  dateOnlyUtc,
  shanghaiDateString,
  shanghaiDayBounds,
} from "@/lib/analytics/usageShanghaiDate";
export type ArticleReadRow = {
  slug: string;
  title: string;
  /** published | draft | 其它/库中无记录 */
  status: string;
  pv: number;
  uv: number;
  activeMsSum: number;
  href: string;
};

function actorKey(userId: string | null, guestId: string | null): string | null {
  if (userId) return `u:${userId}`;
  if (guestId) return `g:${guestId}`;
  return null;
}

/** 今日文章阅读：从明细即时汇总（产品受众）。 */
async function liveArticleTotals(dateStr: string): Promise<Map<string, { pv: number; uv: number; activeMsSum: number }>> {
  const { start, end } = shanghaiDayBounds(dateStr);
  const events = await prisma.usageEvent.findMany({
    where: {
      createdAt: { gte: start, lt: end },
      audience: { in: [...PRODUCT_USAGE_AUDIENCES] },
      OR: [{ articleSlug: { not: null } }, { path: { startsWith: "/articles/" } }],
    },
    select: {
      kind: true,
      userId: true,
      guestId: true,
      path: true,
      articleSlug: true,
      activeMs: true,
    },
  });

  const bySlug = new Map<string, { actors: Set<string>; pv: number; activeMsSum: number }>();
  for (const e of events) {
    const slug = e.articleSlug ?? extractArticleSlug(e.path);
    if (!slug) continue;
    let b = bySlug.get(slug);
    if (!b) {
      b = { actors: new Set(), pv: 0, activeMsSum: 0 };
      bySlug.set(slug, b);
    }
    const actor = actorKey(e.userId, e.guestId);
    if (actor) b.actors.add(actor);
    if (e.kind === "page_view") b.pv += 1;
    if (e.activeMs > 0) b.activeMsSum += e.activeMs;
  }

  const out = new Map<string, { pv: number; uv: number; activeMsSum: number }>();
  for (const [slug, b] of bySlug) {
    out.set(slug, { pv: b.pv, uv: b.actors.size, activeMsSum: b.activeMsSum });
  }
  return out;
}

/**
 * 近 N 日文章阅读排行（默认 7 日）：历史读 UsageArticleDailyAgg(audience=all)，
 * 今日叠明细；标题从 Article 表补全。
 */
export async function getArticleReadRanking(days = 7, now = new Date()): Promise<ArticleReadRow[]> {
  const today = shanghaiDateString(now);
  const dates = Array.from({ length: days }, (_, i) => addShanghaiDays(today, -i));
  const historical = dates.filter((d) => d !== today);

  const totals = new Map<string, { pv: number; uv: number; activeMsSum: number }>();

  if (historical.length) {
    const rows = await prisma.usageArticleDailyAgg.findMany({
      where: {
        audience: "all",
        date: { in: historical.map(dateOnlyUtc) },
      },
    });
    for (const row of rows) {
      const cur = totals.get(row.articleSlug) ?? { pv: 0, uv: 0, activeMsSum: 0 };
      cur.pv += row.pv;
      cur.uv += row.uv;
      cur.activeMsSum += Number(row.activeMsSum);
      totals.set(row.articleSlug, cur);
    }
  }

  if (dates.includes(today)) {
    const live = await liveArticleTotals(today);
    for (const [slug, row] of live) {
      const cur = totals.get(slug) ?? { pv: 0, uv: 0, activeMsSum: 0 };
      cur.pv += row.pv;
      cur.uv += row.uv;
      cur.activeMsSum += row.activeMsSum;
      totals.set(slug, cur);
    }
  }

  const slugs = [...totals.keys()];
  const articles = slugs.length
    ? await prisma.article.findMany({
        where: { slug: { in: slugs } },
        select: { slug: true, title: true, status: true },
      })
    : [];
  const meta = new Map(articles.map((a) => [a.slug, a]));

  return slugs
    .map((slug) => {
      const t = totals.get(slug)!;
      const info = meta.get(slug);
      return {
        slug,
        title: info?.title ?? slug,
        status: info?.status ?? "unknown",
        pv: t.pv,
        uv: t.uv,
        activeMsSum: t.activeMsSum,
        href: `/articles/${slug}`,
      };
    })
    .sort((a, b) => b.pv - a.pv || b.uv - a.uv || a.slug.localeCompare(b.slug));
}
