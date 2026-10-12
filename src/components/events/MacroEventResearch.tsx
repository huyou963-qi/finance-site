"use client";

import { useMemo, useState } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { formatEventOccurredAt } from "@/lib/data/marketEvents";
import { classifyMacroEventSurprise, isMacroResearchEvent } from "@/lib/data/macroEventSurprise";
import { EventImportanceBadge } from "@/components/events/EventImportanceBadge";
import { MacroEventSurpriseSummary, MacroSurpriseEvidence } from "@/components/events/MacroSurpriseEvidence";
import { EventDetailDrawer } from "@/components/events/EventDetailDrawer";

export function MacroEventResearch({ events, loading, error, from, to }: {
  events: MarketEventDto[]; loading: boolean; error: string | null; from: string | null; to: string | null;
}) {
  const [selected, setSelected] = useState<MarketEventDto | null>(null);
  const research = useMemo(() => events.filter(isMacroResearchEvent).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)), [events]);
  const assessed = research.filter(e => e.eventType === "macro.release" && classifyMacroEventSurprise(e.payload).level !== "unassessed");
  const large = assessed.filter(e => classifyMacroEventSurprise(e.payload).level === "large");
  const releases = research.filter(e => e.eventType === "macro.release");
  const visible = research;
  return <section className="flex min-h-0 flex-1 flex-col" aria-label="美国宏观事件区间研究">
    <div className="shrink-0 space-y-1 border-b border-fs-border px-3 py-2 text-xs">
      <p className="font-medium">{from && to ? `${from} — ${to}` : "拖动行情时间轴，研究当前区间"}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>当前筛选 {research.length} 条</span><span>数据发布 {releases.length} 条</span>
        <span>可按阈值评估 {assessed.length} 条</span><span>大预期差 {large.length} 条</span>
      </div>
      <p className="text-fs-muted">勾选上方「仅大预期差」同时筛选列表与K线。检查关键分项，采用试行绝对阈值；重要性与预期差分别判断。未录入预期不代表符合预期。</p>
      {releases.length === 0 && !loading && !error && <p className="text-fs-muted">当前结果只有背景事件，尚无结构化宏观数据发布，无法评估本区间整体预期差。</p>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2" aria-live="polite">
      {loading ? <p className="text-xs text-fs-muted">正在加载事件…</p> : error ? <p role="alert" className="text-xs text-red-500">{error}</p> : visible.length === 0 ?
        <p className="text-xs text-fs-muted">当前区间与筛选下未找到美国宏观事件，可调整时间范围或筛选。</p> :
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(event => {
            const result = event.eventType === "macro.release" ? classifyMacroEventSurprise(event.payload) : null;
            return <li key={event.id} className={`rounded border p-2 ${result?.level === "large" ? "border-amber-500/70 bg-amber-500/10" : "border-fs-border bg-fs-elevated"}`}>
              <div className="flex flex-wrap items-center gap-2 text-[11px]"><time>{formatEventOccurredAt(event)}</time><EventImportanceBadge importance={event.importance} /></div>
              <button type="button" onClick={() => setSelected(event)} className="my-1 text-left text-xs font-medium text-fs-text hover:underline">{event.title || event.content.slice(0, 80)}</button>
              {result ? <><MacroEventSurpriseSummary payload={event.payload} /><MacroSurpriseEvidence payload={event.payload} compact /></> : <p className="text-xs text-fs-muted">政策／新闻背景 · 暂无数值预期差</p>}
              <button type="button" onClick={() => setSelected(event)} className="mt-2 text-xs text-fs-accent-text underline">详情与来源</button>
            </li>;
          })}
        </ul>}
    </div>
    {selected && <EventDetailDrawer event={selected} onClose={() => setSelected(null)} />}
  </section>;
}
