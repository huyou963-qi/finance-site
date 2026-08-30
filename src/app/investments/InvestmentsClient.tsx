"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type InvestmentRow = {
  id: string; symbol: string; title: string; style: string; status: string; horizon: string | null;
  coreThesis: string | null; nextReviewAt: string | null; updatedAt: string;
  summary: { quantity: number; currentWeightPct: number | null; buys: number; trims: number };
  catalysts: { title: string; windowEnd: string | null }[];
  researchVersions: { version: number }[];
  reviews: { authorKind: string }[];
};

const STATUS_LABEL: Record<string, string> = { research: "研究中", watching: "等待 Catalyst", approved: "待建仓", holding: "持仓中", closed: "已关闭" };
const STYLE_LABEL: Record<string, string> = { long_term: "长期", swing: "波段", event: "事件驱动", short_term: "短线" };

export function InvestmentsClient({ initialSymbol }: { initialSymbol: string }) {
  const [rows, setRows] = useState<InvestmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(Boolean(initialSymbol));
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ symbol: initialSymbol, title: initialSymbol ? `${initialSymbol} 投资案例` : "", style: "long_term", horizon: "", coreThesis: "" });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await fetch("/api/investments", { cache: "no-store" });
    const j = await r.json() as { cases?: InvestmentRow[]; error?: string };
    if (!r.ok) setError(j.error ?? "加载失败"); else setRows(j.cases ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createCase(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    const r = await fetch("/api/investments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json() as { case?: { id: string }; error?: string };
    setSaving(false);
    if (!r.ok || !j.case) { setError(j.error ?? "创建失败"); return; }
    window.location.href = `/investments/${j.case.id}`;
  }

  const openRows = rows.filter((r) => r.status !== "closed");
  const closedRows = rows.filter((r) => r.status === "closed");

  return <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-semibold text-fs-text">投资记录</h1><p className="mt-1 text-sm text-fs-muted">从研究、Catalyst、建仓到减仓与复盘，保留每次决策的真实版本。</p></div>
      <button type="button" onClick={() => setCreating((v) => !v)} className="rounded-md bg-fs-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">{creating ? "收起" : "新建投资案例"}</button>
    </div>

    {creating ? <form onSubmit={createCase} className="mt-4 grid gap-3 rounded-lg border border-fs-border bg-fs-elevated/50 p-4 sm:grid-cols-2">
      <label className="text-sm text-fs-muted">股票代码<input required value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} placeholder="CRCL" className="mt-1 w-full rounded-md border border-fs-border bg-fs-bg px-3 py-2 text-fs-text" /></label>
      <label className="text-sm text-fs-muted">案例名称<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="CRCL 稳定币监管与采用率机会" className="mt-1 w-full rounded-md border border-fs-border bg-fs-bg px-3 py-2 text-fs-text" /></label>
      <label className="text-sm text-fs-muted">投资风格<select value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} className="mt-1 w-full rounded-md border border-fs-border bg-fs-bg px-3 py-2 text-fs-text"><option value="long_term">长期</option><option value="swing">波段</option><option value="event">事件驱动</option><option value="short_term">短线</option></select></label>
      <label className="text-sm text-fs-muted">预计持有周期<input value={form.horizon} onChange={(e) => setForm({ ...form, horizon: e.target.value })} placeholder="3–12 个月" className="mt-1 w-full rounded-md border border-fs-border bg-fs-bg px-3 py-2 text-fs-text" /></label>
      <label className="text-sm text-fs-muted sm:col-span-2">初始核心论点<textarea value={form.coreThesis} onChange={(e) => setForm({ ...form, coreThesis: e.target.value })} rows={3} className="mt-1 w-full rounded-md border border-fs-border bg-fs-bg px-3 py-2 text-fs-text" /></label>
      <div className="sm:col-span-2"><button disabled={saving} className="rounded-md bg-fs-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "创建中…" : "创建并进入案例"}</button></div>
    </form> : null}

    {error ? <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}{error === "请先登录" ? <Link href="/auth" className="ml-2 underline">前往登录</Link> : null}</div> : null}
    {loading ? <p className="mt-6 text-sm text-fs-muted">正在加载…</p> : null}

    <section className="mt-5"><h2 className="mb-2 text-sm font-medium text-fs-text">进行中的案例</h2><div className="grid gap-3 md:grid-cols-2">
      {openRows.map((row) => <CaseCard key={row.id} row={row} />)}
      {!loading && openRows.length === 0 ? <div className="rounded-md border border-dashed border-fs-border px-4 py-8 text-center text-sm text-fs-muted md:col-span-2">还没有进行中的案例。可以从这里或个股研究页创建。</div> : null}
    </div></section>
    {closedRows.length ? <section className="mt-6"><h2 className="mb-2 text-sm font-medium text-fs-text">已关闭 / 待复盘</h2><div className="grid gap-3 md:grid-cols-2">{closedRows.map((row) => <CaseCard key={row.id} row={row} />)}</div></section> : null}
  </main>;
}

function CaseCard({ row }: { row: InvestmentRow }) {
  return <Link href={`/investments/${row.id}`} className="rounded-lg border border-fs-border bg-fs-elevated/40 p-4 transition hover:border-fs-accent/60 hover:bg-fs-elevated">
    <div className="flex items-start justify-between gap-2"><div><strong className="text-base text-fs-text">{row.symbol}</strong><span className="ml-2 text-sm text-fs-muted">{row.title}</span></div><span className="shrink-0 rounded bg-fs-accent-soft px-2 py-0.5 text-xs text-fs-accent-text">{STATUS_LABEL[row.status] ?? row.status}</span></div>
    <p className="mt-2 line-clamp-2 min-h-10 text-sm text-fs-secondary">{row.coreThesis || "尚未填写核心论点"}</p>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fs-muted"><span>{STYLE_LABEL[row.style] ?? row.style}</span><span>研究 V{row.researchVersions[0]?.version ?? 0}</span><span>当前数量 {row.summary.quantity.toLocaleString()}</span><span>减仓 {row.summary.trims} 次</span>{row.catalysts[0] ? <span>下一 Catalyst：{row.catalysts[0].title}</span> : null}{row.reviews[0] ? <span>已有复盘</span> : null}</div>
  </Link>;
}
