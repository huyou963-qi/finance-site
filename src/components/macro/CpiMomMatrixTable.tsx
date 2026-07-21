"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CPI_MOM_MATRIX_ROWS,
  CPI_MOM_MATRIX_FRED_IDS,
  CPI_WEIGHT_META,
  cpiWeightForFredId,
  type CpiMomMatrixRow,
} from "@/lib/data/cpi/cpiMomMatrixCatalog";
import { compareMacroPeriodLabels, formatMacroPeriodDisplay } from "@/lib/macroPeriodLabel";

type UnifiedSeries = { key: string; name: string; data: (number | null)[] };
type UnifiedPayload = { categories: string[]; series: UnifiedSeries[] };

/** 展示多少个月（列数）。BLS Table A 通常展示最近 7 个月。 */
const DEFAULT_MONTHS = 7;

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

export function CpiMomMatrixTable({ months = DEFAULT_MONTHS }: { months?: number }) {
  const [payload, setPayload] = useState<UnifiedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return false;
        const j = (await r.json().catch(() => ({}))) as { user?: { role?: string } };
        return String(j.user?.role ?? "").trim().toLowerCase() === "admin";
      })
      .then((admin) => {
        if (!cancelled) setIsAdmin(admin);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { columns, momByRow } = useMemo(() => {
    if (!payload) return { columns: [] as string[], momByRow: new Map<string, Map<string, number>>() };
    const seriesByKey = new Map(payload.series.map((s) => [s.key, s]));
    const perRow = new Map<string, Map<string, number>>();
    const periodSet = new Set<string>();
    for (const row of CPI_MOM_MATRIX_ROWS) {
      const s = seriesByKey.get(fredKey(row.fredId));
      const mom = s ? computeMomByPeriod(payload.categories, s.data) : new Map<string, number>();
      perRow.set(row.fredId, mom);
      for (const p of mom.keys()) periodSet.add(p);
    }
    const allPeriods = [...periodSet].sort(compareMacroPeriodLabels);
    const cols = allPeriods.slice(-months);
    return { columns: cols, momByRow: perRow };
  }, [payload, months]);

  if (loading) {
    return <div className="py-10 text-center text-sm text-fs-muted">加载 CPI 分项数据中…</div>;
  }
  if (error) {
    return (
      <div className="py-10 text-center text-sm text-red-400">
        加载失败：{error}
      </div>
    );
  }

  const hasFootnote = CPI_MOM_MATRIX_ROWS.some((r) => r.footnote);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-fs-border">
        <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="bg-fs-elevated">
              <th className="sticky left-0 z-10 border-b border-fs-border bg-fs-elevated px-3 py-2 text-left font-semibold text-fs-text">
                分项（季调环比 %）
              </th>
              {columns.map((c) => (
                <th
                  key={c}
                  className="border-b border-l border-fs-border px-3 py-2 text-right font-semibold text-fs-text whitespace-nowrap"
                >
                  {formatMacroPeriodDisplay(c, columns)}
                </th>
              ))}
              <th className="border-b border-l border-fs-border bg-fs-elevated px-3 py-2 text-right font-semibold text-fs-text whitespace-nowrap">
                权重 %
              </th>
            </tr>
          </thead>
          <tbody>
            {CPI_MOM_MATRIX_ROWS.map((row) => {
              const mom = momByRow.get(row.fredId);
              const weight = cpiWeightForFredId(row.fredId);
              return (
                <tr key={row.fredId}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 border-b border-fs-border bg-fs-bg px-3 py-1.5 text-left font-normal ${indentPadding(
                      row.indent,
                    )} ${row.emphasize ? "font-semibold text-fs-text" : "text-fs-secondary"}`}
                  >
                    <span className="whitespace-nowrap">{row.labelZh}</span>
                    {row.footnote ? <sup className="ml-0.5 text-fs-muted">*</sup> : null}
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
                  <td className="border-b border-l border-fs-border px-3 py-1.5 text-right tabular-nums font-medium text-fs-secondary">
                    {fmtWeight(weight)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1 text-[11px] text-fs-muted">
        {hasFootnote ? (
          <p>
            * {CPI_MOM_MATRIX_ROWS.find((r) => r.footnote)?.footnote}
          </p>
        ) : null}
        <p>
          {isAdmin ? (
            <>
              环比 = 季调指数（BLS/FRED，SA）相邻月变动；正值（通胀走热）红色、负值绿色。权重为{" "}
              {CPI_WEIGHT_META.source}（{CPI_WEIGHT_META.asOf}，{CPI_WEIGHT_META.weightBase}
              ，CPI-U，占全部项目 %）。
            </>
          ) : (
            <>
              环比 = 季调指数相邻月变动；正值（通胀走热）红色、负值绿色。权重为相对重要性（
              {CPI_WEIGHT_META.asOf}，CPI-U，占全部项目 %）。
            </>
          )}
        </p>
      </div>
    </div>
  );
}
