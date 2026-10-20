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
  MacroSeriesCalcStep,
} from "@/lib/data/macroPresetTemplates";
import {
  applyMacroSeriesSteps,
  evaluateAdvancedMacroCalculation,
  inspectMacroFormula,
  MACRO_FORMULA_FUNCTIONS,
  sortMacroDerivedCalculations,
  validateMacroFormula,
  type MacroCalculationResult,
  type MacroCalculationSeries,
} from "@/lib/macroCalculationEngine";
import { MACRO_CALCULATION_TEMPLATES, type MacroCalculationTemplate } from "@/lib/macroCalculationTemplates";
import { buildMacroSeriesCalcSuffix } from "@/lib/macroSeriesDisplayName";
import { IconClose } from "@/components/mobile/mobileIcons";

type KeyOption = { key: string; label: string; unit?: string | null; derived?: boolean };

export type MacroCalculationWorkbenchProps = {
  open: boolean;
  onClose: () => void;
  options: KeyOption[];
  rawPayload: MacroPayload | null;
  displayPayload: MacroPayload | null;
  derivedCalcs: MacroDerivedCalc[];
  onAddDerived: (calc: MacroDerivedCalc) => void;
  onUpdateDerived: (calc: MacroDerivedCalc) => void;
  onDeleteDerived: (id: string) => void;
  onToggleDerived: (id: string) => void;
};

const inputClass =
  "h-9 min-w-0 rounded-md border border-fs-border bg-white px-2 text-[13px] text-fs-text outline-none focus:border-fs-accent focus:ring-1 focus:ring-fs-accent/20";
const labelClass = "mb-0.5 block text-[11px] font-medium text-fs-muted";

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
  if (type === "rollingQuantile") return { id, type, window: 24, minPeriods: 18, quantile: 0.5 };
  if (type === "outlier") return { id, type, method: "winsorize", lower: 0.05, upper: 0.95 };
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
          : step.type === "rollingQuantile"
            ? "滚动分位数"
          : step.type === "outlier"
            ? "异常值处理"
          : step.type === "volatility"
            ? "波动率"
            : step.type === "fill"
              ? "缺失值处理"
              : "数值缩放";
  return (
    <div className="rounded-lg border border-fs-border bg-white p-2.5 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-fs-accent-soft text-xs font-semibold text-fs-accent-text">
          {index + 1}
        </span>
        <span className="flex-1 text-[13px] font-semibold text-fs-text">{title}</span>
        <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="h-7 px-2 text-xs text-fs-muted disabled:opacity-25">↑</button>
        <button type="button" disabled={index === total - 1} onClick={() => onMove(1)} className="h-7 px-2 text-xs text-fs-muted disabled:opacity-25">↓</button>
        <button type="button" onClick={onRemove} className="h-7 px-2 text-xs text-red-600">删除</button>
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
      {step.type === "rollingQuantile" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Field label="滚动窗口">{numberInput(step.window, (window) => onChange({ ...step, window: Math.max(2, window) }), 2, 520)}</Field>
          <Field label="最少有效期数">{numberInput(step.minPeriods, (minPeriods) => onChange({ ...step, minPeriods: Math.max(1, Math.min(step.window, minPeriods)) }), 1, step.window)}</Field>
          <Field label="分位数（0–100）">{numberInput(Math.round(step.quantile * 100), (quantile) => onChange({ ...step, quantile: Math.min(1, Math.max(0, quantile / 100)) }), 0, 100)}</Field>
        </div>
      ) : null}
      {step.type === "outlier" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Field label="处理方式">
            <select value={step.method} onChange={(event) => onChange({ ...step, method: event.target.value as typeof step.method, lower: event.target.value === "clip" ? 0 : 0.05, upper: event.target.value === "clip" ? 100 : 0.95 })} className={`${inputClass} w-full`}>
              <option value="winsorize">Winsorize 截尾</option><option value="null">极端值设为空</option><option value="clip">固定上下界</option>
            </select>
          </Field>
          <Field label={step.method === "clip" ? "数值下界" : "下分位数（0–100）"}>{numberInput(step.method === "clip" ? step.lower : Math.round(step.lower * 100), (lower) => onChange({ ...step, lower: step.method === "clip" ? lower : Math.min(1, Math.max(0, lower / 100)) }), step.method === "clip" ? undefined : 0, step.method === "clip" ? undefined : 100)}</Field>
          <Field label={step.method === "clip" ? "数值上界" : "上分位数（0–100）"}>{numberInput(step.method === "clip" ? step.upper : Math.round(step.upper * 100), (upper) => onChange({ ...step, upper: step.method === "clip" ? upper : Math.min(1, Math.max(0, upper / 100)) }), step.method === "clip" ? undefined : 0, step.method === "clip" ? undefined : 100)}</Field>
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
    <aside className="rounded-lg border border-fs-border bg-fs-elevated p-2.5 lg:sticky lg:top-0 lg:self-start">
      <h3 className="text-[13px] font-semibold text-fs-text">{title}</h3>
      {!result ? <p className="mt-2.5 text-[13px] text-fs-muted">选择指标并配置运算后显示预览。</p> : (
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
  return <div className="rounded-lg border border-fs-border bg-white px-1 py-1.5"><div className="text-sm font-semibold text-fs-text">{value}</div><div className="text-[10px] text-fs-muted">{label}</div></div>;
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
        className="w-full resize-y rounded-md border border-fs-border bg-white px-2.5 py-1.5 font-mono text-[13px] text-fs-text outline-none focus:border-fs-accent"
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

type PortableCalculationPackage = {
  type: "gekko-macro-calculation";
  version: 1;
  name?: string;
  advanced: MacroAdvancedDerivedConfig;
  outputs?: Array<{ name?: string; formula: string }>;
};

function encodeSharePackage(value: PortableCalculationPackage) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeSharePackage(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function parsePortablePackage(source: string): PortableCalculationPackage {
  if (source.length > 24_000) throw new Error("导入内容过长");
  let text = source.trim();
  if (/^https?:\/\//i.test(text)) {
    const token = new URL(text).searchParams.get("macroCalc");
    if (!token) throw new Error("分享链接中没有 macroCalc 参数");
    text = decodeSharePackage(token);
  }
  const parsed = JSON.parse(text) as Partial<PortableCalculationPackage>;
  if (parsed.type !== "gekko-macro-calculation" || parsed.version !== 1 || !parsed.advanced) {
    throw new Error("不是受支持的指标运算配置");
  }
  const raw = parsed.advanced;
  if (!["formula", "correlation", "regression"].includes(raw.kind)) throw new Error("运算类型无效");
  if (!Array.isArray(raw.inputs) || raw.inputs.length < 2 || raw.inputs.length > 8) throw new Error("输入指标数量应为 2–8 个");
  const resampleMethods = new Set<MacroResampleMethod>(["avg", "start", "end", "sum", "min", "max"]);
  const fillMethods = new Set<MacroMissingValueMethod>(["none", "forward", "backward", "linear"]);
  const aliases = new Set<string>();
  const inputs = raw.inputs.map((input, index) => {
    const key = String(input.key ?? "").trim().slice(0, 240);
    const alias = String(input.alias ?? String.fromCharCode(65 + index)).trim().toUpperCase();
    if (!key || !/^[A-Z][A-Z0-9_]{0,15}$/.test(alias) || aliases.has(alias)) throw new Error("输入指标或别名无效");
    aliases.add(alias);
    return {
      key,
      alias,
      resampleMethod: resampleMethods.has(input.resampleMethod) ? input.resampleMethod : "end" as const,
      fillMethod: fillMethods.has(input.fillMethod) ? input.fillMethod : "none" as const,
      maxGap: Math.min(120, Math.max(1, Math.trunc(Number(input.maxGap) || 3))),
    };
  });
  const frequency = ["keep", "month", "quarter", "year"].includes(raw.alignment?.frequency)
    ? raw.alignment.frequency
    : "keep";
  const join = ["inner", "union", "left"].includes(raw.alignment?.join) ? raw.alignment.join : "inner";
  const advanced: MacroAdvancedDerivedConfig = {
    version: 2,
    kind: raw.kind,
    inputs,
    alignment: { frequency, join },
  };
  if (raw.kind === "formula") {
    const formula = String(raw.formula ?? "").slice(0, 500);
    const validation = validateMacroFormula(formula, inputs.map((input) => input.alias));
    if (validation) throw new Error(validation);
    advanced.formula = formula;
  }
  if (raw.kind === "correlation") {
    const config = raw.correlation;
    if (!config) throw new Error("滚动统计配置缺失");
    const window = Math.min(520, Math.max(2, Math.trunc(Number(config.window) || 24)));
    advanced.correlation = {
      metric: config.metric === "covariance" || config.metric === "beta" ? config.metric : "correlation",
      method: config.method === "spearman" ? "spearman" : "pearson",
      input: ["diff", "pctChange", "logReturn", "yoy"].includes(config.input) ? config.input : "level",
      window,
      minPeriods: Math.min(window, Math.max(2, Math.trunc(Number(config.minPeriods) || Math.ceil(window * 0.8)))),
      lag: Math.min(120, Math.max(-120, Math.trunc(Number(config.lag) || 0))),
      sample: config.sample !== false,
    };
  }
  if (raw.kind === "regression") {
    const config = raw.regression;
    if (!config) throw new Error("回归配置缺失");
    const window = Math.min(520, Math.max(3, Math.trunc(Number(config.window) || 36)));
    advanced.regression = {
      output: ["coefficient", "intercept", "rSquared", "fitted", "residual"].includes(config.output) ? config.output : "residual",
      input: ["diff", "pctChange", "logReturn", "yoy"].includes(config.input) ? config.input : "level",
      window,
      minPeriods: Math.min(window, Math.max(3, Math.trunc(Number(config.minPeriods) || Math.ceil(window * 0.8)))),
      lag: Math.min(120, Math.max(-120, Math.trunc(Number(config.lag) || 0))),
      includeIntercept: config.includeIntercept !== false,
    };
  }
  const outputs = Array.isArray(parsed.outputs)
    ? parsed.outputs.slice(0, 8).map((output, index) => {
        const formula = String(output.formula ?? "").slice(0, 500);
        const validation = validateMacroFormula(formula, inputs.map((input) => input.alias));
        if (validation) throw new Error(`输出 ${index + 1}：${validation}`);
        return { name: typeof output.name === "string" ? output.name.trim().slice(0, 160) : undefined, formula };
      })
    : undefined;
  return {
    type: "gekko-macro-calculation",
    version: 1,
    name: typeof parsed.name === "string" ? parsed.name.trim().slice(0, 160) : undefined,
    advanced,
    ...(outputs?.length ? { outputs } : {}),
  };
}

export function MacroCalculationWorkbench(props: MacroCalculationWorkbenchProps) {
  const { open, onClose } = props;
  const [mode, setMode] = useState<"single" | "derived">("single");
  const [targetKey, setTargetKey] = useState("");
  const [steps, setSteps] = useState<MacroSeriesCalcStep[]>([]);
  const [singleName, setSingleName] = useState("");
  const [kind, setKind] = useState<"formula" | "correlation" | "regression">("formula");
  const [inputKeys, setInputKeys] = useState<string[]>([]);
  const [inputMethods, setInputMethods] = useState<Record<string, { resample: MacroResampleMethod; fill: MacroMissingValueMethod; maxGap: number }>>({});
  const [frequency, setFrequency] = useState<MacroFrequencyAdjust>("keep");
  const [join, setJoin] = useState<"inner" | "union" | "left">("inner");
  const [formula, setFormula] = useState("A / B * 100");
  const [name, setName] = useState("");
  const [extraOutputs, setExtraOutputs] = useState<Array<{ id: string; name: string; formula: string }>>([]);
  const [corrMethod, setCorrMethod] = useState<"pearson" | "spearman">("pearson");
  const [statMetric, setStatMetric] = useState<"correlation" | "covariance" | "beta">("correlation");
  const [statSample, setStatSample] = useState(true);
  const [corrInput, setCorrInput] = useState<"level" | "diff" | "pctChange" | "logReturn" | "yoy">("pctChange");
  const [corrWindow, setCorrWindow] = useState(24);
  const [corrMinPeriods, setCorrMinPeriods] = useState(18);
  const [corrLag, setCorrLag] = useState(0);
  const [regressionOutput, setRegressionOutput] = useState<"coefficient" | "intercept" | "rSquared" | "fitted" | "residual">("residual");
  const [regressionWindow, setRegressionWindow] = useState(36);
  const [regressionMinPeriods, setRegressionMinPeriods] = useState(24);
  const [regressionIntercept, setRegressionIntercept] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferText, setTransferText] = useState("");
  const [transferStatus, setTransferStatus] = useState("");
  const importedShareRef = useRef("");
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

  useEffect(() => {
    if (!open) return;
    const token = new URLSearchParams(window.location.search).get("macroCalc") ?? "";
    if (!token || importedShareRef.current === token) return;
    importedShareRef.current = token;
    setMode("derived");
    setTransferOpen(true);
    setTransferText(window.location.href);
    setTransferStatus("检测到分享配置，点击“导入配置”后检查预览并保存");
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
    ...(kind === "regression" ? { regression: { output: regressionOutput, input: corrInput, window: regressionWindow, minPeriods: regressionMinPeriods, lag: corrLag, includeIntercept: regressionIntercept } } : {}),
  }), [aliases, corrInput, corrLag, corrMethod, corrMinPeriods, corrWindow, formula, frequency, inputKeys, inputMethods, join, kind, regressionIntercept, regressionMinPeriods, regressionOutput, regressionWindow, statMetric, statSample]);

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
    const warnings = [
      ...(steps.some((step) => step.type === "outlier" && step.method !== "clip") ? ["全样本分位数异常值处理会使用当前区间的全部数据，仅适合历史分析"] : []),
      ...(steps.some((step) => step.type === "fill" && (step.method === "backward" || step.method === "linear")) ? ["当前补值方法可能包含前视信息"] : []),
    ];
    return {
      ...result,
      diagnostics: { inputPoints: { A: source.data.filter((value) => value != null && Number.isFinite(value)).length }, filledPoints: {}, alignedPoints: result.categories.length, validPoints, droppedPoints: result.categories.length - validPoints, warnings },
    };
  }, [props.rawPayload, steps, targetKey]);

  const singleAutoName = useMemo(() => {
    const label = props.options.find((option) => option.key === targetKey)?.label ?? "派生指标";
    const suffix = buildMacroSeriesCalcSuffix({
      op: "none",
      frequency: "keep",
      unit: "keep",
      resampleMethod: "end",
      steps,
    });
    return suffix ? `${label}（${suffix}）` : `${label}（派生）`;
  }, [props.options, steps, targetKey]);

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
  const applyAdvancedToState = (advanced: MacroAdvancedDerivedConfig, importedName = "", outputs: PortableCalculationPackage["outputs"] = []) => {
    const missing = advanced.inputs.find((input) => !props.options.some((option) => option.key === input.key));
    if (missing) throw new Error(`当前工作区没有输入指标 ${missing.key}`);
    setMode("derived");
    setEditingId(null);
    setInputKeys(advanced.inputs.map((input) => input.key));
    setInputMethods(Object.fromEntries(advanced.inputs.map((input, index) => [`${index}:${input.key}`, { resample: input.resampleMethod, fill: input.fillMethod, maxGap: input.maxGap }])));
    setFrequency(advanced.alignment.frequency);
    setJoin(advanced.alignment.join);
    setKind(advanced.kind);
    setName(importedName);
    setFormula(advanced.formula ?? "A - B");
    setExtraOutputs((outputs ?? []).slice(1, 8).map((output) => ({ id: stepId(), name: output.name ?? "", formula: output.formula.slice(0, 500) })));
    const rolling = advanced.correlation;
    setStatMetric(rolling?.metric ?? "correlation");
    setStatSample(rolling?.sample !== false);
    setCorrMethod(rolling?.method ?? "pearson");
    setCorrInput(rolling?.input ?? advanced.regression?.input ?? "pctChange");
    setCorrWindow(rolling?.window ?? 24);
    setCorrMinPeriods(rolling?.minPeriods ?? 18);
    setCorrLag(rolling?.lag ?? advanced.regression?.lag ?? 0);
    const regression = advanced.regression;
    setRegressionOutput(regression?.output ?? "residual");
    setRegressionWindow(regression?.window ?? 36);
    setRegressionMinPeriods(regression?.minPeriods ?? 24);
    setRegressionIntercept(regression?.includeIntercept !== false);
  };
  const applyCalculationTemplate = (template: MacroCalculationTemplate) => {
    setTransferStatus(`已载入模板“${template.title}”`);
    if (template.mode === "single") {
      setMode("single");
      setEditingId(null);
      setSingleName("");
      setSteps(template.steps.map((step) => ({ ...step, id: stepId() })));
      return;
    }
    setMode("derived");
    setKind(template.kind);
    setName(template.title);
    setExtraOutputs([]);
    if (template.formula) setFormula(template.formula);
    if (template.correlation) {
      setCorrInput(template.correlation.input);
      setCorrWindow(template.correlation.window);
      setCorrMinPeriods(template.correlation.minPeriods);
      setStatMetric("correlation");
      setCorrMethod("pearson");
    }
    if (template.regression) {
      setRegressionOutput(template.regression.output);
      setCorrInput(template.regression.input);
      setRegressionWindow(template.regression.window);
      setRegressionMinPeriods(template.regression.minPeriods);
    }
  };
  const portablePackage = (): PortableCalculationPackage => ({
    type: "gekko-macro-calculation",
    version: 1,
    name: name.trim() || undefined,
    advanced: advancedConfig,
    ...(kind === "formula" ? { outputs: [{ name: name.trim() || undefined, formula }, ...extraOutputs.map((output) => ({ name: output.name.trim() || undefined, formula: output.formula }))] } : {}),
  });
  const exportCalculation = () => {
    setTransferText(JSON.stringify(portablePackage(), null, 2));
    setTransferStatus("已生成可移植 JSON");
  };
  const importCalculation = () => {
    try {
      const imported = parsePortablePackage(transferText);
      applyAdvancedToState(imported.advanced, imported.name ?? "", imported.outputs);
      setTransferStatus("导入成功，请检查预览后保存");
    } catch (error) {
      setTransferStatus(error instanceof Error ? error.message : "导入失败");
    }
  };
  const copyShareLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("macroCalc", encodeSharePackage(portablePackage()));
      await navigator.clipboard.writeText(url.toString());
      setTransferText(url.toString());
      setTransferStatus("分享链接已复制；接收方可在导入框中直接粘贴");
    } catch {
      setTransferStatus("无法写入剪贴板，分享链接已显示在文本框中");
      const url = new URL(window.location.href);
      url.searchParams.set("macroCalc", encodeSharePackage(portablePackage()));
      setTransferText(url.toString());
    }
  };
  const submitDerived = () => {
    if (inputKeys.length < 2 || derivedPreview?.diagnostics.error) return;
    const leftKey = inputKeys[0]!;
    const rightKey = inputKeys[1]!;
    const metricLabel = statMetric === "covariance" ? "协方差" : statMetric === "beta" ? "Beta" : "相关性";
    const regressionLabel = regressionOutput === "coefficient" ? "回归系数" : regressionOutput === "intercept" ? "回归截距" : regressionOutput === "rSquared" ? "R²" : regressionOutput === "fitted" ? "回归拟合值" : "回归残差";
    const autoName = kind === "correlation"
      ? `${props.options.find((option) => option.key === leftKey)?.label ?? "A"} / ${props.options.find((option) => option.key === rightKey)?.label ?? "B"} · ${corrWindow}期${metricLabel}`
      : kind === "regression"
        ? `${props.options.find((option) => option.key === leftKey)?.label ?? "A"} · ${regressionWindow}期${regressionLabel}`
      : `公式：${formula}`;
    const outputDefinitions = kind === "formula"
      ? [{ name: name.trim() || autoName, formula }, ...extraOutputs.map((output, index) => ({ name: output.name.trim() || `公式输出 ${index + 2}`, formula: output.formula }))]
      : [{ name: name.trim() || autoName, formula: "" }];
    const invalidOutput = outputDefinitions.find((output) => kind === "formula" && validateMacroFormula(output.formula, aliases));
    if (invalidOutput) {
      setTransferStatus(`“${invalidOutput.name}”公式无效：${validateMacroFormula(invalidOutput.formula, aliases)}`);
      return;
    }
    outputDefinitions.forEach((output, index) => {
      const id = index === 0 && editingId ? editingId : `d-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      const config = kind === "formula" ? { ...advancedConfig, formula: output.formula } : advancedConfig;
      const inferredUnit = kind === "formula"
        ? inspectMacroFormula(output.formula, formulaInputs).outputUnit
        : index === 0 ? derivedPreview?.diagnostics.outputUnit : undefined;
      const next: MacroDerivedCalc = { id, leftKey, rightKey, op: "div", name: output.name, advanced: config, ...(inferredUnit ? { unitLabel: inferredUnit } : {}) };
      if (index === 0 && editingId) props.onUpdateDerived({ ...next, disabled: props.derivedCalcs.find((calc) => calc.id === editingId)?.disabled });
      else props.onAddDerived(next);
    });
    setEditingId(null);
    setExtraOutputs([]);
    props.onClose();
  };
  const submitSingle = () => {
    if (!targetKey || steps.length === 0 || singlePreview?.diagnostics.error) return;
    const id = editingId ?? `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const forcedUnitStep = [...steps].reverse().find((step) => step.type === "scale" && step.unitLabel?.trim());
    const forcedUnit = forcedUnitStep?.type === "scale" && forcedUnitStep.unitLabel?.trim()
      ? forcedUnitStep.unitLabel.trim()
      : steps.some((step) => step.type === "zScore")
        ? "标准差"
        : steps.some((step) => step.type === "volatility" || (step.type === "transform" && (step.op === "yoy" || step.op === "pctChange" || step.op === "logReturn")))
          ? "%"
          : undefined;
    const next: MacroDerivedCalc = {
      id,
      leftKey: targetKey,
      rightKey: targetKey,
      op: "add",
      name: singleName.trim() || singleAutoName,
      ...(forcedUnit ? { unitLabel: forcedUnit } : {}),
      single: {
        inputKey: targetKey,
        steps: steps.map((step) => ({ ...step })),
      },
    };
    if (editingId) {
      const previous = props.derivedCalcs.find((calc) => calc.id === editingId);
      props.onUpdateDerived({ ...next, ...(previous?.disabled ? { disabled: true } : {}) });
    } else {
      props.onAddDerived(next);
    }
    setEditingId(null);
    setSingleName("");
    setSteps([]);
    props.onClose();
  };
  const editDerived = (calc: MacroDerivedCalc) => {
    if (calc.single) {
      setMode("single");
      setManageOpen(false);
      setEditingId(calc.id);
      setTargetKey(calc.single.inputKey);
      setSteps(calc.single.steps.map((step) => ({ ...step })));
      setSingleName(calc.name);
      return;
    }
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
    setExtraOutputs([]);
    const rolling = advanced.correlation;
    setStatMetric(rolling?.metric ?? "correlation");
    setStatSample(rolling?.sample !== false);
    setCorrMethod(rolling?.method ?? "pearson");
    setCorrInput(rolling?.input ?? "pctChange");
    setCorrWindow(rolling?.window ?? 24);
    setCorrMinPeriods(rolling?.minPeriods ?? 18);
    setCorrLag(rolling?.lag ?? 0);
    const regression = advanced.regression;
    setRegressionOutput(regression?.output ?? "residual");
    setRegressionWindow(regression?.window ?? 36);
    setRegressionMinPeriods(regression?.minPeriods ?? 24);
    setRegressionIntercept(regression?.includeIntercept !== false);
  };
  const duplicateDerived = (calc: MacroDerivedCalc) => {
    props.onAddDerived({
      ...calc,
      id: `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${calc.name}（副本）`,
      disabled: false,
    });
  };
  const switchMode = (nextMode: "single" | "derived") => {
    if (nextMode !== mode) {
      setEditingId(null);
      setName("");
      setSingleName("");
    }
    setMode(nextMode);
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/45 p-0 lg:items-center lg:p-6">
      <button type="button" aria-label="关闭" className="absolute inset-0" onClick={props.onClose} />
      <div role="dialog" aria-modal aria-label="指标运算工作台" className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-fs-bg shadow-2xl lg:h-[min(820px,92dvh)] lg:max-w-6xl lg:rounded-2xl">
        <header className="flex h-12 shrink-0 items-center border-b border-fs-border px-3.5 lg:px-4">
          <div className="min-w-0 flex-1"><h2 className="truncate text-base font-semibold text-fs-text">指标运算工作台</h2><p className="hidden text-[11px] text-fs-muted sm:block">按顺序处理、对齐并预览，计算定义会随模板保存</p></div>
          <button type="button" onClick={() => { switchMode("derived"); setManageOpen((value) => !value); }} className="mr-2 rounded-full bg-fs-elevated px-2.5 py-1 text-xs text-fs-muted hover:text-fs-text">运算管理 {props.derivedCalcs.length}</button>
          <button type="button" onClick={props.onClose} aria-label="关闭" className="flex h-9 w-9 items-center justify-center rounded-md text-fs-muted hover:bg-fs-elevated"><IconClose size={20} /></button>
        </header>
        <div className="shrink-0 border-b border-fs-border px-3.5 pt-1 lg:px-4">
          <div className="flex gap-1">
            <TabButton active={mode === "single"} onClick={() => switchMode("single")}>单指标运算</TabButton>
            <TabButton active={mode === "derived"} onClick={() => switchMode("derived")}>指标间运算</TabButton>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 lg:p-4">
          <section className="mb-3 rounded-lg border border-fs-border bg-white">
            <button type="button" onClick={() => setTemplateOpen((value) => !value)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
              <span className="flex-1 text-[13px] font-semibold text-fs-text">计算模板库</span>
              <span className="text-xs text-fs-muted">{MACRO_CALCULATION_TEMPLATES.length} 个模板 · {templateOpen ? "收起" : "展开"}</span>
            </button>
            {templateOpen ? (
              <div className="grid gap-2 border-t border-fs-border p-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {MACRO_CALCULATION_TEMPLATES.map((template) => (
                  <button key={template.id} type="button" onClick={() => applyCalculationTemplate(template)} className="rounded-md border border-fs-border bg-fs-elevated px-2.5 py-1.5 text-left hover:border-fs-accent/50">
                    <span className="block text-[13px] font-medium text-fs-text">{template.title}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-fs-muted">{template.description}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
          {mode === "single" ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0">
                <Field label="指标">
                  <select value={targetKey} onChange={(event) => setTargetKey(event.target.value)} className={`${inputClass} w-full`}>
                    {singleOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                </Field>
                <Field label="派生指标名称（可重命名）" className="mt-2 block">
                  <input
                    value={singleName}
                    onChange={(event) => setSingleName(event.target.value)}
                    className={`${inputClass} w-full`}
                    placeholder={`留空则使用：${singleAutoName}`}
                    maxLength={160}
                  />
                </Field>
                <p className="mt-1.5 text-[11px] text-fs-muted">原指标会保留，运算结果将作为新的派生指标添加。</p>
                <div className="mt-3 flex flex-col gap-2.5">
                  {steps.length === 0 ? <div className="rounded-lg border border-dashed border-fs-border px-3 py-6 text-center text-[13px] text-fs-muted">当前为原始序列。用下方按钮添加运算步骤。</div> : null}
                  {steps.map((step, index) => (
                    <StepEditor key={step.id} step={step} index={index} total={steps.length} onChange={(next) => setSteps((current) => current.map((item) => item.id === step.id ? next : item))} onMove={(offset) => setSteps((current) => { const next = [...current]; const target = index + offset; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target]!, next[index]!]; return next; })} onRemove={() => setSteps((current) => current.filter((item) => item.id !== step.id))} />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["resample", "transform", "rollingMean", "rollingQuantile", "zScore", "outlier", "volatility", "fill", "scale"] as const).map((type) => <button key={type} type="button" onClick={() => setSteps((current) => [...current, defaultStep(type)])} className="rounded-md border border-fs-border bg-white px-2.5 py-1.5 text-xs font-medium text-fs-text hover:border-fs-accent/50">+ {type === "resample" ? "变频" : type === "transform" ? "变化" : type === "rollingMean" ? "滚动均值" : type === "rollingQuantile" ? "分位数" : type === "zScore" ? "Z-Score" : type === "outlier" ? "异常值" : type === "volatility" ? "波动率" : type === "fill" ? "补值" : "缩放"}</button>)}
                </div>
              </div>
              <PreviewPanel result={singlePreview} />
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 space-y-3">
                <section className="rounded-xl border border-fs-border bg-white">
                  <button type="button" onClick={() => setManageOpen((value) => !value)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
                    <span className="flex-1 text-[13px] font-semibold text-fs-text">已有运算</span>
                    <span className="text-xs text-fs-muted">{props.derivedCalcs.length} 项 · {manageOpen ? "收起" : "展开管理"}</span>
                  </button>
                  {manageOpen ? (
                    <div className="max-h-64 overflow-y-auto border-t border-fs-border">
                      {props.derivedCalcs.length === 0 ? <p className="px-3 py-5 text-center text-xs text-fs-muted">暂无派生运算</p> : props.derivedCalcs.map((calc) => (
                        <div key={calc.id} className={`flex flex-wrap items-center gap-2 border-b border-fs-border/70 px-3 py-2 last:border-0 ${calc.disabled ? "bg-fs-elevated opacity-70" : ""}`}>
                          <div className="min-w-0 flex-1 basis-48">
                            <p className="truncate text-[13px] font-medium text-fs-text">{calc.name}</p>
                            <p className="truncate text-[11px] text-fs-muted">{calc.disabled ? "已停用" : calc.single ? `${calc.single.steps.length} 步单指标运算` : calc.advanced?.kind === "correlation" ? `${calc.advanced.correlation?.window ?? 24} 期滚动${calc.advanced.correlation?.metric === "beta" ? " Beta" : calc.advanced.correlation?.metric === "covariance" ? "协方差" : "相关性"}` : calc.advanced?.kind === "regression" ? `${calc.advanced.regression?.window ?? 36} 期滚动回归 · ${calc.advanced.regression?.output ?? "residual"}` : calc.advanced?.formula ?? "旧版二元运算"}</p>
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
                  <button type="button" onClick={() => setKind("formula")} className={`h-8 flex-1 rounded text-[13px] font-medium ${kind === "formula" ? "bg-white text-fs-accent-text shadow-sm" : "text-fs-muted"}`}>多指标公式</button>
                  <button type="button" onClick={() => setKind("correlation")} className={`h-8 flex-1 rounded text-[13px] font-medium ${kind === "correlation" ? "bg-white text-fs-accent-text shadow-sm" : "text-fs-muted"}`}>滚动统计</button>
                  <button type="button" onClick={() => setKind("regression")} className={`h-8 flex-1 rounded text-[13px] font-medium ${kind === "regression" ? "bg-white text-fs-accent-text shadow-sm" : "text-fs-muted"}`}>回归分析</button>
                </div>
                <section className="rounded-lg border border-fs-border bg-white p-2.5">
                  <div className="mb-2.5 flex items-center"><h3 className="flex-1 text-[13px] font-semibold text-fs-text">输入指标</h3><button type="button" disabled={inputKeys.length >= 8 || availableInputOptions.length === 0} onClick={() => setInputKeys((current) => [...current, availableInputOptions.find((option) => !current.includes(option.key))?.key ?? availableInputOptions[0]!.key])} className="text-xs font-medium text-fs-accent-text disabled:opacity-30">+ 添加输入</button></div>
                  <div className="space-y-3">
                    {inputKeys.map((key, index) => {
                      const settings = inputMethods[`${index}:${key}`] ?? { resample: "end" as const, fill: "none" as const, maxGap: 3 };
                      return <div key={`${index}-${key}`} className="grid grid-cols-[34px_minmax(0,1fr)] items-start gap-2 rounded-lg bg-fs-elevated p-2">
                        <div className="mt-4 flex h-9 items-center justify-center rounded-md bg-fs-accent-soft text-[13px] font-semibold text-fs-accent-text">{aliases[index]}</div>
                        <div className="grid min-w-0 grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_110px_140px_72px_36px]">
                          <Field label="指标" className="col-span-2 sm:col-span-1"><select value={key} onChange={(event) => setInputKeys((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className={`${inputClass} w-full`}>{availableInputOptions.map((option) => <option key={option.key} value={option.key}>{option.derived ? "ƒ " : ""}{option.label}</option>)}</select></Field>
                          <Field label="聚合"><ResampleSelect value={settings.resample} onChange={(resample) => updateInputSettings(index, key, { resample })} /></Field>
                          <Field label="缺失值"><FillSelect value={settings.fill} onChange={(fill) => updateInputSettings(index, key, { fill })} /></Field>
                          <Field label="最大缺口">{numberInput(settings.maxGap, (maxGap) => updateInputSettings(index, key, { maxGap: Math.max(1, maxGap) }), 1, 120)}</Field>
                          <button type="button" aria-label={`删除输入 ${aliases[index]}`} disabled={inputKeys.length <= 2} onClick={() => setInputKeys((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="h-9 rounded-md border border-fs-border text-[13px] text-red-600 disabled:opacity-25">×</button>
                        </div>
                      </div>;
                    })}
                  </div>
                </section>
                <section className="rounded-lg border border-fs-border bg-white p-2.5">
                  <h3 className="mb-2.5 text-[13px] font-semibold text-fs-text">时间对齐</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="目标频率"><select value={frequency} onChange={(event) => setFrequency(event.target.value as MacroFrequencyAdjust)} className={`${inputClass} w-full`}><option value="keep">保持原频率</option><option value="month">月</option><option value="quarter">季</option><option value="year">年</option></select></Field>
                    <Field label="连接方式"><select value={join} onChange={(event) => setJoin(event.target.value as typeof join)} className={`${inputClass} w-full`}><option value="inner">交集（推荐）</option><option value="union">并集</option><option value="left">跟随 A</option></select></Field>
                  </div>
                </section>
                {kind === "formula" ? (
                  <section className="rounded-lg border border-fs-border bg-white p-2.5">
                    <div className="mb-2.5 flex items-center gap-2"><h3 className="flex-1 text-[13px] font-semibold text-fs-text">批量公式输出</h3><button type="button" disabled={extraOutputs.length >= 7} onClick={() => setExtraOutputs((current) => [...current, { id: stepId(), name: "", formula: "A - B" }])} className="text-xs font-medium text-fs-accent-text disabled:opacity-40">+ 添加输出</button></div>
                    <Field label="输出 1 公式"><FormulaEditor value={formula} onChange={setFormula} inputs={formulaInputs} /></Field>
                    {formulaInspection?.outputUnit ? <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800">推断输出单位：{formulaInspection.outputUnit}</p> : null}
                    {formulaInspection?.warnings.map((warning) => <p key={warning} className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">{warning}</p>)}
                    {extraOutputs.map((output, index) => (
                      <div key={output.id} className="mt-3 rounded-lg border border-fs-border bg-fs-elevated p-2.5">
                        <div className="mb-2 flex items-center gap-2"><span className="flex-1 text-xs font-semibold text-fs-text">输出 {index + 2}</span><button type="button" onClick={() => setExtraOutputs((current) => current.filter((item) => item.id !== output.id))} className="text-xs text-red-600">删除</button></div>
                        <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                          <Field label="名称"><input value={output.name} onChange={(event) => setExtraOutputs((current) => current.map((item) => item.id === output.id ? { ...item, name: event.target.value } : item))} className={`${inputClass} w-full`} placeholder={`公式输出 ${index + 2}`} /></Field>
                          <Field label="公式"><input value={output.formula} onChange={(event) => setExtraOutputs((current) => current.map((item) => item.id === output.id ? { ...item, formula: event.target.value.slice(0, 500) } : item))} className={`${inputClass} w-full font-mono`} aria-label={`输出 ${index + 2} 公式`} /></Field>
                        </div>
                        {validateMacroFormula(output.formula, aliases) ? <p className="mt-1 text-xs text-red-600">{validateMacroFormula(output.formula, aliases)}</p> : null}
                      </div>
                    ))}
                  </section>
                ) : kind === "correlation" ? (
                  <section className="rounded-lg border border-fs-border bg-white p-2.5">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                      <Field label="统计指标"><select value={statMetric} onChange={(event) => setStatMetric(event.target.value as typeof statMetric)} className={`${inputClass} w-full`}><option value="correlation">相关性</option><option value="covariance">协方差</option><option value="beta">Beta（A 对 B）</option></select></Field>
                      {statMetric === "correlation" ? <Field label="相关方法"><select value={corrMethod} onChange={(event) => setCorrMethod(event.target.value as typeof corrMethod)} className={`${inputClass} w-full`}><option value="pearson">Pearson</option><option value="spearman">Spearman</option></select></Field> : <Field label="估计口径"><select value={statSample ? "sample" : "population"} onChange={(event) => setStatSample(event.target.value === "sample")} className={`${inputClass} w-full`}><option value="sample">样本</option><option value="population">总体</option></select></Field>}
                      <Field label="输入变换"><select value={corrInput} onChange={(event) => setCorrInput(event.target.value as typeof corrInput)} className={`${inputClass} w-full`}><option value="level">水平值</option><option value="diff">差分</option><option value="pctChange">百分比变化</option><option value="yoy">同比变化</option><option value="logReturn">对数变化</option></select></Field>
                      <Field label="滚动窗口">{numberInput(corrWindow, (value) => setCorrWindow(Math.max(2, value)), 2, 520)}</Field>
                      <Field label="最少有效期数">{numberInput(corrMinPeriods, (value) => setCorrMinPeriods(Math.max(2, Math.min(corrWindow, value))), 2, corrWindow)}</Field>
                      <Field label="A 领先期数">{numberInput(corrLag, setCorrLag, -120, 120)}</Field>
                    </div>
                    <p className="mt-2 text-xs text-fs-muted">正数表示 A 领先 B。Beta = Cov(A,B) / Var(B)；水平值统计可能受共同趋势影响。</p>
                  </section>
                ) : (
                  <section className="rounded-lg border border-fs-border bg-white p-2.5">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                      <Field label="回归输出"><select value={regressionOutput} onChange={(event) => setRegressionOutput(event.target.value as typeof regressionOutput)} className={`${inputClass} w-full`}><option value="residual">残差</option><option value="fitted">拟合值</option><option value="coefficient">B 的回归系数</option><option value="intercept">截距</option><option value="rSquared">R²</option></select></Field>
                      <Field label="输入变换"><select value={corrInput} onChange={(event) => setCorrInput(event.target.value as typeof corrInput)} className={`${inputClass} w-full`}><option value="level">水平值</option><option value="diff">差分</option><option value="pctChange">百分比变化</option><option value="yoy">同比变化</option><option value="logReturn">对数变化</option></select></Field>
                      <Field label="模型"><select value={regressionIntercept ? "intercept" : "origin"} onChange={(event) => setRegressionIntercept(event.target.value === "intercept")} className={`${inputClass} w-full`}><option value="intercept">包含截距</option><option value="origin">过原点</option></select></Field>
                      <Field label="滚动窗口">{numberInput(regressionWindow, (value) => setRegressionWindow(Math.max(3, value)), 3, 520)}</Field>
                      <Field label="最少有效期数">{numberInput(regressionMinPeriods, (value) => setRegressionMinPeriods(Math.max(3, Math.min(regressionWindow, value))), 3, regressionWindow)}</Field>
                      <Field label="A 领先期数">{numberInput(corrLag, setCorrLag, -120, 120)}</Field>
                    </div>
                    <p className="mt-2 text-xs text-fs-muted">A 为因变量，B–H 为解释变量；正数表示 A 领先解释变量。滚动回归用于统计关系分析，不代表因果。</p>
                  </section>
                )}
                <Field label="输出名称（可选）"><input value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} w-full`} placeholder="留空则自动生成" /></Field>
                <section className="rounded-xl border border-fs-border bg-white">
                  <button type="button" onClick={() => setTransferOpen((value) => !value)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left"><span className="flex-1 text-[13px] font-semibold text-fs-text">导入、导出与共享</span><span className="text-xs text-fs-muted">{transferOpen ? "收起" : "展开"}</span></button>
                  {transferOpen ? <div className="space-y-2 border-t border-fs-border p-3">
                    <textarea value={transferText} onChange={(event) => setTransferText(event.target.value)} rows={5} className="w-full resize-y rounded-lg border border-fs-border bg-fs-elevated px-3 py-2 font-mono text-xs text-fs-text outline-none focus:border-fs-accent" placeholder="粘贴导出的 JSON 或分享链接" aria-label="运算配置导入导出" />
                    <div className="flex flex-wrap gap-2"><button type="button" onClick={exportCalculation} className="rounded-lg border border-fs-border px-3 py-2 text-xs text-fs-text">生成 JSON</button><button type="button" onClick={importCalculation} disabled={!transferText.trim()} className="rounded-lg border border-fs-border px-3 py-2 text-xs text-fs-text disabled:opacity-40">导入配置</button><button type="button" onClick={copyShareLink} className="rounded-lg border border-fs-accent/30 bg-fs-accent-soft px-3 py-2 text-xs font-medium text-fs-accent-text">复制分享链接</button></div>
                    {transferStatus ? <p className="text-xs text-fs-muted">{transferStatus}</p> : null}
                  </div> : null}
                </section>
              </div>
              <PreviewPanel result={derivedPreview} title="对齐与结果诊断" />
            </div>
          )}
        </div>
        <footer className="flex shrink-0 gap-2 border-t border-fs-border bg-white px-3.5 py-2 lg:px-4">
          {mode === "single" ? <button type="button" disabled={steps.length === 0} onClick={() => setSteps([])} className="h-9 rounded-md border border-fs-border px-3.5 text-[13px] text-fs-text disabled:opacity-40">清空步骤</button> : null}
          {editingId ? <button type="button" onClick={() => { setEditingId(null); setName(""); setSingleName(""); }} className="h-9 rounded-md border border-fs-border px-3.5 text-[13px] text-fs-text">退出编辑</button> : null}
          <span className="flex-1" />
          <button type="button" onClick={props.onClose} className="h-9 rounded-md border border-fs-border px-3.5 text-[13px] text-fs-text">取消</button>
          {mode === "single" ? <button type="button" disabled={!targetKey || steps.length === 0 || Boolean(singlePreview?.diagnostics.error)} onClick={submitSingle} className="h-9 rounded-md bg-fs-accent px-4 text-[13px] font-medium text-white disabled:opacity-40">{editingId ? "保存修改" : "添加派生指标"}</button> : <button type="button" disabled={inputKeys.length < 2 || Boolean(derivedPreview?.diagnostics.error)} onClick={submitDerived} className="h-9 rounded-md bg-fs-accent px-4 text-[13px] font-medium text-white disabled:opacity-40">{editingId ? (kind === "formula" && extraOutputs.length ? `保存并新增 ${extraOutputs.length} 项` : "保存修改") : kind === "formula" && extraOutputs.length ? `添加 ${extraOutputs.length + 1} 个派生指标` : "添加派生指标"}</button>}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`h-9 border-b-2 px-3 text-[13px] font-medium ${active ? "border-fs-accent text-fs-accent-text" : "border-transparent text-fs-muted hover:text-fs-text"}`}>{children}</button>;
}
