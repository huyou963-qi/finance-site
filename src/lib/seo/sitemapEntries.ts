import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { GICS_SECTORS, sectorSlug } from "@/lib/equity/gicsCatalog";
import { absoluteUrl } from "./siteUrl";

type Entry = MetadataRoute.Sitemap[number];

/** 对匿名访客公开、值得被搜索收录的静态页（不含登录、编辑器、个人投资档案、跳转页） */
export const STATIC_SITEMAP_PAGES: readonly {
  path: string;
  changeFrequency: Entry["changeFrequency"];
  priority: number;
}[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/macro", changeFrequency: "daily", priority: 0.9 },
  { path: "/macro/framework", changeFrequency: "weekly", priority: 0.7 },
  { path: "/markets", changeFrequency: "daily", priority: 0.8 },
  { path: "/markets-tools", changeFrequency: "weekly", priority: 0.5 },
  { path: "/equity/sectors", changeFrequency: "daily", priority: 0.8 },
  { path: "/quant/screener", changeFrequency: "weekly", priority: 0.7 },
  { path: "/quant/backtest", changeFrequency: "weekly", priority: 0.6 },
  { path: "/quant/factor-research", changeFrequency: "weekly", priority: 0.6 },
  { path: "/quant/regime", changeFrequency: "weekly", priority: 0.6 },
  { path: "/quant/robustness", changeFrequency: "weekly", priority: 0.5 },
  { path: "/events", changeFrequency: "daily", priority: 0.6 },
  { path: "/weekly", changeFrequency: "weekly", priority: 0.8 },
  { path: "/articles", changeFrequency: "daily", priority: 0.8 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.5 },
  { path: "/tools/futures-positions", changeFrequency: "weekly", priority: 0.5 },
  { path: "/tools/statistical-analysis", changeFrequency: "monthly", priority: 0.4 },
];

/** sitemap.xml 与百度全量推送共用：静态页 + GICS 行业 + 已发布文章 + 标普 500 个股页 */
export async function collectSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_SITEMAP_PAGES.map((p) => ({
    url: absoluteUrl(p.path),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  for (const sector of GICS_SECTORS) {
    entries.push({
      url: absoluteUrl(`/equity/sectors/${sectorSlug(sector)}`),
      changeFrequency: "daily",
      priority: 0.6,
    });
  }

  try {
    const [articles, stocks] = await Promise.all([
      prisma.article.findMany({
        where: { status: "published" },
        select: { slug: true, updatedAt: true },
        orderBy: { publishedAt: "desc" },
      }),
      // 有 GICS 分类的即标普 500 成分（全美股 7000+ 只多数无详情价值，不收录）
      prisma.equitySecurity.findMany({
        where: { gicsSector: { not: null } },
        select: { symbol: true },
        orderBy: { symbol: "asc" },
      }),
    ]);
    for (const a of articles) {
      entries.push({
        url: absoluteUrl(`/articles/${encodeURIComponent(a.slug)}`),
        lastModified: a.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
    for (const s of stocks) {
      entries.push({
        url: absoluteUrl(`/equity/stocks/${encodeURIComponent(s.symbol)}`),
        changeFrequency: "daily",
        priority: 0.5,
      });
    }
  } catch (e) {
    // DB 不可用时仍返回静态部分，避免 sitemap 整体 500
    console.error("[sitemap] dynamic entries failed", e);
  }

  return entries;
}
