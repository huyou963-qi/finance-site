"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ARTICLE_COMMENT_MAX_LENGTH } from "@/lib/articles/articleCommentSchema";

type ArticleComment = {
  id: string;
  body: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
};

type CommentsResponse = {
  comments?: ArticleComment[];
  count?: number;
  hasMore?: boolean;
  error?: string;
};

function commentTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function avatarText(username: string): string {
  return Array.from(username.trim())[0]?.toUpperCase() ?? "会";
}

export function ArticleComments({ articleId }: { articleId: string }) {
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [count, setCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    const response = await fetch(`/api/articles/${articleId}/comments`, { cache: "no-store" });
    const payload = (await response.json()) as CommentsResponse;
    if (!response.ok) throw new Error(payload.error ?? "评论加载失败");
    setComments(payload.comments ?? []);
    setCount(payload.count ?? 0);
    setHasMore(!!payload.hasMore);
  }, [articleId]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      loadComments(),
      fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.ok),
    ])
      .then(([commentsResult, authResult]) => {
        if (!active) return;
        setLoggedIn(authResult.status === "fulfilled" ? authResult.value : false);
        if (commentsResult.status === "rejected") {
          setError(
            commentsResult.reason instanceof Error
              ? commentsResult.reason.message
              : "评论加载失败",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadComments]);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/articles/${articleId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const payload = (await response.json()) as { comment?: ArticleComment; error?: string };
      if (!response.ok || !payload.comment) {
        if (response.status === 401) setLoggedIn(false);
        throw new Error(payload.error ?? "评论发布失败");
      }
      setBody("");
      await loadComments();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "评论发布失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteComment(commentId: string) {
    if (!window.confirm("确定删除这条评论吗？")) return;
    setDeletingId(commentId);
    setError(null);
    try {
      const response = await fetch(`/api/articles/${articleId}/comments/${commentId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "评论删除失败");
      await loadComments();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "评论删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section aria-labelledby="article-comments-heading" className="mx-auto max-w-4xl border-t border-fs-border py-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="article-comments-heading" className="text-lg font-semibold text-fs-text">
          评论 <span className="ml-1 text-sm font-normal text-fs-muted">{count}</span>
        </h2>
        {hasMore ? <span className="text-xs text-fs-muted">仅显示最新 100 条</span> : null}
      </div>

      {loggedIn === true ? (
        <form onSubmit={submitComment} className="mt-5 rounded-xl border border-fs-border bg-white p-3 sm:p-4">
          <label htmlFor="article-comment-body" className="text-sm font-medium text-fs-text">
            发表评论
          </label>
          <textarea
            id="article-comment-body"
            value={body}
            maxLength={ARTICLE_COMMENT_MAX_LENGTH}
            onChange={(event) => setBody(event.target.value)}
            placeholder="围绕文章观点理性讨论…"
            rows={4}
            className="mt-2 w-full resize-y rounded-lg border border-fs-border bg-fs-bg px-3 py-2.5 text-sm leading-6 text-fs-text outline-none transition placeholder:text-fs-muted focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20"
          />
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-fs-muted">
              {body.length}/{ARTICLE_COMMENT_MAX_LENGTH} · 请勿发布广告、攻击或违法内容
            </span>
            <button
              type="submit"
              disabled={!body.trim() || submitting}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-fs-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {submitting ? "发布中…" : "发布评论"}
            </button>
          </div>
        </form>
      ) : loggedIn === false ? (
        <div className="mt-5 rounded-xl border border-fs-border bg-fs-elevated px-4 py-5 text-center text-sm text-fs-secondary sm:text-left">
          注册会员登录后可以参与讨论。
          <span className="mt-3 flex justify-center gap-4 sm:ml-3 sm:mt-0 sm:inline-flex">
            <Link href="/auth" className="font-medium text-fs-accent-text hover:underline">登录</Link>
            <Link href="/auth?register=1" className="font-medium text-fs-accent-text hover:underline">免费注册</Link>
          </span>
        </div>
      ) : null}

      <div aria-live="polite">
        {error ? (
          <p className="mt-4 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-fs-muted">正在加载评论…</p>
      ) : comments.length === 0 && !error ? (
        <p className="py-10 text-center text-sm text-fs-muted">还没有评论，欢迎发表第一个观点。</p>
      ) : (
        <ol className="mt-6 divide-y divide-fs-border">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3 py-5 sm:gap-4">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fs-accent-soft text-sm font-semibold text-fs-accent-text"
              >
                {avatarText(comment.author)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-fs-text">{comment.author}</span>
                  <time dateTime={comment.createdAt} className="text-xs text-fs-muted">
                    {commentTime(comment.createdAt)}
                  </time>
                  {comment.canDelete ? (
                    <button
                      type="button"
                      disabled={deletingId === comment.id}
                      onClick={() => void deleteComment(comment.id)}
                      className="ml-auto min-h-8 rounded px-2 text-xs text-fs-muted hover:bg-fs-elevated hover:text-rose-600 disabled:opacity-50"
                    >
                      {deletingId === comment.id ? "删除中…" : "删除"}
                    </button>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-fs-secondary">
                  {comment.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
