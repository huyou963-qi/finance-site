"use client";

import { useEffect, useMemo, useState } from "react";
import { REGIME_LABEL } from "@/components/equity/regimeVisuals";
import type {
  LiveLedgerHorizonSummary,
  SectorRegimeLiveLedgerResponse,
} from "@/lib/equity/sectorRegimeLiveLedger";

function pct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

function decimal(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function valueClass(value: number | null | undefined): string {
  if (value == null) return "text-fs-muted";
  return value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-fs-muted";
}

function horizonStatus(row: LiveLedgerHorizonSummary): string {
  if (row.status === "scored") return "已结算";
  if (row.status === "partial") return `结算中 ${row.evaluated}/${row.total}`;
  return "等待到期";
}

function Loading() {
  return (
    <section className="border-b border-fs-border bg-fs-bg px-4 py-5 sm:px-5" aria-live="polite">
      <div className="animate-pulse space-y-3">
        <div className="h-5 w-72 rounded bg-fs-elevated" />
        <div className="grid gap-2 md:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-32 rounded-lg bg-fs-elevated" />)}
        </div>
      </div>
    </section>
  );
}

export function SectorRegimeLiveLedgerPanel() {
  const [data, setData] = useState<SectorRegimeLiveLedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    fetch("/api/equity/regime-live-ledger", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as SectorRegimeLiveLedgerResponse | { error?: string } | null;
        if (!response.ok) {
          throw new Error(payload && "error" in payload ? payload.error || "真实前瞻账本加载失败" : "真实前瞻账本加载失败");
        }
        return payload as SectorRegimeLiveLedgerResponse;
      })
      .then(setData)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "真实前瞻账本加载失败");
      });
    return () => controller.abort();
  }, [retry]);

  const progress = useMemo(() => {
    if (!data) return 0;
    return Math.min(100, data.status.frozenSignals / data.status.requiredForUpgrade * 100);
  }, [data]);

  if (!data && !error) return <Loading />;
  if (!data) {
    return (
      <section className="border-b border-fs-border bg-fs-bg px-4 py-5 text-center sm:px-5">
        <div className="text-sm font-medium text-fs-text">真实前瞻账本暂不可用</div>
        <div className="mt-1 text-xs text-fs-muted">{error}</div>
        <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-3 rounded-md border border-fs-border bg-fs-elevated px-3 py-1.5 text-xs text-fs-text">重新加载</button>
      </section>
    );
  }

  const latest = data.snapshots[0] ?? null;
  const regimeLabel = latest
    ? REGIME_LABEL[latest.regime as keyof typeof REGIME_LABEL] ?? latest.regime
    : "—";

  return (
    <section id="sector-regime-live-ledger" className="border-b border-fs-border bg-fs-bg" aria-label="Regime 真实前瞻走查账本" data-testid="stage-g-live-ledger">
      <header className="border-b border-fs-border bg-[linear-gradient(105deg,rgba(16,185,129,0.08),transparent_58%)] px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold tracking-[0.16em] text-emerald-700">LIVE WALK-FORWARD · STAGE G</span>
              <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{data.status.label}</span>
              <span className="rounded-full border border-fs-border bg-fs-elevated/70 px-2 py-0.5 text-[10px] text-fs-muted">协议 {data.protocolVersion}</span>
            </div>
            <h2 className="mt-1 text-base font-semibold text-fs-text">真实前瞻走查：预测先封存，未来再揭晓</h2>
            <p className="mt-1 max-w-5xl text-xs leading-5 text-fs-muted">阶段 F 回答“历史上有没有稳定证据”；这里从现在起逐月留下不可回写的判断，按 3/6/12 个月分别到期，检验模型在未知未来中的真实表现。</p>
          </div>
          <div className="grid shrink-0 grid-cols-3 gap-2 text-center text-[10px]">
            <div className="rounded-md border border-emerald-400/25 bg-emerald-400/5 px-3 py-2"><div className="text-fs-muted">过程完整性</div><div className="mt-0.5 text-sm font-semibold text-emerald-700">{data.status.processGrade}</div></div>
            <div className="rounded-md border border-amber-400/25 bg-amber-400/5 px-3 py-2"><div className="text-fs-muted">统计证据</div><div className="mt-0.5 text-sm font-semibold text-amber-800">{data.status.inferenceGrade}</div></div>
            <div className="rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2"><div className="text-fs-muted">已冻结月</div><div className="mt-0.5 text-sm font-semibold tabular-nums text-fs-text">{data.status.frozenSignals}</div></div>
          </div>
        </div>
      </header>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
          <div className="rounded-lg border border-fs-border bg-fs-elevated/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium text-fs-text">证据升级进度</h3>
                <p className="mt-0.5 text-[10px] text-fs-muted">冻结规则已达 B；预测力仍保持 C，必须等真实月份自然成熟，不能用历史回填冒充。</p>
              </div>
              <span className="text-xs tabular-nums text-fs-text">{data.status.frozenSignals} / {data.status.requiredForUpgrade} 月</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-fs-elevated">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,#10b981,#38bdf8)] transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 grid grid-cols-3 text-[9px] text-fs-muted">
              <span>0 · 建账</span><span className="text-center">18 · 中期检查</span><span className="text-right">36 · 正式复评</span>
            </div>
          </div>
          <div className="rounded-lg border border-fs-border bg-fs-elevated/20 p-3">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium text-fs-text">宏观版本覆盖</h3><span className="text-[10px] text-fs-muted">{data.vintageCoverage.vintageRows.toLocaleString()} 个版本</span></div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded border border-fs-border/70 px-2 py-2"><div className="text-[9px] text-fs-muted">已留痕输入</div><div className="mt-0.5 text-sm tabular-nums text-fs-text">{data.vintageCoverage.capturedInputs}/{data.vintageCoverage.trackedInputs}</div></div>
              <div className="rounded border border-fs-border/70 px-2 py-2"><div className="text-[9px] text-fs-muted">ALFRED 官方 vintage</div><div className="mt-0.5 text-sm tabular-nums text-fs-text">{data.vintageCoverage.alfredInputs}/{data.vintageCoverage.trackedInputs}</div></div>
            </div>
            <p className="mt-2 text-[9px] leading-4 text-fs-muted">{data.vintageCoverage.officialNote}</p>
          </div>
        </div>

        {latest ? (
          <div className="overflow-hidden rounded-lg border border-fs-border">
            <div className="flex flex-col gap-3 border-b border-fs-border bg-fs-elevated/25 px-3 py-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium text-fs-text">最新封存信号</h3><span className="rounded bg-fs-accent-soft px-1.5 py-0.5 text-[9px] text-fs-accent-text">{regimeLabel}</span><span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-800">推断证据 {latest.evidenceGrade}</span></div>
                <p className="mt-0.5 text-[10px] text-fs-muted">模型 {latest.modelVersion} · 哈希 {latest.signalHash.slice(0, 12)}…</p>
              </div>
              <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 text-center text-[9px] text-fs-muted xl:w-auto xl:min-w-[30rem] xl:gap-2">
                <div><div>数据归属月</div><div className="mt-0.5 text-xs tabular-nums text-fs-text">{latest.signalDate}</div></div><span>→</span>
                <div><div>不可变冻结</div><div className="mt-0.5 text-xs tabular-nums text-emerald-700">{latest.frozenAt.slice(0, 10)}</div></div><span>→</span>
                <div><div>开始计分</div><div className="mt-0.5 text-xs tabular-nums text-fs-text">{latest.returnStartDate}</div></div>
              </div>
            </div>
            <div className="grid divide-y divide-fs-border xl:grid-cols-3 xl:divide-x xl:divide-y-0">
              {latest.horizons.map((row) => (
                <div key={row.horizonMonths} className="min-w-0 p-3" data-testid={`stage-g-horizon-${row.horizonMonths}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div><div className="text-sm font-semibold text-fs-text">T+{row.horizonMonths} 月</div><div className="mt-0.5 text-[9px] text-fs-muted">目标 {row.targetDate} · {row.modelId}</div></div>
                    <div className="text-right"><span className={`rounded-full border px-2 py-0.5 text-[9px] ${row.status === "scored" ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-700" : "border-fs-border bg-fs-elevated text-fs-muted"}`}>{horizonStatus(row)}</span><div className={`mt-1 text-[9px] ${row.selectionPassed ? "text-fs-accent-text" : "text-amber-800"}`}>{row.selectionPassed ? "主要证据" : "失败复核，不升级证据"}</div></div>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-1 text-center">
                    <div className="rounded bg-fs-elevated/50 py-1.5"><div className="text-[8px] text-fs-muted">IC</div><div className={`mt-0.5 text-[10px] tabular-nums ${valueClass(row.meanIc)}`}>{decimal(row.meanIc)}</div></div>
                    <div className="rounded bg-fs-elevated/50 py-1.5"><div className="text-[8px] text-fs-muted">Top3胜率</div><div className="mt-0.5 text-[10px] tabular-nums text-fs-text">{pct(row.top3HitRate)}</div></div>
                    <div className="rounded bg-fs-elevated/50 py-1.5"><div className="text-[8px] text-fs-muted">Top3超额</div><div className={`mt-0.5 text-[10px] tabular-nums ${valueClass(row.meanTop3Excess)}`}>{pct(row.meanTop3Excess)}</div></div>
                    <div className="rounded bg-fs-elevated/50 py-1.5"><div className="text-[8px] text-fs-muted">首尾差</div><div className={`mt-0.5 text-[10px] tabular-nums ${valueClass(row.topBottomSpread)}`}>{pct(row.topBottomSpread)}</div></div>
                  </div>
                  <div className="mt-3 flex items-center gap-1 overflow-hidden">
                    {row.rankings.slice(0, 3).map((ranking) => <div key={ranking.sector} className="min-w-0 flex-1 rounded border border-fs-border/70 px-1.5 py-1.5 text-center"><div className="truncate text-[9px] font-medium text-fs-text">#{ranking.rank} {ranking.etf}</div><div className={`mt-0.5 text-[8px] tabular-nums ${valueClass(ranking.excessReturn)}`}>{ranking.excessReturn == null ? "待揭晓" : pct(ranking.excessReturn)}</div></div>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-fs-border px-4 py-8 text-center"><div className="text-sm text-fs-text">尚未生成首个封存信号</div><p className="mt-1 text-[10px] text-fs-muted">运行月度冻结任务后，本区会显示归属月、冻结日、开始计分日与三个到期期限。</p></div>
        )}

        <details className="rounded-lg border border-fs-border bg-fs-elevated/15">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-fs-text">不可回写协议与自动化规则</summary>
          <div className="grid gap-3 border-t border-fs-border px-3 py-3 text-[10px] leading-5 text-fs-muted md:grid-cols-2">
            <div><span className="text-fs-text">预测锁：</span>{data.protocol.predictionLock}</div><div><span className="text-fs-text">结果锁：</span>{data.protocol.outcomeLock}</div><div><span className="text-fs-text">评分：</span>{data.protocol.scoring}</div><div><span className="text-fs-text">运行：</span>{data.protocol.automation}</div>
          </div>
        </details>
      </div>
    </section>
  );
}
