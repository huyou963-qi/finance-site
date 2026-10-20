"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Analytics = {
  asOf: string;
  totals: { total: number; verified: number; active30: number; trial: number; trialExpired: number; paid: number; paidEver: number; expiring14: number; formerPaid: number };
  cohorts: { month: string; registered: number; verified: number; paid30: number; paid30Rate: number }[];
  tags: { name: string; count: number }[];
};

export default function UserAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/api/admin/users/analytics", { cache: "no-store" })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "加载失败"); return body as Analytics; })
      .then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : "加载失败"));
  }, []);
  const cards = data ? [
    ["未关闭普通账户", data.totals.total], ["已验证邮箱", data.totals.verified], ["近 30 天登录", data.totals.active30],
    ["试用中", data.totals.trial], ["试用已结束", data.totals.trialExpired], ["当前 Pro", data.totals.paid], ["曾付费", data.totals.paidEver], ["14 天内到期", data.totals.expiring14], ["曾付费但当前非 Pro", data.totals.formerPaid],
  ] as const : [];
  return <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 lg:px-6">
    <div><Link href="/admin/users" className="text-sm text-fs-accent-text">← 返回用户管理</Link><h1 className="mt-3 text-2xl font-semibold text-fs-text">用户生命周期</h1>
      <p className="mt-1 text-sm text-fs-muted">按当前数据库实时汇总。排除后台人员及已关闭账户；近 12 个注册月份展示转化。</p></div>
    {error ? <p role="alert" className="text-red-700">{error}</p> : null}
    {!data && !error ? <p className="text-fs-muted">加载中…</p> : null}
    {data ? <>
      <p className="text-xs text-fs-muted">统计时间：{new Date(data.asOf).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="用户概览">
        {cards.map(([label, value]) => <div key={label} className="rounded-lg border border-fs-border p-4"><div className="text-sm text-fs-muted">{label}</div><div className="mt-2 text-2xl font-semibold text-fs-text">{value.toLocaleString()}</div></div>)}
      </section>
      <section className="rounded-lg border border-fs-border p-4"><h2 className="font-semibold text-fs-text">注册月与 30 天付费转化</h2>
        <p className="mt-1 text-xs text-fs-muted">分母为该月注册且目前未关闭的普通账户；分子为注册后 30 天内首次购买 Pro 的账户。最近 30 天的月份尚未完整观察。</p>
        <div className="mt-4 hidden overflow-x-auto sm:block"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-fs-border text-fs-muted"><th className="py-2">注册月</th><th>注册</th><th>邮箱已验证</th><th>30 天内付费</th><th>转化率</th></tr></thead>
          <tbody>{data.cohorts.map((row) => <tr key={row.month} className="border-b border-fs-border/70 text-fs-text"><td className="py-3">{row.month}</td><td>{row.registered}</td><td>{row.verified}</td><td>{row.paid30}</td><td>{(row.paid30Rate * 100).toFixed(1)}%</td></tr>)}</tbody></table></div>
        <div className="mt-4 space-y-2 sm:hidden">{data.cohorts.map((row) => <article key={row.month} className="rounded-md border border-fs-border p-3 text-sm"><div className="flex justify-between font-medium text-fs-text"><span>{row.month}</span><span>{(row.paid30Rate * 100).toFixed(1)}%</span></div><p className="mt-1 text-fs-secondary">注册 {row.registered} · 已验证 {row.verified} · 30 天内付费 {row.paid30}</p></article>)}</div>
        {!data.cohorts.length ? <p className="py-4 text-sm text-fs-muted">暂无注册数据</p> : null}
      </section>
      <section className="rounded-lg border border-fs-border p-4"><h2 className="font-semibold text-fs-text">标签分群</h2>
        <div className="mt-3 flex flex-wrap gap-2">{data.tags.map((tag) => <Link key={tag.name} href={`/admin/users?tag=${encodeURIComponent(tag.name)}`} className="rounded-full border border-fs-border px-3 py-2 text-sm text-fs-secondary hover:text-fs-accent-text">{tag.name} · {tag.count}</Link>)}
          {!data.tags.length ? <span className="text-sm text-fs-muted">暂无标签</span> : null}</div>
      </section>
    </> : null}
  </main>;
}
