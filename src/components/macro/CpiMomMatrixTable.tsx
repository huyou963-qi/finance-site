"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CPI_MOM_MATRIX_ROWS,
  CPI_MOM_MATRIX_FRED_IDS,
  cpiWeightForFredId,
  type CpiMomMatrixRow,
} from "@/lib/data/cpi/cpiMomMatrixCatalog";
import {
  CPI_MOM_MATRIX_DEFAULT_MONTHS,
  CPI_MOM_MATRIX_MAX_MONTHS,
  clampCpiMomMonthRange,
  defaultCpiMomMonthRange,
  filterCpiMomColumns,
} from "@/lib/data/cpi/cpiMomMatrixRange";
import { compareMacroPeriodLabels, formatMacroPeriodDisplay } from "@/lib/macroPeriodLabel";
import { useTr } from "@/i18n/TextProvider";

type UnifiedSeries = { key: string; name: string; data: (number | null)[] };
type UnifiedPayload = { categories: string[]; series: UnifiedSeries[] };

function fredKey(fredId: string): string {
  return `fred:${fredId}`;
}

/** 由指数水平算季调环比（%）：按期对齐后取相邻月比值。 */
function computeMomByPeriod(
  categories: string[],
  data: (number | null)[],
): Map<string, number> {
  const pairs: { period: string; level: number }[] = [];
  for (let i = 0; i < categories.length; i++) {
    const v = data[i];
    if (v != null && Number.isFinite(v)) pairs.push({ period: categories[i]!, level: v });
  }
  pairs.sort((a, b) => compareMacroPeriodLabels(a.period, b.period));
  const out = new Map<string, number>();
  for (let i = 1; i < pairs.length; i++) {
    const prev = pairs[i - 1]!.level;
    const cur = pairs[i]!.level;
    if (prev !== 0) out.set(pairs[i]!.period, (cur / prev - 1) * 100);
  }
  return out;
}

/** 指数水平按 period → value */
function levelByPeriod(categories: string[], data: (number | null)[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < categories.length; i++) {
    const v = data[i];
    if (v != null && Number.isFinite(v)) out.set(categories[i]!, v);
  }
  return out;
}

/** 同月减一年：`2026-06` / `2026-06-01` → 对应去年标签 */
function shiftYearPeriod(period: string, deltaYears: number): string | null {
  const m = /^(\d{4})(-\d{2}(?:-\d{2})?)$/.exec(period.trim());
  if (!m) return null;
  return `${Number(m[1]) + deltaYears}${m[2]}`;
}

function computeYoy(
  levels: Map<string, number>,
  endPeriod: string | null,
): number | null {
  if (!endPeriod) return null;
  const prev = shiftYearPeriod(endPeriod, -1);
  if (!prev) return null;
  const cur = levels.get(endPeriod);
  const base = levels.get(prev);
  if (cur == null || base == null || base === 0) return null;
  return (cur / base - 1) * 100;
}

function fmtMom(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = v.toFixed(1);
  return s === "-0.0" ? "0.0" : s; // 避免负零，与 BLS 一致
}

function fmtWeight(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  // 保留至多 3 位小数并去掉多余的 0（100.000→100，0.140→0.14）
  return String(Number(v.toFixed(3)));
}

function momColorClass(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-fs-muted";
  if (v > 0.049) return "text-red-400"; // 通胀走热
  if (v < -0.049) return "text-emerald-400"; // 环比转负
  return "text-fs-muted"; // 约等于 0.0
}

function indentPadding(indent: CpiMomMatrixRow["indent"]): string {
  return ["pl-3", "pl-6", "pl-10", "pl-14"][indent] ?? "pl-3";
}

const selectClass =
  "h-7 rounded border border-fs-border bg-fs-bg px-1.5 text-[11px] text-fs-text focus:border-fs-accent focus:outline-none";

export function CpiMomMatrixTable() {
  const tr = useTr();
  const [payload, setPayload] = useState<UnifiedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const series = CPI_MOM_MATRIX_FRED_IDS.map(fredKey).join(",");
    const url = `/api/data/macro?source=unified&series=${encodeURIComponent(series)}`;
    setLoading(true);
    setError(null);
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        return json as UnifiedPayload;
      })
      .then((json) => {
        if (!cancelled) setPayload(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : tr("加载失败"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tr]);

  const { allPeriods, momByRow, levelsByRow } = useMemo(() => {
    if (!payload) {
      return {
        allPeriods: [] as string[],
        momByRow: new Map<string, Map<string, number>>(),
        levelsByRow: new Map<string, Map<string, number>>(),
      };
    }
    const seriesByKey = new Map(payload.series.map((s) => [s.key, s]));
    const perRow = new Map<string, Map<string, number>>();
    const perLevels = new Map<string, Map<string, number>>();
    const periodSet = new Set<string>();
    for (const row of CPI_MOM_MATRIX_ROWS) {
      const s = seriesByKey.get(fredKey(row.fredId));
      const mom = s ? computeMomByPeriod(payload.categories, s.data) : new Map<string, number>();
      const levels = s ? levelByPeriod(payload.categories, s.data) : new Map<string, number>();
      perRow.set(row.fredId, mom);
      perLevels.set(row.fredId, levels);
      for (const p of mom.keys()) periodSet.add(p);
    }
    const periods = [...periodSet].sort(compareMacroPeriodLabels);
    return { allPeriods: periods, momByRow: perRow, levelsByRow: perLevels };
  }, [payload]);

  const effectiveRange = useMemo(() => {
    if (allPeriods.length === 0) return null;
    if (!range) return defaultCpiMomMonthRange(allPeriods, CPI_MOM_MATRIX_DEFAULT_MONTHS);
    return (
      clampCpiMomMonthRange(allPeriods, range.start, range.end, "end") ??
      defaultCpiMomMonthRange(allPeriods, CPI_MOM_MATRIX_DEFAULT_MONTHS)
    );
  }, [allPeriods, range]);

  const { columns, yoyByRow, endPeriod } = useMemo(() => {
    if (!effectiveRange) {
      return {
        columns: [] as string[],
        yoyByRow: new Map<string, number | null>(),
        endPeriod: null as string | null,
      };
    }
    const cols = filterCpiMomColumns(allPeriods, effectiveRange.start, effectiveRange.end);
    const end = effectiveRange.end;
    const perYoy = new Map<string, number | null>();
    for (const row of CPI_MOM_MATRIX_ROWS) {
      perYoy.set(row.fredId, computeYoy(levelsByRow.get(row.fredId) ?? new Map(), end));
    }
    return { columns: cols, yoyByRow: perYoy, endPeriod: end };
  }, [allPeriods, effectiveRange, levelsByRow]);

  const setStartMonth = (nextStart: string) => {
    if (!effectiveRange) return;
    const next = clampCpiMomMonthRange(
      allPeriods,
      nextStart,
      effectiveRange.end,
      "start",
      CPI_MOM_MATRIX_MAX_MONTHS,
    );
    if (next) setRange(next);
  };

  const setEndMonth = (nextEnd: string) => {
    if (!effectiveRange) return;
    const next = clampCpiMomMonthRange(
      allPeriods,
      effectiveRange.start,
      nextEnd,
      "end",
      CPI_MOM_MATRIX_MAX_MONTHS,
    );
    if (next) setRange(next);
  };

  if (loading) {
    return <div className="py-10 text-center text-sm text-fs-muted">{tr("加载 CPI 分项数据中…")}</div>;
  }
  if (error) {
    return (
      <div className="py-10 text-center text-sm text-red-400">{tr("加载失败：")}{error}
      </div>
    );
  }

  const yoyTitle = endPeriod
    ? tr("相对结束月（{v0}）的去年同月", { v0: formatMacroPeriodDisplay(endPeriod, columns) })
    : tr("相对结束月的去年同月");

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-auto">
      <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-fs-muted">
        <label className="flex items-center gap-1.5">
          <span className="shrink-0">{tr("开始月份")}</span>
          <select
            className={selectClass}
            value={effectiveRange?.start ?? ""}
            aria-label={tr("开始月份")}
            disabled={allPeriods.length === 0}
            onChange={(e) => setStartMonth(e.target.value)}
          >
            {allPeriods.map((p) => (
              <option key={`start-${p}`} value={p}>
                {formatMacroPeriodDisplay(p, allPeriods)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="shrink-0">{tr("结束月份")}</span>
          <select
            className={selectClass}
            value={effectiveRange?.end ?? ""}
            aria-label={tr("结束月份")}
            disabled={allPeriods.length === 0}
            onChange={(e) => setEndMonth(e.target.value)}
          >
            {allPeriods.map((p) => (
              <option key={`end-${p}`} value={p}>
                {formatMacroPeriodDisplay(p, allPeriods)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg border border-fs-border">
        <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="bg-fs-elevated">
              <th className="sticky left-0 z-10 border-b border-fs-border bg-fs-elevated px-3 py-2 text-left font-semibold text-fs-text">{tr("分项（季调环比 %）")}</th>
              {columns.map((c) => (
                <th
                  key={c}
                  className="border-b border-l border-fs-border px-3 py-2 text-right font-semibold text-fs-text whitespace-nowrap"
                >
                  {formatMacroPeriodDisplay(c, columns)}
                </th>
              ))}
              <th
                className="border-b border-l border-fs-border bg-fs-elevated px-3 py-2 text-right font-semibold text-fs-text whitespace-nowrap"
                title={yoyTitle}
              >{tr("同比 %")}</th>
              <th className="border-b border-l border-fs-border bg-fs-elevated px-3 py-2 text-right font-semibold text-fs-text whitespace-nowrap">{tr("权重 %")}</th>
            </tr>
          </thead>
          <tbody>
            {CPI_MOM_MATRIX_ROWS.map((row) => {
              const mom = momByRow.get(row.fredId);
              const yoy = yoyByRow.get(row.fredId) ?? null;
              const weight = cpiWeightForFredId(row.fredId);
              return (
                <tr key={row.fredId}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 border-b border-fs-border bg-fs-bg px-3 py-1.5 text-left font-normal ${indentPadding(
                      row.indent,
                    )} ${row.emphasize ? "font-semibold text-fs-text" : "text-fs-secondary"}`}
                  >
                    <span className="whitespace-nowrap">{tr(row.labelZh)}</span>
                    <span className="ml-2 hidden text-[10px] text-fs-muted sm:inline">
                      {row.labelEn}
                    </span>
                  </th>
                  {columns.map((c) => {
                    const v = mom?.get(c) ?? null;
                    return (
                      <td
                        key={c}
                        className={`border-b border-l border-fs-border px-3 py-1.5 text-right tabular-nums ${momColorClass(
                          v,
                        )}`}
                      >
                        {fmtMom(v)}
                      </td>
                    );
                  })}
                  <td
                    className={`border-b border-l border-fs-border px-3 py-1.5 text-right tabular-nums ${momColorClass(
                      yoy,
                    )}`}
                    title={yoyTitle}
                  >
                    {fmtMom(yoy)}
                  </td>
                  <td className="border-b border-l border-fs-border px-3 py-1.5 text-right tabular-nums font-medium text-fs-secondary">
                    {fmtWeight(weight)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
