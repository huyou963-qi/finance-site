"use client";

import { useState } from "react";
import { RANGE_PRESET_LABELS, SCALE_LABELS, takesScale } from "@/lib/equity/stockData/indicatorRegistry";
import {
  MAX_COLUMNS,
  RANGE_PRESETS,
  type Basis,
  type ColumnParams,
  type IndicatorDef,
  type MultiPeriod,
  type PeriodSlot,
  type PeriodSpec,
  type PriceAdjust,
  type RangePreset,
  type RangeSpec,
  type Scale,
} from "@/lib/equity/stockData/types";

type Props = {
  title: string;
  /** 这些指标共用同一组参数 */
  indicators: IndicatorDef[];
  initial: ColumnParams;
  initialMulti?: MultiPeriod;
  /** 按这组参数确定后，表格一共会有多少列（用于提前拦住超过 50 列） */
  totalColumnsFor: (multi: MultiPeriod | undefined) => number;
  onConfirm: (params: ColumnParams, multi: MultiPeriod | undefined) => void;
  onCancel: () => void;
};

type PeriodKind = PeriodSpec["kind"] | "multi";

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR + 1 - 2009 + 1 }, (_, i) => THIS_YEAR + 1 - i);
const SLOTS: PeriodSlot[] = ["Q1", "Q2", "Q3", "Q4", "FY"];
const SLOT_LABELS: Record<PeriodSlot, string> = { Q1: "Q1", Q2: "Q2", Q3: "Q3", Q4: "Q4", FY: "年报" };
const today = () => new Date().toISOString().slice(0, 10);
const yearAgo = () => `${THIS_YEAR - 1}${today().slice(4)}`;

/**
 * 参数编辑：报告期（含多报告期展开）、季度口径、截止日、区间、复权、显示单位。
 * 只显示所选指标用得到的参数；电脑上是居中弹窗，手机上从底部弹出。
 */
export function ParamEditor({ title, indicators, initial, initialMulti, totalColumnsFor, onConfirm, onCancel }: Props) {
  const p0 = initial.period ?? { kind: "latestFY" as const };
  const [kind, setKind] = useState<PeriodKind>(initialMulti ? "multi" : p0.kind);
  const [year, setYear] = useState(p0.kind === "FY" || p0.kind === "FQ" ? p0.year : THIS_YEAR - 1);
  const [q, setQ] = useState<1 | 2 | 3 | 4>(p0.kind === "FQ" ? p0.q : 4);
  const [multi, setMulti] = useState<MultiPeriod>(initialMulti ?? { fromYear: THIS_YEAR - 3, toYear: THIS_YEAR - 1, slots: ["FY"] });
  const [basis, setBasis] = useState<Basis>(initial.basis ?? "single");
  const [asOfKind, setAsOfKind] = useState(initial.asOf?.kind ?? "latest");
  const [asOfDate, setAsOfDate] = useState(initial.asOf?.kind === "date" ? initial.asOf.date : today());
  const r0 = initial.range;
  const [rangeChoice, setRangeChoice] = useState<RangePreset | "custom">(r0?.kind === "custom" ? "custom" : r0?.preset ?? "1y");
  const [rangeFrom, setRangeFrom] = useState(r0?.kind === "custom" ? r0.from : yearAgo());
  const [rangeTo, setRangeTo] = useState(r0?.kind === "custom" ? r0.to : today());
  const [adjust, setAdjust] = useState<PriceAdjust>(initial.adjust ?? "forward");
  const [scale, setScale] = useState<Scale>(initial.scale ?? "auto");

  const has = (k: IndicatorDef["params"][number]) => indicators.some((d) => d.params.includes(k));
  const showScale = indicators.some(takesScale);
  const isMulti = kind === "multi";
  const quarterly = kind === "latestQ" || kind === "FQ" || (isMulti && multi.slots.some((s) => s !== "FY"));

  const activeMulti = has("period") && isMulti ? multi : undefined;
  const total = totalColumnsFor(activeMulti);
  const problems: string[] = [];
  if (isMulti && !multi.slots.length) problems.push("至少勾选一个期次");
  if (isMulti && multi.fromYear > multi.toYear) problems.push("起始财年不能晚于结束财年");
  if (total > MAX_COLUMNS) problems.push(`确定后共 ${total} 列，超过 ${MAX_COLUMNS} 列上限`);
  if (has("asOf") && asOfKind === "date" && !asOfDate) problems.push("请选择截止日");
  if (has("range") && rangeChoice === "custom" && (!rangeFrom || !rangeTo || rangeFrom > rangeTo)) problems.push("区间开始日不能晚于结束日");

  const confirm = () => {
    if (problems.length) return;
    const params: ColumnParams = {};
    if (has("period")) {
      params.period = kind === "FY" ? { kind, year } : kind === "FQ" ? { kind, year, q } : kind === "multi" ? { kind: "latestFY" } : { kind };
      if (has("basis") && quarterly) params.basis = basis;
    }
    if (has("asOf")) params.asOf = asOfKind === "date" ? { kind: "date", date: asOfDate } : { kind: "latest" };
    if (has("range")) params.range = (rangeChoice === "custom" ? { kind: "custom", from: rangeFrom, to: rangeTo } : { kind: "preset", preset: rangeChoice }) as RangeSpec;
    if (has("adjust")) params.adjust = adjust;
    if (showScale && scale !== "auto") params.scale = scale;
    onConfirm(params, activeMulti);
  };

  const radio = (name: string, checked: boolean, onChange: () => void, label: string) => (
    <label className="flex min-h-9 items-center gap-2 text-sm">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      {label}
    </label>
  );
  const select = "min-h-9 rounded-lg border border-fs-border bg-fs-elevated px-2 text-sm";
  const dateInput = "min-h-9 rounded-lg border border-fs-border bg-fs-elevated px-2 text-sm";
  const yearSelect = (label: string, value: number, onChange: (y: number) => void) => (
    <select aria-label={label} className={select} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {YEARS.map((y) => <option key={y} value={y}>FY{y}</option>)}
    </select>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/30 md:items-center" role="presentation" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-fs-border bg-fs-bg p-4 shadow-xl md:w-[480px] md:rounded-xl"
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 line-clamp-2 text-xs text-fs-muted">{indicators.map((d) => d.label).join("、")}</p>

        {has("period") ? (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">报告期</legend>
            <p className="mb-2 text-xs text-fs-muted">按公司自己的财年；财年不按日历年结束的公司（如 9 月年结），FY2025 指截至 2025 年内的那个财年。</p>
            <div className="grid grid-cols-2 gap-x-4">
              {radio("period-kind", kind === "latestFY", () => setKind("latestFY"), "最新年报")}
              {radio("period-kind", kind === "latestQ", () => setKind("latestQ"), "最新一期")}
              {radio("period-kind", kind === "FY", () => setKind("FY"), "指定年报")}
              {radio("period-kind", kind === "FQ", () => setKind("FQ"), "指定季报")}
              {radio("period-kind", isMulti, () => setKind("multi"), "多个报告期")}
            </div>
            {kind === "FY" || kind === "FQ" ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {yearSelect("财年", year, setYear)}
                {kind === "FQ" ? (
                  <select aria-label="财季" className={select} value={q} onChange={(e) => setQ(Number(e.target.value) as 1 | 2 | 3 | 4)}>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>Q{n}</option>)}
                  </select>
                ) : null}
              </div>
            ) : null}
            {isMulti ? (
              <div className="mt-2 space-y-2 rounded-lg border border-fs-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {yearSelect("起始财年", multi.fromYear, (y) => setMulti((m) => ({ ...m, fromYear: y })))}
                  <span className="text-fs-muted">至</span>
                  {yearSelect("结束财年", multi.toYear, (y) => setMulti((m) => ({ ...m, toYear: y })))}
                </div>
                <div className="flex flex-wrap gap-x-4">
                  {SLOTS.map((s) => (
                    <label key={s} className="flex min-h-9 items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={multi.slots.includes(s)}
                        onChange={(e) => setMulti((m) => ({ ...m, slots: e.target.checked ? [...m.slots, s] : m.slots.filter((x) => x !== s) }))}
                      />
                      {SLOT_LABELS[s]}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-fs-muted">每个指标按期次各生成一列，这几列算一组，之后修改参数会整组生效。</p>
              </div>
            ) : null}
          </fieldset>
        ) : null}

        {has("basis") && quarterly ? (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">季度口径</legend>
            <div className="flex gap-4">
              {radio("basis", basis === "single", () => setBasis("single"), "单季")}
              {radio("basis", basis === "ttm", () => setBasis("ttm"), "TTM（滚动 4 季）")}
            </div>
            <p className="text-xs text-fs-muted">期末余额类科目（如总资产）不受口径影响；年报列始终是全年。</p>
          </fieldset>
        ) : null}

        {has("asOf") ? (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">截止日</legend>
            <div className="flex flex-wrap items-center gap-x-4">
              {radio("as-of", asOfKind === "latest", () => setAsOfKind("latest"), "最近交易日")}
              {radio("as-of", asOfKind === "date", () => setAsOfKind("date"), "指定日期")}
              {asOfKind === "date" ? (
                <input type="date" aria-label="截止日" className={dateInput} value={asOfDate} min="1995-01-01" max={today()} onChange={(e) => setAsOfDate(e.target.value)} />
              ) : null}
            </div>
            <p className="text-xs text-fs-muted">非交易日取之前最近一个交易日；估值只用截止日之前已披露的财报。</p>
          </fieldset>
        ) : null}

        {has("range") ? (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">区间</legend>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select aria-label="区间" className={select} value={rangeChoice} onChange={(e) => setRangeChoice(e.target.value as RangePreset | "custom")}>
                {RANGE_PRESETS.map((p) => <option key={p} value={p}>{RANGE_PRESET_LABELS[p]}</option>)}
                <option value="custom">自定义</option>
              </select>
              {rangeChoice === "custom" ? (
                <>
                  <input type="date" aria-label="区间开始日" className={dateInput} value={rangeFrom} min="1995-01-01" max={today()} onChange={(e) => setRangeFrom(e.target.value)} />
                  <span className="text-fs-muted">至</span>
                  <input type="date" aria-label="区间结束日" className={dateInput} value={rangeTo} min="1995-01-01" max={today()} onChange={(e) => setRangeTo(e.target.value)} />
                </>
              ) : null}
            </div>
            <p className="text-xs text-fs-muted">预设区间截止到最近交易日；自定义区间最长 10 年。</p>
          </fieldset>
        ) : null}

        {has("adjust") ? (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">复权</legend>
            <div className="flex gap-4">
              {radio("adjust", adjust === "forward", () => setAdjust("forward"), "前复权（含分红）")}
              {radio("adjust", adjust === "none", () => setAdjust("none"), "不复权")}
            </div>
          </fieldset>
        ) : null}

        {showScale ? (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">显示单位</legend>
            <select aria-label="显示单位" className={select} value={scale} onChange={(e) => setScale(e.target.value as Scale)}>
              {(Object.keys(SCALE_LABELS) as Scale[]).map((s) => <option key={s} value={s}>{SCALE_LABELS[s]}</option>)}
            </select>
            <p className="mt-1 text-xs text-fs-muted">只影响显示和导出；「自动」按数值大小缩写。</p>
          </fieldset>
        ) : null}

        {problems.length ? <p role="alert" className="mt-4 text-sm text-fs-accent">{problems[0]}</p> : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          {isMulti && has("period") ? <span className="mr-auto text-xs text-fs-muted">确定后共 {total} 列</span> : null}
          <button type="button" onClick={onCancel} className="min-h-10 rounded-lg border border-fs-border px-4 text-sm">取消</button>
          <button type="button" onClick={confirm} disabled={problems.length > 0} autoFocus className="min-h-10 rounded-lg bg-fs-accent px-4 text-sm text-white disabled:opacity-40">确定</button>
        </div>
      </div>
    </div>
  );
}
