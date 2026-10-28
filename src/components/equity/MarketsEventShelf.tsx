"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { eventRecord, normalizeEventColor } from "@/lib/data/eventPresentation";
import { eventTypeLabel, EVENT_TYPE_CODES } from "@/lib/data/eventTaxonomy";
import { loadDemoMilestones, parseMilestoneIngestJson, type CompanyMilestone, type LocalEventImportTarget } from "@/lib/equity/companyMilestones";
import type { useLocalCompanyEvents } from "@/lib/equity/useLocalCompanyEvents";
import type { useChartEvents } from "@/lib/chart/useChartEvents";
import { clearEventContentFilters, eventFiltersForSource, updateEventSourceFilters, type EventViewFilterState } from "@/lib/chart/eventViewFilters";
import { eventIdentity, eventSourceGroup, EVENT_SOURCE_COLORS, type EventSourceGroup } from "@/lib/chart/eventSelection";
import { EventPanelFilters, EventFilterSummary } from "@/components/events/EventPanelFilters";
import { EventFilterSheet } from "@/components/events/EventFilterSheet";
import { describeEmptyEventState, summarizeEventPacks } from "@/lib/chart/eventDiagnostics";
import { EventDiagnosticsDialog } from "@/components/events/EventDiagnosticsDialog";
import { EventSettingsDialog } from "@/components/events/EventSettingsDialog";
import { classifyMacroEventSurprise } from "@/lib/data/macroEventSurprise";

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
function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

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
  const [manage, setManage] = useState(false), [styles, setStyles] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [diagnosticEventId, setDiagnosticEventId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; raw: Record<string, unknown>; events: CompanyMilestone[]; errors: string[]; target: LocalEventImportTarget; symbol: string | null } | null>(null);
  const [styleType, setStyleType] = useState<string>("company.earnings");
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
    try {
      const raw = eventRecord(JSON.parse(await file.text()));
      const parsed = parseMilestoneIngestJson(raw);
      setPreview({ name: file.name, raw, events: parsed.milestones, errors: parsed.errors, target: target === "file" ? parsed.importTarget : target, symbol: parsed.symbol });
      setManage(false);
    } catch (e) { setMessage(e instanceof Error ? e.message : "文件读取失败"); }
    if (fileRef.current) fileRef.current.value = "";
  };
  const confirmImport = () => {
    if (!preview || preview.errors.length) return;
    try {
      const pack = eventRecord(preview.raw.pack), query = eventRecord(preview.raw.query);
      const symbols = target === "file" && Array.isArray(pack.symbols) ? pack.symbols.filter((v): v is string => typeof v === "string").map(v => v.toUpperCase()) : undefined;
      store.importEvents(preview.events, preview.target, { id: typeof pack.id === "string" ? pack.id : preview.name, name: typeof pack.name === "string" ? pack.name : typeof query.topic === "string" ? query.topic : preview.name, version: typeof pack.version === "string" ? pack.version : undefined, color: normalizeEventColor(pack.color), symbols });
      setActiveTab("user");
      setMessage(`已导入 ${preview.events.length} 条，保留原有筛选与上图设置；显示范围：${symbols?.length ? symbols.join("、") : preview.target === "all-assets" ? "全部资产" : symbol}`); setPreview(null);
    } catch (e) { setMessage(String(e)); }
  };
  const existingIds = new Set(store.packs.flatMap(p => p.events.map(e => String(e.externalId))));
  const repeated = preview?.events.filter(e => existingIds.has(e.externalId)).length ?? 0;
  const mode = filters.viewMode || "timeline";
  const assessed = events.filter(e => e.eventType === "macro.release" && classifyMacroEventSurprise(e.payload).level !== "unassessed");
  const button = "min-h-10 sm:min-h-7 rounded border border-fs-border px-2 py-1 text-xs text-fs-secondary hover:bg-fs-elevated";
  return <section aria-label="事件筛选器" className="relative flex min-h-[150px] shrink-0 flex-col border-t border-fs-border bg-fs-bg" style={{ height: shelfHeight }}>
    <div role="separator" aria-label="拖动调节事件筛选器高度" aria-orientation="horizontal" onPointerDown={resize} className="absolute inset-x-0 top-0 z-10 h-2 cursor-ns-resize touch-none hover:bg-fs-accent-soft" />
    <div className="flex min-h-0 flex-1 pt-2">
      <nav role="tablist" aria-label="事件来源分页" aria-orientation="vertical" className="flex w-20 shrink-0 flex-col gap-1 border-r border-fs-border bg-fs-elevated/40 p-1">
        {(["system", "user"] as const).map(tab => <button key={tab} id={`event-tab-${tab}`} role="tab" aria-controls={`event-panel-${tab}`} aria-selected={activeTab === tab} tabIndex={activeTab === tab ? 0 : -1}
          onClick={() => { setActiveTab(tab); setManage(false); setStyles(false); setFiltersOpen(false); }}
          onKeyDown={e => { if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) { e.preventDefault(); const next = e.key === "Home" ? "system" : e.key === "End" ? "user" : activeTab === "system" ? "user" : "system"; setActiveTab(next); setManage(false); setStyles(false); setFiltersOpen(false); document.getElementById(`event-tab-${next}`)?.focus(); } }}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded border px-1 py-1 text-xs ${activeTab === tab ? "border-fs-accent bg-fs-accent-soft font-semibold text-fs-text" : "border-transparent text-fs-muted hover:bg-fs-elevated"}`}>
          <span className="flex items-center gap-0.5"><span className="h-1.5 w-2 shrink-0 rounded-full" style={{ backgroundColor: EVENT_SOURCE_COLORS[tab] }} />{tab === "system" ? "系统事件" : "用户事件"}</span><span className="text-[10px] font-normal tabular-nums">{sourceCounts[tab]} 条</span>
        </button>)}
        <span className="text-center text-[10px] leading-4 text-fs-muted">可同时上图</span>
      </nav>
      <div id={`event-panel-${activeTab}`} role="tabpanel" aria-labelledby={`event-tab-${activeTab}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div aria-label="事件工具栏" className="flex shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-fs-border px-2 py-1 text-xs">
      <span className="shrink-0 text-fs-muted">{symbol}</span>
      <div className="hidden sm:contents"><EventPanelFilters key={activeTab} layout="inline" filters={filters} onChange={onChange} showSummary={false} /></div>
      <button className={`${button} shrink-0 sm:hidden`} aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>筛选条件</button>
      <button className={`${button} shrink-0`} aria-expanded={manage} onClick={() => { setManage(!manage); setStyles(false); }}>{activeTab === "system" ? "系统来源管理" : "用户事件包管理"}</button>
      <label className="flex min-h-10 shrink-0 items-center gap-1 sm:min-h-7"><input type="checkbox" checked={filters.markersEnabled} onChange={e => patch({ markersEnabled: e.target.checked })} /> 本类上图</label>
      <button className={`${button} shrink-0`} aria-expanded={styles} onClick={() => { setStyles(!styles); setManage(false); }}>图表显示设置</button>
      <select aria-label="事件视图" value={mode} onChange={e => patch({ viewMode: e.target.value as EventViewFilterState["viewMode"] })} className={`${button} shrink-0`}><option value="timeline">时间线</option><option value="cards">卡片</option><option value="list">列表</option></select>
      <button className={`${button} shrink-0`} onClick={() => openDiagnostics()}>{activeTab === "system" && result.error ? "加载失败 · 结果说明" : loading ? "加载中 · 结果说明" : `列表 ${events.length} · 候选 ${stats.chartCandidates}${stats.merged ? ` · 合并 ${stats.merged}` : ""} · 结果说明`}</button>
    </div>
    <div className="min-w-0 shrink-0 px-2"><EventFilterSummary filters={filters} onChange={onChange} compact /></div>
      {markerGroupIds.length > 1 && <div className="mt-1 flex shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap rounded border border-fs-border p-1 text-xs"><span>此根 K 线的事件：</span>{events.filter(e => markerGroupIds.includes(e.id)).map(e => <button key={e.id} aria-pressed={selectedEventId === e.id} className={button} onClick={() => onSelectEvent(e.id)}>{e.markerLabel} · {e.title}</button>)}<button className={button} onClick={onCloseMarkerGroup}>收起聚合事件</button></div>}
      {activeTab === "system" && result.error && <p role="alert" className="text-xs text-red-600">{result.error}<button className={button} onClick={result.retry}>重试加载</button></p>}
      {activeTab === "user" && message && !manage && <p role="status" className="text-[11px] text-fs-secondary">{message}</p>}
      {manage && <EventSettingsDialog title={activeTab === "system" ? "系统来源管理" : "用户事件包管理"} onClose={() => setManage(false)}>
        {activeTab === "system" && <div className="flex flex-wrap items-center gap-3">
          <label>关联范围 <select aria-label="资产关联范围" value={filters.relationMode || ""} onChange={e => patch({ relationMode: e.target.value as EventViewFilterState["relationMode"] || undefined })} className={button}><option value="">跟随资产默认</option><option value="asset">直接资产</option><option value="industry">资产与行业</option><option value="macro">包含宏观关联</option></select></label>
          {onResetToSymbolDefault && <button className={button} onClick={() => onResetToSymbolDefault("system")}>恢复资产默认</button>}
{([ ["includeMarket", "云端标准事件"], ["includeSec", "SEC 事件"] ] as const).map(([key,label]) => <label key={key}><input type="checkbox" checked={filters[key] !== false} onChange={e => patch({ [key]: e.target.checked })} /> {label}</label>)}

        </div>}
        {activeTab === "user" && <>
        {message && <p role="status" className="w-full text-fs-secondary">{message}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-10 items-center gap-1"><input type="checkbox" checked={filters.includeLocal !== false} onChange={e => patch({ includeLocal: e.target.checked })} /> 启用用户事件来源</label>
          <a className={button} href="/templates/company-milestone/company-milestone-pack.zip" download>下载 SKILL</a>
          <select aria-label="本地事件导入范围" value={target} onChange={e => setTarget(e.target.value as typeof target)} className={button}><option value="file">按文件设置</option><option value="all-assets">全部资产通用</option><option value="symbol">仅当前标的</option></select>
          <button className={button} disabled={!store.ready} onClick={() => fileRef.current?.click()}>导入本地事件</button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={e => void onFile(e.target.files?.[0] ?? null)} />
        </div>
        <p className="text-fs-muted">事件包保存在此浏览器，可导出备份。包范围决定在哪些资产加载，内容标签用于进一步筛选。</p>
        {store.packs.map(pack => <div key={pack.id} className="flex flex-wrap items-center gap-2">
          <label><input type="checkbox" checked={pack.enabled} onChange={e => store.updatePack(pack.id, { enabled: e.target.checked })} /> {pack.name}（{pack.events.length} 条）</label>
          <span className="text-fs-muted">{pack.target === "all-assets" ? "全部资产" : pack.symbols?.join("、")}</span>
          <input aria-label={`${pack.name} 默认颜色`} type="color" value={pack.color || "#475569"} onChange={e => store.updatePack(pack.id, { color: e.target.value })} />
          <button className={button} onClick={() => store.updatePack(pack.id, { color: undefined })}>恢复包配色</button>
          <button className={button} onClick={() => downloadJson(`${pack.name}.json`, { schemaVersion: 2, mode: "company-milestone", pack: { id: pack.id, name: pack.name, version: pack.version, color: pack.color, symbols: pack.target === "assets" ? pack.symbols : undefined }, query: { importTarget: pack.target === "all-assets" ? "all-assets" : "symbol", symbol: pack.symbols?.[0] }, events: pack.events })}>导出</button>
          <button className={button} onClick={() => { downloadJson(`${pack.name}-备份.json`, { schemaVersion: 2, mode: "company-milestone", pack, query: { importTarget: pack.target === "all-assets" ? "all-assets" : "symbol" }, events: pack.events }); store.deletePack(pack.id); }}>删除并备份</button>
        </div>)}
        <button className={button} onClick={() => { store.importEvents(loadDemoMilestones("TSLA"), "symbol", { id: "tsla-demo", name: "TSLA 示例", symbols: ["TSLA"] }); setMessage("TSLA 范本已载入，仅在 TSLA 显示"); }}>载入 TSLA 范本</button>
        </>}
      <details className="text-[10px] text-fs-muted"><summary>本页筛选说明 · 当前已加载集合区间内 {stats.inRange} 条 · 排除 {stats.filteredOut} 条 · 本页可评估发布 {assessed.length} 条</summary>两页分别保存搜索、类型、重要性、关联标签、来源与显示设置，调整本页不影响另一类事件。默认系统蓝色、用户紫色，事件已有颜色和个人设置优先。本页筛选同时作用于本类卡片和主图标记。本地事件仍受事件包范围约束。仅大预期差要求有效的宏观发布证据，不表示利多或利空。本类时间范围外 {stats.loaded - stats.inRange} 条。</details>
      </EventSettingsDialog>}
      {styles && <EventSettingsDialog title="图表显示设置" onClose={() => setStyles(false)}>
        <label><input type="checkbox" checked={filters.showLabel} onChange={e => patch({ showLabel: e.target.checked })} /> 显示标记文字</label>
        <label>类型配色 <select aria-label="配色事件类型" value={styleType} onChange={e => setStyleType(e.target.value)} className={button}>{EVENT_TYPE_CODES.map(t => <option key={t} value={t}>{eventTypeLabel(t)}</option>)}</select></label>
        <input type="color" aria-label="类型颜色" value={filters.typeColors?.[styleType] || "#475569"} onChange={e => patch({ typeColors: { ...filters.typeColors, [styleType]: e.target.value } })} />
        <button className={button} onClick={() => { const next = { ...filters.typeColors }; delete next[styleType]; patch({ typeColors: next }); }}>恢复类型颜色</button>
        {selected && <><span>选中：{selected.markerLabel || selected.title}</span><input type="color" aria-label="选中事件颜色" value={selected.color || "#475569"} onChange={e => patch({ eventColors: { ...filters.eventColors, [eventIdentity(selected)]: e.target.value } })} /><button className={button} onClick={() => { const next = { ...filters.eventColors }; delete next[eventIdentity(selected)]; patch({ eventColors: next }); }}>恢复事件颜色</button><label><input type="checkbox" checked={!filters.hiddenMarkerIds?.includes(eventIdentity(selected))} onChange={e => patch({ hiddenMarkerIds: e.target.checked ? filters.hiddenMarkerIds?.filter(id => id !== eventIdentity(selected)) : [...(filters.hiddenMarkerIds || []), eventIdentity(selected)] })} /> 此事件上图</label></>}
      </EventSettingsDialog>}
    <div ref={scrollRef} className={`min-h-0 flex-1 p-1.5 ${mode === "timeline" ? "overflow-x-auto overflow-y-auto" : "overflow-y-auto"}`}>
      {!events.length ? <div className="flex flex-wrap items-center justify-center gap-2 p-2 text-xs text-fs-muted"><p role="status">{empty.message}</p>{empty.action && <button className={button} onClick={() => { if (empty.action === "retry") result.retry(); else if (empty.action === "manage") setManage(true); else if (empty.action === "clear") onChange(clearEventContentFilters(filters)); else openDiagnostics(); }}>{({ retry: "重试加载", manage: "检查来源与包范围", clear: "清除内容条件后重查", diagnostics: "查看排除原因" })[empty.action]}</button>}</div> :
        <ul className={mode === "timeline" ? "flex min-w-max items-start gap-1.5" : mode === "cards" ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" : "space-y-1"}>
          {events.map(event => <li key={event.id} data-event-id={event.id} className={`rounded border p-1.5 ${mode === "timeline" ? "w-[240px] shrink-0" : ""} ${event.id === selectedEventId ? "border-fs-accent bg-fs-accent-soft ring-1 ring-fs-accent" : "border-fs-border bg-fs-elevated"}`}>
            <button aria-pressed={event.id === selectedEventId} className="w-full text-left" onClick={() => onSelectEvent(event.id)}>
              <span className="flex items-center gap-0.5"><span className="h-1.5 w-2 shrink-0 rounded-full" style={{ backgroundColor: event.color || undefined }} /><time className="text-[10px] tabular-nums text-fs-muted">{event.occurredAt.slice(0, 10)}</time><span className="ml-auto text-[9px] text-fs-muted">{event.sourceKind === "user_local" ? "本地" : event.sourceKind === "sec" ? "SEC" : "共享"}</span></span>
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
    {preview && <EventSettingsDialog title="事件导入预览" onClose={() => setPreview(null)}><div className="w-full text-sm">
      <strong>导入预览：{preview.name}</strong><p className="my-2">有效 {preview.events.length} 条，其中 {repeated} 条 ID 已存在、{preview.events.length - repeated} 条为新 ID；错误 {preview.errors.length} 条；范围：{preview.target === "all-assets" ? "全部资产" : symbol}</p>
      {preview.symbol && preview.target === "symbol" && preview.symbol !== symbol && <p className="text-amber-700">文件标的是 {preview.symbol}，当前选择将导入到 {symbol}。可取消后切换资产。</p>}
      <p>重复 externalId 将更新同包事件；其他事件保留。导入后仍服从当前时间区间和内容筛选。</p>
      <ul className="my-2 max-h-40 overflow-y-auto text-xs">{preview.errors.map((e,i) => <li key={i} className="text-red-600">{e}</li>)}{preview.events.slice(0,8).map(e => <li key={e.id}>{e.occurredAt.slice(0,10)} · {e.title}</li>)}</ul>
      <button className={button} onClick={() => setPreview(null)}>取消</button> <button className={button} disabled={preview.errors.length > 0} onClick={confirmImport}>确认导入</button>
    </div></EventSettingsDialog>}
  </section>;
}
