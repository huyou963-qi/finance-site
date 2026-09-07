import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleMarkdown } from "@/components/articles/ArticleMarkdown";
import { getPublishedArticleBySlug } from "@/lib/articles/articleStore";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const article = await getPublishedArticleBySlug((await params).slug);
  return article
    ? { title: `${article.title} — Finova`, description: article.summary }
    : { title: "文章不存在 — Finova" };
}

function dateTime(value: string | null): string {
  if (!value) return "未标注";
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ArticleDetailPage({ params }: PageProps) {
  const article = await getPublishedArticleBySlug((await params).slug);
  if (!article) notFound();
  return (
    <div className="min-h-full bg-fs-bg px-4 py-8 sm:px-6 lg:px-10">
      <article className="mx-auto max-w-4xl">
        <Link href="/articles" className="text-sm text-fs-accent-text hover:underline">
          ← 返回专题文章
        </Link>
        <header className="mt-6 border-b border-fs-border pb-7">
          <div className="flex flex-wrap items-center gap-2 text-xs text-fs-muted">
            <span className="rounded-full bg-fs-accent-soft px-2.5 py-1 text-fs-accent-text">
              {article.category}
            </span>
            <span>作者 {article.author}</span>
            <span>· 发布于 {dateTime(article.publishedAt)}</span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-fs-text sm:text-4xl">
            {article.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-fs-secondary">{article.summary}</p>
          <div className="mt-4 rounded-lg border border-fs-border bg-fs-elevated px-3 py-2 text-xs text-fs-muted">
            数据与事实截止：{dateTime(article.dataCutoff)}。文章图表为发布时快照，不随实时行情回写。
          </div>
        </header>

        <div className="py-7">
          <ArticleMarkdown content={article.bodyMarkdown} />
        </div>

        <footer className="border-t border-fs-border py-7">
          <h2 className="text-sm font-semibold text-fs-text">数据与资料来源</h2>
          <ol className="mt-3 space-y-2 text-sm text-fs-secondary">
            {article.sourceManifest.map((source, index) => (
              <li key={`${source.url}-${index}`}>
                <span className="mr-2 text-fs-muted">[{index + 1}]</span>
                <a href={source.url} className="text-fs-accent-text hover:underline">
                  {source.label}
                </a>
                <span className="ml-2 text-xs text-fs-muted">
                  {source.kind === "internal" ? "站内数据" : "外部来源"}
                  {source.observedAt ? ` · 获取 ${dateTime(source.observedAt)}` : ""}
                </span>
                {source.note ? <p className="ml-7 mt-1 text-xs text-fs-muted">{source.note}</p> : null}
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs leading-5 text-fs-muted">
            本文为研究信息，不构成投资建议。外部资料的事实与授权责任由原始发布方承担。
          </p>
        </footer>
      </article>
    </div>
  );
}
