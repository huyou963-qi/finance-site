import type { Metadata } from "next";
import Link from "next/link";
import { listArticles } from "@/lib/articles/articleStore";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "专题文章 — Finova",
  description: "聚焦特殊问题、当前政策与市场传导的研究文章。",
};

function dateLabel(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) : "";
}

export default async function ArticlesPage() {
  const articles = await listArticles();
  return (
    <div className="min-h-full bg-fs-bg px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="border-b border-fs-border pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fs-accent-text">
            Research & Policy
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fs-text">专题文章</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-fs-muted">
            针对政策变化、宏观拐点与市场特殊问题的证据型分析。每篇文章标注数据截止时间与来源。
          </p>
        </div>

        {articles.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-fs-border p-10 text-center text-sm text-fs-muted">
            暂无已发布文章。
          </div>
        ) : (
          <div className="divide-y divide-fs-border">
            {articles.map((article) => (
              <article key={article.id} className="py-7">
                <div className="flex flex-wrap items-center gap-2 text-xs text-fs-muted">
                  <span className="rounded-full bg-fs-accent-soft px-2.5 py-1 text-fs-accent-text">
                    {article.category}
                  </span>
                  <span>{dateLabel(article.publishedAt)}</span>
                  {article.dataCutoff ? <span>· 数据截至 {dateLabel(article.dataCutoff)}</span> : null}
                </div>
                <h2 className="mt-3 text-xl font-semibold text-fs-text">
                  <Link href={`/articles/${article.slug}`} className="hover:text-fs-accent-text">
                    {article.title}
                  </Link>
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-fs-secondary">{article.summary}</p>
                {article.tags.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {article.tags.map((tag) => (
                      <span key={tag} className="text-xs text-fs-muted">#{tag}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
