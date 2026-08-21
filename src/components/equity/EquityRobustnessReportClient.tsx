"use client";

/**
 * 稳健性分析报告页（P2 WS4）：/equity/robustness/[runId]。
 * queued/running 轮询；done 按 mode 渲染：
 *  - scan：Deflated Sharpe 横幅 + 参数扫描热力图/表（邻域普遍好 vs 仅一点好）。
 *  - oos：IS/OOS 指标并排 + 退化度量 + DSR + 两段异色净值 + IS 扫描表。
 *  - walkforward：拼接净值 + 各折表 + 整体指标 + 固定策略诚实边界提示。
 * 不用 useSearchParams，故不包 Suspense（Phase 2 陷阱）。
 * 结果类型 import type 自 robustnessData（编译期擦除，不把 prisma 带进 client bundle）。
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  IsOosNavChart,
  WalkforwardNavChart,
} from "@/components/equity/RobustnessCharts";
import type {
  RobustnessExecution,
  ScanPoint,
  WindowMetrics,
} from "@/lib/quant/robustnessData";

type RunStatus = "queued" | "running" | "done" | "failed";

type RunDetail = {
  id: string;
  name: string;
  mode: "scan" | "oos" | "walkforward";
  status: RunStatus;
  params: { weighting: string; costBps: number; start?: string | null; end?: string | null };
  result: RobustnessExecution | null;
  error: string | null;
  createdAt: string;
};

const MODE_LABEL: Record<string, string> = {
  scan: "参数扫描",
  oos: "样本外分割",
  walkforward: "Walk-Forward",
};

function pct(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(d)}%`;
}
function num(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(d);
}
function tone(v: number | null | undefined): "pos" | "neg" | "neutral" {
  if (v == null || !Number.isFinite(v)) return "neutral";
  return v > 0 ? "pos" : v < 0 ? "neg" : "neutral";
}

function StatTile({
  label,
  value,
  sub,
  t,
}: {
  label: string;
  value: string;
  sub?: string;
  t?: "pos" | "neg" | "neutral";
}) {
  const valueClass = t === "pos" ? "text-emerald-400" : t === "neg" ? "text-red-400" : "text-fs-text";
  return (
    <div className="rounded-lg border border-fs-border bg-fs-elevated/40 px-3 py-2.5">
      <div className="text-xs text-fs-muted">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {sub ? <div className="text-[11px] text-fs-muted">{sub}</div> : null}
    </div>
  );
}

/** Deflated Sharpe 横幅：观测夏普 / 试验数 N / 期望最大夏普 SR0 / PSR → DSR / 显著性。 */
function DsrBanner({
  dsr,
}: {
  dsr: NonNullable<RobustnessExecution["scan"]>["deflated"];
}) {
  if (!dsr) return null;
  return (
    <div
      className={`mb-4 rounded-lg border px-4 py-3 ${
        dsr.significant
          ? "border-emerald-500/30 bg-emerald-500/[0.06]"
          : "border-red-400/30 bg-red-400/[0.06]"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">
          Deflated Sharpe Ratio ={" "}
          <span className={dsr.significant ? "text-emerald-400" : "text-red-400"}>
            {pct(dsr.dsr)}
          </span>
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
            dsr.significant
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-red-400/15 text-red-400"
          }`}
        >
          {dsr.significant ? "扣除多重检验与基准后仍显著" : "扣除多重检验与基准后不显著"}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fs-muted">
        <span>
          试验数 N = <span className="text-fs-text tabular-nums">{dsr.nTrials}</span>
        </span>
        <span>
          观测每期夏普 <span className="text-fs-text tabular-nums">{num(dsr.observedSharpe, 4)}</span>
        </span>
        <span>
          期望最大夏普 <span className="text-fs-text tabular-nums">{num(dsr.expectedMaxSharpe, 4)}</span>
        </span>
        <span>
          基准(SPY)每期夏普{" "}
          <span className="text-fs-text tabular-nums">{num(dsr.benchmarkSharpe, 4)}</span>
        </span>
        <span>
          实际零假设 SR₀ <span className="text-fs-text tabular-nums">{num(dsr.thresholdSharpe, 4)}</span>
        </span>
        <span>
          未校正 PSR(vs 0) <span className="text-fs-text tabular-nums">{pct(dsr.psrVsZero)}</span>
        </span>
      </div>
      <div className="mt-1 text-[11px] text-fs-muted">
        零假设 SR₀ = max(期望最大夏普, 基准夏普)，两道门都要过：前者防「N 次试验里挑最优」，
        后者防「只是拿了 beta」——多头股票策略对着 0 检验几乎必然显著，那是空洞结论。
        试验数按实际扫描点数如实记录——谎报 N=1 等于没做校正。
      </div>
    </div>
  );
}

/** 参数扫描热力图（diverging 红↔蓝，围绕 0）；≤2 轴用网格，否则表格 */
function ScanSurface({
  axes,
  points,
  bestIndex,
}: {
  axes: { key: string; values: (number | string)[] }[];
  points: ScanPoint[];
  bestIndex: number | null;
}) {
  const vals = points.map((p) => p.metrics?.sharpeAnnual).filter((v): v is number => v != null);
  const maxAbs = Math.max(0.1, ...vals.map((v) => Math.abs(v)));
  const cellColor = (v: number | null | undefined): string => {
    if (v == null || !Number.isFinite(v)) return "transparent";
    const t = Math.max(-1, Math.min(1, v / maxAbs));
    if (t >= 0) return `rgba(57,135,229,${(0.12 + 0.6 * t).toFixed(3)})`; // 蓝=好
    return `rgba(224,103,103,${(0.12 + 0.6 * -t).toFixed(3)})`; // 红=差
  };

  if (axes.length === 2) {
    const [rowAxis, colAxis] = axes;
    const byCoord = new Map<string, ScanPoint>();
    for (const p of points) byCoord.set(`${p.coords[0]}|${p.coords[1]}`, p);
    return (
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="p-1.5 text-fs-muted">
                {rowAxis!.key} ＼ {colAxis!.key}
              </th>
              {colAxis!.values.map((c) => (
                <th key={String(c)} className="p-1.5 text-center font-medium text-fs-muted">
                  {String(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowAxis!.values.map((r) => (
              <tr key={String(r)}>
                <th className="whitespace-nowrap p-1.5 text-right font-medium text-fs-muted">
                  {String(r)}
                </th>
                {colAxis!.values.map((c) => {
                  const p = byCoord.get(`${r}|${c}`);
                  const v = p?.metrics?.sharpeAnnual ?? null;
                  const isBest = p != null && p.index === bestIndex;
                  return (
                    <td
                      key={String(c)}
                      className={`p-1.5 text-center tabular-nums ${
                        isBest ? "ring-2 ring-fs-accent" : ""
                      }`}
                      style={{ backgroundColor: cellColor(v) }}
                      title={p?.label}
                    >
                      {v == null ? "—" : num(v, 2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-1 text-[11px] text-fs-muted">
          单元格 = 年化夏普（蓝好红差）；★环 = 最优点。邻域普遍偏蓝 → 稳健；仅单点亮 → 疑似过拟合。
        </div>
      </div>
    );
  }

  // 1 轴或 >2 轴：表格
  const sorted = [...points].sort(
    (a, b) => (b.metrics?.sharpeAnnual ?? -Infinity) - (a.metrics?.sharpeAnnual ?? -Infinity),
  );
  return (
    <div className="overflow-x-auto rounded-lg border border-fs-border">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-fs-elevated text-xs text-fs-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">参数点</th>
            <th className="px-3 py-2 text-right font-medium">年化夏普</th>
            <th className="px-3 py-2 text-right font-medium">CAGR</th>
            <th className="px-3 py-2 text-right font-medium">最大回撤</th>
            <th className="px-3 py-2 text-right font-medium">平均持仓</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr
              key={p.index}
              className={`border-t border-fs-border ${p.index === bestIndex ? "bg-fs-accent-soft/20" : ""}`}
            >
              <td className="px-3 py-2 text-fs-text">
                {p.label}
                {p.index === bestIndex ? <span className="ml-1 text-fs-accent-text">★</span> : null}
              </td>
              <td
                className="px-3 py-2 text-right tabular-nums"
                style={{ backgroundColor: cellColor(p.metrics?.sharpeAnnual) }}
              >
                {num(p.metrics?.sharpeAnnual, 2)}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${tone(p.metrics?.cagr) === "neg" ? "text-red-400" : "text-fs-text"}`}>
                {pct(p.metrics?.cagr)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-red-400">
                {pct(p.metrics?.maxDrawdown)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-fs-muted">
                {num(p.metrics?.avgHeld, 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricsPair({ is, oos }: { is: WindowMetrics | null; oos: WindowMetrics | null }) {
  const rows: { label: string; k: keyof WindowMetrics; fmt: (v: number | null | undefined) => string; neg?: boolean }[] = [
    { label: "年化收益 CAGR", k: "cagr", fmt: (v) => pct(v) },
    { label: "夏普", k: "sharpeAnnual", fmt: (v) => num(v, 2) },
    { label: "最大回撤", k: "maxDrawdown", fmt: (v) => pct(v), neg: true },
    { label: "年化波动", k: "vol", fmt: (v) => pct(v) },
  ];
  return (
    <div className="overflow-x-auto rounded-lg border border-fs-border">
      <table className="w-full text-sm">
        <thead className="bg-fs-elevated text-xs text-fs-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">指标</th>
            <th className="px-3 py-2 text-right font-medium text-fs-accent-text">样本内 IS</th>
            <th className="px-3 py-2 text-right font-medium" style={{ color: "#c98500" }}>样本外 OOS</th>
            <th className="px-3 py-2 text-right font-medium">退化</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const iv = is?.[row.k] as number | null | undefined;
            const ov = oos?.[row.k] as number | null | undefined;
            const delta = iv != null && ov != null ? ov - iv : null;
            return (
              <tr key={row.label} className="border-t border-fs-border">
                <td className="px-3 py-2 text-fs-muted">{row.label}</td>
                <td className="px-3 py-2 text-right tabular-nums text-fs-text">{row.fmt(iv)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-fs-text">{row.fmt(ov)}</td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    delta == null ? "text-fs-muted" : (row.neg ? delta > 0 : delta < 0) ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  {delta == null ? "—" : `${delta > 0 ? "+" : ""}${row.fmt(delta)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EquityRobustnessReportClient({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRun = useCallback(
    async (statusOnly: boolean) => {
      try {
        const r = await fetch(`/api/equity/robustness/${runId}${statusOnly ? "?status=1" : ""}`, {
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

  useEffect(() => {
    void fetchRun(false).then((r) => r && setRun(r));
  }, [fetchRun]);

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
    }, 1800);
    return () => clearInterval(timer);
  }, [run, fetchRun]);

  if (error && !run) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <Link href="/quant/robustness" className="text-sm text-fs-accent-text hover:underline">
          ← 返回稳健性分析列表
        </Link>
        <div className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }
  if (!run) {
    return <div className="mx-auto w-full max-w-5xl px-4 py-10 text-center text-sm text-fs-muted">加载中…</div>;
  }

  const res = run.result;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link href="/quant/robustness" className="text-sm text-fs-accent-text hover:underline">
          ← 稳健性列表
        </Link>
        <h1 className="text-xl font-semibold">{run.name}</h1>
        <span className="rounded bg-fs-elevated px-2 py-0.5 text-xs text-fs-muted">
          {MODE_LABEL[run.mode] ?? run.mode}
        </span>
      </div>

      {run.status === "queued" || run.status === "running" ? (
        <div className="rounded-lg border border-fs-border bg-fs-elevated/40 px-4 py-10 text-center">
          <div className="text-sm text-fs-text">{run.status === "queued" ? "排队中…" : "稳健性分析执行中…"}</div>
          <div className="mt-1 text-xs text-fs-muted">
            截面装配一次 → 跨参数网格/时间分割多次回测 → 聚合，请稍候（页面自动刷新）
          </div>
        </div>
      ) : null}

      {run.status === "failed" ? (
        <div className="rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          执行失败：{run.error ?? "未知错误"}
        </div>
      ) : null}

      {run.status === "done" && res ? (
        <>
          <div className="mb-4 rounded-md border border-fs-border bg-fs-elevated/30 px-3 py-2 text-xs text-fs-muted">
            区间 <span className="text-fs-text">{res.effectiveStart}</span> →{" "}
            <span className="text-fs-text">{res.end ?? "最新"}</span>｜调仓{" "}
            <span className="text-fs-text">{res.rebalanceCount}</span> 期｜持仓宇宙{" "}
            <span className="text-fs-text">{res.symbolCount}</span> 只｜网格{" "}
            <span className="text-fs-text">{res.gridSize}</span> 点｜数据下限 {res.dataFloor}
          </div>

          {/* ── scan ── */}
          {res.scan ? (
            <>
              <DsrBanner dsr={res.scan.deflated} />
              <div className="mb-4 rounded-lg border border-fs-border bg-fs-elevated/20 p-3">
                <div className="mb-2 text-sm font-medium">
                  参数扫描稳健性面（挑选指标：{res.scan.selectMetric === "sharpe" ? "夏普" : "CAGR"}）
                </div>
                <ScanSurface axes={res.scan.axes} points={res.scan.points} bestIndex={res.scan.bestIndex} />
              </div>
              <HonestNote mode="scan" />
            </>
          ) : null}

          {/* ── oos ── */}
          {res.oos ? (
            <>
              <div className="mb-3 text-sm text-fs-muted">
                分割日 <span className="text-fs-text">{res.oos.splitDate}</span>｜IS 段扫{" "}
                <span className="text-fs-text">{res.oos.isScan.length}</span> 点挑最优 →{" "}
                赢家 <span className="text-fs-accent-text">{res.oos.winnerLabel ?? "—"}</span>，OOS 段只跑一次
              </div>
              {res.oos.degradation?.collapsed ? (
                <div className="mb-3 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400">
                  ⚠ 样本外崩溃：样本内正夏普在样本外转负——典型的选择性过拟合。
                </div>
              ) : null}
              <div className="mb-4 grid gap-3 lg:grid-cols-2">
                <MetricsPair is={res.oos.isMetrics} oos={res.oos.oosMetrics} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
                  <StatTile
                    label="夏普保留率 OOS/IS"
                    value={res.oos.degradation?.sharpeRetention != null ? `${(res.oos.degradation.sharpeRetention * 100).toFixed(0)}%` : "—"}
                    t={tone(res.oos.degradation?.sharpeRetention)}
                    sub="1 以上=样本外更强"
                  />
                  <StatTile
                    label="夏普退化 Δ"
                    value={num(res.oos.degradation?.sharpeDelta, 2)}
                    t={tone(res.oos.degradation?.sharpeDelta)}
                    sub="OOS − IS"
                  />
                </div>
              </div>
              <DsrBanner dsr={res.oos.deflated} />
              {res.oos.isNav.length && res.oos.oosNav.length ? (
                <div className="mb-4 rounded-lg border border-fs-border bg-fs-elevated/20 p-3">
                  <div className="mb-1 text-sm font-medium">样本内 / 样本外净值（异色，对数轴）</div>
                  <IsOosNavChart isNav={res.oos.isNav} oosNav={res.oos.oosNav} splitDate={res.oos.splitDate} />
                </div>
              ) : null}
              {res.oos.axes.length ? (
                <div className="mb-4 rounded-lg border border-fs-border bg-fs-elevated/20 p-3">
                  <div className="mb-2 text-sm font-medium">样本内扫描（挑选依据）</div>
                  <ScanSurface axes={res.oos.axes} points={res.oos.isScan} bestIndex={res.oos.winnerIndex} />
                </div>
              ) : null}
              <HonestNote mode="oos" />
            </>
          ) : null}

          {/* ── walkforward ── */}
          {res.walkforward ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatTile label="拼接 CAGR" value={pct(res.walkforward.overallMetrics?.cagr)} t={tone(res.walkforward.overallMetrics?.cagr)} sub="全 OOS 段" />
                <StatTile label="拼接夏普" value={num(res.walkforward.overallMetrics?.sharpe, 2)} />
                <StatTile label="拼接最大回撤" value={pct(res.walkforward.overallMetrics?.maxDrawdown)} t="neg" />
                <StatTile label="测试折数" value={String(res.walkforward.folds.length)} sub={res.walkforward.fixedStrategy ? "固定策略" : "每折挑参"} />
              </div>
              {res.walkforward.stitchedNav.length ? (
                <div className="mb-4 rounded-lg border border-fs-border bg-fs-elevated/20 p-3">
                  <div className="mb-1 text-sm font-medium">样本外拼接净值（各段=一次测试窗口，交替底色标段界）</div>
                  <WalkforwardNavChart stitched={res.walkforward.stitchedNav} />
                </div>
              ) : null}
              <div className="mb-4 overflow-x-auto rounded-lg border border-fs-border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-fs-elevated text-xs text-fs-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">折</th>
                      <th className="px-3 py-2 text-left font-medium">训练段</th>
                      <th className="px-3 py-2 text-left font-medium">测试段</th>
                      <th className="px-3 py-2 text-left font-medium">选中参数</th>
                      <th className="px-3 py-2 text-right font-medium">测试夏普</th>
                      <th className="px-3 py-2 text-right font-medium">测试 CAGR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.walkforward.folds.map((f) => (
                      <tr key={f.index} className="border-t border-fs-border">
                        <td className="px-3 py-2 tabular-nums text-fs-muted">{f.index + 1}</td>
                        <td className="px-3 py-2 text-xs tabular-nums text-fs-muted">{f.trainStart} → {f.trainEnd}</td>
                        <td className="px-3 py-2 text-xs tabular-nums text-fs-text">{f.testStart} → {f.testEnd}</td>
                        <td className="px-3 py-2 text-xs text-fs-text">{f.winnerLabel ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-fs-text">{num(f.testMetrics?.sharpeAnnual, 2)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${tone(f.testMetrics?.cagr) === "neg" ? "text-red-400" : "text-fs-text"}`}>{pct(f.testMetrics?.cagr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <HonestNote mode="walkforward" fixed={res.walkforward.fixedStrategy} />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** 诚实边界文案：OOS/walk-forward 只在配合参数选择时才真正防选择性过拟合。 */
function HonestNote({ mode, fixed }: { mode: "scan" | "oos" | "walkforward"; fixed?: boolean }) {
  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-xs text-fs-muted">
      <div className="mb-1 font-medium text-amber-800">诚实边界</div>
      {mode === "scan" ? (
        <p>
          扫描面呈现「参数邻域是否普遍有效」。单点惊艳而邻域塌陷 = 过拟合信号。Deflated Sharpe 已按
          <span className="text-fs-text"> 实际试验点数 </span>校正最优点——但它只针对「从这批参数里挑最优」这一次选择；
          若你在别处已试过更多策略，真实试验数更大、校正应更严。
        </p>
      ) : mode === "oos" ? (
        <p>
          样本外只在<span className="text-fs-text">配合参数选择</span>时才真正防过拟合：这里用 IS 段挑参、OOS 段只跑一次，
          OOS 指标就是对「挑选」这一动作的诚实检验。若 IS 与 OOS 都是同一固定策略（不挑参），OOS 只测「时间稳定性」，不等于对过拟合免疫。
        </p>
      ) : (
        <p>
          {fixed
            ? "当前为固定策略的 walk-forward：每折都是同一策略在测试窗口跑一次，因此只检验「时间稳定性」——并不构成对过拟合的免疫。要真正防选择性过拟合，请加参数网格，让每折只用训练段挑参。"
            : "每折仅用训练段（严格早于测试段）挑参、测试段不回看——结构性无前视。拼接曲线全部由样本外段构成。"}
        </p>
      )}
    </div>
  );
}
