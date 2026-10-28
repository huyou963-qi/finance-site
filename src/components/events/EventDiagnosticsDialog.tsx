"use client";

import { useState } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { EVENT_EXCLUSION_LABELS, eventSourceGroup, type EventSourceGroup, type selectChartEvents } from "@/lib/chart/eventSelection";
import type { summarizeEventPacks } from "@/lib/chart/eventDiagnostics";
import { EventSettingsDialog } from "./EventSettingsDialog";

type Result = ReturnType<typeof selectChartEvents>;
const projectionLabels = { candidate: "已进入主图候选", merged: "同一事实已合并到其他记录", disabled: "本类上图开关已关闭", hidden_marker: "此事件被单独设置为不上图" };
const button = "min-h-9 rounded border border-fs-border px-2 text-xs";

export function EventDiagnosticsDialog({ source, result, packs, error, loading, initialEventId, onClose, onClear, onManage, onRetry, onRestoreHidden, onSelect, from, to }: {
  source: EventSourceGroup; result: Result; packs: ReturnType<typeof summarizeEventPacks>;
  error: string | null; loading: boolean; initialEventId: string | null;
  onClose: () => void; onClear: () => void; onManage: () => void; onRetry: () => void; onRestoreHidden: () => void; from: string; to: string;
  onSelect: (event: MarketEventDto) => void;
}) {
  const [query, setQuery] = useState("");
  const stats = result.sourceStats[source];
  const excluded = result.excludedEvents[source];
  const matched = result.sourceEvents[source];
  const initial = matched.find(e => e.id === initialEventId) ?? excluded.find(e => e.event.id === initialEventId)?.event;
  const renderEvent = (event: MarketEventDto) => {
    const reasons = excluded.find(e => e.event.id === event.id)?.reasons ?? [];
    const projection = result.chartProjection[event.id];
    const related = projection?.relatedIds.map(id => result.events.find(e => e.id === id)).filter((e): e is MarketEventDto => Boolean(e)) ?? [];
    return <div className="space-y-1 break-words text-xs">
      <p>原始发生时间：{event.occurredAt}（{event.datePrecision === "DATE" ? "仅日期" : "精确时刻"}）</p>
      <p>查询命中依据：{event.matchReasons?.join("、") || "当前查询返回的事件；未提供更细的关联依据"}</p>
      <p>内容状态：{reasons.length ? reasons.map(r => EVENT_EXCLUSION_LABELS[r]).join("；") : "符合当前来源的全部内容条件"}</p>
      {projection && <p>图表状态：{projectionLabels[projection.status]}</p>}
      {related.length > 1 && <div className="flex flex-wrap items-center gap-1"><span>同一事实的记录：</span>{related.map(e => <button key={e.id} className={button} onClick={() => onSelect(e)}>{eventSourceGroup(e) === "system" ? "系统" : "用户"} · {e.title || e.markerLabel}{e.id === projection?.representativeId ? "（主图代表）" : ""}</button>)}</div>}
    </div>;
  };
  const entries = [...matched, ...excluded.map(e => e.event)].filter(e => `${e.title ?? ""} ${e.markerLabel ?? ""} ${e.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <EventSettingsDialog title="事件结果说明" onClose={onClose}>
    <div className="w-full space-y-3">
      <p>当前来源：{source === "system" ? "系统事件" : "用户事件"}。时间区间：{from} 至 {to}。以下仅统计当前查询已加载的集合，不代表完整事件库。</p>
      {loading && <p role="status">系统事件正在加载，统计尚未完成。</p>}
      {error && <p role="alert" className="text-red-600">{error}；系统覆盖情况未知，不能把当前零条当作无事件。</p>}
      {source === "system" && <p className="text-fs-muted">资产关联、服务端标签与时间范围先限定查询；未返回的事件无法在此诊断。SEC 数据仍受服务端单次披露数量上限约束。</p>}
      {source === "user" && <p>事件包 {packs.total} 个：停用 {packs.disabled}、范围不适用 {packs.notApplicable}、当前适用 {packs.applicable}。未加载包中的事件不计入下表。</p>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded border border-fs-border p-2">
        <dt>已加载记录</dt><dd>{stats.loaded}</dd>
        <dt>时间区间外</dt><dd>{stats.outsideRange}</dd>
        <dt>时间区间内</dt><dd>{stats.inRange}</dd>
        <dt>区间内被筛除</dt><dd>{stats.filteredOut}</dd>
        <dt>本来源列表</dt><dd>{stats.matched}</dd>
        <dt>关闭本类上图</dt><dd>{stats.markerDisabled}</dd>
        <dt>单独隐藏标记</dt><dd>{stats.markerHidden}</dd>
        <dt>合并到同一事实</dt><dd>{stats.merged}</dd>
        <dt>主图候选（本来源作为代表）</dt><dd>{stats.chartCandidates}</dd>
      </dl>
      <p className="text-fs-muted">列表 = 关闭上图 + 隐藏标记 + 合并记录 + 主图候选。候选不等于最终绘制数量；K 线覆盖、交易日对齐和同根 K 线聚合仍会影响落点。</p>
      <div className="flex flex-wrap gap-2"><button className={button} onClick={onClear}>清除本类内容条件</button><button className={button} onClick={onManage}>检查来源与包范围</button>{excluded.some(e => e.reasons.includes("hidden")) && <button className={button} onClick={onRestoreHidden}>恢复本类隐藏事件</button>}{source === "system" && <button className={button} onClick={onRetry}>重新加载系统事件</button>}</div>
      <div className="rounded border border-fs-border p-2">
        <p>排除原因（每条记录按首个原因计数，互不重复；单条说明列出全部原因）</p>
        {Object.entries(stats.reasons).map(([reason, count]) => <p key={reason}>{EVENT_EXCLUSION_LABELS[reason as keyof typeof EVENT_EXCLUSION_LABELS]}：{count}</p>)}
        {!excluded.length && <p className="text-fs-muted">当前已加载集合中无排除记录。</p>}
      </div>
      {initial && <section aria-label="当前事件说明" className="space-y-2 rounded border border-fs-accent p-2"><strong>{initial.title || initial.markerLabel}</strong>{renderEvent(initial)}</section>}
      <label className="block">查找已加载事件<input type="search" value={query} onChange={e => setQuery(e.target.value)} className="mt-1 block min-h-10 w-full rounded border border-fs-border bg-fs-elevated px-2" /></label>
      <div className="space-y-1">{entries.slice(0, 50).map(event => <details key={event.id} className="rounded border border-fs-border p-2"><summary className="cursor-pointer">{event.occurredAt.slice(0, 10)} · {event.title || event.markerLabel} · {result.chartProjection[event.id] ? projectionLabels[result.chartProjection[event.id].status] : "已排除"}</summary>{renderEvent(event)}</details>)}</div>
      {entries.length > 50 && <p>符合查找条件 {entries.length} 条，先显示前 50 条；可继续输入标题缩小范围。</p>}
    </div>
  </EventSettingsDialog>;
}
