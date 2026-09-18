import type { Metadata } from "next";
import Link from "next/link";
import { checkFeatureAccess } from "@/lib/access/featureAccess";
import { FeatureLocked } from "@/components/access/FeatureLocked";
import { listArticles } from "@/lib/articles/articleStore";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "专题文章 — GekkoTech",
  description: "聚焦特殊问题、当前政策与市场传导的研究文章。",
};

function dateLabel(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) : "";
}

export default async function ArticlesPage() {
  const gate = await checkFeatureAccess("articles");
  if (!gate.allowed) {
    return (
      <FeatureLocked featureId="articles" needsPro={gate.needsPro} viewer={gate.viewer} />
    );
  }
  const articles = await listArticles();
  return (
    <div className="min-h-full bg-fs-bg px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="sr-only">专题文章</h1>
        {articles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-fs-border p-10 text-center text-sm text-fs-muted">
            暂无已发布文章。
          </div>
        ) : (
          <div className="space-y-5">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/articles/${article.slug}`}
                className="group block overflow-hidden rounded-xl border border-fs-border bg-white transition hover:-translate-y-0.5 hover:border-fs-accent/50 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-fs-accent"
              >
                <article className="flex flex-col md:flex-row">
                  {article.coverUrl ? (
                    <div className="aspect-[16/9] shrink-0 overflow-hidden bg-fs-elevated md:aspect-auto md:w-72">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 文章资产走 /api/article-assets，不经 next/image 优化 */}
                      <img
                        src={article.coverUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                    </div>
                  ) : null}
                  <div className="flex min-w-0 flex-1 flex-col p-5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-fs-muted">
                      <span className="rounded-full bg-fs-accent-soft px-2.5 py-1 text-fs-accent-text">
                        {article.category}
                      </span>
                      <span>{dateLabel(article.publishedAt)}</span>
                      {article.dataCutoff ? <span>· 数据截至 {dateLabel(article.dataCutoff)}</span> : null}
                    </div>
                    <h2 className="mt-3 text-xl font-semibold leading-snug text-fs-text group-hover:text-fs-accent-text">
                      {article.title}
                    </h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-fs-secondary">{article.summary}</p>
                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-4">
                      {article.tags.map((tag) => (
                        <span key={tag} className="text-xs text-fs-muted">#{tag}</span>
                      ))}
                      <span className="ml-auto text-sm font-medium text-fs-accent-text">
                        阅读全文 <span className="inline-block transition group-hover:translate-x-0.5">→</span>
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
