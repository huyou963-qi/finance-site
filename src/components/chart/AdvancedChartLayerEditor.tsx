"use client";

import { useEffect, useId, useState } from "react";
import { useTr } from "@/i18n/TextProvider";
import {
  FUNDAMENTAL_METRIC_LABEL, chartLayerUnit, effectiveTransform, layerAxisConflict,
  type AxisBinding, type ChartLayer, type ChartLayerSource, type FundamentalMetric, type LayerTransform,
} from "@/lib/chart/chartLayers";
import {
  layerCalculationFrequency, layerInputAlias, layerInputFrequency, sanitizeLayerCalculation, sanitizeSeriesRef, validateLayerCalculation,
  type LayerCalculation, type LayerInputTransform, type LayerOperation, type LayerSeriesRef, type PriceField,
} from "@/lib/chart/layerCalculation";
import { requireExactLayerSymbols } from "@/lib/chart/layerSymbolSearch";
import { LayerSymbolInput } from "./LayerSymbolInput";

const inputClass = "min-w-0 w-full rounded border border-fs-border bg-fs-elevated px-2 py-1.5 text-sm text-fs-text sm:text-xs";
const typeLabels = { market: "行情", macro: "宏观指标", financial: "基本面" } as const;
const priceLabels: Record<PriceField, string> = { close: "收盘价", open: "开盘价", high: "最高价", low: "最低价", volume: "成交量" };
const operationLabels: Record<LayerOperation, string> = {
  formula: "自定义公式", correlation: "滚动相关性", beta: "滚动 Beta", covariance: "滚动协方差", regression: "滚动回归 R²",
};
const transformLabels: Record<LayerInputTransform, string> = {
  none: "原值", pctChange: "收益率 / 变化率", diff: "差分", logReturn: "对数收益率", yoy: "同比",
};
const frequencyLabels: Record<LayerCalculation["frequency"], string> = {
  auto: "自动", keep: "跟随图表周期", month: "按月末", quarter: "按季末", year: "按年末",
};
const placementLabels = { left: "主图左轴", right: "主图右轴", subpane: "独立副图" } as const;
type Placement = keyof typeof placementLabels;
type DraftInput = { kind: LayerSeriesRef["kind"]; symbol: string; field: PriceField; metric: FundamentalMetric; macro?: Extract<LayerSeriesRef, { kind: "macro" }> };
type CalculationInput = { ref: DraftInput; transform: LayerInputTransform };
type MacroOption = { id: string; name: string; code: string; unit?: string; freqLabel?: string; latestObsDate?: string };

function draftInput(symbol: string, ref?: LayerSeriesRef): DraftInput {
  return {
    kind: ref?.kind ?? "market",
    symbol: ref && ref.kind !== "macro" ? ref.symbol : symbol,
    field: ref?.kind === "market" ? ref.field : "close",
    metric: ref?.kind === "financial" ? ref.metric : "eps",
    macro: ref?.kind === "macro" ? ref : undefined,
  };
}

function readSeries(input: DraftInput): LayerSeriesRef | null {
  if (input.kind === "macro") return sanitizeSeriesRef(input.macro);
  return sanitizeSeriesRef(input);
}

function macroFrequency(label: string | undefined): Extract<LayerSeriesRef, { kind: "macro" }>["frequency"] {
  const freq = label?.trim() ?? "";
  if (/季|quarter|^q$/i.test(freq)) return "quarter";
  if (/年|annual|year|^a$/i.test(freq)) return "year";
  if (/月|month|^m$/i.test(freq)) return "month";
  // Weekly macro observations cannot be paired as same-day returns against arbitrary trading weeks.
  if (/周|weekly|^w$/i.test(freq)) return "month";
  return "keep";
}

function MacroPicker({ value, onChange }: {
  value: DraftInput["macro"];
  onChange: (value: DraftInput["macro"]) => void;
}) {
  const tr = useTr();
  const id = useId();
  const [query, setQuery] = useState(value?.label ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [results, setResults] = useState<MacroOption[]>([]);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (value) setQuery(value.label);
  }, [value]);
  useEffect(() => {
    const term = query.trim();
    setResults([]);
    setActive(-1);
    setStatus(null);
    if (!focused || !term || term === value?.label) return;
    const controller = new AbortController();
    const fetchResults = async () => {
      setStatus(tr("搜索中…"));
      try {
        const query = new URLSearchParams({ q: term, kind: "MACRO_SERIES", limit: "30" });
        const response = await fetch(`/api/data/instruments?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const { items } = await response.json() as { items: MacroOption[] };
        if (controller.signal.aborted) return;
        const found = items.filter(item => item.latestObsDate);
        setResults(found);
        setStatus(found.length ? null : tr("未找到有数据的指标"));
      } catch {
        if (!controller.signal.aborted) setStatus(tr("搜索失败"));
      }
    };
    const timer = setTimeout(fetchResults, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, focused, value?.label, tr]);
  const pick = (item: MacroOption) => {
    onChange({ kind: "macro", id: item.id, label: item.name, unit: item.unit, frequency: macroFrequency(item.freqLabel) });
    setFocused(false);
  };
  return (
    <div className="min-w-0">
      <input className={inputClass} role="combobox" aria-label={tr("搜索宏观指标")}
        aria-autocomplete="list" aria-expanded={focused && results.length > 0} aria-controls={id}
        aria-activedescendant={focused && active >= 0 ? `${id}-${active}` : undefined}
        placeholder={tr("指标名称或代码")} value={query} autoComplete="off"
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={event => {
          const next = event.target.value;
          if (value) onChange(undefined);
          setQuery(next);
          setFocused(true);
        }}
        onKeyDown={event => {
          if (event.key === "Escape") setFocused(false);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setFocused(true);
            const direction = event.key === "ArrowDown" ? 1 : -1;
            setActive(index => results.length ? (index + direction + results.length) % results.length : -1);
          }
          if (event.key === "Enter" && focused && active >= 0 && results[active]) {
            event.preventDefault();
            pick(results[active]);
          }
        }} />
      {focused && status ? <p role="status" className="mt-1 text-xs text-fs-muted">{status}</p> : null}
      {focused && results.length ? (
        <div id={id} role="listbox" aria-label={tr("宏观指标搜索结果")} className="mt-1 max-h-36 overflow-y-auto rounded border border-fs-border">
          {results.map((item, index) => <button key={item.id} id={`${id}-${index}`} type="button" role="option" aria-selected={index === active}
            onMouseDown={event => event.preventDefault()} onClick={() => pick(item)}
            className="block w-full break-words px-2 py-1.5 text-left text-xs hover:bg-fs-elevated aria-selected:bg-fs-elevated">
            {item.name}<span className="ml-2 text-fs-muted">{item.code}</span>
          </button>)}
        </div>
      ) : null}
    </div>
  );
}

function DataInput({ value, onChange, label }: { value: DraftInput; onChange: (value: DraftInput) => void; label: string }) {
  const tr = useTr();
  return (
    <div className="grid min-w-0 gap-1.5">
      <select className={inputClass} aria-label={tr("{label}数据类型", { label })} value={value.kind}
        onChange={event => onChange({ ...value, kind: event.target.value as DraftInput["kind"] })}>
        {Object.entries(typeLabels).map(([type, name]) => <option key={type} value={type}>{tr(name)}</option>)}
      </select>
      {value.kind === "macro" ? <MacroPicker value={value.macro} onChange={macro => onChange({ ...value, macro })} /> : (
        <div className="flex min-w-0 gap-1.5">
          <LayerSymbolInput value={value.symbol} onChange={symbol => onChange({ ...value, symbol })} label={label} />
          {value.kind === "market" ? (
            <select className={`${inputClass} w-auto max-w-[50%]`} aria-label={tr("行情字段")} value={value.field}
              onChange={event => onChange({ ...value, field: event.target.value as PriceField })}>
              {Object.entries(priceLabels).map(([field, name]) => <option key={field} value={field}>{tr(name)}</option>)}
            </select>
          ) : (
            <select className={`${inputClass} w-auto max-w-[50%]`} aria-label={tr("基本面字段")} value={value.metric}
              onChange={event => onChange({ ...value, metric: event.target.value as FundamentalMetric })}>
              {Object.entries(FUNDAMENTAL_METRIC_LABEL).map(([metric, name]) => <option key={metric} value={metric}>{tr(name)}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

type Props = {
  primarySymbol: string;
  primaryUnit?: string;
  layers: ChartLayer[];
  mode: "series" | "calculation";
  editing?: ChartLayer;
  compareMode: boolean;
  onSave: (source: ChartLayerSource, options: { axis: AxisBinding; label: string; transform: LayerTransform }) => void;
};

export function AdvancedChartLayerEditor({ primarySymbol, primaryUnit, layers, mode, editing, compareMode, onSave }: Props) {
  const tr = useTr();
  const existing = editing?.source.kind === "calculation" ? editing.source.calculation : undefined;
  const [series, setSeries] = useState(() => draftInput(primarySymbol, editing?.source.kind === "series" ? editing.source.series : undefined));
  const [inputs, setInputs] = useState<CalculationInput[]>(() => existing?.inputs.map(input => ({
    ref: draftInput(primarySymbol, input.series), transform: input.transform,
  })) ?? [
    { ref: draftInput(primarySymbol), transform: "pctChange" },
    { ref: draftInput(primarySymbol === "QQQ" ? "SPY" : "QQQ"), transform: "pctChange" },
  ]);
  const [operation, setOperation] = useState<LayerOperation>(existing?.operation ?? "correlation");
  const [frequency, setFrequency] = useState<LayerCalculation["frequency"]>(existing?.frequency ?? "auto");
  const [windowSize, setWindowSize] = useState(existing?.window);
  const [windowMin, setWindowMin] = useState(existing?.minPeriods !== existing?.window ? existing?.minPeriods : undefined);
  const [formula, setFormula] = useState(existing?.formula ?? "A / B");
  const [method, setMethod] = useState<LayerCalculation["method"]>(existing?.method ?? "pearson");
  const [transform, setTransform] = useState<LayerTransform>(editing?.transform ?? "raw");
  const [placement, setPlacement] = useState<Placement>(() => {
    const current = editing?.axis.mode;
    return current === "left" || current === "right" || current === "subpane" ? current : mode === "series" && primaryUnit ? "right" : "subpane";
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCalculation = mode === "calculation";
  const hasVariableInputs = operation === "formula" || operation === "regression";
  const usedInputs = hasVariableInputs ? inputs : inputs.slice(0, 2);
  const applyFormulaPreset = (preset: string) => {
    setFormula(preset);
    setInputs([
      { ref: inputs[0]?.ref ?? draftInput(primarySymbol), transform: "none" },
      { ref: inputs[1]?.ref ?? draftInput("QQQ"), transform: "none" },
    ]);
  };
  const configuredInputs = usedInputs.map(input => ({ series: readSeries(input.ref), transform: input.transform }));
  const calculation = sanitizeLayerCalculation({
    operation, inputs: configuredInputs, frequency, window: windowSize ?? 60, minPeriods: windowMin, formula, method,
  });
  const resolvedFrequency = calculation ? layerCalculationFrequency(calculation) : frequency === "auto" ? "keep" : frequency;
  const suggestedWindow = { keep: 60, month: 12, quarter: 8, year: 5 }[resolvedFrequency];
  const windowValue = windowSize ?? suggestedWindow;
  const data = readSeries(series);
  const source: ChartLayerSource | null = isCalculation
    ? calculation ? { kind: "calculation", calculation: { ...calculation, window: windowValue, minPeriods: windowMin ?? windowValue } } : null
    : data ? { kind: "series", series: data } : null;
  const compareTransform = compareMode && transform === "raw" && source?.kind === "series" &&
    source.series.kind === "market" && source.series.field !== "volume" ? "index100" : transform;
  const peers = compareMode ? layers.map(layer => ({ ...layer, transform: effectiveTransform(layer, true) })) : layers;
  const candidate = source ? { id: editing?.id, source, axis: { mode: placement } as AxisBinding, transform: compareTransform } : null;
  const conflict = candidate ? layerAxisConflict(candidate, peers, primaryUnit, primarySymbol) : null;
  const unit = candidate ? chartLayerUnit(candidate, primaryUnit, primarySymbol) : undefined;
  const hint = conflict === "right" ? tr("右轴与主标的共用刻度，仅可用于相同单位。请选择左轴或副图。")
    : conflict === "left" ? tr("左轴已有不同单位的图层。请选择副图或调整现有图层。")
    : placement === "right" ? tr("与主标的共用刻度") : placement === "left" ? tr("独立于右轴的主图刻度") : tr("与主图共用时间轴，使用独立刻度");
  const changeOperation = (next: LayerOperation) => {
    setOperation(next);
    if (next !== "formula" && inputs.length < 2) {
      setInputs([...inputs, { ref: draftInput("QQQ"), transform: "pctChange" }]);
    }
  };
  const save = async () => {
    if (!source) { setError(tr("请选择每个输入的数据序列")); return; }
    if (conflict) return;
    const validation = source.kind === "calculation" ? validateLayerCalculation(source.calculation) : null;
    if (validation) { setError(tr(validation)); return; }
    if (isCalculation && operation !== "formula" && (!Number.isInteger(windowValue) || windowValue < 2 || windowValue > 250 ||
      (windowMin != null && (!Number.isInteger(windowMin) || windowMin < 2 || windowMin > windowValue)))) {
      setError(tr("窗口须为 2–250 期，最少样本数不能超过窗口。"));
      return;
    }
    const refs = source.kind === "series" ? [source.series] : source.calculation.inputs.map(input => input.series);
    setSaving(true);
    setError(null);
    try {
      await requireExactLayerSymbols(refs.flatMap(ref => ref.kind === "macro" || ref.symbol === primarySymbol ? [] : [ref.symbol]));
      const describeSeries = (ref: LayerSeriesRef) => ref.kind === "macro" ? ref.label : `${ref.symbol} ${tr(ref.kind === "market" ? priceLabels[ref.field] : FUNDAMENTAL_METRIC_LABEL[ref.metric])}`;
      const describeSource = (layer: typeof source): string => {
        if (layer.kind === "series") return describeSeries(layer.series);
        const calc = layer.calculation;
        return `${tr(operationLabels[calc.operation])} · ${calc.inputs.map(({ series: input }) => input.kind === "macro" ? input.label : input.symbol).join(" / ")}`;
      };
      const old = editing?.source;
      const autoLabel = old && (old.kind === "series" || old.kind === "calculation") ? describeSource(old).slice(0, 64) : undefined;
      const label = editing?.label && editing.label !== autoLabel ? editing.label : describeSource(source).slice(0, 64);
      onSave(source, { axis: { mode: placement }, label, transform });
    } catch {
      setError(tr("资产校验失败"));
    } finally { setSaving(false); }
  };
  return (
    <form className="grid gap-2 pt-2 text-xs" onSubmit={event => { event.preventDefault(); if (!saving) void save(); }}>
      {isCalculation ? <>
        <label className="grid gap-1">{tr("运算方式")}
          <select className={inputClass} value={operation} onChange={event => changeOperation(event.target.value as LayerOperation)}>
            {Object.entries(operationLabels).map(([key, label]) => <option key={key} value={key}>{tr(label)}</option>)}
          </select>
        </label>
        {usedInputs.map(({ ref, transform: inputTransform }, index) => {
          const alias = layerInputAlias(index);
          const label = tr("输入 {alias}", { alias });
          const update = (patch: Partial<CalculationInput>) => setInputs(current => current.map((input, i) => i === index ? { ...input, ...patch } : input));
          return (
            <fieldset key={index} className="grid min-w-0 gap-1.5 rounded border border-fs-border p-2">
              <legend className="px-1">{label}</legend>
              <DataInput value={ref} onChange={value => update({ ref: value })} label={label} />
              <div className="flex gap-2">
                <select className={inputClass} aria-label={tr("输入 {alias} 的处理方式", { alias })} value={inputTransform}
                  onChange={event => update({ transform: event.target.value as LayerInputTransform })}>
                  {Object.entries(transformLabels).map(([key, name]) => <option key={key} value={key}>{tr(name)}</option>)}
                </select>
                {hasVariableInputs && index >= (operation === "formula" ? 1 : 2) ? <button type="button" onClick={() => setInputs(current => current.filter((_, i) => i !== index))}>{tr("删除")}</button> : null}
                {operation === "formula" && index === 0 && usedInputs.length > 1 ? <button type="button" onClick={() => setInputs(current => current.slice(1))}>{tr("删除")}</button> : null}
              </div>
            </fieldset>
          );
        })}
        {hasVariableInputs && usedInputs.length < 8 ? <button type="button" className="justify-self-start rounded bg-fs-elevated px-2 py-1.5" onClick={() => setInputs([...inputs, { ref: draftInput(""), transform: "none" }])}>{tr("添加输入")}</button> : null}
        {operation === "formula" ? <div className="grid gap-1.5">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded bg-fs-elevated px-2 py-1.5" onClick={() => applyFormulaPreset("A - B")}>{tr("价差 A − B")}</button>
            <button type="button" className="rounded bg-fs-elevated px-2 py-1.5" onClick={() => applyFormulaPreset("A / B")}>{tr("比值 A ÷ B")}</button>
          </div>
          <label className="grid gap-1">{tr("公式")}
          <input className={`${inputClass} font-mono`} maxLength={400} value={formula} placeholder="A / B + ABS(C)" onChange={event => setFormula(event.target.value)} />
          </label>
        </div> : null}
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">{tr("时间对齐")}
            <select className={inputClass} value={frequency} onChange={event => {
              setFrequency(event.target.value as LayerCalculation["frequency"]);
              setWindowSize(undefined);
              setWindowMin(undefined);
            }}>
              {Object.entries(frequencyLabels).map(([key, name]) => <option key={key} value={key}>{tr(name)}</option>)}
            </select>
          </label>
          {operation === "correlation" ? <label className="grid gap-1">{tr("相关性方法")}
            <select className={inputClass} value={method} onChange={event => setMethod(event.target.value as LayerCalculation["method"])}>
              <option value="pearson">Pearson</option><option value="spearman">Spearman</option>
            </select>
          </label> : null}
          {operation !== "formula" ? <>
            <label className="grid gap-1">{tr("滚动窗口（期）")}
              <input className={inputClass} type="number" min={2} max={250} value={windowSize ?? ""} placeholder={String(suggestedWindow)}
                onChange={event => setWindowSize(event.target.value ? Number(event.target.value) : undefined)} />
            </label>
            <label className="grid gap-1">{tr("最少有效样本")}
              <input className={inputClass} type="number" min={2} max={windowValue} value={windowMin ?? ""} placeholder={String(windowValue)}
                onChange={event => setWindowMin(event.target.value ? Number(event.target.value) : undefined)} />
            </label>
          </> : null}
        </div>
        <p className="text-fs-muted">{tr(frequencyLabels[resolvedFrequency])} · {tr("缺值不填充")}</p>
        {frequency === "keep" && configuredInputs.some(input => input.series && layerInputFrequency(input.series) !== "keep")
          ? <p className="text-fs-muted">{tr("低频数据可选择按月末或季末配对。")}</p> : null}
      </> : <DataInput value={series} onChange={setSeries} label={tr("数据序列")} />}
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">{tr("显示位置")}
          <select value={placement} aria-label={tr("显示位置")} className={inputClass} onChange={event => setPlacement(event.target.value as Placement)}>
            {Object.entries(placementLabels).map(([key, name]) => <option key={key} value={key}>{tr(name)}</option>)}
          </select>
        </label>
        {!isCalculation ? <label className="grid gap-1">{tr("显示方式")}
          <select value={transform} className={inputClass} onChange={event => setTransform(event.target.value as LayerTransform)}>
            <option value="raw">{tr("原值")}</option><option value="index100">{tr("指数化100")}</option><option value="pctChange">{tr("涨跌幅%")}</option>
          </select>
        </label> : null}
      </div>
      <p role="status" className={conflict ? "text-amber-500" : "text-fs-muted"}>{hint}{unit && !conflict ? ` · ${tr(unit)}` : ""}</p>
      {error ? <p role="alert" className="text-amber-500">{error}</p> : null}
      <button type="submit" disabled={saving || !!conflict} className="rounded bg-fs-elevated py-2 text-fs-text hover:bg-fs-border disabled:opacity-40">
        {saving ? tr("校验资产…") : placement === "subpane" ? tr("应用到副图") : tr("应用到主图")}
      </button>
    </form>
  );
}
