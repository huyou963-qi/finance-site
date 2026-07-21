"use client";

/**
 * 回测报告页（Phase 3 WS4）：/equity/backtest/[runId]。
 * queued/running 轮询状态；done 渲染 NAV 曲线 / 指标卡 / 年度收益 / 逐期持仓 / 换手 /
 * 数据边界透明化（宇宙覆盖、因子剔除、无价跳过、清算计数）。
 * 不用 useSearchParams，故不包 Suspense（Phase 2 陷阱 1：内嵌 preview 会卡 fallback）。
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavChart, TurnoverChart, type NavPoint } from "@/components/equity/BacktestCharts";

type RunStatus = "queued" | "running" | "done" | "failed";

type Metrics = {
  cagr: number;
  vol: number;
  sharpe: number;
  maxDrawdown: number;
  calmar: number | null;
  monthlyWinRate: number | null;
  monthlyCount: number;
  avgAnnualTurnover: number;
  benchCagr: number | null;
  benchMaxDrawdown: number | null;
  days: number;
};

type PeriodSummary = {
  date: string;
  execDate: string;
  selected: number;
  held: number;
  noPriceSkipped: number;
  droppedNoWeight: number;
  liquidated: number;
  turnover: number;
  cost: number;
  universeTotal: number | null;
  droppedNull: number | null;
  filteredOut: number | null;
  matched: number | null;
};

type Summary = {
  effectiveStart: string;
  dataFloor: string;
  rebalanceCount: number;
  symbolCount: number;
  periods: PeriodSummary[];
};

type Position = {
  rebalanceDate: string;
  symbol: string;
  weight: number;
  entryPrice: number | null;
  exitReason: string | null;
};

type RunDetail = {
  id: string;
  name: string;
  status: RunStatus;
  strategyConfig: unknown;
  params: {
    start?: string | null;
    end?: string | null;
    weighting: string;
    execution: string;
    costBps: number;
  };
  metrics: Metrics | null;
  summary: Summary | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  nav: NavPoint[];
  positions: Position[];
};

const WEIGHTING_LABEL: Record<string, string> = {
  equal: "等权",
  mcap: "市值加权",
  score: "打分加权",
};
const EXIT_LABEL: Record<string, string> = {
  sold: "卖出",
  carried: "续持",
  liquidated: "清算转现金",
  endOfBacktest: "持有至末",
};

function pct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}
function signPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}
function num(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}
function deltaClass(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-fs-muted";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-fs-muted";
}

/** 从日 NAV 序列按自然年折算年度收益（年末/上年末−1；首年用序列起点为基）。 */
function annualReturns(nav: NavPoint[]): {
  year: string;
  port: number;
  bench: number | null;
}[] {
  if (nav.length === 0) return [];
  const byYear = new Map<string, NavPoint>();
  for (const p of nav) byYear.set(p.date.slice(0, 4), p); // 升序，后写覆盖 = 年末
  const yearEnds = [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const base = nav[0]!;
  const out: { year: string; port: number; bench: number | null }[] = [];
  let prev = base;
  for (const [year, end] of yearEnds) {
    const port = end.nav / prev.nav - 1;
    const bench =
      end.benchNav != null && prev.benchNav != null && prev.benchNav !== 0
        ? end.benchNav / prev.benchNav - 1
        : null;
    out.push({ year, port, bench });
    prev = end;
  }
  return out;
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg" | "neutral";
}) {
  const valueClass =
    tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-red-400" : "text-fs-text";
  return (
    <div className="rounded-lg border border-fs-border bg-fs-elevated/40 px-3 py-2.5">
      <div className="text-xs text-fs-muted">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {sub ? <div className="text-[11px] text-fs-muted">{sub}</div> : null}
    </div>
  );
}

export function EquityBacktestReportClient({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRun = useCallback(
    async (statusOnly: boolean) => {
      try {
        const r = await fetch(`/api/equity/backtest/${runId}${statusOnly ? "?status=1" : ""}`, {
          cache: "no-store",
        });
        const j = (await r.json()) as { run?: RunDetail; error?: string };
        if (!r.ok) throw new Error(j.error ?? "加载失败");
        return j.run ?? null;
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
        return null;
      }
    },
    [runId],
  );

  // 初次加载完整详情
  useEffect(() => {
    void fetchRun(false).then((r) => r && setRun(r));
  }, [fetchRun]);

  // running/queued 轮询：状态转 done 时重新拉完整详情
  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    const timer = setInterval(async () => {
      const status = await fetchRun(true);
      if (!status) return;
      if (status.status === "done" || status.status === "failed") {
        const full = await fetchRun(false);
        if (full) setRun(full);
      } else if (status.status !== run.status) {
        setRun((prev) => (prev ? { ...prev, status: status.status } : status));
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [run, fetchRun]);

  const annual = useMemo(() => (run ? annualReturns(run.nav) : []), [run]);
  const turnoverPoints = useMemo(
    () => (run?.summary?.periods ?? []).map((p) => ({ date: p.date, turnover: p.turnover })),
    [run],
  );
  const positionsByPeriod = useMemo(() => {
    const m = new Map<string, Position[]>();
    for (const p of run?.positions ?? []) {
      const list = m.get(p.rebalanceDate) ?? [];
      list.push(p);
      m.set(p.rebalanceDate, list);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [run]);

  if (error && !run) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <Link href="/equity/backtest" className="text-sm text-fs-accent-text hover:underline">
          ← 返回回测列表
        </Link>
        <div className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 text-center text-sm text-fs-muted">
        加载中…
      </div>
    );
  }

  const m = run.metrics;
  const s = run.summary;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/equity/backtest" className="text-sm text-fs-accent-text hover:underline">
          ← 回测列表
        </Link>
        <h1 className="text-xl font-semibold">{run.name}</h1>
        <span className="text-xs text-fs-muted">
          {WEIGHTING_LABEL[run.params.weighting] ?? run.params.weighting} ·{" "}
          {run.params.execution === "nextClose" ? "次日收盘成交" : "当日收盘成交"} · 成本{" "}
          {run.params.costBps}bp/单边
        </span>
      </div>

      {run.status === "queued" || run.status === "running" ? (
        <div className="rounded-lg border border-fs-border bg-fs-elevated/40 px-4 py-10 text-center">
          <div className="text-sm text-fs-text">
            {run.status === "queued" ? "排队中…" : "回测执行中…"}
          </div>
          <div className="mt-1 text-xs text-fs-muted">
            月度重放选股 → 价格批载 → 逐日估值，请稍候（页面自动刷新）
          </div>
        </div>
      ) : null}

      {run.status === "failed" ? (
        <div className="rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          执行失败：{run.error ?? "未知错误"}
        </div>
      ) : null}

      {run.status === "done" && m ? (
        <>
          {/* ── 指标卡 ── */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <StatTile label="年化收益 CAGR" value={pct(m.cagr)} tone={m.cagr >= 0 ? "pos" : "neg"} sub={`基准 ${pct(m.benchCagr)}`} />
            <StatTile label="年化波动" value={pct(m.vol)} sub="252 日口径" />
            <StatTile label="夏普" value={num(m.sharpe, 2)} sub="rf=0" />
            <StatTile label="最大回撤" value={pct(m.maxDrawdown)} tone="neg" sub={`基准 ${pct(m.benchMaxDrawdown)}`} />
            <StatTile label="Calmar" value={num(m.calmar, 2)} sub="CAGR/|MDD|" />
            <StatTile label="月胜率 vs SPY" value={pct(m.monthlyWinRate)} sub={`${m.monthlyCount} 月`} />
            <StatTile label="平均年换手" value={`${num(m.avgAnnualTurnover, 2)}×`} sub="单边口径" />
          </div>

          {/* ── NAV 曲线 ── */}
          <div className="mb-4 rounded-lg border border-fs-border bg-fs-elevated/20 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium">净值曲线（对数轴，起点归一）</span>
              <span className="text-xs text-fs-muted">
                {run.nav[0]?.date} → {run.nav[run.nav.length - 1]?.date} · {run.nav.length} 交易日
              </span>
            </div>
            <NavChart nav={run.nav} />
          </div>

          {/* ── 数据边界透明化 ── */}
          {s ? (
            <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-xs">
              <div className="mb-1 font-medium text-amber-500/90">数据边界（结论审慎性）</div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-fs-muted">
                <span>回测起点 <span className="text-fs-text">{s.effectiveStart}</span>（策略数据下限 {s.dataFloor}）</span>
                <span>调仓 <span className="text-fs-text">{s.rebalanceCount}</span> 期</span>
                <span>持仓宇宙 <span className="text-fs-text">{s.symbolCount}</span> 只</span>
                <span>累计无价跳过 <span className="text-fs-text">{s.periods.reduce((a, p) => a + p.noPriceSkipped, 0)}</span> 次</span>
                <span>累计清算 <span className="text-fs-text">{s.periods.reduce((a, p) => a + p.liquidated, 0)}</span> 次</span>
                <span>累计权重缺失剔除 <span className="text-fs-text">{s.periods.reduce((a, p) => a + p.droppedNoWeight, 0)}</span> 次</span>
              </div>
            </div>
          ) : null}

          {/* ── 年度收益 + 换手 ── */}
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-fs-border bg-fs-elevated/20 p-3">
              <div className="mb-2 text-sm font-medium">年度收益 vs SPY</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-fs-border text-left text-xs text-fs-muted">
                      <th className="px-2 py-1.5">年份</th>
                      <th className="px-2 py-1.5 text-right">策略</th>
                      <th className="px-2 py-1.5 text-right">SPY</th>
                      <th className="px-2 py-1.5 text-right">超额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annual.map((a) => {
                      const excess = a.bench != null ? a.port - a.bench : null;
                      return (
                        <tr key={a.year} className="border-b border-fs-border/60 last:border-0">
                          <td className="px-2 py-1.5 tabular-nums">{a.year}</td>
                          <td className={`px-2 py-1.5 text-right tabular-nums ${deltaClass(a.port)}`}>{signPct(a.port)}</td>
                          <td className={`px-2 py-1.5 text-right tabular-nums ${deltaClass(a.bench)}`}>{signPct(a.bench)}</td>
                          <td className={`px-2 py-1.5 text-right tabular-nums ${deltaClass(excess)}`}>{signPct(excess)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-lg border border-fs-border bg-fs-elevated/20 p-3">
              <div className="mb-2 text-sm font-medium">逐期双边换手率</div>
              <TurnoverChart points={turnoverPoints} />
            </div>
          </div>

          {/* ── 逐期持仓 ── */}
          <div className="rounded-lg border border-fs-border bg-fs-elevated/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">逐期持仓明细</span>
              <span className="text-xs text-fs-muted">共 {positionsByPeriod.length} 期，展开查看每期成分与退出原因</span>
            </div>
            <div className="max-h-[30rem] space-y-1.5 overflow-y-auto">
              {positionsByPeriod.map(([date, rows]) => {
                const period = s?.periods.find((p) => p.date === date);
                return (
                  <details key={date} className="rounded-md border border-fs-border/60 bg-fs-elevated/30">
                    <summary className="cursor-pointer px-3 py-2 text-sm">
                      <span className="tabular-nums">{date}</span>
                      <span className="ml-3 text-xs text-fs-muted">
                        持仓 {rows.length}
                        {period ? (
                          <>
                            {" · "}宇宙 {period.universeTotal ?? "—"} · 命中 {period.matched ?? "—"}
                            {period.noPriceSkipped ? ` · 无价跳过 ${period.noPriceSkipped}` : ""}
                            {period.liquidated ? ` · 清算 ${period.liquidated}` : ""}
                            {" · "}换手 {pct(period.turnover, 1)}
                          </>
                        ) : null}
                      </span>
                    </summary>
                    <div className="overflow-x-auto border-t border-fs-border/60 px-3 py-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-fs-muted">
                            <th className="px-2 py-1">#</th>
                            <th className="px-2 py-1">代码</th>
                            <th className="px-2 py-1 text-right">权重</th>
                            <th className="px-2 py-1 text-right">入场价(复权)</th>
                            <th className="px-2 py-1">退出</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((p, i) => (
                            <tr key={p.symbol} className="border-t border-fs-border/40">
                              <td className="px-2 py-1 text-fs-muted">{i + 1}</td>
                              <td className="px-2 py-1">
                                <Link href={`/equity/stocks/${p.symbol}`} className="text-fs-accent-text hover:underline">
                                  {p.symbol}
                                </Link>
                              </td>
                              <td className="px-2 py-1 text-right tabular-nums">{pct(p.weight, 1)}</td>
                              <td className="px-2 py-1 text-right tabular-nums">{num(p.entryPrice, 2)}</td>
                              <td className="px-2 py-1 text-fs-muted">{p.exitReason ? EXIT_LABEL[p.exitReason] ?? p.exitReason : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
