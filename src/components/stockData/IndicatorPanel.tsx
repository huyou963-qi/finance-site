"use client";

import { useMemo, useState } from "react";
import { buildIndicatorTree, type IndicatorTreeNode } from "@/lib/equity/stockData/indicatorRegistry";
import type { IndicatorDef } from "@/lib/equity/stockData/types";
import { useTr } from "@/i18n/TextProvider";

export const INDICATOR_DRAG_TYPE = "application/x-stock-data-indicators";

/** 常用别名：搜「毛利率」等也能命中报表科目，避免重复登记 ratio.* */
const SEARCH_ALIASES: Record<string, string[]> = {
  "fs.grossMargin": ["毛利率", "gross margin", "gm"],
  "fs.opMargin": ["营业利润率", "operating margin", "opm"],
  "fs.netMargin": ["净利率", "net margin"],
  "fs.ebitda": ["息税折旧摊销前利润", "ebitda"],
  "fs.fcf": ["自由现金流", "free cash flow"],
  "ratio.currentRatio": ["流动比率", "current ratio"],
  "ratio.interestCoverage": ["利息保障", "interest coverage"],
  "ratio.roeTtm": ["净资产收益率", "roe"],
  "ratio.roaTtm": ["总资产收益率", "roa"],
};

type Props = {
  indicators: readonly IndicatorDef[];
  /** 把选中的指标加入表格（有参数的会先弹出参数编辑） */
  onAdd: (defs: IndicatorDef[]) => void;
};

/**
 * 左上：指标目录。单击选中（Ctrl/⌘ 多选），双击或点「加入表格」加列，也可以把指标拖到表格上。
 * 有搜索词时改为平铺结果并显示所在路径。
 */
export function IndicatorPanel({ indicators, onAdd }: Props) {
  const tr = useTr();
  const tree = useMemo(() => buildIndicatorTree(indicators), [indicators]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set([tr("证券信息"), tr("财务报表"), tr("财务指标")]));
  const [selected, setSelected] = useState<string[]>([]);
  /** 触屏没有 Ctrl 键：打开后单击即多选 */
  const [multi, setMulti] = useState(false);
  const byId = useMemo(() => new Map(indicators.map((d) => [d.id, d])), [indicators]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      q
        ? indicators.filter((d) => {
            const aliases = SEARCH_ALIASES[d.id] ?? [];
            return (
              d.label.toLowerCase().includes(q) ||
              d.id.toLowerCase().includes(q) ||
              d.path.join(" ").toLowerCase().includes(q) ||
              aliases.some((a) => a.toLowerCase().includes(q) || q.includes(a.toLowerCase()))
            );
          })
        : [],
    [indicators, q],
  );

  const select = (id: string, multi: boolean) =>
    setSelected((prev) => (multi ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id]));
  const addIds = (ids: string[]) => {
    const defs = ids.map((id) => byId.get(id)).filter((d): d is IndicatorDef => !!d);
    if (defs.length) onAdd(defs);
  };
  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const leaf = (d: IndicatorDef, showPath: boolean) => {
    const active = selected.includes(d.id);
    return (
      <li key={d.id}>
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            const ids = active ? selected : [d.id];
            e.dataTransfer.setData(INDICATOR_DRAG_TYPE, JSON.stringify(ids));
            e.dataTransfer.effectAllowed = "copy";
          }}
          onClick={(e) => select(d.id, multi || e.ctrlKey || e.metaKey)}
          onDoubleClick={() => addIds(active && selected.length > 1 ? selected : [d.id])}
          title={d.note}
          aria-pressed={active}
          className={`flex min-h-8 md:min-h-6 w-full items-center gap-2 rounded px-2 text-left text-sm md:text-xs ${active ? "bg-fs-accent text-white" : "hover:bg-fs-elevated"}`}
        >
          <span className="truncate">{d.label}</span>
          {showPath ? <span className={`ml-auto shrink-0 truncate text-xs ${active ? "text-white/80" : "text-fs-muted"}`}>{d.path.slice(1).join(" › ") || d.path[0]}</span> : null}
        </button>
      </li>
    );
  };

  const branch = (node: IndicatorTreeNode, path: string, depth: number) => {
    const isOpen = open.has(path);
    return (
      <li key={path}>
        <button
          type="button"
          onClick={() => toggle(path)}
          aria-expanded={isOpen}
          className="flex min-h-8 md:min-h-6 w-full items-center gap-1 rounded px-1 text-left text-sm md:text-xs hover:bg-fs-elevated"
          style={{ fontWeight: depth === 0 ? 600 : 500 }}
        >
          <span aria-hidden className="inline-block w-4 text-center text-xs text-fs-muted">{isOpen ? "▾" : "▸"}</span>
          {node.label}
        </button>
        {isOpen ? (
          <ul className="ml-4 border-l border-fs-border pl-1">
            {node.children.map((c) => branch(c, `${path}/${c.label}`, depth + 1))}
            {node.indicators.map((d) => leaf(d, false))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <section aria-label={tr("指标")} className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pt-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr("搜索指标，如 营业收入、ROE")}
          title={tr("双击指标或拖到表格即可加列")}
          aria-label={tr("搜索指标")}
          className="min-h-9 md:min-h-7 w-full rounded-lg border border-fs-border bg-fs-elevated px-3 text-sm md:text-xs"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 md:py-1">
        {q ? (
          matches.length ? <ul>{matches.map((d) => leaf(d, true))}</ul> : <p className="px-2 py-6 text-center text-sm md:text-xs text-fs-muted">{tr("没有匹配的指标")}</p>
        ) : (
          <ul>{tree.children.map((c) => branch(c, c.label, 0))}</ul>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-fs-border px-3 py-2 md:py-1">
        <label className="flex min-h-9 md:min-h-7 items-center gap-1.5 text-xs text-fs-muted">
          <input type="checkbox" checked={multi} onChange={(e) => { setMulti(e.target.checked); if (!e.target.checked) setSelected((p) => p.slice(-1)); }} />{tr("多选")}{selected.length ? tr(" · 已选 {length} 个", { length: selected.length }) : ""}
        </label>
        <button
          type="button"
          disabled={!selected.length}
          onClick={() => addIds(selected)}
          className="min-h-9 md:min-h-7 rounded-lg bg-fs-accent px-3 text-sm md:text-xs text-white disabled:opacity-40"
        >{tr("加入表格")}</button>
      </div>
    </section>
  );
}
