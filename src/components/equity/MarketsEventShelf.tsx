"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { eventRecord, normalizeEventColor } from "@/lib/data/eventPresentation";
import { eventTypeLabel, familyIdForEventType, EVENT_TYPE_CODES } from "@/lib/data/eventTaxonomy";
import { loadDemoMilestones, parseMilestoneIngestJson, type CompanyMilestone, type LocalEventImportTarget, type CompanyKindFilter } from "@/lib/equity/companyMilestones";
import type { useLocalCompanyEvents } from "@/lib/equity/useLocalCompanyEvents";
import type { useChartEvents } from "@/lib/chart/useChartEvents";
import type { EventViewFilterState } from "@/lib/chart/eventViewFilters";
import { eventIdentity, eventSourceGroup, EVENT_SOURCE_COLORS, type EventSourceGroup } from "@/lib/chart/eventSelection";
import { EventPanelFilters } from "@/components/events/EventPanelFilters";
import { MacroEventSurpriseSummary } from "@/components/events/MacroSurpriseEvidence";
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
  onResetToSymbolDefault?: () => void; height?: number;
};
const KEY = "markets-event-shelf-height-v2";
function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

export function MarketsEventShelf({ localEventStore: store, eventResult: result, onOpenDetail, selectedEventId, markerGroupIds, onCloseMarkerGroup, onSelectEvent, onLocateEvent, symbol, viewFilters: filters, onViewFiltersChange: onChange, onResetToSymbolDefault, height = 210 }: MarketsEventShelfProps) {
  const fileRef = useRef<HTMLInputElement>(null), scrollRef = useRef<HTMLDivElement>(null);
  const [shelfHeight, setShelfHeight] = useState(() => { try { return Math.min(640, Math.max(150, Number(localStorage.getItem(KEY)) || height)); } catch { return height; } });
  const [activeTab, setActiveTab] = useState<EventSourceGroup>("system");
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
  const [preview, setPreview] = useState<{ name: string; raw: Record<string, unknown>; events: CompanyMilestone[]; errors: string[]; target: LocalEventImportTarget; symbol: string | null } | null>(null);
  const [styleType, setStyleType] = useState<string>("company.earnings");
  const patch = (p: Partial<EventViewFilterState>) => onChange({ ...filters, ...p });
  const events = result.events.filter(e => eventSourceGroup(e) === activeTab);
  const sourceCounts = { system: result.events.filter(e => eventSourceGroup(e) === "system").length, user: result.events.filter(e => eventSourceGroup(e) === "user").length };
  const selected = events.find(e => e.id === selectedEventId);
  useEffect(() => {
    const node = scrollRef.current?.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(selectedEventId || "")}"]`);
    node?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [selectedEventId, activeTab]);
  const resize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); const startY = e.clientY, startHeight = shelfHeight; let next = shelfHeight;
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
    } catch (e) { setMessage(e instanceof Error ? e.message : "文件读取失败"); }
    if (fileRef.current) fileRef.current.value = "";
  };
  const confirmImport = () => {
    if (!preview || preview.errors.length) return;
    try {
      const pack = eventRecord(preview.raw.pack), query = eventRecord(preview.raw.query);
      const symbols = target === "file" && Array.isArray(pack.symbols) ? pack.symbols.filter((v): v is string => typeof v === "string").map(v => v.toUpperCase()) : undefined;
      store.importEvents(preview.events, preview.target, { id: typeof pack.id === "string" ? pack.id : preview.name, name: typeof pack.name === "string" ? pack.name : typeof query.topic === "string" ? query.topic : preview.name, version: typeof pack.version === "string" ? pack.version : undefined, color: normalizeEventColor(pack.color), symbols });
      onChange({ ...filters, markersEnabled: true, includeLocal: true, largeSurpriseOnly: false, companyKinds: undefined, typeFamilies: [...new Set([...filters.typeFamilies, ...preview.events.map(m => familyIdForEventType(m.eventType))])] });
      setActiveTab("user");
      setMessage(`已导入 ${preview.events.length} 条；显示范围：${symbols?.length ? symbols.join("、") : preview.target === "all-assets" ? "全部资产" : symbol}`); setPreview(null);
    } catch (e) { setMessage(String(e)); }
  };
  const existingIds = new Set(store.packs.flatMap(p => p.events.map(e => String(e.externalId))));
  const repeated = preview?.events.filter(e => existingIds.has(e.externalId)).length ?? 0;
  const mode = filters.viewMode || "timeline";
  const assessed = events.filter(e => e.eventType === "macro.release" && classifyMacroEventSurprise(e.payload).level !== "unassessed");
  const button = "rounded border border-fs-border px-2 py-1 text-[11px] text-fs-secondary hover:bg-fs-elevated";
  return <section aria-label="事件筛选器" className="relative flex min-h-[240px] shrink-0 flex-col border-t border-fs-border bg-fs-bg sm:min-h-[170px]" style={{ height: shelfHeight }}>
    <div role="separator" aria-label="拖动调节事件筛选器高度" aria-orientation="horizontal" onPointerDown={resize} className="absolute inset-x-0 top-0 z-10 h-2 cursor-ns-resize touch-none hover:bg-fs-accent-soft" />
    <div className="flex min-h-0 flex-1 pt-2">
      <nav role="tablist" aria-label="事件来源分页" aria-orientation="vertical" className="flex w-[80px] shrink-0 flex-col gap-1 border-r border-fs-border bg-fs-elevated/40 px-1 py-1 sm:w-[88px]">
        {(["system", "user"] as const).map(tab => <button key={tab} id={`event-tab-${tab}`} role="tab" aria-controls={`event-panel-${tab}`} aria-selected={activeTab === tab} tabIndex={activeTab === tab ? 0 : -1}
          onClick={() => { setActiveTab(tab); setManage(false); setStyles(false); setFiltersOpen(false); }}
          onKeyDown={e => { if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) { e.preventDefault(); const next = e.key === "Home" ? "system" : e.key === "End" ? "user" : activeTab === "system" ? "user" : "system"; setActiveTab(next); document.getElementById(`event-tab-${next}`)?.focus(); } }}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded border px-1 py-2 text-[11px] sm:text-xs ${activeTab === tab ? "border-fs-accent bg-fs-accent-soft font-semibold text-fs-text" : "border-transparent text-fs-muted hover:bg-fs-elevated"}`}>
          <span className="flex items-center gap-1"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: EVENT_SOURCE_COLORS[tab] }} />{tab === "system" ? "系统事件" : "用户事件"}</span><span className="text-[10px] font-normal tabular-nums">{sourceCounts[tab]} 条</span>
        </button>)}
        <span className="mt-1 text-center text-[9px] leading-4 text-fs-muted">两类可同时上图</span>
      </nav>
      <div id={`event-panel-${activeTab}`} role="tabpanel" aria-labelledby={`event-tab-${activeTab}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="max-h-[65%] shrink-0 overflow-y-auto sm:max-h-[55%] border-b border-fs-border px-2 pb-1 pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <strong className="text-[11px]">{activeTab === "system" ? "系统事件" : "用户事件"}</strong><span className="text-[10px] text-fs-muted">{symbol}</span>
        <label className="text-[11px]"><input type="checkbox" checked={filters.markersEnabled} onChange={e => patch({ markersEnabled: e.target.checked })} /> 图上显示</label>
        <button className={`${button} sm:hidden`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>筛选 {filtersOpen ? "▴" : "▾"}</button>
        <div className={`${filtersOpen ? "contents" : "hidden"} sm:contents`}><EventPanelFilters layout="inline" filters={filters} onChange={onChange} onResetToSymbolDefault={onResetToSymbolDefault} companyKindFilter={(filters.companyKinds ?? ["sec", "product", "capacity", "deal", "other"]) as CompanyKindFilter[]} onCompanyKindFilterChange={companyKinds => patch({ companyKinds })} /></div>
        <label className="text-[11px]"><input type="checkbox" checked={activeTab === "system" ? filters.includeMarket || filters.includeSec : filters.includeLocal !== false} onChange={e => patch(activeTab === "system" ? { includeMarket: e.target.checked, includeSec: e.target.checked } : { includeLocal: e.target.checked })} /> {activeTab === "system" ? "显示系统事件" : "显示用户事件"}</label>
        <span className="text-[10px] text-fs-muted">本页 {events.length} · 两类合计 {result.events.length} / 区间内 {result.inRange}{result.loading ? " · 加载中" : ""}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <select aria-label="事件视图" value={mode} onChange={e => patch({ viewMode: e.target.value as EventViewFilterState["viewMode"] })} className={button}><option value="timeline">时间线</option><option value="cards">卡片</option><option value="list">列表</option></select>
          <button className={button} aria-expanded={manage} onClick={() => setManage(!manage)}>{activeTab === "system" ? "系统来源" : "用户事件包"}</button>
          <button className={button} aria-expanded={styles} onClick={() => setStyles(!styles)}>显示设置</button>
          {activeTab === "user" && <>
          <a className={`${button} hidden sm:inline-block`} href="/templates/company-milestone/company-milestone-pack.zip" download>下载SKILL</a>
          <select aria-label="本地事件导入范围" value={target} onChange={e => setTarget(e.target.value as typeof target)} className={`${button} hidden sm:inline-block`}><option value="file">按文件设置</option><option value="all-assets">全部资产通用</option><option value="symbol">仅当前标的</option></select>
          <button className={button} disabled={!store.ready} onClick={() => fileRef.current?.click()}>导入本地事件</button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={e => void onFile(e.target.files?.[0] ?? null)} />
          </>}
        </div>
      </div>
      {markerGroupIds.length > 1 && <div className="mt-1 flex flex-wrap items-center gap-2 rounded border border-fs-border p-2 text-xs"><span>此根 K 线的事件：</span>{events.filter(e => markerGroupIds.includes(e.id)).map(e => <button key={e.id} aria-pressed={selectedEventId === e.id} className={button} onClick={() => onSelectEvent(e.id)}>{e.markerLabel} · {e.title}</button>)}<button className={button} onClick={onCloseMarkerGroup}>收起聚合事件</button></div>}
      {result.error && <p role="alert" className="text-xs text-red-600">{result.error}</p>}
      {activeTab === "user" && message && <p role="status" className="text-[11px] text-fs-secondary">{message}</p>}
      {manage && <div className="mt-1 space-y-2 rounded border border-fs-border p-2 text-xs">
        {activeTab === "system" && <div className="flex flex-wrap gap-3">{([ ["includeMarket", "云端标准事件"], ["includeSec", "SEC 事件"] ] as const).map(([key,label]) => <label key={key}><input type="checkbox" checked={filters[key] !== false} onChange={e => patch({ [key]: e.target.checked })} /> {label}</label>)}
          <label>资产关联 <select aria-label="资产关联范围" value={filters.relationMode || ""} onChange={e => patch({ relationMode: e.target.value as EventViewFilterState["relationMode"] || undefined })} className={button}><option value="">跟随资产默认</option><option value="asset">直接资产</option><option value="industry">资产与行业</option><option value="macro">包含宏观关联</option></select></label>
        </div>}
        {activeTab === "user" && <>
        <div className="flex flex-wrap items-center gap-2 sm:hidden"><a className={button} href="/templates/company-milestone/company-milestone-pack.zip" download>下载SKILL</a><select aria-label="手机本地事件导入范围" value={target} onChange={e => setTarget(e.target.value as typeof target)} className={button}><option value="file">按文件设置</option><option value="all-assets">全部资产通用</option><option value="symbol">仅当前标的</option></select></div>
        <p className="text-fs-muted">本地事件按事件包的显示范围加载；资产、行业是事实关联标签。</p>
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
      </div>}
      {styles && <div className="mt-1 flex flex-wrap items-center gap-2 rounded border border-fs-border p-2 text-xs">
        <label><input type="checkbox" checked={filters.showLabel} onChange={e => patch({ showLabel: e.target.checked })} /> 显示标记文字</label>
        <label>类型配色 <select aria-label="配色事件类型" value={styleType} onChange={e => setStyleType(e.target.value)} className={button}>{EVENT_TYPE_CODES.map(t => <option key={t} value={t}>{eventTypeLabel(t)}</option>)}</select></label>
        <input type="color" aria-label="类型颜色" value={filters.typeColors?.[styleType] || "#475569"} onChange={e => patch({ typeColors: { ...filters.typeColors, [styleType]: e.target.value } })} />
        <button className={button} onClick={() => { const next = { ...filters.typeColors }; delete next[styleType]; patch({ typeColors: next }); }}>恢复类型颜色</button>
        {selected && <><span>选中：{selected.markerLabel || selected.title}</span><input type="color" aria-label="选中事件颜色" value={selected.color || "#475569"} onChange={e => patch({ eventColors: { ...filters.eventColors, [eventIdentity(selected)]: e.target.value } })} /><button className={button} onClick={() => { const next = { ...filters.eventColors }; delete next[eventIdentity(selected)]; patch({ eventColors: next }); }}>恢复事件颜色</button><label><input type="checkbox" checked={!filters.hiddenMarkerIds?.includes(eventIdentity(selected))} onChange={e => patch({ hiddenMarkerIds: e.target.checked ? filters.hiddenMarkerIds?.filter(id => id !== eventIdentity(selected)) : [...(filters.hiddenMarkerIds || []), eventIdentity(selected)] })} /> 此事件上图</label></>}
      </div>}
      <details className="text-[10px] text-fs-muted"><summary>共同筛选说明 · 排除 {result.filteredOut} 条 · 本页可评估发布 {assessed.length} 条</summary>页签仅切换管理内容，不改变另一类事件的显示开关。默认系统蓝色、用户紫色，事件已有颜色和个人设置优先。类型、重要性、搜索、人物、机构、来源和公司细类为两页共用筛选，同时作用于主图。本地事件仍受事件包范围约束。仅大预期差要求有效的宏观发布证据，不表示利多或利空。时间范围外 {result.loaded - result.inRange} 条。</details>
    </div>
    <div ref={scrollRef} className={`min-h-0 flex-1 p-2 ${mode === "timeline" ? "overflow-x-auto overflow-y-auto" : "overflow-y-auto"}`}>
      {!events.length ? <p className="p-3 text-center text-xs text-fs-muted">{result.loading ? "正在加载事件…" : activeTab === "system" ? "当前区间与筛选下没有系统事件，可检查系统来源或调整筛选。" : "当前区间与筛选下没有用户事件，可检查事件包开关或导入本地事件包。"}</p> :
        <ul className={mode === "timeline" ? "flex min-w-max items-stretch gap-2" : mode === "cards" ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" : "space-y-1"}>
          {events.map(event => <li key={event.id} data-event-id={event.id} className={`rounded border p-1.5 ${mode === "timeline" ? "w-[170px] shrink-0" : ""} ${event.id === selectedEventId ? "border-fs-accent bg-fs-accent-soft ring-1 ring-fs-accent" : "border-fs-border bg-fs-elevated"}`}>
            <button aria-pressed={event.id === selectedEventId} className="w-full text-left" onClick={() => onSelectEvent(event.id)}>
              <span className="flex items-center gap-1"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: event.color || undefined }} /><time className="text-[10px] tabular-nums text-fs-muted">{event.occurredAt.slice(0, 10)}</time><span className="ml-auto text-[9px] text-fs-muted">{event.sourceKind === "user_local" ? "本地" : event.sourceKind === "sec" ? "SEC" : "共享"}</span></span>
              <span className="block text-[10px] text-fs-muted">{eventTypeLabel(event.eventType)}</span>
              <span className="block truncate text-[11px] font-medium">{event.markerLabel}</span><span className="line-clamp-2 text-[10px] text-fs-secondary">{event.title}</span>
            </button>
            {mode !== "timeline" && event.eventType === "macro.release" && <MacroEventSurpriseSummary payload={event.payload} />}
            <div className="mt-1 flex gap-3 text-[10px] text-fs-accent-text"><button onClick={() => { onSelectEvent(event.id); onOpenDetail?.(event); }}>详情</button><button onClick={() => { onSelectEvent(event.id); onLocateEvent(event); }}>定位 K 线</button></div>
          </li>)}
        </ul>}
    </div>
      </div>
    </div>
    {preview && <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 p-3"><div role="dialog" aria-modal="true" aria-label="事件导入预览" className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded bg-white p-4 text-sm shadow-xl">
      <strong>导入预览：{preview.name}</strong><p className="my-2">有效 {preview.events.length} 条，其中 {repeated} 条 ID 已存在、{preview.events.length - repeated} 条为新 ID；错误 {preview.errors.length} 条；范围：{preview.target === "all-assets" ? "全部资产" : symbol}</p>
      {preview.symbol && preview.target === "symbol" && preview.symbol !== symbol && <p className="text-amber-700">文件标的是 {preview.symbol}，当前选择将导入到 {symbol}。可取消后切换资产。</p>}
      <p>重复 externalId 将更新同包事件；其他事件保留。导入后仍服从当前时间区间和内容筛选。</p>
      <ul className="my-2 max-h-40 overflow-y-auto text-xs">{preview.errors.map((e,i) => <li key={i} className="text-red-600">{e}</li>)}{preview.events.slice(0,8).map(e => <li key={e.id}>{e.occurredAt.slice(0,10)} · {e.title}</li>)}</ul>
      <button className={button} onClick={() => setPreview(null)}>取消</button> <button className={button} disabled={preview.errors.length > 0} onClick={confirmImport}>确认导入</button>
    </div></div>}
  </section>;
}
