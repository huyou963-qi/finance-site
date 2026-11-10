"use client";
import { useEffect, useId, useRef, useState } from "react";
import { DRAWING_GROUPS, drawingLabel, drawingPoints, updateDrawingPoint, type DrawingTool, type MarketDrawing } from "@/lib/chart/marketDrawings";
import { createPortal } from "react-dom";
import { randomUUID } from "@/lib/randomId";
import { useTr } from "@/i18n/TextProvider";
type Props = {
  tool: DrawingTool; onTool: (tool: DrawingTool) => void; drawings: MarketDrawing[];
  selectedId: string | null; onSelect: (id: string | null) => void;
  onChange: (next: MarketDrawing[] | ((d: MarketDrawing[]) => MarketDrawing[])) => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  ready: boolean; status: string; conflict: boolean; resolveConflict: (merge: boolean) => Promise<void>; retry: () => void;
  magnet: boolean; onMagnet: (value: boolean) => void; text: string; onText: (value: string) => void;
};
const button = "min-h-9 rounded border border-fs-border px-2 text-xs text-fs-secondary hover:bg-fs-elevated disabled:opacity-40";
export function MarketDrawingToolbar(p: Props) {
  const tr = useTr();
  const [open, setOpen] = useState(false), [tab, setTab] = useState<"tools" | "objects" | "settings">("tools");
  const [clearConfirm, setClearConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelId = useId();
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect || window.innerWidth < 640) { setPanelStyle({}); return; }
      const top = Math.min(rect.bottom + 8, window.innerHeight - 160);
      setPanelStyle({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 388)), top, bottom: "auto", width: 380, maxHeight: Math.min(window.innerHeight * 0.7, window.innerHeight - top - 12) });
    };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  const selected = p.drawings.find(d => d.id === p.selectedId);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [open]);
  const patch = (id: string, change: Partial<MarketDrawing>) => p.onChange(ds => ds.map(d => d.id === id ? { ...d, ...change } as MarketDrawing : d));
  function edit(d: MarketDrawing) { p.onSelect(d.id); p.onTool("cursor"); setTab("settings"); setOpen(true); }
  const drawingControls = <>
    <button className={button} onClick={p.undo} disabled={!p.ready || !p.canUndo} title={tr("撤销 Ctrl/⌘ Z")} aria-label={tr("撤销画图")}>↶</button>
    <button className={button} onClick={p.redo} disabled={!p.ready || !p.canRedo} title={tr("重做 Ctrl/⌘ Shift Z")} aria-label={tr("重做画图")}>↷</button>
    <button className={`${button} ${p.magnet ? "text-fs-accent-text bg-fs-accent-soft" : ""}`} onClick={() => p.onMagnet(!p.magnet)} aria-pressed={p.magnet} title={tr("接近 K 线开高低收 8 像素时吸附；拖动时按 Alt 暂时关闭")}>{tr("磁吸")}</button>
    <button className={button} onClick={() => { setTab("objects"); setOpen(true); }}>{tr("对象")} {p.drawings.length}</button>
    {selected && <button className={button} onClick={() => edit(selected)}>{tr("编辑所选")}</button>}
  </>;
  return <div ref={ref} className="relative flex shrink-0 items-center gap-1" aria-label={tr("画图工作台")}>
    <button className={`h-7 shrink-0 whitespace-nowrap rounded border border-fs-border px-2 text-[11px] text-fs-secondary md:min-h-9 md:text-xs ${open ? "bg-fs-accent-soft text-fs-accent-text" : ""}`} onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls={panelId} aria-label={tr("画图工具：{v0}", { v0: drawingLabel(p.tool) })}><span className="md:hidden">{tr("画图 ▾")}</span><span className="hidden md:inline">{tr("画图 ·")} {drawingLabel(p.tool)} ▾</span></button>
    <div className="hidden items-center gap-1 md:flex">{drawingControls}</div>
    {open && createPortal(<section ref={panelRef} style={panelStyle} id={panelId} aria-label={tr("高级画图工具")} className="fixed inset-x-2 bottom-16 z-[110] max-h-[70dvh] overflow-y-auto rounded-xl border border-fs-border bg-fs-bg p-3 text-fs-text shadow-2xl sm:inset-x-auto">
      <header className="mb-3 flex items-center justify-between"><strong className="text-sm">{tr("画图工作台")}</strong><button className={button} onClick={() => setOpen(false)} aria-label={tr("关闭画图面板")}>✕</button></header>
      <div className="mb-2 flex flex-wrap items-center gap-1 md:hidden">{drawingControls}</div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
    {!p.status.startsWith("游客") && <span role="status" className="text-[10px] text-fs-muted">{p.status}</span>}
    <button className="min-h-8 px-1 text-[10px] text-fs-accent-text" onClick={p.retry}>{tr("重试／同步")}</button>
    {p.conflict && <div className="flex w-full flex-wrap items-center gap-2 text-xs text-fs-negative"><span>{tr("同步冲突：本地草稿保留")}</span><button className={button} onClick={() => void p.resolveConflict(true)}>{tr("合并并保留双方图形")}</button><button className={button} onClick={() => void p.resolveConflict(false)}>{tr("采用云端版本")}</button></div>}
      </div>
      <nav className="mb-3 flex gap-1" aria-label={tr("画图面板栏目")}>{([['tools', tr("工具")], ['objects', tr("对象管理")], ['settings', tr("图形设置")]] as const).map(([id, title]) => <button key={id} className={`${button} flex-1 ${tab === id ? "bg-fs-accent-soft text-fs-accent-text" : ""}`} onClick={() => setTab(id)} aria-pressed={tab === id}>{title}</button>)}</nav>
      {tab === "tools" && <div className="space-y-3">
        <button className={`${button} w-full`} onClick={() => { p.onTool("cursor"); setOpen(false); }}>{tr("十字光标／选择图形")}</button>
        {DRAWING_GROUPS.map(group => <div key={group.label}><h3 className="mb-1 text-[11px] text-fs-muted">{group.label}</h3><div className="grid grid-cols-2 gap-1">{group.tools.map(t => <button key={t.id} className={`${button} flex items-center gap-2 text-left ${p.tool === t.id ? "bg-fs-accent-soft text-fs-accent-text" : ""}`} disabled={!p.ready} onClick={() => { p.onTool(t.id); p.onSelect(null); setOpen(false); }}><span className="w-6 text-center text-lg">{t.icon}</span>{t.label}</button>)}</div></div>)}
        <label className="block text-xs">{tr("新标注文字")}<input className="mt-1 w-full rounded border border-fs-border bg-fs-elevated p-2" value={p.text} maxLength={500} onChange={e => p.onText(e.target.value)} /></label>
        <p className="text-[11px] leading-5 text-fs-muted">{tr("线段连接两点，直线向两端延伸，射线单向延伸。依次点击定点；通道第三点确定宽度，仓位依次设置入场、目标、止损。完成后自动进入选择模式。选中图形可拖动圆形锚点，Esc 取消草稿，Delete 删除。")}</p>
      </div>}
      {tab === "objects" && <div className="space-y-2">
        <div className="flex gap-1"><button className={button} disabled={!p.ready || !p.drawings.length} onClick={() => p.onChange(ds => ds.map(d => ({ ...d, hidden: !ds.every(x => x.hidden) })))}>{p.drawings.every(d => d.hidden) ? tr("显示全部") : tr("隐藏全部")}</button><button className={button} disabled={!p.ready || !p.drawings.length} onClick={() => p.onChange(ds => ds.map(d => ({ ...d, locked: !ds.every(x => x.locked) })))}>{p.drawings.every(d => d.locked) ? tr("解锁全部") : tr("锁定全部")}</button><button className={button} disabled={!p.drawings.some(d => !d.locked)} onClick={() => setClearConfirm(true)}>{tr("清空")}</button></div>
        {clearConfirm && <div className="rounded border border-fs-border p-2 text-xs">{tr("清空当前标的的未锁定图形？可用撤销恢复。")}<div className="mt-2 flex gap-2"><button className={button} onClick={() => { p.onChange(ds => ds.filter(d => d.locked)); p.onSelect(null); setClearConfirm(false); }}>{tr("确认清空")}</button><button className={button} onClick={() => setClearConfirm(false)}>{tr("取消")}</button></div></div>}
        {!p.drawings.length && <p className="py-5 text-center text-xs text-fs-muted">{tr("暂无图形，选择工具开始分析")}</p>}
        {[...p.drawings].reverse().map(d => <div key={d.id} className={`flex items-center gap-1 rounded border p-1 ${p.selectedId === d.id ? "border-fs-accent bg-fs-accent-soft" : "border-fs-border"}`}><button className="min-h-9 min-w-0 flex-1 truncate px-1 text-left text-xs" onClick={() => edit(d)}>{d.name || (d.kind === "text" ? d.text : drawingLabel(d.kind))}</button><button className={button} onClick={() => patch(d.id, { hidden: !d.hidden })} aria-label={`${d.hidden ? tr("显示") : tr("隐藏")}${drawingLabel(d.kind)}`}>{d.hidden ? tr("显示") : tr("隐藏")}</button><button className={button} onClick={() => patch(d.id, { locked: !d.locked })}>{d.locked ? tr("解锁") : tr("锁定")}</button><button className={button} disabled={d.locked} onClick={() => p.onChange(ds => ds.filter(x => x.id !== d.id))} aria-label={tr("删除{v0}", { v0: drawingLabel(d.kind) })}>×</button></div>)}
      </div>}
      {tab === "settings" && (selected ? <div key={selected.id} className="space-y-3 text-xs">
        <label className="block">{tr("名称")}<input className="mt-1 w-full rounded border border-fs-border bg-fs-elevated p-2" defaultValue={selected.name ?? drawingLabel(selected.kind)} maxLength={80} disabled={selected.locked} onBlur={e => patch(selected.id, { name: e.target.value })}/></label>
        <div className="flex flex-wrap items-center gap-2"><label>{tr("颜色")} <input aria-label={tr("图形颜色")} type="color" value={selected.color?.startsWith("#") ? selected.color : "#38bdf8"} disabled={selected.locked} onChange={e => patch(selected.id, { color: e.target.value })}/></label><label>{tr("线宽")} <select aria-label={tr("图形线宽")} className={button} value={selected.lineWidth ?? 2} disabled={selected.locked} onChange={e => patch(selected.id, { lineWidth: Number(e.target.value) })}>{[1,2,3,4].map(n => <option key={n}>{n}</option>)}</select></label><label>{tr("线型")} <select aria-label={tr("图形线型")} className={button} value={selected.dash ?? "solid"} disabled={selected.locked} onChange={e => patch(selected.id, { dash: e.target.value as MarketDrawing["dash"] })}><option value="solid">{tr("实线")}</option><option value="dashed">{tr("虚线")}</option><option value="dotted">{tr("点线")}</option></select></label></div>
        {selected.kind === "text" && <label className="block">{tr("标注内容")}<textarea aria-label={tr("标注内容")} className="mt-1 w-full rounded border border-fs-border p-2" defaultValue={selected.text} maxLength={500} disabled={selected.locked} onBlur={e => { if (e.target.value.trim()) patch(selected.id, { text: e.target.value }); }}/></label>}
        <p className="text-fs-muted">{tr("坐标按 UTC 时间保存；锁定后可查看但不能编辑或删除。")}</p>
        {selected.kind === "hline" ? <label className="block">{tr("价格")}<input aria-label={tr("水平线价格")} type="number" step="any" defaultValue={selected.price} disabled={selected.locked} className="ml-2 w-40 rounded border border-fs-border p-2" onBlur={e => { const value = Number(e.target.value); if (e.target.value && Number.isFinite(value)) patch(selected.id, { price: value }); }}/></label> : drawingPoints(selected).map((point, index) => <div key={`${index}-${point.t}-${point.p}`} className="flex flex-wrap gap-2"><span className="w-full text-fs-muted">{tr("锚点")} {index + 1}</span><input aria-label={tr("锚点{v0} UTC时间", { v0: index + 1 })} type="datetime-local" defaultValue={new Date(point.t * 1000).toISOString().slice(0,16)} disabled={selected.locked} className="min-w-0 rounded border border-fs-border bg-fs-elevated p-2" onBlur={e => { const t = Date.parse(`${e.target.value}Z`) / 1000; if (Number.isFinite(t)) p.onChange(ds => ds.map(d => d.id === selected.id ? updateDrawingPoint(d, index, { ...point, t }) : d)); }}/>{selected.kind !== "vline" && <input aria-label={tr("锚点{v0}价格", { v0: index + 1 })} type="number" step="any" defaultValue={point.p} disabled={selected.locked} className="w-28 rounded border border-fs-border bg-fs-elevated p-2" onBlur={e => { const value = Number(e.target.value); if (e.target.value && Number.isFinite(value)) p.onChange(ds => ds.map(d => d.id === selected.id ? updateDrawingPoint(d, index, { ...point, p: value }) : d)); }}/>}</div>)}
        <div className="flex gap-2"><button className={button} onClick={() => patch(selected.id, { locked: !selected.locked })}>{selected.locked ? tr("解锁") : tr("锁定")}</button><button className={button} onClick={() => { const id = randomUUID(); p.onChange(ds => [...ds, { ...selected, id, locked: false, name: tr("{v0} 副本", { v0: selected.name ?? drawingLabel(selected.kind) }).slice(0,80) }]); p.onSelect(id); }}>{tr("复制")}</button><button className={button} disabled={selected.locked} onClick={() => { p.onChange(ds => ds.filter(d => d.id !== selected.id)); p.onSelect(null); }}>{tr("删除")}</button></div>
      </div> : <p className="py-5 text-center text-xs text-fs-muted">{tr("先点击图形，或在对象管理中选择图形")}</p>)}
    </section>, document.body)}
  </div>;
}
