"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  FeatureAccessPolicy,
  FeatureAudience,
  FeatureVisibility,
} from "@/lib/access/featureCatalog";

type CatalogFeature = {
  id: string;
  label: string;
  group: string;
  paths: string[];
  description: string;
  adminOnly: boolean;
  defaults: FeatureVisibility;
};

type Payload = {
  groups: string[];
  features: CatalogFeature[];
  policy: FeatureAccessPolicy;
  defaults?: FeatureAccessPolicy;
  error?: string;
};

const AUDIENCES: { key: FeatureAudience; label: string; hint: string }[] = [
  { key: "standard", label: "普通用户", hint: "注册后未付费；未登录访客同此列" },
  { key: "pro", label: "Pro 用户", hint: "付费或 7 天试用期内" },
];

function samePolicy(a: FeatureAccessPolicy, b: FeatureAccessPolicy): boolean {
  const ids = new Set([...Object.keys(a.features), ...Object.keys(b.features)]);
  for (const id of ids) {
    const x = a.features[id];
    const y = b.features[id];
    if (!x || !y || x.standard !== y.standard || x.pro !== y.pro) return false;
  }
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
        checked
          ? "border-fs-accent/40 bg-fs-accent-soft"
          : "border-fs-border bg-fs-elevated"
      }`}
    >
      <span
        className={`mx-0.5 h-[1.125rem] w-[1.125rem] rounded-full transition ${
          checked
            ? "translate-x-5 bg-fs-accent-text"
            : "translate-x-0 bg-fs-muted"
        }`}
      />
    </button>
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

  const setVisibility = (id: string, audience: FeatureAudience, next: boolean) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const cur = prev.features[id] ?? { standard: false, pro: false };
      // 单调：普通可见 ⇒ Pro 必然可见；关掉 Pro 同时关掉普通
      const value: FeatureVisibility =
        audience === "standard"
          ? { standard: next, pro: next ? true : cur.pro }
          : { standard: next ? cur.standard : false, pro: next };
      return { ...prev, features: { ...prev.features, [id]: value } };
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
      setData(payload);
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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-fs-text">管理员：功能页权限</h1>
        <p className="mt-1 text-sm text-fs-muted">
          配置「普通用户」和「Pro 用户」分别能看到哪些功能页。关闭后该入口从导航消失，直接访问链接也会看到升级提示。
        </p>
        <ul className="mt-2 space-y-0.5 text-xs text-fs-muted">
          <li>· 管理员始终可见全部功能，不受此处配置影响。</li>
          <li>· 未登录访客按「普通用户」列判定。</li>
          <li>· 普通用户可见的功能，Pro 用户必然可见（关掉 Pro 会同时关掉普通用户）。</li>
          <li>· 此处只控制页面入口；周报全文、策略保存等页面内部的 Pro 权益仍按原有规则。</li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fs-muted">
                <th className="px-3 py-2 font-normal">功能页</th>
                {AUDIENCES.map((a) => (
                  <th key={a.key} className="w-44 px-3 py-2 text-center font-normal">
                    <span className="block text-fs-secondary">{a.label}</span>
                    <span className="block text-[11px]">{a.hint}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.features
                .filter((f) => f.group === group)
                .map((f) => {
                  const vis = draft.features[f.id] ?? f.defaults;
                  return (
                    <tr key={f.id} className="border-t border-fs-border/70 align-top">
                      <td className="px-3 py-2">
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
                      {AUDIENCES.map((a) => (
                        <td key={a.key} className="px-3 py-3 text-center">
                          <div className="flex justify-center">
                            <Toggle
                              checked={vis[a.key]}
                              disabled={f.adminOnly || saving}
                              label={`${f.label} 对 ${a.label} 可见`}
                              onChange={(next) => setVisibility(f.id, a.key, next)}
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
