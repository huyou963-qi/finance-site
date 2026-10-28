import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleDocument } from "@/components/articles/ArticleDocument";
import { checkFeatureAccess } from "@/lib/access/featureAccess";
import { FeatureLocked } from "@/components/access/FeatureLocked";
import { resolveArticleCover } from "@/lib/articles/articleSchema";
import { getPublishedArticleBySlug } from "@/lib/articles/articleStore";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/seo/siteUrl";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const article = await getPublishedArticleBySlug((await params).slug);
  if (!article) {
    return { title: "文章不存在 — GekkoTech" };
  }

  const url = absoluteUrl(`/articles/${article.slug}`);
  const cover = resolveArticleCover(article.coverImageUrl, article.bodyMarkdown);
  const image = cover?.startsWith("/") ? absoluteUrl(cover) : cover;
  // 全文一张图都没有时退回站点默认分享图，保证每篇文章都有卡片配图。
  const images = [image ?? DEFAULT_OG_IMAGE.path];

  return {
    title: `${(article.seoTitle || article.title)} — GekkoTech`,
    description: (article.seoDescription || article.summary),
    alternates: { canonical: url },
    // Next 的 metadata 合并是浅层的：这里的 openGraph/twitter 会整体覆盖根布局的同名对象，
    // 站点级字段必须重复一遍，否则文章页会丢掉 site_name / locale / twitter:site。
    openGraph: {
      title: (article.seoTitle || article.title),
      description: (article.seoDescription || article.summary),
      siteName: "GekkoTech",
      locale: "zh_CN",
      type: "article",
      url,
      images,
      publishedTime: article.publishedAt ?? undefined,
      authors: [article.author],
    },
    twitter: {
      card: "summary_large_image",
      site: "@GekkoQ30180",
      title: (article.seoTitle || article.title),
      description: (article.seoDescription || article.summary),
      images,
    },
  };
}

export default async function ArticleDetailPage({ params }: PageProps) {
  const gate = await checkFeatureAccess("articles");
  if (gate.state !== "allowed") return <FeatureLocked featureId="articles" state={gate.state} viewer={gate.viewer} />;
  const article = await getPublishedArticleBySlug((await params).slug);
  if (!article) notFound();
  return <ArticleDocument article={article} />;
}
