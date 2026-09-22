"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FEATURE_AUDIENCE_LABELS,
  resolveFeatureAccess,
  type FeatureAccessPolicy,
  type FeatureAccessState,
  type FeatureAudience,
  type FeatureRule,
  type FeatureStatus,
  type FeatureViewer,
} from "@/lib/access/featureCatalog";

type CatalogFeature = {
  id: string;
  label: string;
  group: string;
  paths: string[];
  description: string;
  adminOnly: boolean;
  defaults: FeatureRule;
};

type Payload = {
  groups: string[];
  features: CatalogFeature[];
  policy: FeatureAccessPolicy;
  defaults?: FeatureAccessPolicy;
  error?: string;
};

const AUDIENCES: FeatureAudience[] = ["visitor", "standard", "pro"];

/** 效果预览用的三类代表身份（管理员恒为可用，不列） */
const PREVIEW_VIEWERS: Record<FeatureAudience, FeatureViewer> = {
  visitor: { role: null, hasProAccess: false },
  standard: { role: "user", hasProAccess: false },
  pro: { role: "user", hasProAccess: true },
};

const EFFECT_STYLE: Record<FeatureAccessState, { text: string; cls: string }> = {
  allowed: { text: "可用", cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  "needs-register": { text: "引导注册", cls: "border-amber-300 bg-amber-50 text-amber-700" },
  "needs-upgrade": { text: "引导升级", cls: "border-amber-300 bg-amber-50 text-amber-700" },
  hidden: { text: "不可见", cls: "border-fs-border bg-fs-elevated text-fs-muted" },
};

function sameRule(a: FeatureRule | undefined, b: FeatureRule | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.status === b.status &&
    a.proOnly === b.proOnly &&
    AUDIENCES.every((k) => a.preview[k] === b.preview[k])
  );
}

function samePolicy(a: FeatureAccessPolicy, b: FeatureAccessPolicy): boolean {
  const ids = new Set([...Object.keys(a.features), ...Object.keys(b.features)]);
  for (const id of ids) if (!sameRule(a.features[id], b.features[id])) return false;
  return true;
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "border-fs-accent/40 bg-fs-accent-soft" : "border-fs-border bg-fs-elevated"
      }`}
    >
      <span
        className={`mx-0.5 h-[1.125rem] w-[1.125rem] rounded-full transition ${
          checked ? "translate-x-5 bg-fs-accent-text" : "translate-x-0 bg-fs-muted"
        }`}
      />
    </button>
  );
}

function StatusSwitch({
  value,
  disabled,
  onChange,
  label,
}: {
  value: FeatureStatus;
  disabled?: boolean;
  onChange: (next: FeatureStatus) => void;
  label: string;
}) {
  const opts: { key: FeatureStatus; label: string }[] = [
    { key: "development", label: "开发中" },
    { key: "released", label: "已上线" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-md border border-fs-border text-xs"
    >
      {opts.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label}：${o.label}`}
            disabled={disabled}
            onClick={() => onChange(o.key)}
            className={`whitespace-nowrap px-2.5 py-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? o.key === "released"
                  ? "bg-fs-accent-soft font-medium text-fs-accent-text"
                  : "bg-amber-50 font-medium text-amber-700"
                : "bg-fs-bg text-fs-muted hover:text-fs-text"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function FeatureAccessAdminClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<FeatureAccessPolicy | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/feature-access", { cache: "no-store" });
    const payload = (await res.json()) as Payload;
    if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
    setData(payload);
    setDraft(payload.policy);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, [load]);

  const dirty = useMemo(
    () => Boolean(data && draft && !samePolicy(data.policy, draft)),
    [data, draft],
  );

  const summary = useMemo(() => {
    if (!data || !draft) return null;
    let dev = 0;
    let released = 0;
    let pro = 0;
    for (const f of data.features) {
      const r = draft.features[f.id] ?? f.defaults;
      if (r.status === "development") dev += 1;
      else {
        released += 1;
        if (r.proOnly) pro += 1;
      }
    }
    return { dev, released, pro };
  }, [data, draft]);

  const updateRule = (id: string, patch: (cur: FeatureRule) => FeatureRule) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const cur = prev.features[id];
      if (!cur) return prev;
      return { ...prev, features: { ...prev.features, [id]: patch(cur) } };
    });
    setHint(null);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/feature-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: draft }),
      });
      const payload = (await res.json()) as Payload;
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setData((prev) => (prev ? { ...prev, ...payload } : payload));
      setDraft(payload.policy);
      setHint("已保存，最长 15 秒后全站生效");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (error && !data) {
    return <p className="text-sm text-fs-negative">{error}</p>;
  }
  if (!data || !draft) {
    return <p className="text-sm text-fs-muted">加载中…</p>;
  }

  const groups = data.groups.filter((g) => data.features.some((f) => f.group === g));
  const extraGroups = [...new Set(data.features.map((f) => f.group))].filter(
    (g) => !groups.includes(g),
  );

  return (
    <div className="space-y-4 pb-10">
      <div>
        <h1 className="text-xl font-semibold text-fs-text">管理员：功能页权限</h1>
        <p className="mt-1 text-sm text-fs-muted">
          为每个功能页设置状态与访问权限。管理员永远拥有最高权限，可见并可使用全部功能。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs leading-5 text-fs-secondary">
          <p className="mb-1 text-sm font-medium text-amber-800">开发中</p>
          按「游客 / 普通用户 / Pro 用户」分别控制是否可见。不可见的身份导航里没有入口，直接访问链接显示「开发中，敬请期待」。
          适合内测：例如只对 Pro 用户开放预览。
        </div>
        <div className="rounded-lg border border-fs-accent/25 bg-fs-accent-soft/50 p-3 text-xs leading-5 text-fs-secondary">
          <p className="mb-1 text-sm font-medium text-fs-accent-text">已上线</p>
          所有人都能在导航里看到入口，只需配置是否「Pro 专属」。Pro 专属时：Pro 用户（含 7
          天试用期内）正常使用；游客被引导注册（注册即送 7 天 Pro 试用）；普通用户（试用已结束）被引导升级 Pro。
        </div>
      </div>
      <p className="text-xs text-fs-muted">
        本页只控制页面入口；周报全文、策略保存、回测积分等页面内部的 Pro 权益仍按原有规则。
      </p>

      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 bg-fs-bg/95 px-1 py-2 backdrop-blur">
        <button
          type="button"
          onClick={() => save().catch(() => {})}
          disabled={!dirty || saving}
          className="rounded-md border border-fs-accent/40 bg-fs-accent-soft px-3 py-1.5 text-sm text-fs-accent-text disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(data.policy);
            setHint(null);
          }}
          disabled={!dirty || saving}
          className="rounded-md border border-fs-border px-3 py-1.5 text-sm text-fs-secondary disabled:opacity-50"
        >
          撤销修改
        </button>
        {data.defaults ? (
          <button
            type="button"
            onClick={() => {
              setDraft(data.defaults!);
              setHint("已载入默认配置，点「保存」后生效");
            }}
            disabled={saving}
            className="rounded-md border border-fs-border px-3 py-1.5 text-sm text-fs-secondary disabled:opacity-50"
          >
            恢复默认
          </button>
        ) : null}
        {summary ? (
          <span className="text-xs text-fs-muted">
            开发中 {summary.dev} · 已上线 {summary.released}（Pro 专属 {summary.pro}）
          </span>
        ) : null}
        {dirty ? <span className="text-xs text-fs-negative">有未保存的修改</span> : null}
        {hint ? <span className="text-sm text-fs-secondary">{hint}</span> : null}
        {error ? <span className="text-sm text-fs-negative">{error}</span> : null}
      </div>

      {[...groups, ...extraGroups].map((group) => (
        <section
          key={group}
          className="overflow-hidden rounded-lg border border-fs-border bg-fs-bg/60"
        >
          <h2 className="border-b border-fs-border px-3 py-2 text-sm font-medium text-fs-text">
            {group}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="text-left text-xs text-fs-muted">
                  <th className="px-3 py-2 font-normal">功能页</th>
                  <th className="w-40 px-3 py-2 font-normal">状态</th>
                  <th className="w-60 px-3 py-2 font-normal">权限配置</th>
                  <th className="w-64 px-3 py-2 font-normal">
                    实际效果
                    <span className="ml-1 text-[11px]">（管理员始终可用）</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.features
                  .filter((f) => f.group === group)
                  .map((f) => {
                    const rule = draft.features[f.id] ?? f.defaults;
                    const locked = f.adminOnly || saving;
                    return (
                      <tr key={f.id} className="border-t border-fs-border/70 align-top">
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-fs-text">{f.label}</span>
                            {f.adminOnly ? (
                              <span className="rounded border border-fs-border px-1.5 py-0.5 text-[11px] text-fs-muted">
                                管理员专属
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs text-fs-muted">{f.description}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-fs-muted">
                            {f.paths.join("  ")}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <StatusSwitch
                            value={rule.status}
                            label={`${f.label} 状态`}
                            disabled={locked}
                            onChange={(status) => updateRule(f.id, (cur) => ({ ...cur, status }))}
                          />
                        </td>
                        <td className="px-3 py-3">
                          {f.adminOnly ? (
                            <p className="text-xs text-fs-muted">仅管理员可见，不可开放</p>
                          ) : rule.status === "development" ? (
                            <div className="space-y-1.5">
                              <p className="text-[11px] text-fs-muted">谁可以看到（预览）</p>
                              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                                {AUDIENCES.map((a) => (
                                  <label
                                    key={a}
                                    className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-fs-secondary"
                                  >
                                    <input
                                      type="checkbox"
                                      aria-label={`${f.label} 开发中对${FEATURE_AUDIENCE_LABELS[a]}可见`}
                                      checked={rule.preview[a]}
                                      disabled={locked}
                                      onChange={(e) =>
                                        updateRule(f.id, (cur) => ({
                                          ...cur,
                                          preview: { ...cur.preview, [a]: e.target.checked },
                                        }))
                                      }
                                      className="h-3.5 w-3.5 accent-[#0b6bcb]"
                                    />
                                    {FEATURE_AUDIENCE_LABELS[a]}
                                  </label>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Toggle
                                checked={rule.proOnly}
                                disabled={locked}
                                label={`${f.label} 是否 Pro 专属`}
                                onChange={(proOnly) =>
                                  updateRule(f.id, (cur) => ({ ...cur, proOnly }))
                                }
                              />
                              <span className="text-xs text-fs-secondary">
                                {rule.proOnly ? "Pro 专属" : "免费开放"}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {AUDIENCES.map((a) => {
                              const state = resolveFeatureAccess(draft, f.id, PREVIEW_VIEWERS[a]);
                              const s = EFFECT_STYLE[state];
                              return (
                                <span
                                  key={a}
                                  title={`${FEATURE_AUDIENCE_LABELS[a]}：${s.text}`}
                                  className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] ${s.cls}`}
                                >
                                  {FEATURE_AUDIENCE_LABELS[a]} · {s.text}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
