"use client";

import { useEffect, useState, type ReactNode } from "react";
import { REGIME_DESC, REGIME_LABEL, type RegimeKey } from "@/components/equity/regimeVisuals";
import type {
  MacroRegimeNowcast,
  OfficialRegimeIndicator,
  RegimeNowcastConfirmation,
  RegimeNowcastConfidence,
  RegimeNowcastIndicator,
} from "@/lib/quant/macroRegime";
import {
  REGIME_NOWCAST_DIRECTION_THRESHOLD,
  REGIME_NOWCAST_MIN_AXIS_COVERAGE,
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

const MARKET_BACKGROUND_DESC: Record<RegimeKey, string> = {
  reflation: "风险偏好改善 · 通胀定价升温",
  goldilocks: "风险偏好改善 · 通胀定价降温",
  stagflation: "风险偏好走弱 · 通胀定价升温",
  deflation: "风险偏好走弱 · 通胀定价降温",
};

function marketBackgroundDescription(value: string | null | undefined): string {
  return value && value in MARKET_BACKGROUND_DESC ? MARKET_BACKGROUND_DESC[value as RegimeKey] : "市场定价仍在过渡";
}

function marketFundamentalSummary(data: MacroRegimeNowcast): { conclusion: string; comment: string } {
  const weekly = regimeLabel(data.live?.regime);
  const monthly = regimeLabel(data.official?.regime);
  const conclusion = `周度市场交易：${weekly}；月度宏观基本面：${monthly}。`;
  if (!data.live) {
    return {
      conclusion,
      comment: "缺少周度市场数据，暂不能形成市场交易四象限。",
    };
  }
  if (!data.live.regime) {
    const unresolved: string[] = [];
    const threshold = REGIME_NOWCAST_DIRECTION_THRESHOLD.toFixed(2);
    const axisReason = (label: string, score: number, coverage: number) =>
      coverage < REGIME_NOWCAST_MIN_AXIS_COVERAGE
        ? `${label}有效覆盖率 ${(coverage * 100).toFixed(0)}%，低于 ${(REGIME_NOWCAST_MIN_AXIS_COVERAGE * 100).toFixed(0)}% 要求`
        : `${label}得分 ${score >= 0 ? "+" : ""}${score.toFixed(2)}，仍在 -${threshold}～+${threshold} 中性区间`;
    if (!data.live.riskDirection) {
      unresolved.push(axisReason("风险定价", data.live.riskScore, data.live.riskCoverage));
    }
    if (!data.live.inflationState) {
      unresolved.push(axisReason("通胀定价", data.live.inflationScore, data.live.inflationCoverage));
    }
    return {
      conclusion,
      comment: `周度四象限暂未形成：${unresolved.join("；")}。模型要求风险与通胀两条轴均形成方向，不用月度结论填补周度中性信号。`,
    };
  }
  if (!data.official?.regime || data.live.relationToOfficial === "inconclusive") {
    return {
      conclusion,
      comment: "周度市场交易背景已形成，但月度正式锚暂无可比方向，暂不判断两者是否一致。",
    };
  }
  if (data.live.relationToOfficial === "aligned") {
    return {
      conclusion,
      comment: "两者一致，市场定价与已公布基本面相互确认；仍需结合行业趋势与风险控制。",
    };
  }
  return {
    conclusion,
    comment: "两者冲突，可能是市场提前交易基本面变化，也可能是短期误判；应降低判断置信度，等待周度经济、金融条件或后续月度数据确认。",
  };
}

function monthLabel(value: string | null | undefined): string {
  return value ? value.slice(0, 7) : "—";
}

function changeText(row: RegimeNowcastIndicator): string {
  if (row.change == null) return "—";
  if (row.changeKind === "percent") return `${row.change >= 0 ? "+" : ""}${(row.change * 100).toFixed(1)}%`;
  return `${row.change >= 0 ? "+" : ""}${row.change.toFixed(2)}`;
}

function latestValueText(row: RegimeNowcastIndicator): string {
  if (row.latestValue == null || !Number.isFinite(row.latestValue)) return "—";
  if (row.unit === "currency") return `$${row.latestValue.toFixed(2)}`;
  if (row.unit === "percent") return `${row.latestValue.toFixed(2)}%`;
  if (row.unit === "people") return Math.round(row.latestValue).toLocaleString("zh-CN");
  return row.latestValue.toFixed(row.unit === "ratio" ? 3 : 2);
}

function scoreLabel(value: number, positive: string, negative: string): string {
  if (value >= REGIME_NOWCAST_DIRECTION_THRESHOLD) return positive;
  if (value <= -REGIME_NOWCAST_DIRECTION_THRESHOLD) return negative;
  return "方向中性";
}

function axisLabel(row: RegimeNowcastIndicator): string {
  const axis = row.axis === "risk"
    ? "风险定价"
    : row.axis === "inflation"
      ? "通胀定价"
      : row.axis === "policy"
        ? "政策/贴现率"
        : row.axis === "financial"
          ? "金融条件确认"
          : "经济确认";
  return row.role === "diagnostic" ? `${axis}·诊断` : axis;
}

const INDICATOR_AXIS_ORDER: Record<RegimeNowcastIndicator["axis"], number> = {
  risk: 0,
  inflation: 1,
  policy: 2,
  financial: 3,
  activity: 4,
};

function sortIndicatorsByCategory(rows: readonly RegimeNowcastIndicator[]): RegimeNowcastIndicator[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) =>
      INDICATOR_AXIS_ORDER[left.row.axis] - INDICATOR_AXIS_ORDER[right.row.axis]
      || Number(left.row.role === "diagnostic") - Number(right.row.role === "diagnostic")
      || left.index - right.index)
    .map(({ row }) => row);
}

function confirmationLabel(value: RegimeNowcastConfirmation): string {
  if (value === "confirmed") return "慢频同向确认";
  if (value === "divergent") return "慢频尚未确认";
  if (value === "mixed") return "慢频信号混合";
  return "慢频数据不足";
}

function indicatorTone(row: RegimeNowcastIndicator): string {
  if (!row.fresh) return "text-fs-muted";
  if (row.vote > 0) return "text-emerald-500";
  if (row.vote < 0) return "text-red-500";
  return "text-fs-muted";
}

function officialValueText(row: OfficialRegimeIndicator): string {
  if (row.latestValue == null || !Number.isFinite(row.latestValue)) return "—";
  return row.valueKind === "percent"
    ? `${row.latestValue >= 0 ? "+" : ""}${(row.latestValue * 100).toFixed(1)}%`
    : row.latestValue.toFixed(1);
}

function officialModelInputText(row: OfficialRegimeIndicator): string {
  const z = row.modelZ == null || !Number.isFinite(row.modelZ)
    ? "z —"
    : `z ${row.modelZ >= 0 ? "+" : ""}${row.modelZ.toFixed(2)}`;
  if (row.momentum == null || !Number.isFinite(row.momentum)) return z;
  return `3月 ${row.momentum >= 0 ? "+" : ""}${(row.momentum * 100).toFixed(2)}pp · ${z}`;
}

function officialIndicatorTone(row: OfficialRegimeIndicator): string {
  if (row.direction > 0) return "text-emerald-500";
  if (row.direction < 0) return "text-red-500";
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

export function SectorRegimeNowcastPanel({ officialDetails }: { officialDetails?: ReactNode }) {
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
  const sortedIndicators = live ? sortIndicatorsByCategory(live.indicators) : [];
  const visibleDates = live?.visibleMonth
    ? Object.values(live.visibleMonth).filter((value): value is string => Boolean(value)).sort()
    : [];
  const latestOfficialInput = visibleDates.at(-1) ?? null;
  const summary = marketFundamentalSummary(data);

  return (
    <section className="overflow-hidden rounded-xl border border-fs-border bg-fs-elevated/20" aria-label="周度实时宏观环境监测">
      <header className="border-b border-fs-border px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-fs-text">市场交易与宏观基本面</h2>
            <p className="mt-2 max-w-5xl rounded-md border border-amber-400/60 bg-amber-50/70 px-3 py-2 text-sm font-semibold leading-6 text-amber-950">
              <span className="block">{summary.conclusion}</span>
              <span className="mt-1 block">{summary.comment}</span>
            </p>
          </div>
          <div className="text-xs text-fs-muted">{data.cadenceLabel} · 计算 {data.asOfDate}</div>
        </div>
      </header>

      <div className="grid lg:grid-cols-2">
        <div className="border-b border-fs-border p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <div className="text-sm font-semibold text-fs-text">周度市场交易背景</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="text-2xl font-semibold text-fs-text">{regimeLabel(live?.regime)}</div>
            <div className="text-xs text-fs-muted">{marketBackgroundDescription(live?.regime)}</div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-fs-border bg-fs-bg/30 p-3">
              <div className="text-[10px] text-fs-muted">风险偏好定价</div>
              <div className="mt-1 text-sm font-medium text-fs-text">{scoreLabel(live?.riskScore ?? 0, "偏改善", "偏走弱")}</div>
            </div>
            <div className="rounded-lg border border-fs-border bg-fs-bg/30 p-3">
              <div className="text-[10px] text-fs-muted">通胀定价</div>
              <div className="mt-1 text-sm font-medium text-fs-text">{scoreLabel(live?.inflationScore ?? 0, "偏升温", "偏降温")}</div>
            </div>
            <div className="rounded-lg border border-fs-border bg-fs-bg/30 p-3">
              <div className="text-[10px] text-fs-muted">政策/实际贴现率</div>
              <div className="mt-1 text-sm font-medium text-fs-text">{scoreLabel(live?.policyScore ?? 0, "偏紧", "偏松")}</div>
              <div className="mt-0.5 text-[9px] text-fs-muted">2Y 利率与 10Y 实际利率</div>
            </div>
            <div className="rounded-lg border border-fs-border bg-fs-bg/30 p-3">
              <div className="text-[10px] text-fs-muted">监测置信度</div>
              <div className="mt-1 text-sm font-medium text-fs-text">{live ? CONFIDENCE_LABEL[live.confidence] : "—"}</div>
              <div className="mt-0.5 text-[9px] text-fs-muted">有效覆盖 {live ? `${(live.coverage * 100).toFixed(0)}%` : "—"} · {live ? confirmationLabel(live.confirmation) : "—"}</div>
            </div>
          </div>

          {live ? (
            <div className="-mx-4 mt-4 border-t border-fs-border bg-fs-bg/20 sm:-mx-5">
              <div className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5">
                <div className="shrink-0 text-xs font-medium text-fs-text">高频指标</div>
                <div className="text-[10px] leading-4 text-fs-muted sm:text-right">基于1周/4周变化识别市场定价；经济与金融条件只作确认，缺失或过期指标不参与判断。</div>
              </div>
              <div className="overflow-x-auto border-t border-fs-border">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-fs-elevated/40 text-[10px] text-fs-muted"><tr><th className="px-3 py-2 font-medium">指标</th><th className="px-3 py-2 font-medium">归类</th><th className="px-3 py-2 font-medium">最新日期</th><th className="px-3 py-2 font-medium">最新值</th><th className="px-3 py-2 font-medium">4周变化</th><th className="px-3 py-2 font-medium">解释</th></tr></thead>
                  <tbody>{sortedIndicators.map((row) => <tr key={row.code} className="border-t border-fs-border/60"><td className="px-3 py-2 text-fs-text">{row.labelZh}</td><td className="px-3 py-2 text-fs-muted">{axisLabel(row)}</td><td className="px-3 py-2 tabular-nums text-fs-muted">{row.latestDate ?? "—"}</td><td className="px-3 py-2 tabular-nums text-fs-text">{latestValueText(row)}</td><td className="px-3 py-2 tabular-nums text-fs-text">{changeText(row)}</td><td className={`px-3 py-2 ${indicatorTone(row)}`}>{row.directionLabel}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : null}

        </div>

        <div className="p-4 sm:p-5">
          <div className="text-sm font-semibold text-fs-text">正式月度锚</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="text-lg font-semibold text-fs-text">{regimeLabel(official?.regime)}</div>
            <div className="text-xs text-fs-muted">{regimeDescription(official?.regime)}</div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border border-fs-border bg-fs-bg/25 px-2 py-2"><div className="text-[9px] text-fs-muted">月度归属</div><div className="mt-1 text-xs font-medium text-fs-text">{monthLabel(official?.signalDate)}</div></div>
            <div className="rounded-md border border-fs-border bg-fs-bg/25 px-2 py-2"><div className="text-[9px] text-fs-muted">最新官方输入</div><div className="mt-1 text-xs font-medium text-fs-text">{monthLabel(latestOfficialInput)}</div></div>
            <div className="rounded-md border border-fs-border bg-fs-bg/25 px-2 py-2"><div className="text-[9px] text-fs-muted">高频数据截至</div><div className="mt-1 text-xs font-medium text-fs-text">{live?.dataThrough ?? "—"}</div></div>
          </div>
          {official ? (
            <div className="-mx-4 mt-4 border-t border-fs-border bg-fs-bg/20 sm:-mx-5">
              <div className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5">
                <div className="shrink-0 text-xs font-medium text-fs-text">月度指标</div>
                <div className="text-[10px] leading-4 text-fs-muted sm:text-right">增长由就业、收入、生产、调查四块等权合成；制造业与服务业 ISM 先合成一个调查块。通胀由 CPI/PCE 的 3 个月同比动量合成。表内数值直接来自正式月度快照，不在页面重新计算。</div>
              </div>
              <div className="overflow-x-auto border-t border-fs-border">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-fs-elevated/40 text-[10px] text-fs-muted"><tr><th className="px-3 py-2 font-medium">指标</th><th className="px-3 py-2 font-medium">归类</th><th className="px-3 py-2 font-medium">数据月份</th><th className="px-3 py-2 font-medium">最新值</th><th className="px-3 py-2 font-medium">模型读数</th><th className="px-3 py-2 font-medium">解释</th></tr></thead>
                  <tbody>{official.indicators.map((row) => <tr key={row.code} className="border-t border-fs-border/60"><td className="px-3 py-2 text-fs-text">{row.labelZh}</td><td className="px-3 py-2 text-fs-muted">{row.categoryLabel}</td><td className="px-3 py-2 tabular-nums text-fs-muted">{monthLabel(row.latestMonth)}</td><td className="px-3 py-2 tabular-nums text-fs-text">{officialValueText(row)}</td><td className="whitespace-nowrap px-3 py-2 tabular-nums text-fs-text">{officialModelInputText(row)}</td><td className={`whitespace-nowrap px-3 py-2 ${officialIndicatorTone(row)}`}>{row.directionLabel}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : null}
          {officialDetails ? <div className="-mx-4 mt-4 border-t border-fs-border sm:-mx-5">{officialDetails}</div> : null}
        </div>
      </div>
    </section>
  );
}
