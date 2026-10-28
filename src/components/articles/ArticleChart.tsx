"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { macroPayloadToChartOption } from "@/lib/macroChartOption";
import type { ChartData } from "@/lib/market/charts";
import type { StoredChartReference } from "@/lib/market/attach";
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });
type Response = { data: ChartData; renderMode: "live" | "snapshot"; dataCutoff: string | null; capturedAt: string; displayOptions: StoredChartReference["displayOptions"] };

export function ArticleChart({ referenceId, chartId }: { referenceId?: string; chartId?: string }) {
  const [result, setResult] = useState<Response | null>(null), [error, setError] = useState("");
  const [range, setRange] = useState<{ startDate: string; endDate: string } | null>(null);
  const [start, setStart] = useState(""), [end, setEnd] = useState("");
  const [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError("");
    const params = range ? `?${new URLSearchParams(range)}` : "";
    fetch(`/api/article-charts/${encodeURIComponent(referenceId ?? chartId ?? "")}${params}`, { signal: abort.signal, cache: "no-store" })
      .then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error ?? "图表加载失败"); return body as Response; })
      .then(data => { if (abort.signal.aborted) return; setResult(data); setStart(range?.startDate ?? data.data.displayStartDate); setEnd(range?.endDate ?? data.data.displayEndDate); })
      .catch(e => { if (!abort.signal.aborted) { setError(e.message); setResult(null); } })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [referenceId, chartId, range, retry]);
  const data = result?.data;
  const option = data ? macroPayloadToChartOption({ categories: data.categories, series: data.series }, { compact: true, seriesVisualMap: data.visualMap, displayConfig: data.displayConfig, slotIndex: data.slot }) : null;
  if (option && data) {
    option.tooltip = { trigger: "axis", renderMode: "richText", confine: true };
    option.dataZoom = [{ type: "inside", filterMode: "none", zoomOnMouseWheel: false }, { type: "slider", bottom: 8, height: 18 }];
    if (!Array.isArray(option.legend)) option.legend = { ...option.legend, type: "scroll", top: undefined, bottom: 34 };
    if (!Array.isArray(option.grid)) option.grid = { ...option.grid, bottom: 110 };
    if (Array.isArray(option.yAxis)) option.yAxis = option.yAxis.map((axis, i) => ({ ...axis, name: [...new Set(data.series.filter(s => (data.visualMap[s.key]?.axis === "right" ? 1 : 0) === i).map(s => s.unit ?? "单位未知"))].join(" / "), nameTextStyle: { fontSize: 10 } }));
  }
  return <figure className="not-prose my-6 w-full min-w-0 overflow-hidden rounded-lg border border-fs-border bg-fs-elevated p-3 sm:p-4" data-gekko-chart={referenceId ?? chartId}>
    <figcaption className="mb-2 break-words text-sm font-semibold">{data?.title ?? "GekkoTech 交互图表"}</figcaption>
    {loading ? <p role="status" className="py-14 text-center text-sm text-fs-muted">正在加载图表…</p> : error ? <div role="alert" className="py-8 text-sm text-fs-muted"><p>{error}。文章其余内容仍可阅读。</p><button type="button" onClick={() => setRetry(n => n + 1)} className="mt-3 rounded border border-fs-border px-3 py-2">重试图表</button><a href="/macro" className="ml-4 underline">打开宏观数据</a></div> : data && result && <>
      <p className="mb-2 text-xs text-fs-muted">{result.renderMode === "live" ? "实时引用 · 正文数值不会自动修改" : `历史快照 · 数据可见截止 ${result.dataCutoff ?? result.capturedAt}`} · 数据区间 {data.categories[0] ?? "无"} 至 {data.categories.at(-1) ?? "无"}</p>
      {result.displayOptions.allowTimeRangeChange && <form className="mb-3 flex flex-wrap items-end gap-2 text-xs" onSubmit={e => { e.preventDefault(); const fields = new FormData(e.currentTarget); const startDate = String(fields.get("startDate") ?? ""), endDate = String(fields.get("endDate") ?? ""); if (startDate && endDate && startDate <= endDate) setRange({ startDate, endDate }); }}>
        <label className="flex min-w-0 flex-col gap-1">开始日期<input name="startDate" aria-label="开始日期" type="date" value={start} max={end} required onChange={e => setStart(e.target.value)} className="min-w-0 rounded border border-fs-border bg-fs-bg p-2" /></label>
        <label className="flex min-w-0 flex-col gap-1">结束日期<input name="endDate" aria-label="结束日期" type="date" value={end} min={start} required onChange={e => setEnd(e.target.value)} className="min-w-0 rounded border border-fs-border bg-fs-bg p-2" /></label>
        <button className="rounded border border-fs-border px-3 py-2" type="submit">查看区间</button>
      </form>}
      {data.series.some(s => s.data.some(v => v != null)) ? <div className="w-full min-w-0" style={{ height: `clamp(300px, 65vh, ${result.displayOptions.height}px)` }}><ReactECharts option={option!} style={{ height: "100%", width: "100%" }} notMerge /></div> : <p className="py-8 text-sm">该区间无可用数据；快照模式只能查看捕获时保存的范围。</p>}
      <p className="mt-2 text-xs text-fs-muted">点击图例切换序列；触摸或悬停查看数值。缺失日期不插值。</p>
      {data.formulas.map(f => <p key={f} className="mt-2 break-words text-xs text-fs-muted">计算：{f}</p>)}
      {result.displayOptions.showLastUpdated && <p className="mt-2 text-xs text-fs-muted">最后记录的数据更新时间：{data.lastUpdatedAt ?? "未知"} · 查询时间：{data.retrievedAt}</p>}
      {result.displayOptions.showSource && <ul className="mt-2 space-y-1 text-xs text-fs-muted">{data.sources.map(s => <li key={s.indicatorId} className="break-words">{s.sourceUrl ? <a href={s.sourceUrl} rel="noopener noreferrer" target="_blank" className="underline">{s.name}</a> : s.name} · {String(s.provider ?? "来源未知")} · {s.unit ?? "单位未知"} · {s.location ?? "地区未知"} · {s.instrumentType}</li>)}</ul>}
    </>}
  </figure>;
}
