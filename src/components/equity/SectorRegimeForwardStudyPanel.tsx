"use client";

import { useEffect, useState } from "react";
import { REGIME_LABEL } from "@/components/equity/regimeVisuals";
import type {
  SectorForwardHorizon,
  SectorForwardMetricSummary,
  SectorForwardVerdict,
  SectorRegimeForwardStudyResponse,
} from "@/lib/equity/sectorRegimeForwardStudy";

function pct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

function decimal(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function verdictClass(verdict: SectorForwardVerdict): string {
  if (verdict === "supported") return "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
  if (verdict === "weak") return "border-amber-400/40 bg-amber-400/10 text-amber-300";
  if (verdict === "unsupported") return "border-red-400/35 bg-red-400/10 text-red-300";
  return "border-fs-border bg-fs-elevated text-fs-muted";
}

function valueClass(value: number | null | undefined): string {
  if (value == null) return "text-fs-muted";
  return value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-fs-muted";
}

function icInterval(summary: SectorForwardMetricSummary): string {
  if (summary.meanIc == null) return "—";
  if (summary.icCiLow == null || summary.icCiHigh == null) return decimal(summary.meanIc);
  return `${decimal(summary.meanIc)} [${summary.icCiLow.toFixed(3)}, ${summary.icCiHigh.toFixed(3)}]`;
}

function LoadingPanel() {
  return (
    <section className="border-b border-fs-border bg-fs-bg px-4 py-5 sm:px-5" aria-live="polite">
      <div className="animate-pulse space-y-3">
        <div className="h-5 w-64 rounded bg-fs-elevated" />
        <div className="grid gap-2 md:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-20 rounded-lg bg-fs-elevated" />)}
        </div>
      </div>
    </section>
  );
}

export function SectorRegimeForwardStudyPanel({ variant = "research" }: { variant?: "overview" | "research" }) {
  const [data, setData] = useState<SectorRegimeForwardStudyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [currentHorizon, setCurrentHorizon] = useState<SectorForwardHorizon>(3);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    fetch("/api/equity/regime-forward-study", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as
          | SectorRegimeForwardStudyResponse
          | { error?: string }
          | null;
        if (!response.ok) {
          throw new Error(payload && "error" in payload ? payload.error || "前瞻研究加载失败" : "前瞻研究加载失败");
        }
        return payload as SectorRegimeForwardStudyResponse;
      })
      .then((payload) => setData(payload))
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "前瞻研究加载失败");
      });
    return () => controller.abort();
  }, [retry]);

  const activeCurrent = data?.current?.horizons.find(
    (item) => item.horizonMonths === currentHorizon,
  ) ?? null;

  if (!data && !error) return <LoadingPanel />;
  if (!data) {
    return (
      <section className="border-b border-fs-border bg-fs-bg px-4 py-5 text-center sm:px-5">
        <div className="text-sm font-medium text-fs-text">Regime 前瞻研究暂不可用</div>
        <div className="mt-1 text-xs text-fs-muted">{error}</div>
        <button
          type="button"
          onClick={() => setRetry((value) => value + 1)}
          className="mt-3 rounded-md border border-fs-border bg-fs-elevated px-3 py-1.5 text-xs text-fs-text"
        >
          重新加载
        </button>
      </section>
    );
  }

  const verdict = data.overallVerdict.verdict;

  if (variant === "overview") {
    const currentRegime = data.current
      ? REGIME_LABEL[data.current.regime]
      : "当前 Regime 暂不可用";
    return (
      <section className="rounded-xl border border-fs-border bg-fs-elevated/20" aria-label="当前宏观环境与行业研究">
        <header className="border-b border-fs-border px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.16em] text-fs-accent-text">CURRENT REGIME</p>
              <h2 className="mt-1 text-base font-semibold text-fs-text">当前宏观环境如何映射到行业？</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-fs-muted">{data.current ? `${data.current.signalDate} · ${currentRegime}。` : ""}{data.overallVerdict.summary}</p>
            </div>
            <div className="shrink-0 rounded-md border border-fs-border bg-fs-bg/30 px-3 py-2 text-right"><div className="text-[10px] text-fs-muted">历史检验证据</div><div className={`mt-0.5 text-xs font-medium ${verdictClass(verdict)}`}>{data.overallVerdict.label}</div></div>
          </div>
        </header>
        {data.current && activeCurrent ? (
          <div className="space-y-3 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-medium text-fs-text">研究观察排序</h3><p className="mt-0.5 text-[10px] text-fs-muted">分数用于检验宏观与基本面假设，不代表预期收益或投资建议。</p></div><div className="flex items-center gap-1" aria-label="当前排序前瞻期">{data.current.horizons.map((item) => <button key={item.horizonMonths} type="button" onClick={() => setCurrentHorizon(item.horizonMonths)} className={`rounded px-2 py-1 text-[10px] ${currentHorizon === item.horizonMonths ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/30" : "text-fs-muted hover:text-fs-text"}`} aria-pressed={currentHorizon === item.horizonMonths}>{item.horizonMonths}M</button>)}</div></div>
            <div className="grid gap-2 sm:grid-cols-3">{activeCurrent.rankings.slice(0, 3).map((row) => <div key={row.sector} className="rounded-lg border border-fs-border bg-fs-bg/25 p-3"><div className="text-[10px] text-fs-muted">观察 #{row.rank}</div><div className="mt-1 text-sm font-semibold text-fs-text">{row.nameZh} <span className="text-xs font-normal text-fs-muted">{row.etf}</span></div><div className={`mt-1 text-sm tabular-nums ${valueClass(row.score)}`}>研究分数 {decimal(row.score, 2)}</div></div>)}</div>
            <details className="rounded-lg border border-fs-border bg-fs-bg/20"><summary className="cursor-pointer px-3 py-2 text-xs font-medium text-fs-text">展开全部行业排序与研究限制</summary><div className="border-t border-fs-border px-3 py-3 text-xs text-fs-muted"><div className="flex flex-wrap gap-x-3 gap-y-1">{activeCurrent.rankings.map((row) => <span key={row.sector}>#{row.rank} {row.etf}</span>)}</div><p className="mt-2 leading-5">{activeCurrent.selectionPassed ? "该期限使用验证锁定模型。" : "该期限没有通过验证的模型，排序仅供失败复核。"} 详细检验与方法见“证据与方法”。</p></div></details>
          </div>
        ) : <div className="px-4 py-6 text-sm text-fs-muted sm:px-5">当前 Regime 尚未形成可展示的行业排序。</div>}
      </section>
    );
  }

  return (
    <section id="sector-regime-forward-study" className="border-b border-fs-border bg-fs-bg" aria-label="Regime 样本外前瞻研究">
      <header className="border-b border-fs-border bg-fs-elevated/30 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold tracking-[0.16em] text-fs-accent-text">REGIME FORWARD STUDY · STAGE F</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${verdictClass(verdict)}`}>
                {data.overallVerdict.label}
              </span>
              <span className="rounded-full border border-fs-border bg-fs-elevated/60 px-2 py-0.5 text-[10px] text-fs-muted">
                证据 {data.methodology.evidenceGrade} · {data.methodology.evidenceLabel}
              </span>
            </div>
            <h2 className="mt-1 text-base font-semibold text-fs-text">Regime 能否指示未来行业强弱？</h2>
            <p className="mt-1 max-w-5xl text-xs leading-5 text-fs-muted">{data.overallVerdict.summary}</p>
          </div>
          <dl className="grid shrink-0 grid-cols-3 gap-x-5 text-right text-[10px] text-fs-muted">
            <div><dt>完整样本</dt><dd className="mt-0.5 text-xs tabular-nums text-fs-text">{data.sample.start.slice(0, 7)}–{data.sample.end.slice(0, 7)}</dd></div>
            <div><dt>锁定测试</dt><dd className="mt-0.5 text-xs text-fs-text">2020+</dd></div>
            <div><dt>Regime 月数</dt><dd className="mt-0.5 text-xs tabular-nums text-fs-text">{data.sample.validRegimeMonths}</dd></div>
          </dl>
        </div>
      </header>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium text-fs-text">2020+ 锁定测试集</h3>
              <p className="mt-0.5 text-[11px] text-fs-muted">模型只由 2015–2019 验证集选择；IC 区间用 Newey–West 修正重叠收益。</p>
            </div>
            <span className="text-[10px] text-fs-muted">目标：行业 ETF 总收益 − SPY 总收益</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-fs-border">
            <table className="min-w-[900px] w-full text-left text-xs">
              <thead className="bg-fs-elevated/55 text-[10px] text-fs-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">前瞻期</th>
                  <th className="px-3 py-2 font-medium">验证集锁定模型</th>
                  <th className="px-3 py-2 font-medium">测试 IC [95%]</th>
                  <th className="px-3 py-2 font-medium">Top 3 胜率</th>
                  <th className="px-3 py-2 font-medium">Top 3 超额</th>
                  <th className="px-3 py-2 font-medium">Top−Bottom</th>
                  <th className="px-3 py-2 font-medium">结论</th>
                </tr>
              </thead>
              <tbody>
                {data.selectedByHorizon.map((row) => (
                  <tr key={row.horizonMonths} className="border-t border-fs-border/70">
                    <td className="px-3 py-2 font-medium text-fs-text">T+{row.horizonMonths} 月</td>
                    <td className="px-3 py-2 text-fs-text">
                      {row.modelLabel}
                      <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[9px] ${row.selectionPassed ? "bg-fs-accent-soft text-fs-accent-text" : "bg-amber-400/10 text-amber-300"}`} title={row.selectionNote}>
                        {row.selectionPassed ? "验证锁定" : "无模型通过"}
                      </span>
                    </td>
                    <td className={`px-3 py-2 tabular-nums ${valueClass(row.test.meanIc)}`}>{icInterval(row.test)}</td>
                    <td className="px-3 py-2 tabular-nums text-fs-text">{pct(row.test.hitRate)}</td>
                    <td className={`px-3 py-2 tabular-nums ${valueClass(row.test.meanTop3Outcome)}`}>{pct(row.test.meanTop3Outcome)}</td>
                    <td className={`px-3 py-2 tabular-nums ${valueClass(row.test.meanTopBottomSpread)}`}>{pct(row.test.meanTopBottomSpread)}</td>
                    <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] ${verdictClass(row.verdict)}`}>{row.verdictLabel}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
          <div>
            <h3 className="mb-2 text-sm font-medium text-fs-text">四组模型对照 · 测试集平均 IC</h3>
            <div className="overflow-x-auto rounded-lg border border-fs-border">
              <table className="min-w-[620px] w-full text-xs">
                <thead className="bg-fs-elevated/55 text-[10px] text-fs-muted">
                  <tr><th className="px-3 py-2 text-left font-medium">模型</th>{[3, 6, 12].map((h) => <th key={h} className="px-3 py-2 text-right font-medium">T+{h}月</th>)}<th className="px-3 py-2 text-right font-medium">2020+ 年化超额</th><th className="px-3 py-2 text-right font-medium">最大回撤</th><th className="px-3 py-2 text-right font-medium">月换手</th></tr>
                </thead>
                <tbody>
                  {data.models.map((model) => (
                    <tr key={model.id} className="border-t border-fs-border/70">
                      <td className="px-3 py-2 text-left text-fs-text"><span className="font-medium">{model.label}</span><span className="ml-1 text-[9px] text-fs-muted">{model.id === "unconditional" ? "基准" : "扩展窗口"}</span></td>
                      {model.horizons.map((horizon) => <td key={horizon.horizonMonths} className={`px-3 py-2 text-right tabular-nums ${valueClass(horizon.test.meanIc)}`}>{decimal(horizon.test.meanIc)}</td>)}
                      <td className={`px-3 py-2 text-right tabular-nums ${valueClass(model.testPortfolio.annualizedExcess)}`}>{pct(model.testPortfolio.annualizedExcess)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-fs-text">{pct(model.testPortfolio.maxDrawdown)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-fs-text">{pct(model.testPortfolio.averageMonthlyTurnover)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-fs-text">Regime → 未来基本面</h3>
            <div className="divide-y divide-fs-border overflow-hidden rounded-lg border border-fs-border">
              {data.fundamentalOutlook.map((row) => (
                <div key={row.horizonMonths} className="grid grid-cols-[4rem_1fr_auto] items-center gap-3 px-3 py-2.5 text-xs">
                  <div className="font-medium text-fs-text">{row.quarterLabel}</div>
                  <div>
                    <div className={`tabular-nums ${valueClass(row.regimeOnly.test.meanIc)}`}>IC {icInterval(row.regimeOnly.test)}</div>
                    <div className="mt-0.5 text-[9px] text-fs-muted">复合分数相对变化 · {row.regimeOnly.test.periods} 期</div>
                  </div>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${verdictClass(row.verdict)}`}>{row.verdictLabel}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {data.current ? (
          <div className="rounded-lg border border-fs-border bg-fs-elevated/20">
            <div className="flex flex-col gap-2 border-b border-fs-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-fs-text">当前模型会怎样排序</h3>
                  <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">{data.current.statusLabel}</span>
                </div>
                <p className="mt-0.5 text-[10px] text-fs-muted">{data.current.signalDate} · {REGIME_LABEL[data.current.regime]}。总体验证未通过，排序仅用于观察模型假设。</p>
              </div>
              <div className="flex items-center gap-1" aria-label="当前排序前瞻期">
                {data.current.horizons.map((item) => (
                  <button
                    key={item.horizonMonths}
                    type="button"
                    onClick={() => setCurrentHorizon(item.horizonMonths)}
                    className={`rounded px-2 py-1 text-[10px] ${currentHorizon === item.horizonMonths ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/30" : "text-fs-muted hover:text-fs-text"}`}
                    aria-pressed={currentHorizon === item.horizonMonths}
                  >
                    {item.horizonMonths}M
                  </button>
                ))}
              </div>
            </div>
            {activeCurrent ? (
              <div className="overflow-x-auto" data-testid="stage-f-current-rankings-scroll">
                <div className="grid min-w-[780px] grid-cols-11 divide-x divide-fs-border/60">
                  {activeCurrent.rankings.map((row) => (
                    <div key={row.sector} className="px-2 py-2.5 text-center">
                      <div className="text-[9px] tabular-nums text-fs-muted">#{row.rank}</div>
                      <div className="mt-0.5 truncate text-[11px] font-medium text-fs-text" title={row.nameZh}>{row.nameZh}</div>
                      <div className="text-[9px] text-fs-muted">{row.etf}</div>
                      <div className={`mt-1 text-[10px] tabular-nums ${valueClass(row.score)}`}>{decimal(row.score, 2)}</div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-fs-border px-3 py-1.5 text-[9px] text-fs-muted">{activeCurrent.selectionPassed ? "验证锁定模型" : "失败复核模型"}：{activeCurrent.modelLabel} · 分数是截面排序量纲，不是预期收益率。</div>
              </div>
            ) : null}
          </div>
        ) : null}

        <details className="rounded-lg border border-fs-border bg-fs-elevated/15">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-fs-text">方法、无前视约束与已知风险</summary>
          <div className="grid gap-4 border-t border-fs-border px-3 py-3 text-[10px] leading-5 text-fs-muted lg:grid-cols-2">
            <dl className="space-y-1">
              <div><dt className="inline text-fs-text">信号：</dt><dd className="inline">{data.methodology.signalTiming}</dd></div>
              <div><dt className="inline text-fs-text">训练：</dt><dd className="inline">{data.methodology.trainingRule}</dd></div>
              <div><dt className="inline text-fs-text">选择：</dt><dd className="inline">{data.methodology.modelSelectionRule}</dd></div>
              <div><dt className="inline text-fs-text">统计：</dt><dd className="inline">{data.methodology.confidenceIntervalRule}</dd></div>
            </dl>
            <ul className="list-disc space-y-1 pl-4">
              {data.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        </details>
      </div>
    </section>
  );
}
