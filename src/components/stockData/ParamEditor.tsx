"use client";

import { useState } from "react";
import type { Basis, ColumnParams, IndicatorDef, PeriodSpec } from "@/lib/equity/stockData/types";

type Props = {
  title: string;
  /** 这些指标共用同一组参数 */
  indicators: IndicatorDef[];
  initial: ColumnParams;
  onConfirm: (params: ColumnParams) => void;
  onCancel: () => void;
};

type PeriodKind = PeriodSpec["kind"];

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR + 1 - 2009 + 1 }, (_, i) => THIS_YEAR + 1 - i);

/**
 * 参数编辑：报告期（最新年报 / 最新一期 / 指定财年年报 / 指定财季）与季度口径（单季 / TTM）。
 * 电脑上是居中弹窗，手机上从底部弹出。
 */
export function ParamEditor({ title, indicators, initial, onConfirm, onCancel }: Props) {
  const p0 = initial.period ?? { kind: "latestFY" as const };
  const [kind, setKind] = useState<PeriodKind>(p0.kind);
  const [year, setYear] = useState(p0.kind === "FY" || p0.kind === "FQ" ? p0.year : THIS_YEAR - 1);
  const [q, setQ] = useState<1 | 2 | 3 | 4>(p0.kind === "FQ" ? p0.q : 4);
  const [basis, setBasis] = useState<Basis>(initial.basis ?? "single");

  const takesPeriod = indicators.some((d) => d.params.includes("period"));
  const takesBasis = indicators.some((d) => d.params.includes("basis"));
  const quarterly = kind === "latestQ" || kind === "FQ";

  const confirm = () => {
    const period: PeriodSpec =
      kind === "FY" ? { kind, year } : kind === "FQ" ? { kind, year, q } : { kind };
    onConfirm({ period, ...(takesBasis && quarterly ? { basis } : {}) });
  };

  const radio = (value: PeriodKind, label: string) => (
    <label className="flex min-h-9 items-center gap-2 text-sm">
      <input type="radio" name="period-kind" checked={kind === value} onChange={() => setKind(value)} />
      {label}
    </label>
  );
  const select = "min-h-9 rounded-lg border border-fs-border bg-fs-elevated px-2 text-sm";

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/30 md:items-center" role="presentation" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-fs-border bg-fs-bg p-4 shadow-xl md:w-[440px] md:rounded-xl"
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 line-clamp-2 text-xs text-fs-muted">{indicators.map((d) => d.label).join("、")}</p>

        {takesPeriod ? (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">报告期</legend>
            <p className="mb-2 text-xs text-fs-muted">按公司自己的财年；财年不按日历年结束的公司（如 9 月年结），FY2025 指截至 2025 年内的那个财年。</p>
            <div className="grid grid-cols-2 gap-x-4">
              {radio("latestFY", "最新年报")}
              {radio("latestQ", "最新一期")}
              {radio("FY", "指定年报")}
              {radio("FQ", "指定季报")}
            </div>
            {kind === "FY" || kind === "FQ" ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <select aria-label="财年" className={select} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {YEARS.map((y) => <option key={y} value={y}>FY{y}</option>)}
                </select>
                {kind === "FQ" ? (
                  <select aria-label="财季" className={select} value={q} onChange={(e) => setQ(Number(e.target.value) as 1 | 2 | 3 | 4)}>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>Q{n}</option>)}
                  </select>
                ) : null}
              </div>
            ) : null}
          </fieldset>
        ) : null}

        {takesBasis && quarterly ? (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">季度口径</legend>
            <div className="flex gap-4">
              <label className="flex min-h-9 items-center gap-2 text-sm"><input type="radio" name="basis" checked={basis === "single"} onChange={() => setBasis("single")} />单季</label>
              <label className="flex min-h-9 items-center gap-2 text-sm"><input type="radio" name="basis" checked={basis === "ttm"} onChange={() => setBasis("ttm")} />TTM（滚动 4 季）</label>
            </div>
            <p className="text-xs text-fs-muted">期末余额类科目（如总资产）不受口径影响。</p>
          </fieldset>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-10 rounded-lg border border-fs-border px-4 text-sm">取消</button>
          <button type="button" onClick={confirm} autoFocus className="min-h-10 rounded-lg bg-fs-accent px-4 text-sm text-white">确定</button>
        </div>
      </div>
    </div>
  );
}
