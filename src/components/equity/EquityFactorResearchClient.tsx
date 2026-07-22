"use client";

/**
 * 因子研究页（Phase 4 WS5）：/equity/factor-research。
 * 多因子选择 → IC/IR 汇总表 + 累计 IC 曲线 + 聚焦因子的五分层柱/分 regime IC/中性化对照
 * + 因子相关热力图。不用 useSearchParams（Phase 2 陷阱 1）：入口参数从 window.location 读。
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FACTOR_DEFS,
  type FactorCategory,
} from "@/lib/quant/factorRegistry";
import {
  CumulativeICChart,
  QuantileBarChart,
  type CumulativeICSeries,
} from "@/components/equity/FactorResearchCharts";
import {
  REGIME_COLOR,
  REGIME_LABEL,
  REGIME_ORDER,
  divergingColor,
  onColorInk,
  type RegimeKey,
} from "@/components/equity/regimeVisuals";

const CATEGORY_LABELS: Record<FactorCategory, string> = {
  valuation: "估值",
  quality: "质量",
  growth: "成长",
  momentum: "动量",
  volatility: "波动",
  liquidity: "量价",
  size: "规模",
};
const CATEGORY_ORDER: FactorCategory[] = [
  "valuation",
  "quality",
  "growth",
  "momentum",
  "volatility",
  "liquidity",
  "size",
];

type ICSummary = {
  n: number;
  meanIC: number;
  stdIC: number;
  ir: number;
  irAnnualized: number;
  tStat: number;
  hitRate: number;
};
type LayeringSummary = {
  quantiles: number;
  meanGroupReturns: (number | null)[];
  meanSpread: number;
  spreadN: number;
  spreadIR: number;
};
type FactorResult = {
  factorKey: string;
  nameZh: string;
  nameEn: string;
  category: string;
  higherIsBetter: boolean;
  quantiles: number;
  periods: { date: string; ic: number | null; n: number }[];
  cumulativeIC: number[];
  icSummary: ICSummary;
  layering: LayeringSummary;
  neutralizedIcSummary: ICSummary;
  icByRegime: Record<RegimeKey, ICSummary>;
};
type Report = {
  start: string;
  end: string;
  gridDates: string[];
  symbolCount: number;
  factors: FactorResult[];
  correlation: { factorKeys: string[]; matrix: (number | null)[][] };
  regimeByDate: Record<string, RegimeKey>;
  regimeAvailable: boolean;
};

const SESSION_KEY = "equityFactorResearchState.v1";

function pct(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(d)}%`;
}
function signPct(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
}
function num(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(d);
}
function icClass(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-fs-muted";
  if (v > 0.005) return "text-emerald-400";
  if (v < -0.005) return "text-red-400";
  return "text-fs-muted";
}

export function EquityFactorResearchClient() {
  const [selected, setSelected] = useState<Set<string>>(new Set(["mom12_1", "earningsYield"]));
  const [focused, setFocused] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [restored, setRestored] = useState(false);

  // 还原：入口参数（?factors=a,b）优先，其次 sessionStorage
  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const fromUrl = qs.get("factors");
      if (fromUrl) {
        const keys = fromUrl.split(",").map((s) => s.trim()).filter(Boolean);
        if (keys.length) setSelected(new Set(keys));
      } else {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as { selected?: string[]; report?: Report; focused?: string };
          if (saved.selected?.length) setSelected(new Set(saved.selected));
          if (saved.report) setReport(saved.report);
          if (saved.focused) setFocused(saved.focused);
        }
      }
    } catch {
      /* ignore */
    }
    setRestored(true);
  }, []);

  // 持久化（restored 后才写，避免覆盖竞态——Phase 2 陷阱 2）
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ selected: [...selected], report, focused }),
      );
    } catch {
      /* ignore */
    }
  }, [restored, selected, report, focused]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < 8) next.add(key);
      return next;
    });
  }, []);

  const run = useCallback(async () => {
    if (selected.size === 0) {
      setError("请至少选择一个因子");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/equity/factor-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorKeys: [...selected] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "请求失败");
      const rep = json as Report;
      setReport(rep);
      setFocused(rep.factors[0]?.factorKey ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const cumSeries: CumulativeICSeries[] = useMemo(() => {
    if (!report) return [];
    return report.factors.map((f) => ({
      name: f.nameZh,
      dates: report.gridDates.slice(0, f.cumulativeIC.length),
      cumIC: f.cumulativeIC,
    }));
  }, [report]);

  const focusedFactor = useMemo(
    () => report?.factors.find((f) => f.factorKey === focused) ?? report?.factors[0] ?? null,
    [report, focused],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold text-fs-text">因子研究</h1>
        <p className="text-sm text-fs-muted">
          月频截面 IC/IR、五分层、行业中性化对照与因子相关性（前向收益 = 次调仓期总收益）
        </p>
        <Link
          href="/equity/screener"
          className="ml-auto text-sm text-fs-accent-text hover:underline"
        >
          ← 选股器
        </Link>
      </header>

      {/* 因子选择 */}
      <section className="mb-4 rounded-lg border border-fs-border p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-fs-text">选择因子（最多 8）</span>
          <span className="text-xs text-fs-muted">已选 {selected.size}</span>
        </div>
        <div className="space-y-2">
          {CATEGORY_ORDER.map((cat) => {
            const defs = FACTOR_DEFS.filter((d) => d.category === cat);
            if (!defs.length) return null;
            return (
              <div key={cat} className="flex flex-wrap items-center gap-1.5">
                <span className="w-10 shrink-0 text-xs text-fs-muted">{CATEGORY_LABELS[cat]}</span>
                {defs.map((d) => {
                  const on = selected.has(d.key);
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => toggle(d.key)}
                      title={`${d.nameEn}｜${d.higherIsBetter ? "越大越好" : "越小越好"}｜${d.startYear} 起`}
                      className={`rounded-md px-2 py-0.5 text-xs ring-1 transition ${
                        on
                          ? "bg-fs-accent-soft text-fs-accent-text ring-fs-accent/30"
                          : "text-fs-muted ring-fs-border hover:text-fs-text"
                      }`}
                    >
                      {d.nameZh}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={loading || selected.size === 0}
            className="rounded-md bg-fs-accent-soft px-4 py-1.5 text-sm font-medium text-fs-accent-text ring-1 ring-fs-accent/25 hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "计算中…" : "运行研究"}
          </button>
          {error ? <span className="text-sm text-red-400">{error}</span> : null}
          {loading ? (
            <span className="text-xs text-fs-muted">首次全历史约 10–20 秒，请稍候…</span>
          ) : null}
        </div>
      </section>

      {report ? (
        <>
          <p className="mb-3 text-xs text-fs-muted">
            区间 {report.start} → {report.end}｜价格宇宙 {report.symbolCount} 只｜
            {report.regimeAvailable ? "已接入 regime" : "regime 未构建（分 regime 表为空，运行 quant:build-regime）"}
          </p>

          {/* IC/IR 汇总表 */}
          <section className="mb-5 overflow-x-auto rounded-lg border border-fs-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-fs-elevated text-xs text-fs-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">因子</th>
                  <th className="px-3 py-2 text-right font-medium">均值 IC</th>
                  <th className="px-3 py-2 text-right font-medium">年化 IR</th>
                  <th className="px-3 py-2 text-right font-medium">t 值</th>
                  <th className="px-3 py-2 text-right font-medium">IC&gt;0 胜率</th>
                  <th className="px-3 py-2 text-right font-medium">行业中性 IC</th>
                  <th className="px-3 py-2 text-right font-medium">分层价差</th>
                  <th className="px-3 py-2 text-right font-medium">期数</th>
                </tr>
              </thead>
              <tbody>
                {report.factors.map((f) => (
                  <tr
                    key={f.factorKey}
                    onClick={() => setFocused(f.factorKey)}
                    className={`cursor-pointer border-t border-fs-border hover:bg-fs-elevated/50 ${
                      focused === f.factorKey ? "bg-fs-accent-soft/20" : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-fs-text">
                      {f.nameZh}
                      <span className="ml-1 text-xs text-fs-muted">
                        {f.higherIsBetter ? "↑" : "↓"}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${icClass(f.icSummary.meanIC)}`}>
                      {num(f.icSummary.meanIC, 4)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-fs-text">
                      {num(f.icSummary.irAnnualized)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-fs-text">
                      {num(f.icSummary.tStat)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-fs-text">
                      {pct(f.icSummary.hitRate, 1)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${icClass(f.neutralizedIcSummary.meanIC)}`}>
                      {num(f.neutralizedIcSummary.meanIC, 4)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${icClass(f.layering.meanSpread)}`}>
                      {signPct(f.layering.meanSpread)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-fs-muted">
                      {f.icSummary.n}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-fs-border px-3 py-2 text-xs text-fs-muted">
              IC = 因子 zscore 与次期收益的 Spearman 秩相关；行业中性 IC 用 sectorZscore（行业内标准化）。
              两者差值 = 行业暴露对因子有效性的贡献。点击行切换下方聚焦因子。
            </p>
          </section>

          {/* 累计 IC 曲线 */}
          <section className="mb-5 rounded-lg border border-fs-border p-4">
            <h2 className="mb-2 text-sm font-medium text-fs-text">累计 IC 曲线</h2>
            <CumulativeICChart series={cumSeries} />
          </section>

          {/* 聚焦因子：分层 + 分 regime */}
          {focusedFactor ? (
            <section className="mb-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-fs-border p-4">
                <h2 className="mb-2 text-sm font-medium text-fs-text">
                  {focusedFactor.nameZh}：{focusedFactor.quantiles} 分位组次期收益
                </h2>
                <QuantileBarChart
                  groupReturns={focusedFactor.layering.meanGroupReturns}
                  quantiles={focusedFactor.quantiles}
                />
                <p className="mt-1 text-xs text-fs-muted">
                  Q{focusedFactor.quantiles}−Q1 价差{" "}
                  <span className={icClass(focusedFactor.layering.meanSpread)}>
                    {signPct(focusedFactor.layering.meanSpread)}
                  </span>
                  （价差 IR {num(focusedFactor.layering.spreadIR)}）。价差符号与均值 IC 一致 = 单调有效。
                </p>
              </div>
              <div className="rounded-lg border border-fs-border p-4">
                <h2 className="mb-2 text-sm font-medium text-fs-text">
                  {focusedFactor.nameZh}：分 regime 的均值 IC
                </h2>
                {report.regimeAvailable ? (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-fs-muted">
                      <tr>
                        <th className="py-1 text-left font-medium">regime</th>
                        <th className="py-1 text-right font-medium">均值 IC</th>
                        <th className="py-1 text-right font-medium">期数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {REGIME_ORDER.map((rk) => {
                        const s = focusedFactor.icByRegime[rk];
                        return (
                          <tr key={rk} className="border-t border-fs-border">
                            <td className="py-1.5">
                              <span
                                className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                                style={{ background: REGIME_COLOR[rk] }}
                              />
                              <span className="align-middle text-fs-text">{REGIME_LABEL[rk]}</span>
                            </td>
                            <td className={`py-1.5 text-right tabular-nums ${icClass(s.meanIC)}`}>
                              {num(s.meanIC, 4)}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-fs-muted">{s.n}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-fs-muted">regime 未构建，运行 quant:build-regime 后可见。</p>
                )}
              </div>
            </section>
          ) : null}

          {/* 相关热力图 */}
          {report.correlation.factorKeys.length >= 2 ? (
            <section className="mb-5 rounded-lg border border-fs-border p-4">
              <h2 className="mb-2 text-sm font-medium text-fs-text">因子截面相关（时间平均 Pearson）</h2>
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr>
                      <th className="p-1" />
                      {report.correlation.factorKeys.map((k) => {
                        const def = report.factors.find((f) => f.factorKey === k);
                        return (
                          <th key={k} className="p-1 text-fs-muted" title={k}>
                            {def?.nameZh ?? k}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {report.correlation.matrix.map((row, i) => (
                      <tr key={report.correlation.factorKeys[i]}>
                        <th className="whitespace-nowrap p-1 text-right text-fs-muted">
                          {report.factors.find((f) => f.factorKey === report.correlation.factorKeys[i])?.nameZh ??
                            report.correlation.factorKeys[i]}
                        </th>
                        {row.map((v, j) => (
                          <td
                            key={j}
                            className="p-1 text-center tabular-nums"
                            style={{ background: divergingColor(v, 1), color: onColorInk(v, 1) }}
                            title={v == null ? "—" : v.toFixed(2)}
                          >
                            {v == null ? "—" : v.toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-fs-muted">
                红=正相关（因子冗余）· 蓝=负相关 · 灰≈无关。构建复合策略时避免高正相关因子叠加。
              </p>
            </section>
          ) : null}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-fs-border px-4 py-10 text-center text-sm text-fs-muted">
          选择因子后点击「运行研究」查看 IC/IR、分层与相关性。
        </div>
      )}
    </div>
  );
}
