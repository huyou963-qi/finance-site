"use client";

import { useState, type ReactNode } from "react";
import { MobileSheet } from "@/components/mobile/MobileSheet";
import type {
  MacroDerivedCalcOp,
  MacroFrequencyAdjust,
  MacroResampleMethod,
  MacroSeriesCalcConfig,
  MacroSeriesCalcOp,
  MacroUnitAdjust,
} from "@/lib/data/macroPresetTemplates";

type KeyOption = { key: string; label: string };

export type MacroMobileCalcSheetProps = {
  open: boolean;
  onClose: () => void;
  options: KeyOption[];
  targetKey: string;
  onTargetKeyChange: (key: string) => void;
  draft: MacroSeriesCalcConfig;
  onDraftChange: (patch: Partial<MacroSeriesCalcConfig>) => void;
  onApply: () => void;
  onReset: () => void;
  leftKey: string;
  onLeftKeyChange: (key: string) => void;
  rightKey: string;
  onRightKeyChange: (key: string) => void;
  op: MacroDerivedCalcOp;
  onOpChange: (op: MacroDerivedCalcOp) => void;
  name: string;
  onNameChange: (name: string) => void;
  onAddDerived: () => void;
};

const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-fs-border bg-white px-3 text-fs-text disabled:opacity-40";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[13px] text-fs-muted">{label}</span>
      {children}
    </label>
  );
}

function KeySelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (key: string) => void;
  options: KeyOption[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={options.length === 0}
      className={selectClass}
    >
      {options.map((x) => (
        <option key={x.key} value={x.key}>
          {x.label}
        </option>
      ))}
    </select>
  );
}

/** 手机端指标运算面板：桌面顶部运算栏的纵向版本，选项与桌面一致 */
export function MacroMobileCalcSheet(props: MacroMobileCalcSheetProps) {
  const { open, onClose, options, draft, onDraftChange } = props;
  const [mode, setMode] = useState<"single" | "derived">("single");

  const segClass = (active: boolean) =>
    `h-9 flex-1 rounded-md text-sm font-medium transition ${
      active
        ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
        : "text-fs-secondary"
    }`;

  const footer =
    mode === "single" ? (
      <div className="flex gap-3">
        <button
          type="button"
          disabled={!props.targetKey}
          onClick={props.onReset}
          className="h-11 flex-1 rounded-lg border border-fs-border text-base text-fs-text disabled:opacity-40"
        >
          重置
        </button>
        <button
          type="button"
          disabled={!props.targetKey}
          onClick={() => {
            props.onApply();
            onClose();
          }}
          className="h-11 flex-[2] rounded-lg border border-fs-accent/30 bg-fs-accent-soft text-base font-medium text-fs-accent-text disabled:opacity-40"
        >
          应用
        </button>
      </div>
    ) : (
      <button
        type="button"
        disabled={options.length === 0}
        onClick={() => {
          props.onAddDerived();
          onClose();
        }}
        className="h-11 w-full rounded-lg border border-fs-accent/30 bg-fs-accent-soft text-base font-medium text-fs-accent-text disabled:opacity-40"
      >
        添加派生指标
      </button>
    );

  return (
    <MobileSheet open={open} onClose={onClose} title="指标运算" footer={footer}>
      <div className="px-4 pb-4 pt-1">
        <div className="flex gap-0.5 rounded-lg border border-fs-border bg-fs-elevated p-0.5">
          <button type="button" onClick={() => setMode("single")} className={segClass(mode === "single")}>
            单指标运算
          </button>
          <button type="button" onClick={() => setMode("derived")} className={segClass(mode === "derived")}>
            指标间运算
          </button>
        </div>

        {mode === "single" ? (
          <div className="mt-4 flex flex-col gap-3.5">
            <Field label="指标">
              <KeySelect value={props.targetKey} onChange={props.onTargetKeyChange} options={options} />
            </Field>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
              <Field label="运算">
                <select
                  value={draft.op}
                  onChange={(e) => onDraftChange({ op: e.target.value as MacroSeriesCalcOp })}
                  className={selectClass}
                >
                  <option value="none">原始</option>
                  <option value="pctChange">环比%</option>
                  <option value="yoy">同比%</option>
                  <option value="diff">差分</option>
                  <option value="cumsum">累计</option>
                </select>
              </Field>
              <Field label="频率">
                <select
                  value={draft.frequency}
                  onChange={(e) =>
                    onDraftChange({ frequency: e.target.value as MacroFrequencyAdjust })
                  }
                  className={selectClass}
                >
                  <option value="keep">原始</option>
                  <option value="month">月</option>
                  <option value="quarter">季</option>
                  <option value="year">年</option>
                </select>
              </Field>
              <Field label="变频">
                <select
                  value={draft.resampleMethod}
                  onChange={(e) =>
                    onDraftChange({ resampleMethod: e.target.value as MacroResampleMethod })
                  }
                  className={selectClass}
                >
                  <option value="avg">平均</option>
                  <option value="start">期初</option>
                  <option value="end">期末</option>
                </select>
              </Field>
              <Field label="单位">
                <select
                  value={draft.unit}
                  onChange={(e) => onDraftChange({ unit: e.target.value as MacroUnitAdjust })}
                  className={selectClass}
                >
                  <option value="keep">原始</option>
                  <option value="x0.01">x0.01</option>
                  <option value="x100">x100</option>
                </select>
              </Field>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3.5">
            <Field label="左（A）">
              <KeySelect value={props.leftKey} onChange={props.onLeftKeyChange} options={options} />
            </Field>
            <Field label="运算">
              <select
                value={props.op}
                onChange={(e) => props.onOpChange(e.target.value as MacroDerivedCalcOp)}
                className={selectClass}
              >
                <option value="ratio">A/B</option>
                <option value="spread">A-B</option>
                <option value="add">A+B</option>
                <option value="sub">A-B</option>
                <option value="mul">A×B</option>
                <option value="div">A÷B</option>
              </select>
            </Field>
            <Field label="右（B）">
              <KeySelect value={props.rightKey} onChange={props.onRightKeyChange} options={options} />
            </Field>
            <Field label="名称">
              <input
                type="text"
                value={props.name}
                onChange={(e) => props.onNameChange(e.target.value)}
                placeholder="自动"
                className="h-11 w-full rounded-lg border border-fs-border bg-white px-3 text-fs-text placeholder:text-fs-muted"
              />
            </Field>
          </div>
        )}
      </div>
    </MobileSheet>
  );
}
