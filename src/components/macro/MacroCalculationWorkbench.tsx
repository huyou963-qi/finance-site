"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { MacroPayload } from "@/lib/data/types";
import type {
  MacroAdvancedDerivedConfig,
  MacroDerivedCalc,
  MacroFrequencyAdjust,
  MacroMissingValueMethod,
  MacroResampleMethod,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
  MacroSeriesCalcStep,
} from "@/lib/data/macroPresetTemplates";
import {
  applyMacroSeriesSteps,
  evaluateAdvancedMacroCalculation,
  inspectMacroFormula,
  MACRO_FORMULA_FUNCTIONS,
  sortMacroDerivedCalculations,
  type MacroCalculationResult,
  type MacroCalculationSeries,
} from "@/lib/macroCalculationEngine";
import { IconClose } from "@/components/mobile/mobileIcons";

type KeyOption = { key: string; label: string; unit?: string | null; derived?: boolean };

export type MacroCalculationWorkbenchProps = {
  open: boolean;
  onClose: () => void;
  options: KeyOption[];
  configMap: MacroSeriesCalcConfigMap;
  rawPayload: MacroPayload | null;
  displayPayload: MacroPayload | null;
  derivedCalcs: MacroDerivedCalc[];
  onApplySingle: (key: string, config: MacroSeriesCalcConfig) => void;
  onResetSingle: (key: string) => void;
  onAddDerived: (calc: MacroDerivedCalc) => void;
  onUpdateDerived: (calc: MacroDerivedCalc) => void;
  onDeleteDerived: (id: string) => void;
  onToggleDerived: (id: string) => void;
};

const inputClass =
  "h-10 min-w-0 rounded-lg border border-fs-border bg-white px-2.5 text-sm text-fs-text outline-none focus:border-fs-accent focus:ring-1 focus:ring-fs-accent/20";
const labelClass = "mb-1 block text-xs font-medium text-fs-muted";

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`min-w-0 ${className}`}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function stepId() {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function defaultStep(type: MacroSeriesCalcStep["type"]): MacroSeriesCalcStep {
  const id = stepId();
  if (type === "resample") return { id, type, frequency: "month", method: "end" };
  if (type === "transform") return { id, type, op: "pctChange" };
  if (type === "rollingMean") return { id, type, window: 12, minPeriods: 12 };
  if (type === "zScore") return { id, type, window: 24, minPeriods: 18, sample: true };
  if (type === "fill") return { id, type, method: "forward", maxGap: 3 };
  if (type === "scale") return { id, type, factor: 100 };
  return {
    id,
    type: "volatility",
    input: "pctChange",
    window: 12,
    minPeriods: 10,
    sample: true,
    annualize: true,
    periodsPerYear: 12,
  };
}

function numberInput(value: number, onChange: (value: number) => void, min?: number, max?: number) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(event) => onChange(Number(event.target.value))}
      className={`${inputClass} w-full`}
    />
  );
}

function StepEditor({
  step,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  step: MacroSeriesCalcStep;
  index: number;
  total: number;
  onChange: (step: MacroSeriesCalcStep) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
}) {
  const title =
    step.type === "resample"
      ? "变频"
      : step.type === "transform"
        ? "变化计算"
        : step.type === "rollingMean"
          ? "滚动均值"
          : step.type === "zScore"
            ? "滚动 Z-Score"
          : step.type === "volatility"
            ? "波动率"
            : step.type === "fill"
              ? "缺失值处理"
              : "数值缩放";
  return (
    <div className="rounded-xl border border-fs-border bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-fs-accent-soft text-xs font-semibold text-fs-accent-text">
          {index + 1}
        </span>
        <span className="flex-1 text-sm font-semibold text-fs-text">{title}</span>
        <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="h-8 px-2 text-sm text-fs-muted disabled:opacity-25">↑</button>
        <button type="button" disabled={index === total - 1} onClick={() => onMove(1)} className="h-8 px-2 text-sm text-fs-muted disabled:opacity-25">↓</button>
        <button type="button" onClick={onRemove} className="h-8 px-2 text-sm text-red-600">删除</button>
      </div>
      {step.type === "resample" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="目标频率">
            <select value={step.frequency} onChange={(event) => onChange({ ...step, frequency: event.target.value as Exclude<MacroFrequencyAdjust, "keep"> })} className={`${inputClass} w-full`}>
              <option value="month">月</option><option value="quarter">季</option><option value="year">年</option>
            </select>
          </Field>
          <Field label="聚合方式">
            <ResampleSelect value={step.method} onChange={(method) => onChange({ ...step, method })} />
          </Field>
        </div>
      ) : null}
      {step.type === "transform" ? (
        <Field label="计算方式">
          <select value={step.op} onChange={(event) => onChange({ ...step, op: event.target.value as typeof step.op })} className={`${inputClass} w-full`}>
            <option value="pctChange">百分比变化%</option><option value="logReturn">对数变化%</option>
            <option value="yoy">同比%</option><option value="diff">差分</option><option value="cumsum">累计</option>
          </select>
        </Field>
      ) : null}
      {step.type === "rollingMean" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="窗口">{numberInput(step.window, (window) => onChange({ ...step, window: Math.max(2, window) }), 2, 520)}</Field>
          <Field label="最少有效期数">{numberInput(step.minPeriods, (minPeriods) => onChange({ ...step, minPeriods: Math.max(1, Math.min(step.window, minPeriods)) }), 1, step.window)}</Field>
        </div>
      ) : null}
      {step.type === "zScore" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Field label="滚动窗口">{numberInput(step.window, (window) => onChange({ ...step, window: Math.max(2, window) }), 2, 520)}</Field>
          <Field label="最少有效期数">{numberInput(step.minPeriods, (minPeriods) => onChange({ ...step, minPeriods: Math.max(2, Math.min(step.window, minPeriods)) }), 2, step.window)}</Field>
          <Field label="标准差口径">
            <select value={step.sample ? "sample" : "population"} onChange={(event) => onChange({ ...step, sample: event.target.value === "sample" })} className={`${inputClass} w-full`}>
              <option value="sample">样本标准差</option><option value="population">总体标准差</option>
            </select>
          </Field>
        </div>
      ) : null}
      {step.type === "volatility" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Field label="变化类型">
            <select value={step.input} onChange={(event) => onChange({ ...step, input: event.target.value as typeof step.input })} className={`${inputClass} w-full`}>
              <option value="pctChange">百分比变化</option><option value="logReturn">对数变化</option><option value="diff">水平值差分</option>
            </select>
          </Field>
          <Field label="滚动窗口">{numberInput(step.window, (window) => onChange({ ...step, window: Math.max(2, window) }), 2, 520)}</Field>
          <Field label="最少有效期数">{numberInput(step.minPeriods, (minPeriods) => onChange({ ...step, minPeriods: Math.max(2, Math.min(step.window, minPeriods)) }), 2, step.window)}</Field>
          <Field label="年化因子">{numberInput(step.periodsPerYear, (periodsPerYear) => onChange({ ...step, periodsPerYear: Math.max(1, periodsPerYear) }), 1, 366)}</Field>
          <Field label="估计方法">
            <select value={step.sample ? "sample" : "population"} onChange={(event) => onChange({ ...step, sample: event.target.value === "sample" })} className={`${inputClass} w-full`}>
              <option value="sample">样本标准差</option><option value="population">总体标准差</option>
            </select>
          </Field>
          <Field label="输出">
            <select value={step.annualize ? "annualized" : "raw"} onChange={(event) => onChange({ ...step, annualize: event.target.value === "annualized" })} className={`${inputClass} w-full`}>
              <option value="annualized">年化波动率</option><option value="raw">窗口波动率</option>
            </select>
          </Field>
        </div>
      ) : null}
      {step.type === "fill" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="填充方式">
            <FillSelect value={step.method} onChange={(method) => method !== "none" && onChange({ ...step, method })} omitNone />
          </Field>
          <Field label="最大连续缺口">{numberInput(step.maxGap, (maxGap) => onChange({ ...step, maxGap: Math.max(1, maxGap) }), 1, 120)}</Field>
        </div>
      ) : null}
      {step.type === "scale" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="乘数">{numberInput(step.factor, (factor) => onChange({ ...step, factor }))}</Field>
          <Field label="输出单位（可选）"><input value={step.unitLabel ?? ""} onChange={(event) => onChange({ ...step, unitLabel: event.target.value })} className={`${inputClass} w-full`} placeholder="例如：% / bp" /></Field>
        </div>
      ) : null}
    </div>
  );
}

function ResampleSelect({ value, onChange }: { value: MacroResampleMethod; onChange: (value: MacroResampleMethod) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as MacroResampleMethod)} className={`${inputClass} w-full`}>
      <option value="end">期末</option><option value="start">期初</option><option value="avg">平均</option>
      <option value="sum">合计</option><option value="min">最小</option><option value="max">最大</option>
    </select>
  );
}

function FillSelect({ value, onChange, omitNone = false }: { value: MacroMissingValueMethod; onChange: (value: MacroMissingValueMethod) => void; omitNone?: boolean }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as MacroMissingValueMethod)} className={`${inputClass} w-full`}>
      {!omitNone ? <option value="none">不填充</option> : null}<option value="forward">前向填充</option>
      <option value="linear">线性插值（含前视）</option><option value="backward">后向填充（含前视）</option>
    </select>
  );
}

function PreviewPanel({ result, title = "结果预览" }: { result: MacroCalculationResult | null; title?: string }) {
  const rows = useMemo(() => {
    if (!result) return [];
    return result.categories
      .map((category, index) => ({ category, value: result.data[index] }))
      .filter((row) => row.value != null && Number.isFinite(row.value))
      .slice(-8)
      .reverse();
  }, [result]);
  return (
    <aside className="rounded-xl border border-fs-border bg-fs-elevated p-3 lg:sticky lg:top-0 lg:self-start">
      <h3 className="text-sm font-semibold text-fs-text">{title}</h3>
      {!result ? <p className="mt-3 text-sm text-fs-muted">选择指标并配置运算后显示预览。</p> : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Metric label="对齐期数" value={result.diagnostics.alignedPoints} />
            <Metric label="有效结果" value={result.diagnostics.validPoints} />
            <Metric label="无效/丢弃" value={result.diagnostics.droppedPoints} />
          </div>
          {Object.keys(result.diagnostics.filledPoints).length ? (
            <p className="mt-3 text-xs text-fs-muted">填充：{Object.entries(result.diagnostics.filledPoints).map(([alias, count]) => `${alias} ${count}期`).join("，")}</p>
          ) : null}
          {result.diagnostics.outputUnit ? <p className="mt-2 text-xs text-fs-muted">输出单位：<span className="font-medium text-fs-text">{result.diagnostics.outputUnit}</span></p> : null}
          {result.diagnostics.error ? <p className="mt-3 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-700">{result.diagnostics.error}</p> : null}
          {result.diagnostics.warnings.map((warning) => <p key={warning} className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">{warning}</p>)}
          {rows.length ? (
            <div className="mt-3 overflow-hidden rounded-lg border border-fs-border bg-white text-xs">
              {rows.map((row) => (
                <div key={row.category} className="flex justify-between border-b border-fs-border/70 px-2.5 py-1.5 last:border-b-0">
                  <span className="text-fs-muted">{row.category}</span><span className="font-mono text-fs-text">{Number(row.value).toLocaleString("zh-CN", { maximumFractionDigits: 5 })}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-fs-border bg-white px-1 py-2"><div className="text-base font-semibold text-fs-text">{value}</div><div className="text-[11px] text-fs-muted">{label}</div></div>;
}

function FormulaEditor({
  value,
  onChange,
  inputs,
}: {
  value: string;
  onChange: (value: string) => void;
  inputs: Array<{ alias: string; label: string }>;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [prefix, setPrefix] = useState("");
  const [hint, setHint] = useState(MACRO_FORMULA_FUNCTIONS[0]!);
  const candidates = useMemo(() => {
    if (!prefix) return [];
    const upper = prefix.toUpperCase();
    return [
      ...inputs.map((input) => ({ name: input.alias, signature: input.alias, description: input.label, function: false })),
      ...MACRO_FORMULA_FUNCTIONS.map((item) => ({ ...item, function: true })),
    ].filter((item) => item.name.startsWith(upper)).slice(0, 6);
  }, [inputs, prefix]);

  const updatePrefix = (text: string, caret: number) => {
    const match = /[A-Za-z_][A-Za-z0-9_]*$/.exec(text.slice(0, caret));
    setPrefix(match?.[0] ?? "");
    const fn = MACRO_FORMULA_FUNCTIONS.find((item) => item.name === match?.[0]?.toUpperCase());
    if (fn) setHint(fn);
  };
  const insert = (name: string, isFunction: boolean) => {
    const textarea = ref.current;
    const caret = textarea?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const token = /[A-Za-z_][A-Za-z0-9_]*$/.exec(before)?.[0] ?? "";
    const insertion = isFunction ? `${name}()` : name;
    const nextCaret = caret - token.length + name.length + (isFunction ? 1 : 0);
    const next = `${before.slice(0, before.length - token.length)}${insertion}${value.slice(textarea?.selectionEnd ?? caret)}`;
    onChange(next);
    setPrefix("");
    const fn = MACRO_FORMULA_FUNCTIONS.find((item) => item.name === name);
    if (fn) setHint(fn);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCaret, nextCaret);
    });
  };
  const preview = value.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (token) => {
    const input = inputs.find((item) => item.alias.toUpperCase() === token.toUpperCase());
    return input ? `[${input.label}]` : token.toUpperCase();
  });

  return (
    <div>
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          updatePrefix(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) => updatePrefix(event.currentTarget.value, event.currentTarget.selectionStart)}
        rows={3}
        className="w-full resize-y rounded-lg border border-fs-border bg-white px-3 py-2 font-mono text-sm text-fs-text outline-none focus:border-fs-accent"
        placeholder="例如：(A - B) / C * 100"
        aria-label="公式"
      />
      {candidates.length ? (
        <div className="mt-1 overflow-hidden rounded-lg border border-fs-border bg-white shadow-lg">
          {candidates.map((item) => (
            <button key={`${item.function ? "fn" : "input"}-${item.name}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insert(item.name, item.function)} className="flex w-full items-center gap-3 border-b border-fs-border/70 px-3 py-2 text-left text-xs last:border-0 hover:bg-fs-elevated">
              <span className="w-24 shrink-0 font-mono font-semibold text-fs-accent-text">{item.signature}</span>
              <span className="truncate text-fs-muted">{item.description}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {inputs.map((input) => <button key={input.alias} type="button" onClick={() => insert(input.alias, false)} className="rounded border border-fs-accent/30 bg-fs-accent-soft px-2 py-1 font-mono text-[11px] text-fs-accent-text" title={input.label}>{input.alias}</button>)}
        {MACRO_FORMULA_FUNCTIONS.map((item) => <button key={item.name} type="button" onClick={() => insert(item.name, true)} onMouseEnter={() => setHint(item)} className="rounded border border-fs-border bg-fs-elevated px-2 py-1 font-mono text-[11px] text-fs-secondary">{item.name}</button>)}
      </div>
      <p className="mt-2 text-xs text-fs-muted"><span className="font-mono font-medium text-fs-text">{hint.signature}</span>：{hint.description}</p>
      <div className="mt-2 rounded-lg bg-fs-elevated px-3 py-2 text-xs text-fs-muted">
        <span className="font-medium text-fs-text">公式预览：</span><span className="break-all font-mono">{preview || "—"}</span>
      </div>
    </div>
  );
}

function rawSeriesForKey(payload: MacroPayload | null, key: string): MacroCalculationSeries | null {
  if (!payload) return null;
  const baseKey = key.split("::")[0] ?? key;
  const source = payload.series.find((series) => series.key === key) ?? payload.series.find((series) => series.key === baseKey);
  return source ? { key, name: source.name, categories: payload.categories, data: source.data } : null;
}

export function MacroCalculationWorkbench(props: MacroCalculationWorkbenchProps) {
  const { open, onClose } = props;
  const [mode, setMode] = useState<"single" | "derived">("single");
  const [targetKey, setTargetKey] = useState("");
  const [steps, setSteps] = useState<MacroSeriesCalcStep[]>([]);
  const [kind, setKind] = useState<"formula" | "correlation">("formula");
  const [inputKeys, setInputKeys] = useState<string[]>([]);
  const [inputMethods, setInputMethods] = useState<Record<string, { resample: MacroResampleMethod; fill: MacroMissingValueMethod; maxGap: number }>>({});
  const [frequency, setFrequency] = useState<MacroFrequencyAdjust>("keep");
  const [join, setJoin] = useState<"inner" | "union" | "left">("inner");
  const [formula, setFormula] = useState("A / B * 100");
  const [name, setName] = useState("");
  const [corrMethod, setCorrMethod] = useState<"pearson" | "spearman">("pearson");
  const [statMetric, setStatMetric] = useState<"correlation" | "covariance" | "beta">("correlation");
  const [statSample, setStatSample] = useState(true);
  const [corrInput, setCorrInput] = useState<"level" | "diff" | "pctChange" | "logReturn">("pctChange");
  const [corrWindow, setCorrWindow] = useState(24);
  const [corrMinPeriods, setCorrMinPeriods] = useState(18);
  const [corrLag, setCorrLag] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const singleOptions = useMemo(() => props.options.filter((option) => !option.derived), [props.options]);
  const availableInputOptions = useMemo(
    () => props.options.filter((option) => option.key !== (editingId ? `calc:${editingId}` : "")),
    [editingId, props.options],
  );

  useEffect(() => {
    if (!open) return;
    const first = singleOptions[0]?.key ?? "";
    const second = singleOptions[1]?.key ?? first;
    setTargetKey((current) => current && singleOptions.some((option) => option.key === current) ? current : first);
    if (!editingId) setInputKeys((current) => current.length >= 2 && current.every((key) => props.options.some((option) => option.key === key)) ? current : [first, second].filter(Boolean));
  }, [editingId, open, props.options, singleOptions]);

  useEffect(() => {
    if (!targetKey) return;
    setSteps(props.configMap[targetKey]?.steps ?? []);
  }, [targetKey, props.configMap]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    setEditingId(null);
    setManageOpen(false);
  }, [open]);

  const aliases = inputKeys.map((_, index) => String.fromCharCode(65 + index));
  const advancedConfig = useMemo<MacroAdvancedDerivedConfig>(() => ({
    version: 2,
    kind,
    inputs: inputKeys.map((key, index) => {
      const settings = inputMethods[`${index}:${key}`] ?? { resample: "end" as const, fill: "none" as const, maxGap: 3 };
      return { key, alias: aliases[index]!, resampleMethod: settings.resample, fillMethod: settings.fill, maxGap: settings.maxGap };
    }),
    alignment: { frequency, join },
    ...(kind === "formula" ? { formula } : {}),
    ...(kind === "correlation" ? { correlation: { metric: statMetric, method: corrMethod, input: corrInput, window: corrWindow, minPeriods: corrMinPeriods, lag: corrLag, sample: statSample } } : {}),
  }), [aliases, corrInput, corrLag, corrMethod, corrMinPeriods, corrWindow, formula, frequency, inputKeys, inputMethods, join, kind, statMetric, statSample]);

  const formulaInputs = useMemo(
    () => inputKeys.map((key, index) => ({
      alias: aliases[index]!,
      label: props.options.find((option) => option.key === key)?.label ?? key,
      unit: props.options.find((option) => option.key === key)?.unit,
    })),
    [aliases, inputKeys, props.options],
  );
  const formulaInspection = useMemo(
    () => kind === "formula" ? inspectMacroFormula(formula, formulaInputs) : null,
    [formula, formulaInputs, kind],
  );

  const singlePreview = useMemo<MacroCalculationResult | null>(() => {
    const source = rawSeriesForKey(props.rawPayload, targetKey);
    if (!source) return null;
    const result = applyMacroSeriesSteps(source.categories, source.data, steps);
    const validPoints = result.data.filter((value) => value != null && Number.isFinite(value)).length;
    return {
      ...result,
      diagnostics: { inputPoints: { A: source.data.filter((value) => value != null && Number.isFinite(value)).length }, filledPoints: {}, alignedPoints: result.categories.length, validPoints, droppedPoints: result.categories.length - validPoints, warnings: [] },
    };
  }, [props.rawPayload, steps, targetKey]);

  const derivedPreview = useMemo<MacroCalculationResult | null>(() => {
    if ((!props.rawPayload && !props.displayPayload) || inputKeys.length < 2) return null;
    const map = new Map<string, MacroCalculationSeries>();
    for (const payload of [props.rawPayload, props.displayPayload]) {
      payload?.series.forEach((series) => {
        if (series.key) map.set(series.key, { key: series.key, name: series.name, categories: payload.categories, data: series.data, unit: props.options.find((option) => option.key === series.key)?.unit });
      });
    }
    try {
      if (editingId) {
        const candidate: MacroDerivedCalc = { id: editingId, leftKey: inputKeys[0] ?? "", rightKey: inputKeys[1] ?? "", op: "div", name: name || "编辑中的运算", advanced: advancedConfig };
        const graph = sortMacroDerivedCalculations([...props.derivedCalcs.filter((calc) => calc.id !== editingId), candidate]);
        if (graph.cyclicIds.includes(editingId)) throw new Error("公式形成循环引用，请移除对自身或下游派生指标的引用");
      }
      return evaluateAdvancedMacroCalculation(advancedConfig, map);
    } catch (error) {
      const message = error instanceof Error ? error.message : "计算失败";
      return { categories: [], data: [], diagnostics: { inputPoints: {}, filledPoints: {}, alignedPoints: 0, validPoints: 0, droppedPoints: 0, warnings: [], error: message } };
    }
  }, [advancedConfig, editingId, inputKeys, name, props.derivedCalcs, props.displayPayload, props.options, props.rawPayload]);

  if (!open) return null;

  const updateInputSettings = (index: number, key: string, patch: Partial<{ resample: MacroResampleMethod; fill: MacroMissingValueMethod; maxGap: number }>) => {
    const id = `${index}:${key}`;
    setInputMethods((previous) => {
      const current = previous[id] ?? { resample: "end" as const, fill: "none" as const, maxGap: 3 };
      return { ...previous, [id]: { ...current, ...patch } };
    });
  };
  const submitDerived = () => {
    if (inputKeys.length < 2 || derivedPreview?.diagnostics.error) return;
    const id = editingId ?? `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const leftKey = inputKeys[0]!;
    const rightKey = inputKeys[1]!;
    const metricLabel = statMetric === "covariance" ? "协方差" : statMetric === "beta" ? "Beta" : "相关性";
    const autoName = kind === "correlation"
      ? `${props.options.find((option) => option.key === leftKey)?.label ?? "A"} / ${props.options.find((option) => option.key === rightKey)?.label ?? "B"} · ${corrWindow}期${metricLabel}`
      : `公式：${formula}`;
    const next: MacroDerivedCalc = { id, leftKey, rightKey, op: "div", name: name.trim() || autoName, advanced: advancedConfig, ...(derivedPreview?.diagnostics.outputUnit ? { unitLabel: derivedPreview.diagnostics.outputUnit } : {}) };
    if (editingId) props.onUpdateDerived({ ...next, disabled: props.derivedCalcs.find((calc) => calc.id === editingId)?.disabled });
    else props.onAddDerived(next);
    setEditingId(null);
    props.onClose();
  };
  const editDerived = (calc: MacroDerivedCalc) => {
    const fallbackFormula = calc.op === "add" ? "A + B" : calc.op === "sub" || calc.op === "spread" ? "A - B" : calc.op === "mul" ? "A * B" : "A / B";
    const advanced: MacroAdvancedDerivedConfig = calc.advanced ?? {
      version: 2,
      kind: "formula",
      inputs: [calc.leftKey, calc.rightKey].map((key, index) => ({ key, alias: String.fromCharCode(65 + index), resampleMethod: "end", fillMethod: "none", maxGap: 3 })),
      alignment: { frequency: "keep", join: "inner" },
      formula: fallbackFormula,
    };
    setMode("derived");
    setManageOpen(false);
    setEditingId(calc.id);
    setName(calc.name);
    setInputKeys(advanced.inputs.map((input) => input.key));
    setInputMethods(Object.fromEntries(advanced.inputs.map((input, index) => [`${index}:${input.key}`, { resample: input.resampleMethod, fill: input.fillMethod, maxGap: input.maxGap }])));
    setFrequency(advanced.alignment.frequency);
    setJoin(advanced.alignment.join);
    setKind(advanced.kind);
    setFormula(advanced.formula ?? fallbackFormula);
    const rolling = advanced.correlation;
    setStatMetric(rolling?.metric ?? "correlation");
    setStatSample(rolling?.sample !== false);
    setCorrMethod(rolling?.method ?? "pearson");
    setCorrInput(rolling?.input ?? "pctChange");
    setCorrWindow(rolling?.window ?? 24);
    setCorrMinPeriods(rolling?.minPeriods ?? 18);
    setCorrLag(rolling?.lag ?? 0);
  };
  const duplicateDerived = (calc: MacroDerivedCalc) => {
    props.onAddDerived({
      ...calc,
      id: `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${calc.name}（副本）`,
      disabled: false,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/45 p-0 lg:items-center lg:p-6">
      <button type="button" aria-label="关闭" className="absolute inset-0" onClick={props.onClose} />
      <div role="dialog" aria-modal aria-label="指标运算工作台" className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-fs-bg shadow-2xl lg:h-[min(820px,92dvh)] lg:max-w-6xl lg:rounded-2xl">
        <header className="flex h-14 shrink-0 items-center border-b border-fs-border px-4 lg:px-5">
          <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-semibold text-fs-text">指标运算工作台</h2><p className="hidden text-xs text-fs-muted sm:block">按顺序处理、对齐并预览，计算定义会随模板保存</p></div>
          <button type="button" onClick={() => { setMode("derived"); setManageOpen((value) => !value); }} className="mr-2 rounded-full bg-fs-elevated px-2.5 py-1 text-xs text-fs-muted hover:text-fs-text">运算管理 {props.derivedCalcs.length}</button>
          <button type="button" onClick={props.onClose} aria-label="关闭" className="flex h-10 w-10 items-center justify-center rounded-lg text-fs-muted hover:bg-fs-elevated"><IconClose size={22} /></button>
        </header>
        <div className="shrink-0 border-b border-fs-border px-4 pt-2 lg:px-5">
          <div className="flex gap-1">
            <TabButton active={mode === "single"} onClick={() => setMode("single")}>单指标运算</TabButton>
            <TabButton active={mode === "derived"} onClick={() => setMode("derived")}>指标间运算</TabButton>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
          {mode === "single" ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                <Field label="指标">
                  <select value={targetKey} onChange={(event) => setTargetKey(event.target.value)} className={`${inputClass} w-full`}>
                    {singleOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                </Field>
                <div className="mt-4 flex flex-col gap-3">
                  {steps.length === 0 ? <div className="rounded-xl border border-dashed border-fs-border px-4 py-8 text-center text-sm text-fs-muted">当前为原始序列。用下方按钮添加运算步骤。</div> : null}
                  {steps.map((step, index) => (
                    <StepEditor key={step.id} step={step} index={index} total={steps.length} onChange={(next) => setSteps((current) => current.map((item) => item.id === step.id ? next : item))} onMove={(offset) => setSteps((current) => { const next = [...current]; const target = index + offset; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target]!, next[index]!]; return next; })} onRemove={() => setSteps((current) => current.filter((item) => item.id !== step.id))} />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["resample", "transform", "rollingMean", "zScore", "volatility", "fill", "scale"] as const).map((type) => <button key={type} type="button" onClick={() => setSteps((current) => [...current, defaultStep(type)])} className="rounded-lg border border-fs-border bg-white px-3 py-2 text-xs font-medium text-fs-text hover:border-fs-accent/50">+ {type === "resample" ? "变频" : type === "transform" ? "变化" : type === "rollingMean" ? "滚动均值" : type === "zScore" ? "Z-Score" : type === "volatility" ? "波动率" : type === "fill" ? "补值" : "缩放"}</button>)}
                </div>
              </div>
              <PreviewPanel result={singlePreview} />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-4">
                <section className="rounded-xl border border-fs-border bg-white">
                  <button type="button" onClick={() => setManageOpen((value) => !value)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
                    <span className="flex-1 text-sm font-semibold text-fs-text">已有运算</span>
                    <span className="text-xs text-fs-muted">{props.derivedCalcs.length} 项 · {manageOpen ? "收起" : "展开管理"}</span>
                  </button>
                  {manageOpen ? (
                    <div className="max-h-64 overflow-y-auto border-t border-fs-border">
                      {props.derivedCalcs.length === 0 ? <p className="px-3 py-5 text-center text-xs text-fs-muted">暂无派生运算</p> : props.derivedCalcs.map((calc) => (
                        <div key={calc.id} className={`flex flex-wrap items-center gap-2 border-b border-fs-border/70 px-3 py-2 last:border-0 ${calc.disabled ? "bg-fs-elevated opacity-70" : ""}`}>
                          <div className="min-w-0 flex-1 basis-48">
                            <p className="truncate text-sm font-medium text-fs-text">{calc.name}</p>
                            <p className="truncate text-[11px] text-fs-muted">{calc.disabled ? "已停用" : calc.advanced?.kind === "correlation" ? `${calc.advanced.correlation?.window ?? 24} 期滚动${calc.advanced.correlation?.metric === "beta" ? " Beta" : calc.advanced.correlation?.metric === "covariance" ? "协方差" : "相关性"}` : calc.advanced?.formula ?? "旧版二元运算"}</p>
                          </div>
                          <button type="button" onClick={() => editDerived(calc)} className="rounded border border-fs-border px-2 py-1 text-xs text-fs-secondary">编辑</button>
                          <button type="button" onClick={() => duplicateDerived(calc)} className="rounded border border-fs-border px-2 py-1 text-xs text-fs-secondary">复制</button>
                          <button type="button" onClick={() => props.onToggleDerived(calc.id)} className="rounded border border-fs-border px-2 py-1 text-xs text-fs-secondary">{calc.disabled ? "启用" : "停用"}</button>
                          <button type="button" onClick={() => { props.onDeleteDerived(calc.id); if (editingId === calc.id) setEditingId(null); }} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600">删除</button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
                <div className="flex rounded-lg border border-fs-border bg-fs-elevated p-0.5">
                  <button type="button" onClick={() => setKind("formula")} className={`h-9 flex-1 rounded-md text-sm font-medium ${kind === "formula" ? "bg-white text-fs-accent-text shadow-sm" : "text-fs-muted"}`}>多指标公式</button>
                  <button type="button" onClick={() => setKind("correlation")} className={`h-9 flex-1 rounded-md text-sm font-medium ${kind === "correlation" ? "bg-white text-fs-accent-text shadow-sm" : "text-fs-muted"}`}>滚动统计</button>
                </div>
                <section className="rounded-xl border border-fs-border bg-white p-3">
                  <div className="mb-3 flex items-center"><h3 className="flex-1 text-sm font-semibold text-fs-text">输入指标</h3><button type="button" disabled={inputKeys.length >= 8 || availableInputOptions.length === 0} onClick={() => setInputKeys((current) => [...current, availableInputOptions.find((option) => !current.includes(option.key))?.key ?? availableInputOptions[0]!.key])} className="text-xs font-medium text-fs-accent-text disabled:opacity-30">+ 添加输入</button></div>
                  <div className="space-y-3">
                    {inputKeys.map((key, index) => {
                      const settings = inputMethods[`${index}:${key}`] ?? { resample: "end" as const, fill: "none" as const, maxGap: 3 };
                      return <div key={`${index}-${key}`} className="grid grid-cols-[34px_minmax(0,1fr)] items-start gap-2 rounded-lg bg-fs-elevated p-2">
                        <div className="mt-5 flex h-10 items-center justify-center rounded-lg bg-fs-accent-soft text-sm font-semibold text-fs-accent-text">{aliases[index]}</div>
                        <div className="grid min-w-0 grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_110px_140px_72px_36px]">
                          <Field label="指标" className="col-span-2 sm:col-span-1"><select value={key} onChange={(event) => setInputKeys((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className={`${inputClass} w-full`}>{availableInputOptions.map((option) => <option key={option.key} value={option.key}>{option.derived ? "ƒ " : ""}{option.label}</option>)}</select></Field>
                          <Field label="聚合"><ResampleSelect value={settings.resample} onChange={(resample) => updateInputSettings(index, key, { resample })} /></Field>
                          <Field label="缺失值"><FillSelect value={settings.fill} onChange={(fill) => updateInputSettings(index, key, { fill })} /></Field>
                          <Field label="最大缺口">{numberInput(settings.maxGap, (maxGap) => updateInputSettings(index, key, { maxGap: Math.max(1, maxGap) }), 1, 120)}</Field>
                          <button type="button" aria-label={`删除输入 ${aliases[index]}`} disabled={inputKeys.length <= 2} onClick={() => setInputKeys((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="h-10 rounded-lg border border-fs-border text-sm text-red-600 disabled:opacity-25">×</button>
                        </div>
                      </div>;
                    })}
                  </div>
                </section>
                <section className="rounded-xl border border-fs-border bg-white p-3">
                  <h3 className="mb-3 text-sm font-semibold text-fs-text">时间对齐</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="目标频率"><select value={frequency} onChange={(event) => setFrequency(event.target.value as MacroFrequencyAdjust)} className={`${inputClass} w-full`}><option value="keep">保持原频率</option><option value="month">月</option><option value="quarter">季</option><option value="year">年</option></select></Field>
                    <Field label="连接方式"><select value={join} onChange={(event) => setJoin(event.target.value as typeof join)} className={`${inputClass} w-full`}><option value="inner">交集（推荐）</option><option value="union">并集</option><option value="left">跟随 A</option></select></Field>
                  </div>
                </section>
                {kind === "formula" ? (
                  <section className="rounded-xl border border-fs-border bg-white p-3">
                    <Field label="公式"><FormulaEditor value={formula} onChange={setFormula} inputs={formulaInputs} /></Field>
                    {formulaInspection?.outputUnit ? <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800">推断输出单位：{formulaInspection.outputUnit}</p> : null}
                    {formulaInspection?.warnings.map((warning) => <p key={warning} className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">{warning}</p>)}
                  </section>
                ) : (
                  <section className="rounded-xl border border-fs-border bg-white p-3">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                      <Field label="统计指标"><select value={statMetric} onChange={(event) => setStatMetric(event.target.value as typeof statMetric)} className={`${inputClass} w-full`}><option value="correlation">相关性</option><option value="covariance">协方差</option><option value="beta">Beta（A 对 B）</option></select></Field>
                      {statMetric === "correlation" ? <Field label="相关方法"><select value={corrMethod} onChange={(event) => setCorrMethod(event.target.value as typeof corrMethod)} className={`${inputClass} w-full`}><option value="pearson">Pearson</option><option value="spearman">Spearman</option></select></Field> : <Field label="估计口径"><select value={statSample ? "sample" : "population"} onChange={(event) => setStatSample(event.target.value === "sample")} className={`${inputClass} w-full`}><option value="sample">样本</option><option value="population">总体</option></select></Field>}
                      <Field label="输入变换"><select value={corrInput} onChange={(event) => setCorrInput(event.target.value as typeof corrInput)} className={`${inputClass} w-full`}><option value="level">水平值</option><option value="diff">差分</option><option value="pctChange">百分比变化</option><option value="logReturn">对数变化</option></select></Field>
                      <Field label="滚动窗口">{numberInput(corrWindow, (value) => setCorrWindow(Math.max(2, value)), 2, 520)}</Field>
                      <Field label="最少有效期数">{numberInput(corrMinPeriods, (value) => setCorrMinPeriods(Math.max(2, Math.min(corrWindow, value))), 2, corrWindow)}</Field>
                      <Field label="A 领先期数">{numberInput(corrLag, setCorrLag, -120, 120)}</Field>
                    </div>
                    <p className="mt-2 text-xs text-fs-muted">正数表示 A 领先 B。Beta = Cov(A,B) / Var(B)；水平值统计可能受共同趋势影响。</p>
                  </section>
                )}
                <Field label="输出名称（可选）"><input value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} w-full`} placeholder="留空则自动生成" /></Field>
              </div>
              <PreviewPanel result={derivedPreview} title="对齐与结果诊断" />
            </div>
          )}
        </div>
        <footer className="flex shrink-0 gap-2 border-t border-fs-border bg-white px-4 py-3 lg:px-5">
          {mode === "single" ? <button type="button" disabled={!targetKey} onClick={() => { props.onResetSingle(targetKey); setSteps([]); }} className="h-10 rounded-lg border border-fs-border px-4 text-sm text-fs-text disabled:opacity-40">恢复原始</button> : null}
          {mode === "derived" && editingId ? <button type="button" onClick={() => { setEditingId(null); setName(""); }} className="h-10 rounded-lg border border-fs-border px-4 text-sm text-fs-text">退出编辑</button> : null}
          <span className="flex-1" />
          <button type="button" onClick={props.onClose} className="h-10 rounded-lg border border-fs-border px-4 text-sm text-fs-text">取消</button>
          {mode === "single" ? <button type="button" disabled={!targetKey} onClick={() => { const previous = props.configMap[targetKey] ?? { op: "none", frequency: "keep", unit: "keep", resampleMethod: "end" }; props.onApplySingle(targetKey, { ...previous, steps }); props.onClose(); }} className="h-10 rounded-lg bg-fs-accent px-5 text-sm font-medium text-white disabled:opacity-40">应用运算链</button> : <button type="button" disabled={inputKeys.length < 2 || Boolean(derivedPreview?.diagnostics.error)} onClick={submitDerived} className="h-10 rounded-lg bg-fs-accent px-5 text-sm font-medium text-white disabled:opacity-40">{editingId ? "保存修改" : "添加派生指标"}</button>}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`h-10 border-b-2 px-4 text-sm font-medium ${active ? "border-fs-accent text-fs-accent-text" : "border-transparent text-fs-muted hover:text-fs-text"}`}>{children}</button>;
}
