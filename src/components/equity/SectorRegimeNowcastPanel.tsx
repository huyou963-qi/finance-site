"use client";

import { useEffect, useState } from "react";
import { REGIME_DESC, REGIME_LABEL, type RegimeKey } from "@/components/equity/regimeVisuals";
import type {
  MacroRegimeNowcast,
  RegimeNowcastConfidence,
  RegimeNowcastIndicator,
} from "@/lib/quant/macroRegime";

const CONFIDENCE_LABEL: Record<RegimeNowcastConfidence, string> = {
  high: "较高",
  medium: "中等",
  low: "较低",
};

function regimeLabel(value: string | null | undefined): string {
  return value && value in REGIME_LABEL ? REGIME_LABEL[value as RegimeKey] : "尚未形成";
}

function regimeDescription(value: string | null | undefined): string {
  return value && value in REGIME_DESC ? REGIME_DESC[value as RegimeKey] : "方向证据不足";
}

function monthLabel(value: string | null | undefined): string {
  return value ? value.slice(0, 7) : "—";
}

function changeText(row: RegimeNowcastIndicator): string {
  if (row.change == null) return "—";
  if (row.changeKind === "percent") return `${row.change >= 0 ? "+" : ""}${(row.change * 100).toFixed(1)}%`;
  return `${row.change >= 0 ? "+" : ""}${row.change.toFixed(2)}`;
}

function scoreLabel(value: number, positive: string, negative: string): string {
  if (value >= 0.25) return positive;
  if (value <= -0.25) return negative;
  return "方向中性";
}

function indicatorTone(row: RegimeNowcastIndicator): string {
  if (!row.fresh) return "text-fs-muted";
  if (row.vote > 0) return "text-emerald-500";
  if (row.vote < 0) return "text-red-500";
  return "text-fs-muted";
}

function LoadingPanel() {
  return (
    <section className="rounded-xl border border-fs-border bg-fs-elevated/20 px-4 py-5 sm:px-5" aria-live="polite">
      <div className="animate-pulse space-y-3">
        <div className="h-5 w-56 rounded bg-fs-elevated" />
        <div className="grid gap-2 lg:grid-cols-2">
          <div className="h-28 rounded-lg bg-fs-elevated" />
          <div className="h-28 rounded-lg bg-fs-elevated" />
        </div>
      </div>
    </section>
  );
}

export function SectorRegimeNowcastPanel() {
  const [data, setData] = useState<MacroRegimeNowcast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    fetch("/api/equity/regime-nowcast", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as MacroRegimeNowcast | { error?: string } | null;
        if (!response.ok) {
          throw new Error(payload && "error" in payload ? payload.error || "实时环境监测加载失败" : "实时环境监测加载失败");
        }
        return payload as MacroRegimeNowcast;
      })
      .then(setData)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "实时环境监测加载失败");
      });
    return () => controller.abort();
  }, [retry]);

  if (!data && !error) return <LoadingPanel />;
  if (!data) {
    return (
      <section className="rounded-xl border border-fs-border bg-fs-elevated/20 px-4 py-5 text-center sm:px-5">
        <div className="text-sm font-medium text-fs-text">实时环境监测暂不可用</div>
        <div className="mt-1 text-xs text-fs-muted">{error}</div>
        <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-3 rounded-md border border-fs-border bg-fs-elevated px-3 py-1.5 text-xs text-fs-text">重新加载</button>
      </section>
    );
  }

  const live = data.live;
  const official = data.official;
  const visibleDates = live?.visibleMonth
    ? Object.values(live.visibleMonth).filter((value): value is string => Boolean(value)).sort()
    : [];
  const latestOfficialInput = visibleDates.at(-1) ?? null;

  return (
    <section className="overflow-hidden rounded-xl border border-fs-border bg-fs-elevated/20" aria-label="周度实时宏观环境监测">
      <header className="border-b border-fs-border px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold tracking-[0.16em] text-fs-accent-text">LIVE REGIME MONITOR</p>
              <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] text-amber-700">临时监测 · 不覆盖月度信号</span>
            </div>
            <h2 className="mt-1 text-base font-semibold text-fs-text">当前环境相对月度锚发生了什么变化？</h2>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-fs-muted">{live?.summary ?? "当前证据不足，暂不能形成实时判断。"}</p>
          </div>
          <div className="text-xs text-fs-muted">{data.cadenceLabel} · 计算 {data.asOfDate}</div>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
        <div className="border-b border-fs-border p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <div className="text-[10px] text-fs-muted">周度实时环境</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="text-2xl font-semibold text-fs-text">{regimeLabel(live?.regime)}</div>
            <div className="text-xs text-fs-muted">{regimeDescription(live?.regime)}</div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-fs-border bg-fs-bg/30 p-3">
              <div className="text-[10px] text-fs-muted">增长/风险确认</div>
              <div className="mt-1 text-sm font-medium text-fs-text">{scoreLabel(live?.growthScore ?? 0, "偏改善", "偏走弱")}</div>
            </div>
            <div className="rounded-lg border border-fs-border bg-fs-bg/30 p-3">
              <div className="text-[10px] text-fs-muted">通胀代理确认</div>
              <div className="mt-1 text-sm font-medium text-fs-text">{scoreLabel(live?.inflationScore ?? 0, "偏升温", "偏降温")}</div>
            </div>
            <div className="rounded-lg border border-fs-border bg-fs-bg/30 p-3">
              <div className="text-[10px] text-fs-muted">监测置信度</div>
              <div className="mt-1 text-sm font-medium text-fs-text">{live ? CONFIDENCE_LABEL[live.confidence] : "—"}</div>
              <div className="mt-0.5 text-[9px] text-fs-muted">有效覆盖 {live ? `${(live.coverage * 100).toFixed(0)}%` : "—"}</div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-[10px] text-fs-muted">正式月度锚</div>
          <div className="mt-1 text-lg font-semibold text-fs-text">{regimeLabel(official?.regime)}</div>
          <div className="mt-0.5 text-xs text-fs-muted">{regimeDescription(official?.regime)}</div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border border-fs-border bg-fs-bg/25 px-2 py-2"><div className="text-[9px] text-fs-muted">月度归属</div><div className="mt-1 text-xs font-medium text-fs-text">{monthLabel(official?.signalDate)}</div></div>
            <div className="rounded-md border border-fs-border bg-fs-bg/25 px-2 py-2"><div className="text-[9px] text-fs-muted">最新官方输入</div><div className="mt-1 text-xs font-medium text-fs-text">{monthLabel(latestOfficialInput)}</div></div>
            <div className="rounded-md border border-fs-border bg-fs-bg/25 px-2 py-2"><div className="text-[9px] text-fs-muted">高频数据截至</div><div className="mt-1 text-xs font-medium text-fs-text">{live?.dataThrough ?? "—"}</div></div>
          </div>
          {live?.changedFromOfficial ? <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[10px] leading-4 text-amber-800">实时层已偏离月度锚，等待后续官方数据确认；历史回测和正式排序仍使用月度快照。</div> : <div className="mt-3 text-[10px] leading-4 text-fs-muted">实时层与月度锚方向一致，尚未出现需要升级为正式状态的反转证据。</div>}
        </div>
      </div>

      {live ? (
        <details className="border-t border-fs-border bg-fs-bg/20">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-fs-text sm:px-5">查看高频确认指标、日期与限制</summary>
          <div className="overflow-x-auto border-t border-fs-border">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-fs-elevated/40 text-[10px] text-fs-muted"><tr><th className="px-3 py-2 font-medium">指标</th><th className="px-3 py-2 font-medium">归类</th><th className="px-3 py-2 font-medium">最新日期</th><th className="px-3 py-2 font-medium">4周变化</th><th className="px-3 py-2 font-medium">解释</th></tr></thead>
              <tbody>{live.indicators.map((row) => <tr key={row.code} className="border-t border-fs-border/60"><td className="px-3 py-2 text-fs-text">{row.labelZh}</td><td className="px-3 py-2 text-fs-muted">{row.axis === "growth" ? "增长/风险" : row.axis === "inflation" ? "通胀" : "利率"}</td><td className="px-3 py-2 tabular-nums text-fs-muted">{row.latestDate ?? "—"}</td><td className="px-3 py-2 tabular-nums text-fs-text">{changeText(row)}</td><td className={`px-3 py-2 ${indicatorTone(row)}`}>{row.directionLabel}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="border-t border-fs-border px-4 py-3 text-[10px] leading-4 text-fs-muted sm:px-5">{data.limitations.join(" ")}</div>
        </details>
      ) : null}
    </section>
  );
}
