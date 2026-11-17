"use client";

import { useMemo, useState } from "react";
import { columnHeader } from "@/lib/equity/stockData/display";
import type { StockDataTemplate } from "@/lib/equity/stockData/templates";
import { useTr } from "@/i18n/TextProvider";

type Props = {
  system: StockDataTemplate[];
  mine: StockDataTemplate[] | null;
  loadError: string;
  /** withStocks：模板里存了股票时，连同股票一起替换 */
  onApply: (t: StockDataTemplate, withStocks: boolean) => void;
  onDelete: (t: StockDataTemplate) => void;
};

/** 左上「模板」标签：系统模板与我的模板。应用模板会替换当前所有列 */
export function TemplatePanel({ system, mine, loadError, onApply, onDelete }: Props) {
  const tr = useTr();
  const [open, setOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const summary = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of [...system, ...(mine ?? [])]) {
      const names = [...new Set(t.columns.map((c) => columnHeader(c).label))];
      m.set(
        t.id,
        tr("{length} 列：{v1}{v2}", {
          length: t.columns.length,
          v1: names.slice(0, 6).join("、"),
          v2: names.length > 6 ? tr(" 等") : "",
        }),
      );
    }
    return m;
  }, [system, mine, tr]);

  const item = (t: StockDataTemplate) => {
    const expanded = open === t.id;
    return (
      <li key={t.id} className="border-b border-fs-border last:border-b-0">
        <button type="button" onClick={() => setOpen(expanded ? null : t.id)} aria-expanded={expanded} className="flex min-h-10 md:min-h-8 w-full items-center gap-2 px-3 text-left text-sm md:text-xs hover:bg-fs-elevated">
          <span className="min-w-0 flex-1 truncate">{tr(t.name)}</span>
          <span className="shrink-0 text-xs text-fs-muted">{t.columns.length} {tr("列")}{t.symbols?.length ? tr(" · {length} 只", { length: t.symbols.length }) : ""}</span>
        </button>
        {expanded ? (
          <div className="space-y-2 px-3 pb-3 text-xs">
            <p className="text-fs-muted">{summary.get(t.id)}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onApply(t, false)} className="min-h-9 md:min-h-7 rounded-lg bg-fs-accent px-3 text-white">{tr("应用列")}</button>
              {t.symbols?.length ? (
                <button type="button" onClick={() => onApply(t, true)} className="min-h-9 md:min-h-7 rounded-lg border border-fs-border px-3">{tr("连同股票应用")}</button>
              ) : null}
              {!t.system ? (
                confirmDelete === t.id ? (
                  <>
                    <button type="button" onClick={() => { onDelete(t); setConfirmDelete(null); }} className="min-h-9 md:min-h-7 rounded-lg border border-fs-border px-3 text-fs-accent">{tr("确认删除")}</button>
                    <button type="button" onClick={() => setConfirmDelete(null)} className="min-h-9 md:min-h-7 rounded-lg px-3">{tr("取消")}</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(t.id)} className="min-h-9 md:min-h-7 rounded-lg px-3 text-fs-muted">{tr("删除")}</button>
                )
              ) : null}
            </div>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="px-3 pt-2 text-xs text-fs-muted">{tr("应用模板会替换表格里现有的列。")}</p>
      <h3 className="px-3 pb-1 pt-3 text-xs font-semibold text-fs-muted">{tr("系统模板")}</h3>
      <ul>{system.map(item)}</ul>
      <h3 className="px-3 pb-1 pt-4 text-xs font-semibold text-fs-muted">{tr("我的模板")}</h3>
      {loadError ? <p className="px-3 text-xs text-fs-muted">{loadError}</p> : null}
      {mine == null && !loadError ? <p className="px-3 text-xs text-fs-muted">{tr("加载中…")}</p> : null}
      {mine?.length === 0 ? <p className="px-3 text-xs text-fs-muted">{tr("还没有模板。配好列之后，点工具条里的「保存模板」。")}</p> : null}
      {mine?.length ? <ul>{mine.map(item)}</ul> : null}
    </div>
  );
}
