"use client";

import { useState } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { EVENT_TYPE_CODES, eventTypeLabel } from "@/lib/data/eventTaxonomy";
import type { useLocalCompanyEvents } from "@/lib/equity/useLocalCompanyEvents";
import { loadDemoMilestones, type LocalEventImportTarget } from "@/lib/equity/companyMilestones";
import type { LocalEventPack } from "@/lib/equity/localEventPacks";
import type { EventViewFilterState } from "@/lib/chart/eventViewFilters";
import { eventIdentity, type EventSourceGroup } from "@/lib/chart/eventSelection";
import { EventSettingsDialog } from "./EventSettingsDialog";

const control = "min-h-10 rounded border border-fs-border bg-fs-bg px-2 py-1 text-xs";
function download(pack: LocalEventPack) {
  const data = { schemaVersion: 2, mode: "company-milestone", pack: { id: pack.id, name: pack.name, version: pack.version, color: pack.color, symbols: pack.symbols }, query: { importTarget: pack.target === "all-assets" ? "all-assets" : "symbol", symbol: pack.symbols?.[0] }, events: pack.events };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = `${pack.name}.json`; link.click(); URL.revokeObjectURL(url);
}
export function EventShelfSettings({ source, filters, onChange, store, target, onTargetChange, onImport, selected, onReset, onClose, message, onInspectImport }: {
  source: EventSourceGroup; filters: EventViewFilterState; onChange: (next: EventViewFilterState) => void;
  store: ReturnType<typeof useLocalCompanyEvents>; target: "file" | LocalEventImportTarget;
  onTargetChange: (next: "file" | LocalEventImportTarget) => void; onImport: () => void;
  message?: string; onInspectImport?: () => void;
  selected?: MarketEventDto; onReset?: () => void; onClose: () => void;
}) {
  const [type, setType] = useState("company.earnings");
  const patch = (next: Partial<EventViewFilterState>) => onChange({ ...filters, ...next });
  return <EventSettingsDialog title={source === "system" ? "系统事件设置" : "用户事件设置"} onClose={onClose}>
    <div className="w-full space-y-4">
      {source === "system" ? <fieldset className="space-y-2">
        <legend className="mb-1 font-medium">显示哪些来源</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">{([ ["includeMarket", "网站事件"], ["includeSec", "SEC 公告"] ] as const).map(([key, label]) => <label key={key} className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={filters[key] !== false} onChange={e => patch({ [key]: e.target.checked })} />{label}</label>)}</div>
      </fieldset> : <section aria-label="本地事件文件" className="space-y-2">
        {message && <p role="alert">{message}</p>}
        <p className="text-fs-muted">仅保存在当前浏览器，不上传服务器。换设备前请导出备份。</p>
        {store.authError && <p role="alert">{store.authError}<button className={control} onClick={store.retryAuth}>重新确认账号</button></p>}
        <div className="flex flex-wrap gap-2">{onInspectImport && <button className={control} onClick={onInspectImport}>查看本次导入</button>}<button className={control} disabled={!store.ready} onClick={onImport}>导入文件</button><a className={`${control} inline-flex items-center`} href="/templates/company-milestone/company-milestone-pack.zip" download>下载 SKILL</a></div>
        {filters.includeLocal === false && <button className={control} onClick={() => patch({ includeLocal: true })}>恢复显示用户事件</button>}
        {!store.packs.length && <p className="py-2 text-fs-muted">还没有事件文件，用 Skill 生成后导入即可。</p>}
        {store.packs.map(pack => <div key={pack.id} data-event-pack-id={pack.id} className="rounded border border-fs-border p-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2"><input type="checkbox" checked={pack.enabled} onChange={e => store.updatePack(pack.id, { enabled: e.target.checked })} /><span className="break-words">{pack.name} · {pack.events.length} 条</span></label>
            <button className={control} onClick={() => download(pack)}>导出</button>
          </div>
          <p className="text-fs-muted">显示范围：{pack.target === "all-assets" ? "所有资产" : pack.symbols?.join("、")}</p>
          <details className="mt-2"><summary className="min-h-9 cursor-pointer leading-9 text-fs-muted">文件选项</summary><div className="flex flex-wrap items-center gap-2 py-1">
            <label className="flex min-h-10 items-center gap-2">标记颜色<input aria-label={`${pack.name} 默认颜色`} type="color" value={pack.color || "#7C3AED"} onChange={e => store.updatePack(pack.id, { color: e.target.value })} /></label>
            <button className={control} onClick={() => store.updatePack(pack.id, { color: undefined })}>恢复配色</button>
            <button className={control} onClick={() => { download(pack); store.deletePack(pack.id); }}>删除并备份</button>
          </div></details>
        </div>)}
      </section>}
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-fs-border pt-3">
        <legend className="font-medium">显示方式</legend>
        <label className="flex items-center gap-2">排列<select aria-label="事件视图" value={filters.viewMode || "timeline"} onChange={e => patch({ viewMode: e.target.value as EventViewFilterState["viewMode"] })} className={control}><option value="timeline">时间线</option><option value="cards">卡片</option><option value="list">列表</option></select></label>
        <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={filters.showLabel} onChange={e => patch({ showLabel: e.target.checked })} />K 线标记显示文字</label>
      </fieldset>
      <details className="border-t border-fs-border pt-2"><summary className="min-h-10 cursor-pointer leading-10 text-fs-muted">更多设置</summary>
        <div className="space-y-3 py-2">
          {source === "system" ? <div className="flex flex-wrap items-center gap-2"><label>事件关联 <select aria-label="资产关联范围" value={filters.relationMode || ""} onChange={e => patch({ relationMode: e.target.value as EventViewFilterState["relationMode"] || undefined })} className={control}><option value="">按资产默认</option><option value="asset">直接关联</option><option value="industry">包含同行业</option><option value="macro">包含宏观事件</option></select></label>{onReset && <button className={control} onClick={onReset}>恢复资产默认</button>}</div> : <>
            <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={filters.includeLocal !== false} onChange={e => patch({ includeLocal: e.target.checked })} />启用用户事件来源</label>
            <label className="flex flex-wrap items-center gap-2">导入时显示范围<select aria-label="本地事件导入范围" value={target} onChange={e => onTargetChange(e.target.value as typeof target)} className={control}><option value="file">按文件设置</option><option value="all-assets">所有资产</option><option value="symbol">当前资产</option></select></label>
            <button className={control} onClick={() => store.importEvents(loadDemoMilestones("TSLA"), "symbol", { id: "tsla-demo", name: "TSLA 示例", symbols: ["TSLA"] })}>载入 TSLA 示例</button>
          </>}
          <div className="flex flex-wrap items-center gap-2"><label>按类型配色 <select aria-label="配色事件类型" value={type} onChange={e => setType(e.target.value)} className={control}>{EVENT_TYPE_CODES.map(t => <option key={t} value={t}>{eventTypeLabel(t)}</option>)}</select></label><input type="color" aria-label="类型颜色" value={filters.typeColors?.[type] || "#475569"} onChange={e => patch({ typeColors: { ...filters.typeColors, [type]: e.target.value } })} /><button className={control} onClick={() => { const next = { ...filters.typeColors }; delete next[type]; patch({ typeColors: next }); }}>恢复类型颜色</button></div>
          {selected && <div className="flex flex-wrap items-center gap-2"><span className="w-full break-words">选中事件：{selected.title}</span><input type="color" aria-label="选中事件颜色" value={filters.eventColors?.[eventIdentity(selected)] || selected.color || "#475569"} onChange={e => patch({ eventColors: { ...filters.eventColors, [eventIdentity(selected)]: e.target.value } })} /><button className={control} onClick={() => { const next = { ...filters.eventColors }; delete next[eventIdentity(selected)]; patch({ eventColors: next }); }}>恢复事件颜色</button><label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={!filters.hiddenMarkerIds?.includes(eventIdentity(selected))} onChange={e => patch({ hiddenMarkerIds: e.target.checked ? filters.hiddenMarkerIds?.filter(id => id !== eventIdentity(selected)) : [...(filters.hiddenMarkerIds || []), eventIdentity(selected)] })} />此事件显示在 K 线</label></div>}
          <p className="text-fs-muted">设置只影响当前这一类事件，另一类保持不变。</p>
        </div>
      </details>
    </div>
  </EventSettingsDialog>;
}
