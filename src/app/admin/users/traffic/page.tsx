"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { UsageTrafficAnalytics } from "@/lib/analytics/usageTrafficAnalytics";

function formatMs(ms: number): string {
  if (!ms || ms < 0) return "0s";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const m2 = min % 60;
  return m2 ? `${hr}h ${m2}m` : `${hr}h`;
}

const AUDIENCE_LABEL: Record<string, string> = {
  guest: "游客",
  standard: "普通用户",
  pro: "Pro",
  all: "合计",
};

export default function UserTrafficPage() {
  const [data, setData] = useState<UsageTrafficAnalytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/admin/users/traffic", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "加载失败");
        return body as UsageTrafficAnalytics;
      })
      .then(setData)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "加载失败"));
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 lg:px-6">
      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href="/admin/users" className="text-fs-accent-text">
            ← 返回用户管理
          </Link>
          <Link href="/admin/users/analytics" className="text-fs-accent-text">
            生命周期统计
          </Link>
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-fs-text">使用流量</h1>
        <p className="mt-1 text-sm text-fs-muted">
          按页面访问与可见时长统计游客 / 普通用户 / Pro。后台人员默认不计入。今日实时汇总；历史读日聚合。近 7/30 日卡片为日均值；WAU/MAU 为去重活跃。时区 Asia/Shanghai。
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : null}
      {!data && !error ? <p className="text-fs-muted">加载中…</p> : null}

      {data ? (
        <>
          <p className="text-xs text-fs-muted">
            统计时间：
            {new Date(data.asOf).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（{data.timezone}）
          </p>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="活跃概览">
            {(
              [
                ["今日 DAU", data.windows.today.all.dau],
                ["WAU（近 7 日去重）", data.wau],
                ["MAU（近 30 日去重）", data.mau],
                ["今日人均时长", formatMs(data.windows.today.all.avgActiveMsPerUser)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-fs-border p-4">
                <div className="text-sm text-fs-muted">{label}</div>
                <div className="mt-2 text-2xl font-semibold text-fs-text">
                  {typeof value === "number" ? value.toLocaleString() : value}
                </div>
              </div>
            ))}
          </section>

          {(
            [
              ["今日", data.windows.today],
              ["近 7 日（日均）", data.windows.d7],
              ["近 30 日（日均）", data.windows.d30],
            ] as const
          ).map(([title, window]) => (
            <section key={title} className="rounded-lg border border-fs-border p-4" aria-label={title}>
              <h2 className="font-semibold text-fs-text">{title}</h2>
              <div className="mt-4 hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-fs-border text-fs-muted">
                      <th className="py-2">身份</th>
                      <th>DAU</th>
                      <th>会话</th>
                      <th>PV</th>
                      <th>人均时长</th>
                      <th>场均时长</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...window.byAudience, window.all].map((row) => (
                      <tr key={row.audience} className="border-b border-fs-border/70 text-fs-text">
                        <td className="py-3">{AUDIENCE_LABEL[row.audience] ?? row.audience}</td>
                        <td>{row.dau.toLocaleString()}</td>
                        <td>{row.sessions.toLocaleString()}</td>
                        <td>{row.pv.toLocaleString()}</td>
                        <td>{formatMs(row.avgActiveMsPerUser)}</td>
                        <td>{formatMs(row.avgSessionMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 space-y-2 sm:hidden">
                {[...window.byAudience, window.all].map((row) => (
                  <article key={row.audience} className="rounded-md border border-fs-border p-3 text-sm">
                    <div className="font-medium text-fs-text">{AUDIENCE_LABEL[row.audience] ?? row.audience}</div>
                    <p className="mt-1 text-fs-secondary">
                      DAU {row.dau} · 会话 {row.sessions} · PV {row.pv} · 人均 {formatMs(row.avgActiveMsPerUser)} · 场均{" "}
                      {formatMs(row.avgSessionMs)}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ))}

          <section className="rounded-lg border border-fs-border p-4">
            <h2 className="font-semibold text-fs-text">功能排行（近 7 日）</h2>
            <p className="mt-1 text-xs text-fs-muted">UV 为各日 UV 之和（人日），非去重用户。</p>
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-fs-border text-fs-muted">
                    <th className="py-2">功能</th>
                    <th>PV</th>
                    <th>UV（人日）</th>
                    <th>总停留</th>
                  </tr>
                </thead>
                <tbody>
                  {data.features.map((row) => (
                    <tr key={row.featureId} className="border-b border-fs-border/70 text-fs-text">
                      <td className="py-3">{row.label}</td>
                      <td>{row.pv.toLocaleString()}</td>
                      <td>{row.uv.toLocaleString()}</td>
                      <td>{formatMs(row.activeMsSum)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 space-y-2 sm:hidden">
              {data.features.map((row) => (
                <article key={row.featureId} className="rounded-md border border-fs-border p-3 text-sm">
                  <div className="font-medium text-fs-text">{row.label}</div>
                  <p className="mt-1 text-fs-secondary">
                    PV {row.pv} · UV {row.uv} · 停留 {formatMs(row.activeMsSum)}
                  </p>
                </article>
              ))}
            </div>
            {!data.features.length ? <p className="py-4 text-sm text-fs-muted">暂无功能访问数据</p> : null}
          </section>

          <section className="rounded-lg border border-fs-border p-4">
            <h2 className="font-semibold text-fs-text">近 30 日趋势</h2>
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-fs-border text-fs-muted">
                    <th className="py-2">日期</th>
                    <th>DAU</th>
                    <th>会话</th>
                    <th>场均时长</th>
                    <th>次日回访占比</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trend.map((row) => (
                    <tr key={row.date} className="border-b border-fs-border/70 text-fs-text">
                      <td className="py-3">{row.date}</td>
                      <td>{row.dau.toLocaleString()}</td>
                      <td>{row.sessions.toLocaleString()}</td>
                      <td>{formatMs(row.avgSessionMs)}</td>
                      <td>{row.returningRate == null ? "—" : `${(row.returningRate * 100).toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 space-y-2 sm:hidden">
              {data.trend.map((row) => (
                <article key={row.date} className="rounded-md border border-fs-border p-3 text-sm">
                  <div className="flex justify-between font-medium text-fs-text">
                    <span>{row.date}</span>
                    <span>DAU {row.dau}</span>
                  </div>
                  <p className="mt-1 text-fs-secondary">
                    会话 {row.sessions} · 场均 {formatMs(row.avgSessionMs)} · 次日回访{" "}
                    {row.returningRate == null ? "—" : `${(row.returningRate * 100).toFixed(1)}%`}
                  </p>
                </article>
              ))}
            </div>
            {!data.trend.length ? <p className="py-4 text-sm text-fs-muted">暂无趋势数据</p> : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
