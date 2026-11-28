"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CandlestickData } from "lightweight-charts";
import { useTr } from "@/i18n/TextProvider";
import { randomUUID } from "@/lib/randomId";
import { compileIndicatorFormula, MAX_FORMULA_LENGTH, type FormulaDiagnostic } from "@/lib/chart/indicatorFormula";
import {
  DEFAULT_FORMULA_SOURCE,
  FORMULA_PRESETS,
  MAX_FORMULA_NAME,
  MAX_FORMULAS,
  evaluateOnCandles,
  formulaOutputColor,
  type FormulaIndicatorId,
  type SavedFormula,
} from "@/lib/chart/formulaIndicators";

type Props = {
  formulas: SavedFormula[];
  selected: string;
  candles: CandlestickData[];
  volumes: readonly number[] | undefined;
  onApply: (id: FormulaIndicatorId) => void;
  onSave: (formula: SavedFormula) => boolean;
  onRemove: (id: FormulaIndicatorId) => boolean;
  onClose: () => void;
};

type Draft = { id?: FormulaIndicatorId; name: string; source: string };
const GROUPS = [
  { id: "trend", label: "趋势与波动" },
  { id: "momentum", label: "动量与振荡" },
  { id: "volume", label: "量能" },
] as const;

const DIAGNOSTICS = {
  syntax: "检查此处的公式语法",
  unknown: "未知函数或变量",
  duplicate: "变量名重复或为保留字",
  arguments: "函数参数数量有误",
  period: "周期必须是符合范围的整数常量",
  style: "无法识别绘图样式",
  output: "请用“名称:表达式”定义至少一条输出",
  limit: "公式过长、过于复杂或输出超过 8 条",
} satisfies Record<FormulaDiagnostic["code"], string>;

const btn = "rounded border border-fs-border px-3 py-2 text-sm text-fs-text hover:bg-fs-elevated disabled:opacity-50";
const primary = "rounded bg-indigo-900 px-3 py-2 text-sm text-white hover:bg-indigo-800 disabled:opacity-50";
const input = "w-full rounded border border-fs-border bg-white px-3 py-2 text-sm text-fs-text";

export function FormulaIndicatorDialog({
  formulas, selected, candles, volumes, onApply, onSave, onRemove, onClose,
}: Props) {
  const tr = useTr();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [tab, setTab] = useState<"presets" | "custom">(selected.startsWith("formula:custom-") ? "custom" : "presets");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<FormulaDiagnostic | null>(null);
  const [message, setMessage] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<FormulaIndicatorId | null>(null);
  const [preview, setPreview] = useState<{ name: string; color: string; latest: number | null; hasValues: boolean }[] | null>(null);

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  function changeDraft(value: Draft | null) {
    setDraft(value);
    setError(null);
    setMessage("");
    setPreview(null);
  }

  function checkFormula() {
    if (!draft) return null;
    setMessage("");
    const compiled = compileIndicatorFormula(draft.source);
    if (!compiled.ok) {
      setPreview(null);
      setError(compiled.error);
      return null;
    }
    setError(null);
    const results = evaluateOnCandles(compiled.program, candles, volumes);
    setPreview(compiled.program.outputs.map((output, i) => {
      const values = results.get(output.name)!;
      const latest = values.at(-1);
      return {
        name: output.name,
        color: formulaOutputColor(output, i),
        latest: latest != null && Number.isFinite(latest) ? latest : null,
        hasValues: values.some(Number.isFinite),
      };
    }));
    return compiled.program;
  }

  function commit() {
    if (!draft || !checkFormula()) return;
    const name = draft.name.trim();
    if (!name) {
      setMessage(tr("请输入指标名称"));
      return;
    }
    if (!draft.id && formulas.length >= MAX_FORMULAS) {
      setMessage(tr("自定义公式库已满"));
      return;
    }
    const id: FormulaIndicatorId = draft.id ?? `formula:custom-${randomUUID()}`;
    if (!onSave({ id, name, source: draft.source.trim() })) setMessage(tr("浏览器无法保存公式"));
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="m-auto max-h-[88dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-xl border border-fs-border bg-white p-0 text-fs-text shadow-2xl backdrop:bg-slate-950/45"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-fs-border bg-white px-4 py-3">
        <h2 id={titleId} className="text-base font-semibold">{draft ? tr("编辑指标公式") : tr("副图指标库")}</h2>
        <button className={btn} type="button" onClick={onClose}>{tr("关闭")}</button>
      </div>

      {draft ? (
        <form className="space-y-3 p-4" onSubmit={(event) => { event.preventDefault(); commit(); }}>
          <label className="block text-sm">
            {tr("指标名称")}
            <input className={`${input} mt-1`} value={draft.name} maxLength={MAX_FORMULA_NAME}
              onChange={(event) => changeDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="block text-sm">
            {tr("公式")}
            <textarea className={`${input} mt-1 min-h-40 font-mono leading-relaxed`} rows={8} value={draft.source}
              spellCheck={false} autoCapitalize="off" autoCorrect="off" maxLength={MAX_FORMULA_LENGTH}
              aria-invalid={error != null} onChange={(event) => changeDraft({ ...draft, source: event.target.value })} />
          </label>
          <details className="rounded border border-fs-border px-3 py-2 text-xs text-fs-secondary">
            <summary className="cursor-pointer font-medium">{tr("公式语法与函数")}</summary>
            <p className="mt-2">{tr("用 N:=20 定义参数，BASE:=MA(CLOSE,N) 定义中间变量，OUT:BASE 定义绘图输出。多条语句用分号分隔。")}</p>
            <p className="mt-2">{tr("行情字段")} <code>OPEN, HIGH, LOW, CLOSE, VOL</code></p>
            <p className="mt-2">{tr("运算与条件")} <code>+ - * / &gt; &lt; &gt;= &lt;= = != AND OR</code></p>
            <p className="mt-2 break-words"><code>MA(X,N), EMA(X,N), SMA(X,N,M), RMA(X,N), SUM(X,N), HHV(X,N), LLV(X,N), REF(X,N), COUNT(X,N), IF(X,A,B), CROSS(A,B), NZ(X,A), ABS(X), MAX(A,B), MIN(A,B)</code></p>
            <p className="mt-2">{tr("周期用 K 线根数表示，常用范围为 1–500。REF 的 0 表示当前值，SUM 的 0 表示累计。")}</p>
            <p className="mt-2">{tr("输出默认画线，可在表达式后加 ,HIST 或 ,COLORSTICK 绘制柱状图，也可加 ,#2563EB 指定颜色。")}</p>
          </details>
          {error ? (
            <p role="alert" className="text-sm text-rose-700">
              {tr("行 {line}，列 {column}", { line: error.line, column: error.column })} · {tr(DIAGNOSTICS[error.code])}{error.detail ? ` (${error.detail})` : ""}
            </p>
          ) : null}
          {message ? <p role="alert" className="text-sm text-rose-700">{message}</p> : null}
          {preview ? (
            <div role="status" className="space-y-1 rounded border border-fs-border p-3 text-sm">
              <p className="font-medium">{tr("校验通过 · 当前行情最新值")}</p>
              {preview.map(output => (
                <div key={output.name} className="flex flex-wrap items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: output.color }} />
                  <code>{output.name}</code>
                  <span className="ml-auto text-fs-secondary">
                    {output.latest != null ? Number(output.latest.toPrecision(7)).toString() : tr(output.hasValues ? "最新一根无有效值" : "当前行情无有效值")}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button className={btn} type="button" onClick={() => changeDraft(null)}>{tr("返回指标库")}</button>
            <button className={btn} type="button" onClick={checkFormula}>{tr("校验公式")}</button>
            <button className={primary} type="submit">{tr("保存并应用")}</button>
          </div>
        </form>
      ) : (
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <button className={tab === "presets" ? primary : btn} aria-pressed={tab === "presets"} type="button" onClick={() => { setTab("presets"); setConfirmRemove(null); setMessage(""); }}>{tr("内置指标")}</button>
            <button className={tab === "custom" ? primary : btn} aria-pressed={tab === "custom"} type="button" onClick={() => setTab("custom")}>{tr("我的公式")}</button>
            <button className={`${btn} ml-auto`} disabled={formulas.length >= MAX_FORMULAS} type="button" onClick={() => {
              setTab("custom");
              changeDraft({ name: "", source: DEFAULT_FORMULA_SOURCE });
            }}>{tr("新建公式")}</button>
          </div>

          {tab === "presets" ? GROUPS.map(group => (
            <section key={group.id} className="space-y-1">
              <h3 className="text-sm font-medium text-fs-secondary">{tr(group.label)}</h3>
              {FORMULA_PRESETS.filter(item => item.category === group.id).map(item => (
                <div key={item.id} className="flex flex-wrap items-center gap-2 border-b border-fs-border py-2">
                  <div className="min-w-[10rem] flex-1">
                    <div className="text-sm font-medium">{item.name}</div>
                    <div className="text-xs text-fs-secondary">{tr(item.summary)}</div>
                    {item.needsVolume && !volumes ? <div className="text-xs text-fs-muted">{tr("当前标的缺少成交量")}</div> : null}
                  </div>
                  <button className={btn} disabled={formulas.length >= MAX_FORMULAS} type="button" onClick={() => {
                    setTab("custom");
                    changeDraft({ name: item.name, source: item.source });
                  }}>{tr("复制公式")}</button>
                  <button className={btn} disabled={item.needsVolume && !volumes} aria-pressed={selected === item.id} type="button" onClick={() => onApply(item.id)}>{tr("应用")}</button>
                </div>
              ))}
            </section>
          )) : (
            <>
              <p className="text-xs text-fs-secondary">{tr("公式保存在当前浏览器。")}</p>
              {formulas.length >= MAX_FORMULAS ? <p className="text-sm">{tr("自定义公式库已满")}</p> : null}
              {!formulas.length ? <p className="text-sm text-fs-muted">{tr("还没有自定义公式")}</p> : null}
              {message ? <p role="alert" className="text-sm text-rose-700">{message}</p> : null}
              {formulas.map(item => (
                <div key={item.id} className="flex flex-wrap items-center gap-2 border-b border-fs-border py-2">
                  <strong className="min-w-[8rem] flex-1 break-all text-sm">{item.name}</strong>
                  {confirmRemove === item.id ? (
                    <>
                      <button className={btn} type="button" onClick={() => {
                        if (onRemove(item.id)) setConfirmRemove(null);
                        else setMessage(tr("浏览器无法保存公式"));
                      }}>{tr("确认删除")}</button>
                      <button className={btn} type="button" onClick={() => setConfirmRemove(null)}>{tr("取消")}</button>
                    </>
                  ) : (
                    <>
                      <button className={btn} type="button" onClick={() => changeDraft(item)}>{tr("编辑")}</button>
                      <button className={btn} type="button" onClick={() => { setMessage(""); setConfirmRemove(item.id); }}>{tr("删除")}</button>
                      <button className={btn} aria-pressed={selected === item.id} type="button" onClick={() => onApply(item.id)}>{tr("应用")}</button>
                    </>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
