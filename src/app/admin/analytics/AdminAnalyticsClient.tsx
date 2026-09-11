"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ANALYTICS_RANGE_DAYS,
  DEVICE_LABELS,
  type AnalyticsRangeDays,
  type AnalyticsSummary,
} from "@/lib/analytics/pageView";
import { AnalyticsTrendChart } from "./AnalyticsTrendChart";

const fmt = (n: number) => n.toLocaleString("zh-CN");

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded border border-fs-border bg-fs-elevated/40 px-3 py-2">
      <p className="text-xs text-fs-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-fs-text">{fmt(value)}</p>
      {sub ? <p className="mt-0.5 text-xs text-fs-muted">{sub}</p> : null}
    </div>
  );
}

function ShareList({
  title,
  unit,
  rows,
}: {
  title: string;
  unit: string;
  rows: { key: string; label: string; value: number; href?: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="rounded border border-fs-border px-3 py-2">
      <h2 className="mb-2 flex justify-between text-sm font-medium text-fs-text">
        <span>{title}</span>
        <span className="text-xs font-normal text-fs-muted">{unit}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-xs text-fs-muted">暂无数据</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.key} className="relative overflow-hidden rounded px-2 py-1 text-xs">
              <div
                className="absolute inset-y-0 left-0 bg-fs-accent-soft"
                style={{ width: `${(r.value / max) * 100}%` }}
              />
              <div className="relative flex justify-between gap-3">
                {r.href ? (
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-fs-text hover:underline"
                    title={r.label}
                  >
                    {r.label}
                  </a>
                ) : (
                  <span className="truncate text-fs-text" title={r.label}>
                    {r.label}
                  </span>
                )}
                <span className="shrink-0 tabular-nums text-fs-muted">{fmt(r.value)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminAnalyticsClient() {
  const [days, setDays] = useState<AnalyticsRangeDays>(30);
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`, { cache: "no-store" });
      const payload = (await res.json()) as AnalyticsSummary & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setData(payload);
      setHint(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load().catch((e) => setHint(e instanceof Error ? e.message : "未知错误"));
  }, [load]);

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-fs-text">流量统计</h1>
          <p className="text-xs text-fs-muted">
            按北京时间统计；已排除爬虫、管理员本人与后台页面。访客按浏览器区分（换设备/清缓存算新访客）。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ANALYTICS_RANGE_DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded border px-2 py-1 text-sm ${
                d === days
                  ? "border-fs-accent-text bg-fs-accent-soft text-fs-accent-text"
                  : "border-fs-border hover:bg-fs-elevated"
              }`}
            >
              近 {d} 天
            </button>
          ))}
          <button
            type="button"
            disabled={loading}
            onClick={() => load().catch((e) => setHint(e instanceof Error ? e.message : "未知错误"))}
            className="rounded border border-fs-border px-2 py-1 text-sm hover:bg-fs-elevated disabled:opacity-50"
          >
            {loading ? "加载中…" : "刷新"}
          </button>
        </div>
      </div>

      {hint ? <p className="text-sm text-fs-muted">{hint}</p> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="当前在线（近 30 分钟）" value={data.onlineNow} />
            <Stat
              label="今日访客"
              value={data.today.uv}
              sub={`昨日 ${fmt(data.yesterday.uv)} · 今日浏览 ${fmt(data.today.pv)}`}
            />
            <Stat label={`近 ${data.days} 天访客`} value={data.totals.uv} sub={`其中新访客 ${fmt(data.totals.newVisitors)}`} />
            <Stat
              label={`近 ${data.days} 天浏览量`}
              value={data.totals.pv}
              sub={`访问 ${fmt(data.totals.sessions)} 次 · 人均 ${
                data.totals.uv ? (data.totals.pv / data.totals.uv).toFixed(1) : "0"
              } 页`}
            />
            <Stat label={`近 ${data.days} 天登录用户`} value={data.totals.loggedInUsers} />
            <Stat label="注册用户总数" value={data.users.total} sub={`近 ${data.days} 天新增 ${fmt(data.users.newInRange)}`} />
          </div>

          <section className="rounded border border-fs-border px-3 py-2">
            <h2 className="mb-1 text-sm font-medium text-fs-text">每日趋势</h2>
            <AnalyticsTrendChart daily={data.daily} />
          </section>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ShareList
                title="热门页面"
                unit="浏览量"
                rows={data.pages.map((p) => ({ key: p.path, label: p.path, value: p.pv, href: p.path }))}
              />
            </div>
            <div className="space-y-3">
              <ShareList
                title="来源"
                unit="访问次数"
                rows={data.referrers.map((r) => ({
                  key: r.host ?? "(direct)",
                  label: r.host ?? "直接访问 / 书签",
                  value: r.sessions,
                }))}
              />
              <ShareList
                title="设备"
                unit="访客"
                rows={data.devices.map((d) => ({
                  key: d.device,
                  label: DEVICE_LABELS[d.device] ?? d.device,
                  value: d.uv,
                }))}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
