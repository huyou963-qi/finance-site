"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SiteAnnouncementDialog } from "@/components/home/SiteAnnouncementDialog";
import type { ActiveSiteAnnouncement, SiteAnnouncementConfig } from "@/lib/siteAnnouncement";

type Payload = { announcement?: SiteAnnouncementConfig; error?: string };
type Draft = Omit<SiteAnnouncementConfig, "startsAt" | "endsAt"> & {
  startsAt: string;
  endsAt: string;
};

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toDraft(config: SiteAnnouncementConfig): Draft {
  return {
    ...config,
    startsAt: toLocalInput(config.startsAt),
    endsAt: toLocalInput(config.endsAt),
  };
}

function safeIso(value: string, fallback: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function statusOf(draft: Draft): { label: string; className: string } {
  if (!draft.enabled) return { label: "已关闭", className: "bg-slate-100 text-slate-600" };
  const now = Date.now();
  const startsAt = new Date(draft.startsAt).getTime();
  const endsAt = new Date(draft.endsAt).getTime();
  if (now < startsAt) return { label: "等待生效", className: "bg-blue-50 text-blue-700" };
  if (now >= endsAt) return { label: "已过期", className: "bg-amber-50 text-amber-700" };
  return { label: "生效中", className: "bg-emerald-50 text-emerald-700" };
}

export function SiteAnnouncementAdminClient() {
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/site-announcement", { cache: "no-store" });
      const payload = (await response.json()) as Payload;
      if (!response.ok || !payload.announcement) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      const next = toDraft(payload.announcement);
      setSaved(next);
      setDraft(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "公告配置加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const dirty = useMemo(
    () => Boolean(saved && draft && JSON.stringify(saved) !== JSON.stringify(draft)),
    [saved, draft],
  );
  const status = draft ? statusOf(draft) : null;

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setHint(null);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setHint(null);
    try {
      const startsAt = new Date(draft.startsAt);
      const endsAt = new Date(draft.endsAt);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
        throw new Error("请选择完整的生效和结束时间");
      }
      const response = await fetch("/api/admin/site-announcement", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          announcement: {
            enabled: draft.enabled,
            title: draft.title,
            content: draft.content,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
          },
        }),
      });
      const payload = (await response.json()) as Payload;
      if (!response.ok || !payload.announcement) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      const next = toDraft(payload.announcement);
      setSaved(next);
      setDraft(next);
      setHint("已保存；符合开关和时间条件时，刷新首页即可看到公告。此版本已重新对所有访客生效。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "公告保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="py-8 text-sm text-fs-muted">加载中…</p>;
  if (!draft || !saved) {
    return (
      <div className="py-8">
        <p className="text-sm text-fs-negative">{error ?? "公告配置加载失败"}</p>
        <button type="button" onClick={() => load().catch(() => {})} className="mt-3 text-sm text-fs-accent-text">
          重新加载
        </button>
      </div>
    );
  }

  const preview: ActiveSiteAnnouncement = {
    id: "default",
    title: draft.title || "网站公告",
    content: draft.content || "公告内容将在这里显示。",
    startsAt: safeIso(draft.startsAt, new Date().toISOString()),
    endsAt: safeIso(draft.endsAt, new Date(Date.now() + 60 * 60 * 1_000).toISOString()),
    revision: draft.revision,
    updatedAt: draft.updatedAt ?? new Date().toISOString(),
  };

  return (
    <div className="space-y-5 pb-12">
      {previewing ? (
        <SiteAnnouncementDialog announcement={preview} preview onClose={() => setPreviewing(false)} />
      ) : null}

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-fs-text">管理员：首页公告</h1>
          {status ? <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>{status.label}</span> : null}
        </div>
        <p className="mt-1 text-sm text-fs-muted">
          公告面向所有访问首页的游客和登录用户。用户关闭后，同一版本不会再次弹出；每次保存都会生成新版本并重新展示。
        </p>
      </div>

      <section className="space-y-5 rounded-xl border border-fs-border bg-fs-bg p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-fs-border bg-fs-elevated/50 p-4">
          <div>
            <p className="text-sm font-medium text-fs-text">启用公告</p>
            <p className="mt-1 text-xs text-fs-muted">开启后仍需处于下方生效时间段内才会弹出。</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.enabled}
            onClick={() => update("enabled", !draft.enabled)}
            className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${draft.enabled ? "border-emerald-500 bg-emerald-500" : "border-fs-border bg-slate-200"}`}
          >
            <span className={`mx-0.5 h-5 w-5 rounded-full bg-white shadow transition ${draft.enabled ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-fs-text">公告标题</span>
          <input
            value={draft.title}
            maxLength={80}
            onChange={(event) => update("title", event.target.value)}
            className="mt-2 w-full rounded-lg border border-fs-border bg-fs-bg px-3 py-2.5 text-sm text-fs-text outline-none focus:border-fs-accent"
            placeholder="例如：系统维护通知"
          />
          <span className="mt-1 block text-right text-xs text-fs-muted">{draft.title.length}/80</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-fs-text">公告内容</span>
          <textarea
            value={draft.content}
            maxLength={4000}
            rows={7}
            onChange={(event) => update("content", event.target.value)}
            className="mt-2 w-full resize-y rounded-lg border border-fs-border bg-fs-bg px-3 py-2.5 text-sm leading-6 text-fs-text outline-none focus:border-fs-accent"
            placeholder="输入要向所有首页访客展示的公告内容，可换行。"
          />
          <span className="mt-1 block text-right text-xs text-fs-muted">{draft.content.length}/4000</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-fs-text">生效时间</span>
            <input
              type="datetime-local"
              value={draft.startsAt}
              onChange={(event) => update("startsAt", event.target.value)}
              className="mt-2 w-full rounded-lg border border-fs-border bg-fs-bg px-3 py-2.5 text-sm text-fs-text outline-none focus:border-fs-accent"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-fs-text">结束时间</span>
            <input
              type="datetime-local"
              value={draft.endsAt}
              onChange={(event) => update("endsAt", event.target.value)}
              className="mt-2 w-full rounded-lg border border-fs-border bg-fs-bg px-3 py-2.5 text-sm text-fs-text outline-none focus:border-fs-accent"
            />
          </label>
        </div>
        <p className="text-xs text-fs-muted">时间按当前浏览器所在时区填写，保存后统一转换为服务器可比较的时间。</p>
      </section>

      {error ? <p className="text-sm text-fs-negative">{error}</p> : null}
      {hint ? <p className="text-sm text-emerald-700">{hint}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => save().catch(() => {})}
          disabled={!dirty || saving}
          className="rounded-lg bg-fs-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "保存中…" : "保存公告"}
        </button>
        <button
          type="button"
          onClick={() => setPreviewing(true)}
          className="rounded-lg border border-fs-border px-4 py-2 text-sm font-medium text-fs-secondary transition hover:bg-fs-elevated"
        >
          预览弹窗
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(saved);
            setError(null);
            setHint(null);
          }}
          disabled={!dirty || saving}
          className="rounded-lg border border-fs-border px-4 py-2 text-sm text-fs-muted transition hover:bg-fs-elevated disabled:opacity-40"
        >
          放弃修改
        </button>
      </div>
    </div>
  );
}
