"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { randomUUID } from "@/lib/randomId";
import { buildCsv, sortRows, type SortState } from "@/lib/equity/stockData/display";
import { getIndicator, INDICATORS, normalizeParams, publicIndicator } from "@/lib/equity/stockData/indicatorRegistry";
import { normalizeUsTicker } from "@/lib/equity/stockData/request";
import {
  MAX_COLUMNS,
  MAX_SYMBOLS,
  type ColumnParams,
  type ColumnSpec,
  type IndicatorDef,
  type StockDataResponse,
  type StockDataRow,
} from "@/lib/equity/stockData/types";
import { DataGrid } from "./DataGrid";
import { IndicatorPanel } from "./IndicatorPanel";
import { ParamEditor } from "./ParamEditor";
import { StockPoolPanel, type PickedStock } from "./StockPoolPanel";

type Draft = { stocks: PickedStock[]; columns: ColumnSpec[] };
type Editor = { mode: "add"; defs: IndicatorDef[] } | { mode: "edit"; keys: string[] };
type MobileTab = "stocks" | "indicators" | "table";

const DRAFT_KEY = "gekko.stockData.draft.v1";
const PUBLIC_INDICATORS = INDICATORS.map(publicIndicator);
const newKey = () => randomUUID().slice(0, 8);

const col = (indicatorId: string): ColumnSpec => ({
  key: newKey(),
  indicatorId,
  params: normalizeParams(getIndicator(indicatorId)!, {}),
});

/** 首次打开时的示例列：行业、规模、增长、盈利 */
function defaultColumns(): ColumnSpec[] {
  return ["sec.gicsSector", "sec.marketCap", "fs.revenue", "growth.revenueYoY", "fs.netIncome", "fs.grossMargin", "ratio.roeTtm"].map(col);
}

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!Array.isArray(d.stocks) || !Array.isArray(d.columns)) return null;
    return {
      stocks: d.stocks.filter((s) => typeof s?.symbol === "string").slice(0, MAX_SYMBOLS),
      columns: d.columns.filter((c) => typeof c?.key === "string" && getIndicator(c.indicatorId)).slice(0, MAX_COLUMNS),
    };
  } catch {
    return null;
  }
}

function writeDraft(d: Draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* 隐私模式等：只是不保存草稿 */ }
}

export function StockDataWorkspace() {
  const [draft, setDraft] = useState<Draft>({ stocks: [], columns: [] });
  const [restored, setRestored] = useState(false);
  const [result, setResult] = useState<StockDataResponse | null>(null);
  const [fetchedKey, setFetchedKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ text: string; needsPro?: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const [toast, setToast] = useState<{ text: string; goTable?: boolean } | null>(null);
  const [sort, setSort] = useState<SortState>(null);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("table");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const draftKey = JSON.stringify([draft.stocks.map((s) => s.symbol), draft.columns]);
  const stale = !!result && fetchedKey !== draftKey;

  const showToast = useCallback((text: string, goTable = false) => {
    setToast({ text, goTable });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchData = useCallback(async (d: Draft) => {
    if (!d.stocks.length || !d.columns.length) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/equity/stock-data/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: d.stocks.map((s) => s.symbol), columns: d.columns }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError({ text: j.error || "取数失败", needsPro: j.code === "NEEDS_PRO" });
        return;
      }
      const res = j as StockDataResponse;
      let next = d;
      if (res.ignored.length) {
        const ignored = new Set(res.ignored.map((s) => normalizeUsTicker(s) ?? s));
        next = { ...d, stocks: d.stocks.filter((s) => !ignored.has(s.symbol)) };
        setNotice(`已忽略 ${res.ignored.length} 只非美股标的：${res.ignored.slice(0, 8).join("、")}${res.ignored.length > 8 ? " 等" : ""}`);
        setDraft(next);
      }
      setResult(res);
      setFetchedKey(JSON.stringify([next.stocks.map((s) => s.symbol), next.columns]));
    } catch {
      setError({ text: "网络异常，请稍后重试" });
    } finally {
      setLoading(false);
    }
  }, []);

  // 恢复上次的草稿（刷新不丢），有股票和列时自动取一次数
  useEffect(() => {
    const saved = readDraft();
    const d = saved && (saved.stocks.length || saved.columns.length) ? saved : { stocks: [], columns: defaultColumns() };
    setDraft(d);
    setRestored(true);
    if (d.stocks.length && d.columns.length) void fetchData(d);
  }, [fetchData]);
  useEffect(() => { if (restored) writeDraft(draft); }, [draft, restored]);

  // ---------- 股票 ----------
  const inTable = useMemo(() => new Set(draft.stocks.map((s) => s.symbol)), [draft.stocks]);

  const addStocks = (picked: PickedStock[]) => {
    const rejected: string[] = [];
    const fresh: PickedStock[] = [];
    for (const p of picked) {
      const symbol = normalizeUsTicker(p.symbol);
      if (!symbol) { rejected.push(p.symbol); continue; }
      if (inTable.has(symbol) || fresh.some((f) => f.symbol === symbol)) continue;
      fresh.push({ symbol, name: p.name });
    }
    const room = MAX_SYMBOLS - draft.stocks.length;
    const added = fresh.slice(0, Math.max(0, room));
    const overflow = fresh.length - added.length;
    if (added.length) setDraft((d) => ({ ...d, stocks: [...d.stocks, ...added] }));
    const parts: string[] = [];
    if (added.length) parts.push(`已加入 ${added.length} 只`);
    else if (!overflow && !rejected.length) parts.push("已在表格中");
    if (overflow) parts.push(`超出 ${MAX_SYMBOLS} 只上限，${overflow} 只未加入`);
    if (rejected.length) parts.push(`已忽略 ${rejected.length} 只非美股标的`);
    showToast(parts.join("；"), added.length > 0);
  };

  // ---------- 列 ----------
  const insertColumns = (defs: IndicatorDef[], params: ColumnParams) => {
    const room = MAX_COLUMNS - draft.columns.length;
    if (room <= 0) { showToast(`单次最多 ${MAX_COLUMNS} 列，请先删除部分列`); return; }
    const cols = defs.slice(0, room).map((d) => ({ key: newKey(), indicatorId: d.id, params: normalizeParams(d, params) }));
    setDraft((d) => ({ ...d, columns: [...d.columns, ...cols] }));
    const skipped = defs.length - cols.length;
    showToast(`已加入第 ${draft.columns.length + 1}${cols.length > 1 ? `–${draft.columns.length + cols.length}` : ""} 列${skipped ? `；超出上限，${skipped} 个未加入` : ""}`, true);
  };

  const addIndicators = (defs: IndicatorDef[]) => {
    if (!defs.length) return;
    if (defs.every((d) => !d.params.length)) insertColumns(defs, {});
    else setEditor({ mode: "add", defs });
  };

  const addIndicatorIds = (ids: string[]) =>
    addIndicators(ids.map((id) => PUBLIC_INDICATORS.find((d) => d.id === id)).filter((d): d is IndicatorDef => !!d));

  const editableSelected = draft.columns.filter((c) => selectedCols.has(c.key) && getIndicator(c.indicatorId)?.params.length);

  const confirmEditor = (params: ColumnParams) => {
    if (!editor) return;
    if (editor.mode === "add") insertColumns(editor.defs, params);
    else {
      const keys = new Set(editor.keys);
      setDraft((d) => ({
        ...d,
        columns: d.columns.map((c) => (keys.has(c.key) ? { ...c, params: normalizeParams(getIndicator(c.indicatorId)!, params) } : c)),
      }));
    }
    setEditor(null);
  };

  const editorDefs = editor
    ? editor.mode === "add"
      ? editor.defs
      : editor.keys.map((k) => draft.columns.find((c) => c.key === k)).filter((c): c is ColumnSpec => !!c).map((c) => publicIndicator(getIndicator(c.indicatorId)!))
    : [];
  const editorInitial: ColumnParams = editor?.mode === "edit" ? draft.columns.find((c) => c.key === editor.keys[0])?.params ?? {} : {};

  // ---------- 选择、删除、排序 ----------
  const toggleIn = (set: Set<string>, key: string, multi: boolean) => {
    if (!multi) return set.has(key) && set.size === 1 ? new Set<string>() : new Set([key]);
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const deleteColumns = () => {
    setDraft((d) => ({ ...d, columns: d.columns.filter((c) => !selectedCols.has(c.key)) }));
    if (sort && selectedCols.has(sort.key)) setSort(null);
    setSelectedCols(new Set());
  };
  const deleteRows = () => {
    setDraft((d) => ({ ...d, stocks: d.stocks.filter((s) => !selectedRows.has(s.symbol)) }));
    setSelectedRows(new Set());
  };
  const clearAll = () => {
    setDraft((d) => ({ ...d, stocks: [] }));
    setSelectedRows(new Set());
    setResult(null);
  };
  const onSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: key.startsWith("$") ? "asc" : "desc" } : s.dir === "desc" ? { key, dir: "asc" } : s.dir === "asc" && key.startsWith("$") ? { key, dir: "desc" } : null));

  // 表格行：按草稿顺序，取回的结果按代码对应；尚未取数的新股票先显示空行
  const byResult = useMemo(() => new Map((result?.rows ?? []).map((r) => [r.symbol, r])), [result]);
  const rows: StockDataRow[] = useMemo(
    () => sortRows(draft.stocks.map((s) => byResult.get(s.symbol) ?? { symbol: s.symbol, name: s.name, cells: {} }), sort),
    [draft.stocks, byResult, sort],
  );

  const exportCsv = () => {
    const blob = new Blob([buildCsv(rows, draft.columns)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `股票数据-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canFetch = draft.stocks.length > 0 && draft.columns.length > 0 && !loading;
  const canExport = !!result && !stale && rows.length > 0;

  const actions = [
    { label: "修改参数", run: () => setEditor({ mode: "edit", keys: editableSelected.map((c) => c.key) }), disabled: !editableSelected.length },
    { label: "删除列", run: deleteColumns, disabled: !selectedCols.size },
    { label: "删除行", run: deleteRows, disabled: !selectedRows.size },
    { label: "清空股票", run: clearAll, disabled: !draft.stocks.length },
    { label: "导出 CSV", run: exportCsv, disabled: !canExport },
  ];

  const tableArea = (
    <div className="flex min-h-0 flex-1 flex-col">
      {error ? (
        <div role="alert" className="m-3 rounded-lg border border-fs-border bg-fs-elevated px-3 py-2 text-sm">
          {error.text}
          {error.needsPro ? <Link href="/pricing" className="ml-3 text-fs-accent">了解 Pro 会员</Link> : null}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="mx-3 mt-3 flex items-start gap-3 rounded-lg border border-fs-border bg-fs-elevated px-3 py-2 text-sm text-fs-muted">
          <span className="min-w-0 flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="关闭提示" className="shrink-0">✕</button>
        </div>
      ) : null}
      {!draft.stocks.length || !draft.columns.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-fs-muted">
          <p className="text-base text-fs-text">{!draft.stocks.length ? "先选股票" : "再选指标"}</p>
          <p>{!draft.stocks.length ? "从自选股、系统股票池或搜索框加入美股，最多 50 只。" : "在指标目录里双击，或拖到这里，最多 50 列。"}</p>
          <div className="mt-2 flex gap-2 md:hidden">
            <button type="button" onClick={() => setMobileTab(!draft.stocks.length ? "stocks" : "indicators")} className="min-h-10 rounded-lg bg-fs-accent px-4 text-white">
              {!draft.stocks.length ? "去选股票" : "去选指标"}
            </button>
          </div>
        </div>
      ) : (
        <DataGrid
          rows={rows}
          columns={draft.columns}
          sort={sort}
          onSort={onSort}
          selectedCols={selectedCols}
          selectedRows={selectedRows}
          onSelectCol={(k, multi) => setSelectedCols((s) => toggleIn(s, k, multi))}
          onSelectRow={(sym, multi) => setSelectedRows((s) => toggleIn(s, sym, multi))}
          onEditCol={(k) => setEditor({ mode: "edit", keys: selectedCols.has(k) && editableSelected.length > 1 ? editableSelected.map((c) => c.key) : [k] })}
          onDropIndicators={addIndicatorIds}
          loading={loading || !result || stale}
        />
      )}
    </div>
  );

  return (
    <div className="flex min-h-[560px] flex-1 flex-col text-fs-text">
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-fs-border px-3 py-2 md:px-4">
        <h1 className="mr-2 text-base font-semibold">股票数据</h1>
        <button
          type="button"
          onClick={() => { void fetchData(draft); setMobileTab("table"); }}
          disabled={!canFetch}
          className="min-h-9 rounded-lg bg-fs-accent px-4 text-sm text-white disabled:opacity-40"
        >
          {loading ? "提取中…" : "提取数据"}
        </button>
        <div className="hidden flex-wrap items-center gap-1 md:flex">
          {actions.map((a) => (
            <button key={a.label} type="button" onClick={a.run} disabled={a.disabled} className="min-h-9 rounded-lg px-3 text-sm hover:bg-fs-elevated disabled:opacity-40">
              {a.label}
            </button>
          ))}
        </div>
        <details className="relative md:hidden">
          <summary className="flex min-h-9 cursor-pointer list-none items-center rounded-lg border border-fs-border px-3 text-sm" aria-label="更多操作">⋯</summary>
          <div className="absolute left-0 top-full z-40 mt-1 w-40 rounded-lg border border-fs-border bg-fs-bg py-1 shadow-lg">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                disabled={a.disabled}
                onClick={(e) => { a.run(); (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }}
                className="block min-h-10 w-full px-3 text-left text-sm hover:bg-fs-elevated disabled:opacity-40"
              >
                {a.label}
              </button>
            ))}
          </div>
        </details>
        <span className="ml-auto text-xs text-fs-muted">
          {draft.stocks.length}/{MAX_SYMBOLS} 只 · {draft.columns.length}/{MAX_COLUMNS} 列
          {stale ? <span className="ml-2 text-fs-accent">有未刷新的改动</span> : null}
        </span>
      </div>

      {/* 手机：三个标签 */}
      <div role="tablist" aria-label="股票数据视图" className="flex border-b border-fs-border md:hidden">
        {([["stocks", `股票 ${draft.stocks.length}`], ["indicators", `指标 ${draft.columns.length}`], ["table", "表格"]] as [MobileTab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mobileTab === id}
            onClick={() => setMobileTab(id)}
            className={`min-h-10 flex-1 text-sm ${mobileTab === id ? "border-b-2 border-fs-accent font-semibold" : "text-fs-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 电脑：左栏上下两块；手机：按标签只显示其一 */}
        <aside className={`min-h-0 w-full flex-col border-fs-border md:flex md:w-[300px] md:shrink-0 md:border-r ${mobileTab === "table" ? "hidden" : "flex"}`}>
          <div className={`min-h-0 flex-col md:flex md:flex-[3] md:border-b md:border-fs-border ${mobileTab === "indicators" ? "flex flex-1" : "hidden"}`}>
            <IndicatorPanel indicators={PUBLIC_INDICATORS} onAdd={addIndicators} />
          </div>
          <div className={`min-h-0 flex-col md:flex md:flex-[2] ${mobileTab === "stocks" ? "flex flex-1" : "hidden"}`}>
            <StockPoolPanel inTable={inTable} onAdd={addStocks} />
          </div>
        </aside>
        <section aria-label="数据表格" className={`min-h-0 min-w-0 flex-1 flex-col md:flex ${mobileTab === "table" ? "flex" : "hidden"}`}>
          {tableArea}
          <p className="border-t border-fs-border px-3 py-1.5 text-xs text-fs-muted">
            财务数据来自上市公司公开披露的定期报告，取最新修订值；报告期按公司财年。悬停单元格可看实际报告期与截止日。
          </p>
        </section>
      </div>

      {toast ? (
        <div role="status" className="fixed inset-x-4 bottom-4 z-[150] mx-auto flex max-w-md items-center gap-3 rounded-lg bg-fs-text px-4 py-3 text-sm text-white shadow-lg">
          <span className="min-w-0 flex-1">{toast.text}</span>
          {toast.goTable && mobileTab !== "table" ? (
            <button type="button" onClick={() => { setMobileTab("table"); setToast(null); }} className="shrink-0 font-semibold text-white underline md:hidden">去表格</button>
          ) : null}
        </div>
      ) : null}

      {editor ? (
        <ParamEditor
          title={editor.mode === "add" ? `加入 ${editorDefs.length} 列` : `修改 ${editorDefs.length} 列的参数`}
          indicators={editorDefs}
          initial={editorInitial}
          onConfirm={confirmEditor}
          onCancel={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}
