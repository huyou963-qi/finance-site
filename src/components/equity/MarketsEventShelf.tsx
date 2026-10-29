"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { eventRecord } from "@/lib/data/eventPresentation";
import { eventTypeLabel } from "@/lib/data/eventTaxonomy";
import { parseMilestoneIngestJson, type CompanyMilestone, type LocalEventImportTarget } from "@/lib/equity/companyMilestones";
import type { useLocalCompanyEvents } from "@/lib/equity/useLocalCompanyEvents";
import type { useChartEvents } from "@/lib/chart/useChartEvents";
import { clearEventContentFilters, hasActiveEventViewContentFilters, eventFiltersForSource, updateEventSourceFilters, type EventViewFilterState } from "@/lib/chart/eventViewFilters";
import { eventSourceGroup, EVENT_SOURCE_COLORS, type EventSourceGroup } from "@/lib/chart/eventSelection";
import { EventShelfSettings } from "@/components/events/EventShelfSettings";
import { EventFilterSheet } from "@/components/events/EventFilterSheet";
import { describeEmptyEventState, summarizeEventPacks } from "@/lib/chart/eventDiagnostics";
import { EventDiagnosticsDialog } from "@/components/events/EventDiagnosticsDialog";
import { EventImportResultDialog } from "@/components/events/EventImportResultDialog";
import { prepareEventPackImport, resolveEventPackFileMetadata, type EventPackMetadata, type EventImportReceipt } from "@/lib/equity/localEventPacks";
import { EventSettingsDialog } from "@/components/events/EventSettingsDialog";

export type MarketsEventShelfProps = {
  localEventStore: ReturnType<typeof useLocalCompanyEvents>;
  eventResult: ReturnType<typeof useChartEvents>;
  onOpenDetail?: (event: MarketEventDto) => void;
  selectedEventId: string | null;
  markerGroupIds: string[];
  onCloseMarkerGroup: () => void;
  onSelectEvent: (id: string | null) => void;
  onLocateEvent: (event: MarketEventDto) => void;
  symbol: string; viewFilters: EventViewFilterState;
  onViewFiltersChange: (next: EventViewFilterState) => void;
  rangeFromSec?: number | null; rangeToSec?: number | null; trackDate?: string | null;
  onResetToSymbolDefault?: (source: EventSourceGroup) => void; height?: number;
};
const KEY = "markets-event-shelf-height-v3-compact";
export function MarketsEventShelf({ localEventStore: store, eventResult: result, onOpenDetail, selectedEventId, markerGroupIds, onCloseMarkerGroup, onSelectEvent, onLocateEvent, symbol, viewFilters: allFilters, onViewFiltersChange: onAllChange, onResetToSymbolDefault, height = 180 }: MarketsEventShelfProps) {
  const fileRef = useRef<HTMLInputElement>(null), scrollRef = useRef<HTMLDivElement>(null);
  const [shelfHeight, setShelfHeight] = useState(() => { try { return Math.min(640, Math.max(150, Number(localStorage.getItem(KEY)) || height)); } catch { return height; } });
  const [activeTab, setActiveTab] = useState<EventSourceGroup>("system");
  const filters = eventFiltersForSource(allFilters, activeTab);
  const onChange = (next: EventViewFilterState) => onAllChange(updateEventSourceFilters(allFilters, activeTab, next));
  const stats = result.sourceStats[activeTab];
  const loading = activeTab === "system" && result.loading;
  const allEventsRef = useRef(result.events);
  allEventsRef.current = result.events;
  useEffect(() => {
    const selected = allEventsRef.current.find(e => e.id === selectedEventId);
    if (selected) setActiveTab(eventSourceGroup(selected));
  }, [selectedEventId]);
  const [target, setTarget] = useState<"file" | LocalEventImportTarget>("file");
  const [message, setMessage] = useState("");
  const [manage, setManage] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [diagnosticEventId, setDiagnosticEventId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; events: CompanyMilestone[]; errors: string[]; target: LocalEventImportTarget; symbol: string; metadata: EventPackMetadata } | null>(null);
  const [importError, setImportError] = useState("");
  const [lastImport, setLastImport] = useState<EventImportReceipt | null>(null);
  const [inspectImport, setInspectImport] = useState(false);
  const patch = (p: Partial<EventViewFilterState>) => onChange({ ...filters, ...p });
  const events = result.sourceEvents[activeTab];
  const packSummary = summarizeEventPacks(store.packs, symbol);
  const empty = describeEmptyEventState({ source: activeTab, filters, stats, loading, error: activeTab === "system" ? result.error : null, ready: store.ready, packs: packSummary, symbol });
  const openDiagnostics = (id: string | null = null) => { setDiagnosticEventId(id); setDiagnostics(true); };
  const sourceCounts = { system: result.sourceEvents.system.length, user: result.sourceEvents.user.length };
  const selected = events.find(e => e.id === selectedEventId);
  useEffect(() => {
    const node = scrollRef.current?.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(selectedEventId || "")}"]`);
    node?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [selectedEventId, activeTab]);
  const resize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); const startY = e.clientY, startHeight = e.currentTarget.parentElement?.getBoundingClientRect().height ?? shelfHeight; let next = shelfHeight;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => { next = Math.min(640, Math.max(150, startHeight + startY - ev.clientY)); setShelfHeight(next); };
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); try { localStorage.setItem(KEY, String(next)); } catch {} };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
  }, [shelfHeight]);
  const onFile = async (file: File | null) => {
    if (!file) return;
    setImportError(""); setMessage("");
    try {
      const raw = eventRecord(JSON.parse(await file.text()));
      const parsed = parseMilestoneIngestJson(raw);
      const resolved = resolveEventPackFileMetadata(raw, file.name, parsed.importTarget, parsed.symbol, target);
      if (!parsed.errors.length) prepareEventPackImport(store.packs, parsed.milestones, resolved.target, symbol, resolved.metadata);
      setPreview({ name: file.name, events: parsed.milestones, errors: parsed.errors, target: resolved.target, symbol, metadata: resolved.metadata });
      setManage(false);
    } catch (e) { setMessage(e instanceof Error ? e.message : "文件读取失败"); }
    if (fileRef.current) fileRef.current.value = "";
  };
  const confirmImport = () => {
    if (!preview || preview.errors.length) return;
    setImportError("");
    try {
      const receipt = store.importEvents(preview.events, preview.target, { ...preview.metadata, symbols: previewPlan?.pack.symbols });
      setActiveTab("user");
      setLastImport(receipt); setInspectImport(true);
      setMessage("");
      setPreview(null);
    } catch (e) { setImportError(`保存失败：${e instanceof Error ? e.message : String(e)}。原有事件未改动，可清理浏览器空间或导出备份后重试。`); }
  };
  const previewPlan = useMemo(() => preview && !preview.errors.length
    ? prepareEventPackImport(store.packs, preview.events, preview.target, preview.symbol, preview.metadata) : null, [preview, store.packs]);
  const mode = filters.viewMode || "timeline";
  const hasFilters = hasActiveEventViewContentFilters(filters);
  const button = "min-h-10 sm:min-h-7 rounded border border-fs-border px-2 py-1 text-xs text-fs-secondary hover:bg-fs-elevated";
  return <section aria-label="事件筛选器" className="relative flex min-h-[150px] shrink-0 flex-col border-t border-fs-border bg-fs-bg" style={{ height: shelfHeight }}>
    <div role="separator" aria-label="拖动调节事件筛选器高度" aria-orientation="horizontal" onPointerDown={resize} className="absolute inset-x-0 top-0 z-10 h-2 cursor-ns-resize touch-none hover:bg-fs-accent-soft" />
    <div className="flex min-h-0 flex-1 pt-2">
      <nav role="tablist" aria-label="事件来源分页" aria-orientation="vertical" className="flex w-20 shrink-0 flex-col gap-1 border-r border-fs-border bg-fs-elevated/40 p-1">
        {(["system", "user"] as const).map(tab => <button key={tab} id={`event-tab-${tab}`} role="tab" aria-controls={`event-panel-${tab}`} aria-selected={activeTab === tab} tabIndex={activeTab === tab ? 0 : -1}
          onClick={() => { setActiveTab(tab); setManage(false); setFiltersOpen(false); }}
          onKeyDown={e => { if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) { e.preventDefault(); const next = e.key === "Home" ? "system" : e.key === "End" ? "user" : activeTab === "system" ? "user" : "system"; setActiveTab(next); setManage(false); setFiltersOpen(false); document.getElementById(`event-tab-${next}`)?.focus(); } }}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded border px-1 py-1 text-xs ${activeTab === tab ? "border-fs-accent bg-fs-accent-soft font-semibold text-fs-text" : "border-transparent text-fs-muted hover:bg-fs-elevated"}`}>
          <span className="flex items-center gap-0.5"><span className="h-1.5 w-2 shrink-0 rounded-full" style={{ backgroundColor: EVENT_SOURCE_COLORS[tab] }} />{tab === "system" ? "系统事件" : "用户事件"}</span><span className="text-[10px] font-normal tabular-nums">{sourceCounts[tab]} 条</span>
        </button>)}
        <span className="text-center text-[10px] leading-4 text-fs-muted">可同时上图</span>
      </nav>
      <div id={`event-panel-${activeTab}`} role="tabpanel" aria-labelledby={`event-tab-${activeTab}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div aria-label="事件工具栏" className="flex shrink-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap border-b border-fs-border px-1.5 py-1 text-xs sm:gap-2 sm:px-2">
      <input type="search" aria-label="搜索事件" placeholder="搜索事件…" value={filters.searchQ} onChange={e => patch({ searchQ: e.target.value })} className="hidden min-h-7 w-36 shrink-0 rounded border border-fs-border bg-fs-elevated px-2 sm:block" />
      <button className={`${button} shrink-0 ${hasFilters ? "border-fs-accent text-fs-accent-text" : ""}`} aria-label="筛选条件" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>筛选{hasFilters && <span className="hidden sm:inline"> · 已选</span>}</button>
      {hasFilters && <button className={`${button} hidden shrink-0 sm:inline-flex`} aria-label="清除内容条件" onClick={() => onChange(clearEventContentFilters(filters))}>清除</button>}
      {activeTab === "user" && <button className={`${button} shrink-0`} disabled={!store.ready} onClick={() => fileRef.current?.click()}>导入</button>}
      <label className="flex min-h-10 shrink-0 items-center gap-1 sm:min-h-7"><input type="checkbox" aria-label="本类上图" checked={filters.markersEnabled} onChange={e => patch({ markersEnabled: e.target.checked })} /><span className="hidden sm:inline">显示在 K 线</span><span className="sm:hidden">显示</span></label>
      <button className={`${button} shrink-0`} aria-haspopup="dialog" aria-expanded={manage} onClick={() => setManage(!manage)}>设置</button>
      <button className={`${button} shrink-0`} aria-label={activeTab === "system" && result.error ? "加载失败 · 结果说明" : `结果说明：${events.length} 条事件`} onClick={() => openDiagnostics()}>{activeTab === "system" && result.error ? "加载失败" : loading ? "加载中" : `${events.length} 条`}</button>
    </div>
      {markerGroupIds.length > 1 && <div className="mt-1 flex shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap rounded border border-fs-border p-1 text-xs"><span>此根 K 线的事件：</span>{events.filter(e => markerGroupIds.includes(e.id)).map(e => <button key={e.id} aria-pressed={selectedEventId === e.id} className={button} onClick={() => onSelectEvent(e.id)}>{e.markerLabel} · {e.title}</button>)}<button className={button} onClick={onCloseMarkerGroup}>收起聚合事件</button></div>}
      {activeTab === "system" && result.error && <p role="alert" className="text-xs text-red-600">{result.error}<button className={button} onClick={result.retry}>重试加载</button></p>}
      {activeTab === "user" && message && !preview && !inspectImport && <p role="status" title={message} className="shrink-0 truncate px-2 text-[11px] text-fs-secondary">{message}</p>}
      {manage && <EventShelfSettings source={activeTab} filters={filters} onChange={onChange} store={store} message={message} onInspectImport={lastImport ? () => { setManage(false); setInspectImport(true); } : undefined} target={target} onTargetChange={setTarget} selected={selected} onReset={onResetToSymbolDefault ? () => onResetToSymbolDefault(activeTab) : undefined} onImport={() => fileRef.current?.click()} onClose={() => setManage(false)} />}
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={e => void onFile(e.target.files?.[0] ?? null)} />
    <div ref={scrollRef} className={`min-h-0 flex-1 p-1.5 ${mode === "timeline" ? "overflow-x-auto overflow-y-auto" : "overflow-y-auto"}`}>
      {!events.length ? <div className="flex flex-wrap items-center justify-center gap-2 p-2 text-xs text-fs-muted"><p role="status">{activeTab === "user" && store.authError && !store.ready ? store.authError : empty.message}</p>{activeTab === "user" && store.authError && !store.ready ? <button className={button} onClick={store.retryAuth}>重新确认账号</button> : empty.action && <button className={button} onClick={() => { if (empty.action === "retry") result.retry(); else if (empty.action === "manage") setManage(true); else if (empty.action === "clear") onChange(clearEventContentFilters(filters)); else openDiagnostics(); }}>{({ retry: "重试加载", manage: "检查来源与包范围", clear: "清除内容条件后重查", diagnostics: "查看排除原因" })[empty.action]}</button>}</div> :
        <ul className={mode === "timeline" ? "flex min-w-max items-start gap-1.5" : mode === "cards" ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" : "space-y-1"}>
          {events.map(event => <li key={event.id} data-event-id={event.id} className={`rounded border p-1.5 ${mode === "timeline" ? "w-[240px] shrink-0" : ""} ${event.id === selectedEventId ? "border-fs-accent bg-fs-accent-soft ring-1 ring-fs-accent" : "border-fs-border bg-fs-elevated"}`}>
            <button aria-pressed={event.id === selectedEventId} className="w-full text-left" onClick={() => onSelectEvent(event.id)}>
              <span className="flex items-center gap-0.5"><span className="h-1.5 w-2 shrink-0 rounded-full" style={{ backgroundColor: event.color || undefined }} /><time className="text-[10px] tabular-nums text-fs-muted">{event.occurredAt.slice(0, 10)}</time><span className="ml-auto text-[9px] text-fs-muted">{event.sourceKind === "user_local" ? "本地" : event.sourceKind === "sec" ? "SEC" : "网站"}</span></span>
              <span title={event.title || event.markerLabel || undefined} className="block truncate text-xs font-medium">{event.title || event.markerLabel}</span>
            </button>
            <div className="flex items-center gap-3 text-[11px] text-fs-accent-text"><span className="mr-auto text-[10px] text-fs-muted">{eventTypeLabel(event.eventType)}</span><button className="min-h-7" aria-label={`说明：${event.title || event.markerLabel}`} onClick={() => openDiagnostics(event.id)}>说明{result.chartProjection[event.id]?.status === "merged" ? "·合并" : ""}</button><button className="min-h-7" onClick={() => { onSelectEvent(event.id); onOpenDetail?.(event); }}>详情</button><button className="min-h-7" onClick={() => { onSelectEvent(event.id); onLocateEvent(event); }}>定位 K 线</button></div>
          </li>)}
        </ul>}
    </div>
      </div>
    </div>
    {diagnostics && <EventDiagnosticsDialog source={activeTab} result={result} packs={packSummary} error={activeTab === "system" ? result.error : null} loading={loading} initialEventId={diagnosticEventId} onClose={() => setDiagnostics(false)} onClear={() => { onChange(clearEventContentFilters(filters)); }} onManage={() => { setDiagnostics(false); setManage(true); }} onRetry={result.retry} onRestoreHidden={() => patch({ hiddenEventIds: [] })} from={result.from} to={result.to} onSelect={event => { setDiagnostics(false); setActiveTab(eventSourceGroup(event)); onSelectEvent(event.id); }} />}
    {filtersOpen && <EventFilterSheet filters={filters} onApply={onChange} onClose={() => setFiltersOpen(false)} />}
    {inspectImport && lastImport && <EventImportResultDialog receipt={lastImport} packs={store.packs} symbol={symbol} filters={allFilters} from={result.from} to={result.to} projection={result.chartProjection} onClose={() => setInspectImport(false)} onManage={() => { setInspectImport(false); setActiveTab("user"); setManage(true); }} onDetail={onOpenDetail ? event => { setInspectImport(false); onOpenDetail(event); } : undefined} />}
    {preview && <EventSettingsDialog title="事件导入预览" onClose={() => setPreview(null)}><div className="w-full text-sm">
      <strong>导入预览：{preview.name}</strong>
      {importError && <p role="alert" className="my-2 text-red-600">{importError}</p>}
      <p className="my-2">有效 {preview.events.length} 条 · 错误 {preview.errors.length} 条</p>
      {previewPlan && <div className="space-y-2 text-xs">
        <p className="font-medium">{previewPlan.pack.name}</p>
        <p>新增 {previewPlan.receipt.added} · 更新 {previewPlan.receipt.updated} · 未变 {previewPlan.receipt.unchanged}</p>
        <p>显示范围：{previewPlan.pack.target === "all-assets" ? "所有资产" : previewPlan.pack.symbols?.join("、")} · {previewPlan.pack.enabled ? "已启用" : "保持停用"}</p>
        <p className="text-fs-muted">更新同一文件中的已有事件，保留原有筛选和开关。</p>
        <details><summary className="min-h-9 cursor-pointer leading-9">查看导入明细</summary>
          <p>目标包：{previewPlan.pack.name} · ID：{previewPlan.pack.id}</p>
          <p>同包新增 {previewPlan.receipt.added} · 更新 {previewPlan.receipt.updated} · 未变 {previewPlan.receipt.unchanged} · 其他原有事件保留 {previewPlan.receipt.retained}</p>
          {previewPlan.receipt.otherPackIds > 0 && <p>其他包出现的相同 ID：{previewPlan.receipt.otherPackIds} 个，不会被覆盖。</p>}
          <ul className="my-2 max-h-40 overflow-y-auto">{previewPlan.changes.slice(0, 8).map(e => <li key={e.externalId}>{({ added: "新增", updated: "更新", unchanged: "未变" })[e.kind]} · {e.title}</li>)}</ul>
        </details>
      </div>}
      {preview.errors.length > 0 && <ul className="my-2 max-h-40 overflow-y-auto text-xs">{preview.errors.map((e, i) => <li key={i} className="text-red-600">{e}</li>)}</ul>}
      <button className={button} onClick={() => setPreview(null)}>取消</button> <button className={button} disabled={preview.errors.length > 0} onClick={confirmImport}>确认导入</button>
    </div></EventSettingsDialog>}
  </section>;
}
