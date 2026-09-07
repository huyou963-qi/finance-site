"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArticleMarkdown } from "@/components/articles/ArticleMarkdown";
import { randomUUID } from "@/lib/randomId";

type ArticleSource = {
  label: string;
  kind: "internal" | "external";
  url: string;
  observedAt?: string;
  note?: string;
};

type ArticleAsset = {
  id: string;
  fileName: string;
  url: string;
  sourceKind: string;
  sourceUrl: string | null;
};

type Article = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  bodyMarkdown: string;
  status: "draft" | "published";
  dataCutoff: string | null;
  sourceManifest: ArticleSource[];
  publishedAt: string | null;
  updatedAt: string;
  assets?: ArticleAsset[];
};

type EditorDraft = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string;
  bodyMarkdown: string;
  dataCutoff: string;
  sourceManifestJson: string;
};

const EMPTY_SOURCES = JSON.stringify(
  [
    {
      label: "站内宏观数据或行情页面",
      kind: "internal",
      url: "/macro",
      observedAt: new Date().toISOString(),
      note: "按文章实际使用的数据页面与截止时间修改",
    },
  ],
  null,
  2,
);

function defaultDraft(): EditorDraft {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return {
    slug: `article-${day}-${randomUUID().slice(0, 6).toLowerCase()}`,
    title: "未命名文章",
    summary: "",
    category: "policy-analysis",
    tags: "",
    bodyMarkdown: "# 核心结论\n\n\n\n## 数据与传导机制\n\n\n\n## 情景与风险\n\n",
    dataCutoff: "",
    sourceManifestJson: EMPTY_SOURCES,
  };
}

function dateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function articleToDraft(article: Article): EditorDraft {
  return {
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    category: article.category,
    tags: article.tags.join(", "),
    bodyMarkdown: article.bodyMarkdown,
    dataCutoff: dateTimeLocal(article.dataCutoff),
    sourceManifestJson: JSON.stringify(article.sourceManifest, null, 2),
  };
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "请求失败");
  return payload;
}

export function ArticleEditorClient() {
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("id");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(requestedId);
  const [draft, setDraft] = useState<EditorDraft>(() => defaultDraft());
  const [currentStatus, setCurrentStatus] = useState<"draft" | "published">("draft");
  const [assets, setAssets] = useState<ArticleAsset[]>([]);
  const [sourceKind, setSourceKind] = useState("internal_macro");
  const [sourceUrl, setSourceUrl] = useState("/macro");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const loadList = useCallback(async () => {
    const payload = await responseJson<{ articles: Article[] }>(
      await fetch("/api/articles?manage=1", { cache: "no-store" }),
    );
    setArticles(payload.articles);
    setAccessDenied(false);
    return payload.articles;
  }, []);

  const loadArticle = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await responseJson<{ article: Article }>(
        await fetch(`/api/articles/${id}`, { cache: "no-store" }),
      );
      setDraft(articleToDraft(payload.article));
      setCurrentStatus(payload.article.status);
      setAssets(payload.article.assets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载文章失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList()
      .then((list) => {
        const nextId = requestedId && list.some((item) => item.id === requestedId)
          ? requestedId
          : list[0]?.id ?? null;
        setSelectedId(nextId);
        if (!nextId) setLoading(false);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "无管理员权限";
        setError(message);
        setAccessDenied(message.includes("登录") || message.includes("权限"));
        setLoading(false);
      });
  }, [loadList, requestedId]);

  useEffect(() => {
    if (selectedId) void loadArticle(selectedId);
  }, [selectedId, loadArticle]);

  const payload = useMemo(() => {
    let sourceManifest: ArticleSource[];
    try {
      sourceManifest = JSON.parse(draft.sourceManifestJson) as ArticleSource[];
    } catch {
      sourceManifest = [];
    }
    return {
      slug: draft.slug,
      title: draft.title,
      summary: draft.summary,
      category: draft.category,
      tags: draft.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
      bodyMarkdown: draft.bodyMarkdown,
      dataCutoff: draft.dataCutoff ? new Date(draft.dataCutoff).toISOString() : null,
      sourceManifest,
    };
  }, [draft]);

  const save = useCallback(
    async (status: "draft" | "published") => {
      setSaving(true);
      setError(null);
      setMessage(null);
      try {
        let parsedSources: unknown;
        try {
          parsedSources = JSON.parse(draft.sourceManifestJson);
        } catch {
          throw new Error("来源清单不是有效 JSON");
        }
        const body = { ...payload, sourceManifest: parsedSources, status };
        const response = await fetch(selectedId ? `/api/articles/${selectedId}` : "/api/articles", {
          method: selectedId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = await responseJson<{ article: Article }>(response);
        setSelectedId(result.article.id);
        setDraft(articleToDraft(result.article));
        setCurrentStatus(result.article.status);
        setAssets(result.article.assets ?? []);
        await loadList();
        window.history.replaceState(null, "", `/articles/editor?id=${result.article.id}`);
        setMessage(status === "published" ? "文章已发布" : "草稿已保存");
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      } finally {
        setSaving(false);
      }
    },
    [draft.sourceManifestJson, payload, selectedId, loadList],
  );

  const insertMarkdown = useCallback((markdown: string) => {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? draft.bodyMarkdown.length;
    const end = el?.selectionEnd ?? start;
    setDraft((current) => ({
      ...current,
      bodyMarkdown: `${current.bodyMarkdown.slice(0, start)}\n\n${markdown}\n\n${current.bodyMarkdown.slice(end)}`,
    }));
  }, [draft.bodyMarkdown.length]);

  const uploadImage = useCallback(
    async (file: File) => {
      if (!selectedId) throw new Error("请先保存草稿，再粘贴或上传图表");
      setUploading(true);
      setError(null);
      try {
        const form = new FormData();
        form.set("file", file, file.name || "chart.png");
        form.set("sourceKind", sourceKind);
        if (sourceUrl.trim()) form.set("sourceUrl", sourceUrl.trim());
        form.set("sourceConfig", JSON.stringify({ articleDataCutoff: payload.dataCutoff }));
        const result = await responseJson<{ asset: ArticleAsset; markdown: string }>(
          await fetch(`/api/articles/${selectedId}/assets`, { method: "POST", body: form }),
        );
        setAssets((current) => [...current, result.asset]);
        insertMarkdown(result.markdown);
        setMessage("图表已上传并插入正文；请保存草稿");
      } finally {
        setUploading(false);
      }
    },
    [selectedId, sourceKind, sourceUrl, payload.dataCutoff, insertMarkdown],
  );

  const newArticle = () => {
    setSelectedId(null);
    setDraft(defaultDraft());
    setCurrentStatus("draft");
    setAssets([]);
    setMessage("新文章尚未保存");
    setError(null);
    window.history.replaceState(null, "", "/articles/editor");
  };

  const deleteCurrent = async () => {
    if (!selectedId || !window.confirm("确定删除这篇文章及其图表？此操作不可恢复。")) return;
    setSaving(true);
    try {
      await responseJson(await fetch(`/api/articles/${selectedId}`, { method: "DELETE" }));
      const list = await loadList();
      const next = list[0]?.id ?? null;
      setSelectedId(next);
      if (!next) newArticle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !articles.length) {
    return <div className="p-8 text-sm text-fs-muted">加载文章工作台…</div>;
  }

  if (accessDenied) {
    return (
      <div className="flex min-h-full items-center justify-center bg-fs-bg p-8">
        <div className="max-w-md rounded-xl border border-fs-border bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-fs-text">发布工作台仅限管理员</h1>
          <p className="mt-2 text-sm text-fs-muted">{error}</p>
          <Link href="/auth" className="mt-5 inline-flex rounded-md bg-fs-accent px-4 py-2 text-sm font-medium text-white">
            前往登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-fs-bg">
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-fs-border bg-fs-elevated/60 p-3 lg:block">
        <button
          type="button"
          onClick={newArticle}
          className="w-full rounded-md bg-fs-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + 新建文章
        </button>
        <div className="mt-3 space-y-1">
          {articles.map((article) => (
            <button
              key={article.id}
              type="button"
              onClick={() => setSelectedId(article.id)}
              className={`w-full rounded-md px-3 py-2 text-left ${
                selectedId === article.id ? "bg-white ring-1 ring-fs-border" : "hover:bg-white/70"
              }`}
            >
              <span className="block truncate text-sm font-medium text-fs-text">{article.title}</span>
              <span className="mt-0.5 block text-xs text-fs-muted">
                {article.status === "published" ? "已发布" : "草稿"} · {new Date(article.updatedAt).toLocaleDateString("zh-CN")}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div>
              <h1 className="text-xl font-semibold text-fs-text">发布文章</h1>
              <p className="mt-1 text-xs text-fs-muted">AI 生成草稿，管理员核对来源与截止时间后发布。</p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Link href="/articles" className="rounded-md border border-fs-border px-3 py-2 text-sm text-fs-secondary hover:bg-fs-elevated">
                文章列表
              </Link>
              {selectedId ? (
                <button type="button" onClick={() => void deleteCurrent()} disabled={saving} className="rounded-md border border-fs-negative/40 px-3 py-2 text-sm text-fs-negative disabled:opacity-50">
                  删除
                </button>
              ) : null}
              <button type="button" onClick={() => void save("draft")} disabled={saving} className="rounded-md border border-fs-border px-3 py-2 text-sm font-medium text-fs-text hover:bg-fs-elevated disabled:opacity-50">
                {saving ? "保存中…" : "保存草稿"}
              </button>
              <button type="button" onClick={() => void save("published")} disabled={saving} className="rounded-md bg-fs-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {currentStatus === "published" ? "更新发布" : "发布"}
              </button>
            </div>
          </div>

          {error ? <div className="mb-4 rounded-md border border-fs-negative/30 bg-red-50 px-3 py-2 text-sm text-fs-negative">{error}</div> : null}
          {message ? <div className="mb-4 rounded-md border border-fs-accent/30 bg-fs-accent-soft px-3 py-2 text-sm text-fs-accent-text">{message}</div> : null}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="space-y-4 rounded-xl border border-fs-border bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2 text-xs font-medium text-fs-muted">标题
                  <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-1 w-full rounded-md border border-fs-border px-3 py-2 text-base text-fs-text outline-none focus:border-fs-accent" />
                </label>
                <label className="text-xs font-medium text-fs-muted">Slug
                  <input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase() })} className="mt-1 w-full rounded-md border border-fs-border px-3 py-2 text-sm text-fs-text outline-none focus:border-fs-accent" />
                </label>
                <label className="text-xs font-medium text-fs-muted">分类
                  <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="mt-1 w-full rounded-md border border-fs-border px-3 py-2 text-sm text-fs-text outline-none focus:border-fs-accent" />
                </label>
                <label className="text-xs font-medium text-fs-muted">数据截止时间
                  <input type="datetime-local" value={draft.dataCutoff} onChange={(e) => setDraft({ ...draft, dataCutoff: e.target.value })} className="mt-1 w-full rounded-md border border-fs-border px-3 py-2 text-sm text-fs-text outline-none focus:border-fs-accent" />
                </label>
                <label className="text-xs font-medium text-fs-muted">标签（逗号分隔）
                  <input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} className="mt-1 w-full rounded-md border border-fs-border px-3 py-2 text-sm text-fs-text outline-none focus:border-fs-accent" />
                </label>
              </div>
              <label className="block text-xs font-medium text-fs-muted">摘要
                <textarea value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} rows={3} className="mt-1 w-full resize-y rounded-md border border-fs-border px-3 py-2 text-sm leading-6 text-fs-text outline-none focus:border-fs-accent" />
              </label>

              <div className="rounded-lg border border-fs-border bg-fs-elevated/50 p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs font-medium text-fs-muted">图表来源
                    <select value={sourceKind} onChange={(e) => {
                      const kind = e.target.value;
                      setSourceKind(kind);
                      if (kind === "internal_macro") setSourceUrl("/macro");
                      if (kind === "internal_market") setSourceUrl("/markets");
                      if (kind === "external_chart") setSourceUrl("");
                    }} className="mt-1 block rounded-md border border-fs-border bg-white px-2 py-2 text-sm text-fs-text">
                      <option value="internal_macro">站内宏观图表</option>
                      <option value="internal_market">站内行情图表</option>
                      <option value="external_chart">外部图表</option>
                    </select>
                  </label>
                  <label className="min-w-52 flex-1 text-xs font-medium text-fs-muted">来源页面
                    <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="/macro?... 或 https://..." className="mt-1 w-full rounded-md border border-fs-border bg-white px-2 py-2 text-sm text-fs-text" />
                  </label>
                  <label className="cursor-pointer rounded-md border border-fs-border bg-white px-3 py-2 text-sm text-fs-text hover:bg-fs-accent-soft">
                    {uploading ? "上传中…" : "上传图表"}
                    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadImage(file).catch((err) => setError(err instanceof Error ? err.message : "上传失败"));
                      e.currentTarget.value = "";
                    }} />
                  </label>
                </div>
                <p className="mt-2 text-xs leading-5 text-fs-muted">
                  在宏观或行情页点击“截图”，回到正文框直接粘贴；外部图表请先填写原始页面地址。已存 {assets.length} 张快照。
                </p>
              </div>

              <label className="block text-xs font-medium text-fs-muted">正文（Markdown）
                <textarea
                  ref={bodyRef}
                  value={draft.bodyMarkdown}
                  onChange={(e) => setDraft({ ...draft, bodyMarkdown: e.target.value })}
                  onPaste={(e) => {
                    const image = Array.from(e.clipboardData.files).find((file) => file.type.startsWith("image/"));
                    if (!image) return;
                    e.preventDefault();
                    void uploadImage(image).catch((err) => setError(err instanceof Error ? err.message : "粘贴图片失败"));
                  }}
                  rows={24}
                  className="mt-1 w-full resize-y rounded-md border border-fs-border px-3 py-2 font-mono text-sm leading-6 text-fs-text outline-none focus:border-fs-accent"
                />
              </label>
              <label className="block text-xs font-medium text-fs-muted">来源清单（JSON）
                <textarea value={draft.sourceManifestJson} onChange={(e) => setDraft({ ...draft, sourceManifestJson: e.target.value })} rows={10} className="mt-1 w-full resize-y rounded-md border border-fs-border px-3 py-2 font-mono text-xs leading-5 text-fs-text outline-none focus:border-fs-accent" />
              </label>
            </section>

            <section className="min-w-0 rounded-xl border border-fs-border bg-white p-5 xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
              <div className="mb-5 flex items-center justify-between border-b border-fs-border pb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-fs-muted">发布预览</span>
                {currentStatus === "published" && selectedId ? (
                  <Link href={`/articles/${draft.slug}`} className="text-xs text-fs-accent-text hover:underline">打开已发布页 ↗</Link>
                ) : null}
              </div>
              <h1 className="text-3xl font-semibold leading-tight text-fs-text">{draft.title || "未命名文章"}</h1>
              <p className="mt-3 text-sm leading-6 text-fs-secondary">{draft.summary || "文章摘要将显示在这里。"}</p>
              <div className="my-5 rounded-md bg-fs-elevated px-3 py-2 text-xs text-fs-muted">
                数据截至 {draft.dataCutoff ? new Date(draft.dataCutoff).toLocaleString("zh-CN") : "未填写"}
              </div>
              <ArticleMarkdown content={draft.bodyMarkdown} />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
