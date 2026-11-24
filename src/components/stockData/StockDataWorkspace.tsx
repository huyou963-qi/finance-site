"use client";

import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useVisibleFeatures } from "@/hooks/useVisibleFeatures";
import { randomUUID } from "@/lib/randomId";
import { buildColumns, columnCountAfterEdit, editColumns, expandToGroups, multiPeriodCount } from "@/lib/equity/stockData/columns";
import { buildCsv, buildSheetData, formatCellValue, sortRows, type SortState } from "@/lib/equity/stockData/display";
import { computeGroupStats } from "@/lib/equity/stockData/groupStats";
import {
  clampLeftWidth,
  LEFT_WIDTH_DEFAULT,
  readLayoutPrefs,
  writeLayoutPrefs,
  type StockDataLayoutPrefs,
} from "@/lib/equity/stockData/layoutPrefs";
import { applyResultFilters, FILTER_OP_LABELS, type FilterOp, type ResultFilter } from "@/lib/equity/stockData/resultFilter";
import { systemTemplates, type StockDataTemplate } from "@/lib/equity/stockData/templates";
import { getIndicator, INDICATORS, normalizeParams, publicIndicator } from "@/lib/equity/stockData/indicatorRegistry";
import { normalizeUsTicker } from "@/lib/equity/stockData/request";
import {
  MAX_COLUMNS,
  MAX_SYMBOLS,
  type ColumnParams,
  type ColumnSpec,
  type IndicatorDef,
  type MultiPeriod,
  type StockDataResponse,
  type StockDataRow,
} from "@/lib/equity/stockData/types";
import { CellSeriesPanel } from "./CellSeriesPanel";
import { DataGrid } from "./DataGrid";
import { IndicatorPanel } from "./IndicatorPanel";
import { ParamEditor } from "./ParamEditor";
import { StockPoolPanel, type PickedStock } from "./StockPoolPanel";
import { TemplatePanel } from "./TemplatePanel";
import { useTr } from "@/i18n/TextProvider";

type Draft = { stocks: PickedStock[]; columns: ColumnSpec[] };
type Editor = { mode: "add"; defs: IndicatorDef[] } | { mode: "edit"; keys: string[] };
type MobileTab = "stocks" | "indicators" | "table";
type LeftTab = "indicators" | "templates";

const DRAFT_KEY = "gekko.stockData.draft.v1";
const PUBLIC_INDICATORS = INDICATORS.map(publicIndicator);
const newKey = () => randomUUID().slice(0, 8);
const SYSTEM_TEMPLATES = systemTemplates(newKey);

/** 取数签名：显示单位只影响显示，不算「有未刷新改动」 */
const fetchSignature = (symbols: string[], columns: ColumnSpec[]) =>
  JSON.stringify([symbols, columns.map((c) => ({ ...c, params: { ...c.params, scale: undefined } }))]);

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const tr = useTr();
  const features = useVisibleFeatures();
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
  const [leftTab, setLeftTab] = useState<LeftTab>("indicators");
  const [myTemplates, setMyTemplates] = useState<StockDataTemplate[] | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [saving, setSaving] = useState<{ name: string; withStocks: boolean; busy: boolean; error: string } | null>(null);
  const [filterDraft, setFilterDraft] = useState<ResultFilter>({ columnKey: "$symbol", op: "contains", value: "" });
  const [activeFilters, setActiveFilters] = useState<ResultFilter[]>([]);
  const [seriesTarget, setSeriesTarget] = useState<{ symbol: string; name: string; column: ColumnSpec } | null>(null);
  const [groupValueKey, setGroupValueKey] = useState("");
  const [layout, setLayout] = useState<StockDataLayoutPrefs>({
    leftWidthPx: LEFT_WIDTH_DEFAULT,
    colWidths: {},
    freezeIdentity: true,
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leftResize = useRef<{ startX: number; startW: number } | null>(null);
  const applySeq = useRef(0);
  const applyAbort = useRef<AbortController | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  const draftKey = fetchSignature(draft.stocks.map((s) => s.symbol), draft.columns);
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
        setError({ text: j.error || tr("取数失败"), needsPro: j.code === "NEEDS_PRO" });
        return;
      }
      const res = j as StockDataResponse;
      let next = d;
      if (res.ignored.length) {
        const ignored = new Set(res.ignored.map((s) => normalizeUsTicker(s) ?? s));
        next = { ...d, stocks: d.stocks.filter((s) => !ignored.has(s.symbol)) };
        setNotice(tr("已忽略 {length} 只非美股标的：{v1}{v2}", { length: res.ignored.length, v1: res.ignored.slice(0, 8).join("、"), v2: res.ignored.length > 8 ? tr(" 等") : "" }));
        setDraft(next);
      }
      setResult(res);
      setFetchedKey(fetchSignature(next.stocks.map((s) => s.symbol), next.columns));
    } catch {
      setError({ text: tr("网络异常，请稍后重试") });
    } finally {
      setLoading(false);
    }
  }, [tr]);

  // 恢复上次的草稿与布局（刷新不丢），有股票和列时自动取一次数
  useEffect(() => {
    const saved = readDraft();
    const d = saved && (saved.stocks.length || saved.columns.length) ? saved : { stocks: [], columns: defaultColumns() };
    setDraft(d);
    setLayout(readLayoutPrefs());
    setRestored(true);
    if (d.stocks.length && d.columns.length) void fetchData(d);
  }, [fetchData]);
  useEffect(() => { if (restored) writeDraft(draft); }, [draft, restored]);
  useEffect(() => { if (restored) writeLayoutPrefs(layout); }, [layout, restored]);

  const patchLayout = useCallback((patch: Partial<StockDataLayoutPrefs>) => {
    setLayout((prev) => ({ ...prev, ...patch, colWidths: patch.colWidths ?? prev.colWidths }));
  }, []);

  const onColWidthChange = useCallback((indicatorId: string, widthPx: number) => {
    setLayout((prev) => ({
      ...prev,
      colWidths: { ...prev.colWidths, [indicatorId]: widthPx },
    }));
  }, []);

  const startLeftResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    leftResize.current = { startX: e.clientX, startW: layout.leftWidthPx };
    const onMove = (ev: MouseEvent) => {
      const cur = leftResize.current;
      if (!cur) return;
      patchLayout({ leftWidthPx: clampLeftWidth(cur.startW + (ev.clientX - cur.startX)) });
    };
    const onUp = () => {
      leftResize.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const loadTemplates = useCallback(async () => {
    try {
      const r = await fetch("/api/equity/stock-data/templates");
      const j = await r.json();
      if (!r.ok) { setTemplateError(j.error || tr("无法读取模板")); return; }
      setTemplateError("");
      setMyTemplates(j.templates as StockDataTemplate[]);
    } catch {
      setTemplateError(tr("网络异常，模板未加载"));
    }
  }, [tr]);
  useEffect(() => { if (leftTab === "templates" && myTemplates == null) void loadTemplates(); }, [leftTab, myTemplates, loadTemplates]);

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
    if (added.length) parts.push(tr("已加入 {length} 只", { length: added.length }));
    else if (!overflow && !rejected.length) parts.push(tr("已在表格中"));
    if (overflow) parts.push(tr("超出 {MAX_SYMBOLS} 只上限，{overflow} 只未加入", { MAX_SYMBOLS, overflow }));
    if (rejected.length) parts.push(tr("已忽略 {length} 只非美股标的", { length: rejected.length }));
    showToast(parts.join("；"), added.length > 0);
  };

  // ---------- 列 ----------
  const insertColumns = (defs: IndicatorDef[], params: ColumnParams, multi?: MultiPeriod) => {
    const room = MAX_COLUMNS - draft.columns.length;
    if (room <= 0) { showToast(tr("单次最多 {MAX_COLUMNS} 列，请先删除部分列", { MAX_COLUMNS })); return; }
    const all = defs.flatMap((d) => buildColumns(d, params, multi, newKey));
    const cols = all.slice(0, room);
    setDraft((d) => ({ ...d, columns: [...d.columns, ...cols] }));
    const skipped = all.length - cols.length;
    showToast(tr("已加入第 {v0}{v1} 列{v2}", { v0: draft.columns.length + 1, v1: cols.length > 1 ? `–${draft.columns.length + cols.length}` : "", v2: skipped ? tr("；超出上限，{skipped} 列未加入", { skipped }) : "" }), true);
  };

  const addIndicators = (defs: IndicatorDef[]) => {
    if (!defs.length) return;
    if (defs.every((d) => !d.params.length)) insertColumns(defs, {});
    else setEditor({ mode: "add", defs });
  };

  const addIndicatorIds = (ids: string[]) =>
    addIndicators(ids.map((id) => PUBLIC_INDICATORS.find((d) => d.id === id)).filter((d): d is IndicatorDef => !!d));

  /** 有参数可改的选中列（多报告期的组自动扩到整组） */
  const editableSelected = useMemo(() => {
    const keys = new Set(expandToGroups(draft.columns, selectedCols));
    return draft.columns.filter((c) => keys.has(c.key) && getIndicator(c.indicatorId)?.params.length);
  }, [draft.columns, selectedCols]);

  const confirmEditor = (params: ColumnParams, multi: MultiPeriod | undefined) => {
    if (!editor) return;
    if (editor.mode === "add") insertColumns(editor.defs, params, multi);
    else setDraft((d) => ({ ...d, columns: editColumns(d.columns, editor.keys, params, multi, newKey) }));
    setEditor(null);
  };

  const totalColumnsFor = (multi: MultiPeriod | undefined) =>
    !editor
      ? draft.columns.length
      : editor.mode === "add"
        ? draft.columns.length + editor.defs.reduce((n, d) => n + (d.params.includes("period") ? multiPeriodCount(multi) : 1), 0)
        : columnCountAfterEdit(draft.columns, editor.keys, multi);

  const editorDefs = editor
    ? editor.mode === "add"
      ? editor.defs
      : [...new Set(editor.keys.map((k) => draft.columns.find((c) => c.key === k)?.indicatorId).filter((id): id is string => !!id))].map((id) => publicIndicator(getIndicator(id)!))
    : [];
  const editorFirst = editor?.mode === "edit" ? draft.columns.find((c) => c.key === editor.keys[0]) : undefined;
  const editorInitial: ColumnParams = editorFirst?.params ?? {};

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

  // 表格行：按草稿顺序，取回的结果按代码对应；尚未取数的新股票先显示空行；再套结果过滤
  const byResult = useMemo(() => new Map((result?.rows ?? []).map((r) => [r.symbol, r])), [result]);
  const rows: StockDataRow[] = useMemo(() => {
    const base = draft.stocks.map((s) => byResult.get(s.symbol) ?? { symbol: s.symbol, name: s.name, cells: {} });
    return sortRows(applyResultFilters(base, activeFilters), sort);
  }, [draft.stocks, byResult, sort, activeFilters]);

  const gicsColumnKey = useMemo(
    () => draft.columns.find((c) => c.indicatorId === "sec.gicsSector")?.key ?? "",
    [draft.columns],
  );
  const numericColumns = useMemo(
    () => draft.columns.filter((c) => {
      const u = getIndicator(c.indicatorId)?.unit;
      return u === "money" || u === "pct" || u === "multiple" || u === "number" || u === "perShare" || u === "shares";
    }),
    [draft.columns],
  );
  const groupStats = useMemo(() => {
    if (!gicsColumnKey || !groupValueKey) return [];
    return computeGroupStats(rows, gicsColumnKey, groupValueKey);
  }, [rows, gicsColumnKey, groupValueKey]);

  const fileStem = () => tr("股票数据-{v0}", { v0: new Date().toISOString().slice(0, 10) });
  const exportCsv = () => downloadBlob(new Blob([buildCsv(rows, draft.columns)], { type: "text/csv;charset=utf-8" }), `${fileStem()}.csv`);
  const exportXlsx = async () => {
    try {
      const XLSX = await import("xlsx");
      const { aoa, pctColumns } = buildSheetData(rows, draft.columns);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // 只给数据行设百分比格式（末尾脚注行跳过）
      const dataRowEnd = 1 + rows.length;
      for (let r = 1; r < dataRowEnd; r++) {
        for (const c of pctColumns) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell && cell.t === "n") cell.z = "0.00%";
        }
      }
      ws["!cols"] = aoa[0]!.map((_, i) => ({ wch: i < 2 ? 12 : 18 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, tr("股票数据"));
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      downloadBlob(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileStem()}.xlsx`);
    } catch {
      showToast(tr("导出失败，请改用 CSV"));
    }
  };

  // ---------- 模板 ----------
  const applyTemplate = async (t: StockDataTemplate, withStocks: boolean) => {
    const seq = ++applySeq.current;
    applyAbort.current?.abort();
    const ac = new AbortController();
    applyAbort.current = ac;
    setApplyingTemplate(true);
    // 换新的列标识和组标识，避免和当前的排序、选中状态串号
    const regroup = new Map<string, string>();
    const columns = t.columns.slice(0, MAX_COLUMNS).map((c) => {
      let groupId: string | undefined;
      if (c.groupId) {
        groupId = regroup.get(c.groupId) ?? newKey();
        regroup.set(c.groupId, groupId);
      }
      return { ...c, key: newKey(), ...(groupId ? { groupId } : {}) };
    });
    let stocks: PickedStock[] | null = null;
    try {
      if (withStocks) {
        if (t.symbols?.length) {
          stocks = t.symbols.slice(0, MAX_SYMBOLS).map((symbol) => ({ symbol, name: symbol }));
        } else if (t.defaultPool) {
          try {
            const r = await fetch(`/api/equity/stock-data/pools?id=${encodeURIComponent(t.defaultPool.id)}`, {
              signal: ac.signal,
            });
            if (seq !== applySeq.current) return;
            const j = await r.json();
            if (seq !== applySeq.current) return;
            if (!r.ok) {
              showToast(j.error || tr("无法读取默认股票池"));
              return;
            }
            const members = (j.members as { symbol: string; name: string }[] | undefined) ?? [];
            stocks = members.slice(0, Math.min(t.defaultPool.limit, MAX_SYMBOLS)).map((m) => ({
              symbol: m.symbol,
              name: m.name || m.symbol,
            }));
            if (!stocks.length) {
              showToast(tr("默认股票池暂无成分"));
              return;
            }
          } catch (e) {
            if (ac.signal.aborted || seq !== applySeq.current) return;
            showToast(tr("网络异常，未能加载股票池"));
            return;
          }
        }
      }
      if (seq !== applySeq.current) return;
      setDraft((d) => ({ columns, stocks: stocks ?? d.stocks }));
      setSort(null);
      setSelectedCols(new Set());
      showToast(tr("已应用「{name}」：{length} 列{v2}，点「提取数据」刷新", { name: t.name, length: columns.length, v2: stocks ? tr("、{length} 只股票", { length: stocks.length }) : "" }), true);
    } finally {
      if (seq === applySeq.current) setApplyingTemplate(false);
    }
  };

  const deleteTemplate = async (t: StockDataTemplate) => {
    try {
      const r = await fetch(`/api/equity/stock-data/templates?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
      if (!r.ok) { showToast((await r.json()).error || tr("删除失败")); return; }
      setMyTemplates((list) => list?.filter((x) => x.id !== t.id) ?? null);
      showToast(tr("已删除「{name}」", { name: t.name }));
    } catch {
      showToast(tr("网络异常，删除失败"));
    }
  };

  const saveTemplate = async () => {
    if (!saving) return;
    const name = saving.name.trim();
    if (!name) { setSaving({ ...saving, error: tr("请填写模板名称") }); return; }
    setSaving({ ...saving, busy: true, error: "" });
    try {
      const r = await fetch("/api/equity/stock-data/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, columns: draft.columns, symbols: saving.withStocks ? draft.stocks.map((s) => s.symbol) : null }),
      });
      const j = await r.json();
      if (!r.ok) { setSaving({ ...saving, busy: false, error: j.error || tr("保存失败") }); return; }
      setSaving(null);
      setMyTemplates(null);
      showToast(j.overwritten ? tr("已覆盖模板「{name}」", { name }) : tr("已保存模板「{name}」", { name }));
    } catch {
      setSaving({ ...saving, busy: false, error: tr("网络异常，保存失败") });
    }
  };

  const canFetch = draft.stocks.length > 0 && draft.columns.length > 0 && !loading;
  const canExport = !!result && !stale && rows.length > 0;

  const actions = [
    { label: tr("修改参数"), run: () => setEditor({ mode: "edit", keys: editableSelected.map((c) => c.key) }), disabled: !editableSelected.length },
    { label: tr("删除列"), run: deleteColumns, disabled: !selectedCols.size },
    { label: tr("删除行"), run: deleteRows, disabled: !selectedRows.size },
    { label: tr("清空股票"), run: clearAll, disabled: !draft.stocks.length },
    { label: tr("保存模板"), run: () => setSaving({ name: "", withStocks: false, busy: false, error: "" }), disabled: !draft.columns.length },
    {
      label: layout.freezeIdentity ? tr("取消冻结列") : tr("冻结代码列"),
      run: () => patchLayout({ freezeIdentity: !layout.freezeIdentity }),
      disabled: false,
    },
    { label: tr("导出 Excel"), run: () => void exportXlsx(), disabled: !canExport },
    { label: tr("导出 CSV"), run: exportCsv, disabled: !canExport },
  ];

  const tableArea = (
    <div className="flex min-h-0 flex-1 flex-col">
      {error ? (
        <div role="alert" className="m-3 rounded-lg border border-fs-border bg-fs-elevated px-3 py-2 md:py-1 text-sm md:text-xs">
          {error.text}
          {error.needsPro ? <Link href="/pricing" className="ml-3 text-fs-accent">{tr("了解 Pro 会员")}</Link> : null}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="mx-3 mt-3 flex items-start gap-3 rounded-lg border border-fs-border bg-fs-elevated px-3 py-2 md:py-1 text-sm md:text-xs text-fs-muted">
          <span className="min-w-0 flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label={tr("关闭提示")} className="shrink-0">✕</button>
        </div>
      ) : null}
      {stale ? (
        <div
          role="status"
          className="mx-3 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-fs-accent/40 bg-fs-accent-soft px-3 py-2 text-sm md:text-xs"
        >
          <span className="min-w-0 flex-1 font-medium text-fs-text">{tr("有未刷新的改动：股票或列已变化，表格仍是上次提取的结果。")}</span>
          <button
            type="button"
            disabled={!canFetch}
            onClick={() => { void fetchData(draft); setMobileTab("table"); }}
            className="min-h-9 md:min-h-7 shrink-0 rounded-lg bg-fs-accent px-3 text-white disabled:opacity-40"
          >
            {loading ? tr("提取中…") : tr("提取数据")}
          </button>
        </div>
      ) : null}
      {result && draft.columns.length ? (
        <div className="mx-3 mt-2 flex flex-col gap-2 text-xs md:flex-row md:flex-wrap md:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-fs-muted">{tr("结果过滤")}</span>
            <select
              className="min-h-8 min-w-0 flex-1 rounded border border-fs-border bg-fs-bg px-2 md:flex-none"
              value={filterDraft.columnKey}
              onChange={(e) => setFilterDraft((f) => ({ ...f, columnKey: e.target.value }))}
              aria-label={tr("过滤列")}
            >
              <option value="$symbol">{tr("代码")}</option>
              <option value="$name">{tr("简称")}</option>
              {draft.columns.map((c) => (
                <option key={c.key} value={c.key}>{tr(getIndicator(c.indicatorId)?.label ?? c.indicatorId)}</option>
              ))}
            </select>
            <select
              className="min-h-8 rounded border border-fs-border bg-fs-bg px-2"
              value={filterDraft.op}
              onChange={(e) => setFilterDraft((f) => ({ ...f, op: e.target.value as FilterOp }))}
              aria-label={tr("过滤条件")}
            >
              {(Object.keys(FILTER_OP_LABELS) as FilterOp[]).map((op) => (
                <option key={op} value={op}>{tr(FILTER_OP_LABELS[op])}</option>
              ))}
            </select>
            <input
              className="min-h-8 w-24 min-w-0 flex-1 rounded border border-fs-border bg-fs-bg px-2 md:w-28 md:flex-none"
              value={filterDraft.value}
              onChange={(e) => setFilterDraft((f) => ({ ...f, value: e.target.value }))}
              placeholder={tr("值")}
              aria-label={tr("过滤值")}
            />
            <button
              type="button"
              className="min-h-8 rounded-lg bg-fs-elevated px-3 hover:bg-fs-accent-soft disabled:opacity-40"
              disabled={!filterDraft.value.trim()}
              onClick={() => {
                setActiveFilters((list) => [...list, { ...filterDraft, value: filterDraft.value.trim() }]);
                setFilterDraft((f) => ({ ...f, value: "" }));
              }}
            >{tr("添加")}</button>
            {activeFilters.length ? (
              <button type="button" className="min-h-8 text-fs-muted hover:text-fs-text" onClick={() => setActiveFilters([])}>
                {tr("清除过滤（{length}）", { length: activeFilters.length })}
              </button>
            ) : null}
          </div>
          {gicsColumnKey && numericColumns.length ? (
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <span className="text-fs-muted">{tr("GICS 分组")}</span>
              <select
                className="min-h-8 rounded border border-fs-border bg-fs-bg px-2"
                value={groupValueKey}
                onChange={(e) => setGroupValueKey(e.target.value)}
                aria-label={tr("分组统计数值列")}
              >
                <option value="">{tr("选择数值列")}</option>
                {numericColumns.map((c) => (
                  <option key={c.key} value={c.key}>{tr(getIndicator(c.indicatorId)?.label ?? c.indicatorId)}</option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}
      {groupStats.length ? (
        <div className="mx-3 mt-1 max-h-24 overflow-auto rounded border border-fs-border bg-fs-elevated px-2 py-1 text-[11px] text-fs-muted">
          {groupStats.map((g) => {
            const unit = getIndicator(draft.columns.find((c) => c.key === groupValueKey)?.indicatorId ?? "")?.unit ?? "text";
            const mean = g.mean == null ? "—" : formatCellValue(unit, { v: g.mean, s: "ok" }).text;
            const median = g.median == null ? "—" : formatCellValue(unit, { v: g.median, s: "ok" }).text;
            return (
              <span key={g.group} className="mr-3 inline-block whitespace-nowrap">
                {tr("{group}（{count}）：均值 {mean} · 中位 {median}", { group: g.group, count: g.count, mean, median })}
              </span>
            );
          })}
        </div>
      ) : null}
      {!draft.stocks.length || !draft.columns.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm md:text-xs text-fs-muted">
          <p className="text-base md:text-sm text-fs-text">{!draft.stocks.length ? tr("先选股票") : tr("再选指标")}</p>
          <p>{!draft.stocks.length ? tr("从自选股、系统股票池或搜索框加入美股，最多 50 只。") : tr("在指标目录里双击，或拖到这里，最多 50 列。")}</p>
          <div className="mt-2 flex gap-2 md:hidden">
            <button type="button" onClick={() => setMobileTab(!draft.stocks.length ? "stocks" : "indicators")} className="min-h-10 md:min-h-8 rounded-lg bg-fs-accent px-4 text-white">
              {!draft.stocks.length ? tr("去选股票") : tr("去选指标")}
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
          loading={loading && !result}
          linkMarkets={features.can("markets")}
          linkStock={features.can("markets")}
          onCellClick={(symbol, name, column) => setSeriesTarget({ symbol, name, column })}
          colWidths={layout.colWidths}
          onColWidthChange={onColWidthChange}
          freezeIdentity={layout.freezeIdentity}
        />
      )}
    </div>
  );

  return (
    <div className="flex min-h-[560px] flex-1 flex-col text-fs-text">
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-fs-border px-3 py-2 md:py-1 md:px-4">
        <h1 className="mr-2 text-base md:text-sm font-semibold">{tr("股票数据")}</h1>
        <button
          type="button"
          onClick={() => { void fetchData(draft); setMobileTab("table"); }}
          disabled={!canFetch}
          className="min-h-9 md:min-h-7 rounded-lg bg-fs-accent px-4 text-sm md:text-xs text-white disabled:opacity-40"
        >
          {loading ? tr("提取中…") : tr("提取数据")}
        </button>
        <div className="hidden flex-wrap items-center gap-1 md:flex">
          {actions.map((a) => (
            <button key={a.label} type="button" onClick={a.run} disabled={a.disabled} className="min-h-9 md:min-h-7 rounded-lg px-3 text-sm md:text-xs hover:bg-fs-elevated disabled:opacity-40">
              {a.label}
            </button>
          ))}
        </div>
        <details className="relative md:hidden">
          <summary className="flex min-h-9 md:min-h-7 cursor-pointer list-none items-center rounded-lg border border-fs-border px-3 text-sm md:text-xs" aria-label={tr("更多操作")}>⋯</summary>
          <div className="absolute left-0 top-full z-40 mt-1 w-40 rounded-lg border border-fs-border bg-fs-bg py-1 shadow-lg">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                disabled={a.disabled}
                onClick={(e) => { a.run(); (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }}
                className="block min-h-10 md:min-h-8 w-full px-3 text-left text-sm md:text-xs hover:bg-fs-elevated disabled:opacity-40"
              >
                {a.label}
              </button>
            ))}
          </div>
        </details>
        <span className="ml-auto text-xs text-fs-muted">
          {tr("{stocks}/{maxStocks} 只 · {cols}/{maxCols} 列", {
            stocks: draft.stocks.length,
            maxStocks: MAX_SYMBOLS,
            cols: draft.columns.length,
            maxCols: MAX_COLUMNS,
          })}
          {activeFilters.length ? <span className="ml-2">{tr("显示 {length} 行", { length: rows.length })}</span> : null}
          {loading && result ? <span className="ml-2">{tr("刷新中…")}</span> : null}
        </span>
      </div>

      {/* 手机：三个标签 */}
      <div role="tablist" aria-label={tr("股票数据视图")} className="flex border-b border-fs-border md:hidden">
        {([["stocks", tr("股票 {length}", { length: draft.stocks.length })], ["indicators", tr("指标 {length}", { length: draft.columns.length })], ["table", tr("表格")]] as [MobileTab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mobileTab === id}
            onClick={() => setMobileTab(id)}
            className={`min-h-10 md:min-h-8 flex-1 text-sm md:text-xs ${mobileTab === id ? "border-b-2 border-fs-accent font-semibold" : "text-fs-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 电脑：左栏上下两块（可拖宽）；手机：按标签只显示其一 */}
        <aside
          className={`relative min-h-0 w-full flex-col border-fs-border md:flex md:shrink-0 md:border-r md:w-[var(--sd-left-w)] ${mobileTab === "table" ? "hidden" : "flex"}`}
          style={{ ["--sd-left-w" as string]: `${layout.leftWidthPx}px` }}
        >
          <div className={`min-h-0 flex-col md:flex md:flex-[3] md:border-b md:border-fs-border ${mobileTab === "indicators" ? "flex flex-1" : "hidden"}`}>
            <div role="tablist" aria-label={tr("指标与模板")} className="flex border-b border-fs-border">
              {([["indicators", tr("指标库")], ["templates", tr("模板")]] as [LeftTab, string][]).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={leftTab === id}
                  onClick={() => setLeftTab(id)}
                  className={`min-h-9 md:min-h-7 flex-1 text-sm md:text-xs ${leftTab === id ? "border-b-2 border-fs-accent font-semibold" : "text-fs-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {leftTab === "indicators" ? (
              <IndicatorPanel indicators={PUBLIC_INDICATORS} onAdd={addIndicators} />
            ) : (
                <TemplatePanel system={SYSTEM_TEMPLATES} mine={myTemplates} loadError={templateError} applying={applyingTemplate} onApply={(t, w) => void applyTemplate(t, w)} onDelete={(t) => void deleteTemplate(t)} />
            )}
          </div>
          <div className={`min-h-0 flex-col md:flex md:flex-[2] ${mobileTab === "stocks" ? "flex flex-1" : "hidden"}`}>
            <StockPoolPanel inTable={inTable} onAdd={addStocks} remainingSlots={MAX_SYMBOLS - draft.stocks.length} />
          </div>
          <button
            type="button"
            aria-label={tr("拖动调整左栏宽度")}
            title={tr("拖动调整左栏宽度")}
            onMouseDown={startLeftResize}
            className="absolute inset-y-0 right-0 z-30 hidden w-1.5 cursor-col-resize hover:bg-fs-accent/30 md:block"
          />
        </aside>
        <section aria-label={tr("数据表格")} className={`min-h-0 min-w-0 flex-1 flex-col md:flex ${mobileTab === "table" ? "flex" : "hidden"}`}>
          {tableArea}
          <p className="border-t border-fs-border px-3 py-1.5 text-xs text-fs-muted">{tr("财务数据来自上市公司公开披露的定期报告，取最新修订值；报告期按公司财年。估值只用截止日之前已披露的财报。悬停单元格可看实际报告期或交易日；点击格子可看时序。")}</p>
        </section>
      </div>

      {toast ? (
        <div role="status" className="fixed inset-x-4 bottom-4 z-[150] mx-auto flex max-w-md items-center gap-3 rounded-lg bg-fs-text px-4 py-3 text-sm md:text-xs text-white shadow-lg">
          <span className="min-w-0 flex-1">{toast.text}</span>
          {toast.goTable && mobileTab !== "table" ? (
            <button type="button" onClick={() => { setMobileTab("table"); setToast(null); }} className="shrink-0 font-semibold text-white underline md:hidden">{tr("去表格")}</button>
          ) : null}
        </div>
      ) : null}

      {saving ? (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/30 md:items-center" role="presentation" onClick={() => !saving.busy && setSaving(null)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-label={tr("保存模板")}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); void saveTemplate(); }}
            onKeyDown={(e) => { if (e.key === "Escape" && !saving.busy) setSaving(null); }}
            className="w-full rounded-t-2xl border border-fs-border bg-fs-bg p-4 shadow-xl md:w-[400px] md:rounded-xl"
          >
            <h2 className="text-base md:text-sm font-semibold">{tr("保存模板")}</h2>
            <p className="mt-1 text-xs text-fs-muted">{tr("保存当前的")} {draft.columns.length} {tr("列及其参数；同名模板会被覆盖。")}</p>
            <input
              autoFocus
              maxLength={60}
              value={saving.name}
              onChange={(e) => setSaving({ ...saving, name: e.target.value })}
              placeholder={tr("模板名称")}
              aria-label={tr("模板名称")}
              className="mt-3 min-h-10 md:min-h-8 w-full rounded-lg border border-fs-border bg-fs-elevated px-3 text-sm md:text-xs"
            />
            <label className="mt-3 flex min-h-9 md:min-h-7 items-center gap-2 text-sm md:text-xs">
              <input type="checkbox" checked={saving.withStocks} disabled={!draft.stocks.length} onChange={(e) => setSaving({ ...saving, withStocks: e.target.checked })} />
              {tr("连同当前 {length} 只股票一起保存", { length: draft.stocks.length })}
            </label>
            {saving.error ? <p role="alert" className="mt-2 text-sm md:text-xs text-fs-accent">{saving.error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={saving.busy} onClick={() => setSaving(null)} className="min-h-10 md:min-h-8 rounded-lg border border-fs-border px-4 text-sm md:text-xs">{tr("取消")}</button>
              <button type="submit" disabled={saving.busy} className="min-h-10 md:min-h-8 rounded-lg bg-fs-accent px-4 text-sm md:text-xs text-white disabled:opacity-40">{saving.busy ? tr("保存中…") : tr("保存")}</button>
            </div>
          </form>
        </div>
      ) : null}

      {editor ? (
        <ParamEditor
          title={editor.mode === "add" ? tr("加入 {length} 列", { length: editorDefs.length }) : tr("修改 {length} 列的参数", { length: editorDefs.length })}
          indicators={editorDefs}
          initial={editorInitial}
          initialMulti={editorFirst?.multi}
          totalColumnsFor={totalColumnsFor}
          onConfirm={confirmEditor}
          onCancel={() => setEditor(null)}
        />
      ) : null}

      {seriesTarget ? (
        <CellSeriesPanel
          symbol={seriesTarget.symbol}
          name={seriesTarget.name}
          column={seriesTarget.column}
          onClose={() => setSeriesTarget(null)}
        />
      ) : null}
    </div>
  );
}
