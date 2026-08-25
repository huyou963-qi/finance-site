"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SECTOR_HISTORICAL_PERIODS } from "@/lib/equity/sectorHistoricalPeriods";
import { STYLE_BUCKETS } from "@/lib/equity/styleBuckets";
import type {
  SectorStageTransmissionResponse,
  SectorStageTransmissionRow,
  SectorAggregationMode,
  SectorTransmissionMode,
  TransmissionFactorKey,
} from "@/lib/equity/sectorStageTransmission";
import type { StageMetricSnapshot } from "@/lib/equity/sectorStageAttribution";

type Props = {
  stageId: string | null;
  mode: SectorTransmissionMode;
  aggregation: SectorAggregationMode;
  selectedSectorSlug: string | null;
  onModeChange: (mode: SectorTransmissionMode) => void;
  onAggregationChange: (aggregation: SectorAggregationMode) => void;
  onSectorChange: (slug: string, etf: string) => void;
  onClearStage: () => void;
};

const clientCache = new Map<string, SectorStageTransmissionResponse>();

const REGIME_META: Record<
  string,
  { label: string; className: string; dotClassName: string }
> = {
  goldilocks: {
    label: "增长改善 · 通胀回落",
    className: "bg-emerald-500/75",
    dotClassName: "bg-emerald-500",
  },
  reflation: {
    label: "增长改善 · 通胀上行",
    className: "bg-amber-500/75",
    dotClassName: "bg-amber-500",
  },
  stagflation: {
    label: "增长走弱 · 通胀上行",
    className: "bg-red-500/75",
    dotClassName: "bg-red-500",
  },
  deflation: {
    label: "增长走弱 · 通胀回落",
    className: "bg-blue-500/75",
    dotClassName: "bg-blue-500",
  },
  unknown: {
    label: "状态未知",
    className: "bg-slate-400/60",
    dotClassName: "bg-slate-400",
  },
};

const THEORY_META = {
  confirmed: { label: "理论确认", className: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  partial: { label: "部分兑现", className: "text-amber-700 bg-amber-50 border-amber-200" },
  rejected: { label: "理论未兑现", className: "text-red-700 bg-red-50 border-red-200" },
  inconclusive: { label: "证据不足", className: "text-fs-muted bg-fs-elevated border-fs-border" },
} as const;

const QUALITY_META = {
  A: { label: "A · 严格 PIT", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  B: { label: "B · 高覆盖近似 PIT", className: "border-blue-300 bg-blue-50 text-blue-700" },
  C: { label: "C · 中等覆盖近似 PIT", className: "border-amber-300 bg-amber-50 text-amber-800" },
  D: { label: "D · 低覆盖", className: "border-orange-300 bg-orange-50 text-orange-800" },
  "macro-only": { label: "仅宏观与行情", className: "border-slate-300 bg-slate-50 text-slate-700" },
} as const;

const METRIC_LABELS: Record<TransmissionFactorKey, string> = {
  revenueYoY: "营收同比",
  revenueAccel: "营收加速度",
  epsYoY: "EPS 同比",
  grossMargin: "毛利率",
  opMargin: "营业利润率",
  roeTtm: "ROE TTM",
  ocfToNetIncome: "现金含量",
  accrualsToAssets: "应计比率",
  debtToAssets: "资产负债率",
  earningsYield: "盈利收益率 E/P",
  salesYield: "销售收益率 S/P",
  fcfYield: "FCF 收益率",
  ocfToEv: "OCF / EV",
  dividendYield: "股息率",
  bookYield: "账面收益率 B/P",
};

function pct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

function score(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function logContribution(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`;
}

function valueClass(value: number | null | undefined): string {
  if (value == null) return "text-fs-muted";
  return value >= 0 ? "text-emerald-600" : "text-red-500";
}

function coverage(value: number | null | undefined): string {
  return value == null ? "—" : `${(value * 100).toFixed(0)}%`;
}

function metricPath(metric: StageMetricSnapshot): string {
  return `${pct(metric.start)} → ${pct(metric.end)}`;
}

function metricDelta(metric: StageMetricSnapshot): string {
  return metric.delta == null ? "Δ —" : `Δ ${pct(metric.delta)}`;
}

function stageSummary(row: SectorStageTransmissionRow): [string, string, string] {
  const revenue = row.fundamentals.revenueYoY;
  const margin = row.fundamentals.opMargin;
  const fact = `【事实】${row.nameZh}营收同比 ${metricPath(revenue)}，营业利润率 ${metricPath(margin)}；ETF 收益 ${pct(row.market.absoluteReturn)}，相对 SPY ${pct(row.market.excessVsSpy)}。`;
  const judgment = `【判断】${row.attribution.label ?? "现有证据不足以归入单一驱动"}；理论验证为${THEORY_META[row.theoryValidation].label}。`;
  const risk = `【风险】核心覆盖率 ${coverage(row.quality.fundamentalCoverage)}，财报口径 ${row.quality.vintageMode}，分类口径 ${row.quality.classificationMode}，权重口径 ${row.quality.weightMode}。`;
  return [fact, judgment, risk];
}

function QualityBadge({ quality }: { quality: SectorStageTransmissionResponse["quality"] }) {
  const meta = QUALITY_META[quality.overall];
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function HistoricalFactGate({ quality }: { quality: SectorStageTransmissionResponse["quality"] }) {
  const layers = quality.factLayers;
  if (!layers) return null;
  const cards = [
    ["SEC 财报版本", layers.filingVintage, "accession + filed date"],
    ["历史 GICS", layers.historicalClassification, "validFrom / validTo"],
    ["ETF 历史权重", layers.etfHoldings, "官方日度持仓"],
  ] as const;
  return (
    <div className="border-b border-fs-border bg-fs-elevated/20 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.14em] text-fs-accent-text">HISTORICAL FACT GATE</div>
          <div className="mt-0.5 text-xs font-medium text-fs-text">严格历史口径的三层数据闸门</div>
        </div>
        <div className="text-[10px] text-fs-muted">
          当前计算：{quality.strictPipelineApplied ? "严格事实层已应用" : "仍用近似口径；闸门只表示数据是否就绪"}
        </div>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        {cards.map(([label, layer, method]) => (
          <div key={label} className={`rounded-lg border px-3 py-2.5 ${layer.strict ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/60"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-medium text-fs-text">{label}</div>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${layer.strict ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                {layer.strict ? "首尾通过" : "未通过"}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-lg font-semibold tabular-nums text-fs-text">{coverage(layer.coverage)}</span>
              <span className="text-[9px] text-fs-muted">门槛 {coverage(layer.threshold)}</span>
            </div>
            <div className="mt-1 text-[9px] text-fs-muted">{method}</div>
            {layer.endpoints.length ? (
              <div className="mt-1.5 space-y-0.5 border-t border-black/5 pt-1.5 text-[9px] tabular-nums text-fs-muted">
                {layer.endpoints.map((point) => (
                  <div key={point.date} className="flex justify-between gap-2">
                    <span>{point.date}</span>
                    <span>{coverage(point.coverage)}{point.snapshotDate ? ` · 快照 ${point.snapshotDate}` : ""}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCell({ metric }: { metric: StageMetricSnapshot }) {
  const lowCoverage =
    metric.coverageStart != null &&
    metric.coverageEnd != null &&
    Math.min(metric.coverageStart, metric.coverageEnd) < 0.6;
  return (
    <div className={lowCoverage ? "opacity-55" : ""}>
      <div className="whitespace-nowrap font-medium tabular-nums text-fs-text">
        {metricPath(metric)}
      </div>
      <div className={`mt-0.5 whitespace-nowrap text-[10px] tabular-nums ${valueClass(metric.delta)}`}>
        {metricDelta(metric)} · 覆盖 {coverage(
          metric.coverageStart == null || metric.coverageEnd == null
            ? null
            : Math.min(metric.coverageStart, metric.coverageEnd),
        )}
      </div>
    </div>
  );
}

function ReturnBridge({ row }: { row: SectorStageTransmissionRow }) {
  const bridge = row.returnBridge;
  if (!bridge?.available) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-fs-border bg-fs-elevated/20 px-3 py-2.5">
        <div className="text-[10px] font-semibold tracking-[0.12em] text-fs-muted">ETF RETURN BRIDGE</div>
        <div className="mt-1 text-[11px] text-fs-muted">
          {bridge?.warnings[0] ?? "该行业当前没有足够的正值流量与市值覆盖，暂不进行收益分解。"}
        </div>
      </div>
    );
  }
  const parts = [
    ["总回报", bridge.totalLogReturn, "border-blue-200 bg-blue-50 text-blue-800"],
    ["基本面", bridge.fundamentalContribution, "border-emerald-200 bg-emerald-50 text-emerald-800"],
    ["估值", bridge.valuationContribution, "border-violet-200 bg-violet-50 text-violet-800"],
    ["实际分红", bridge.dividendContribution, "border-amber-200 bg-amber-50 text-amber-800"],
    ["残差", bridge.residual, "border-slate-200 bg-slate-50 text-slate-700"],
  ] as const;
  const strictMethod = bridge.method === "etf-holdings-matched-start-weight";
  return (
    <div className="mt-3 rounded-lg border border-fs-border bg-fs-elevated/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.12em] text-fs-accent-text">ETF RETURN BRIDGE</div>
          <div className="mt-0.5 text-[11px] font-medium text-fs-text">
            对数总回报 = {bridge.basisLabel}变化 + 估值变化 + 实际分红 + 残差
          </div>
        </div>
        <span className="rounded-full border border-fs-border bg-fs-bg px-2 py-0.5 text-[10px] tabular-nums text-fs-muted">
          流量市值覆盖 {coverage(bridge.coverage)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-fs-muted">
        <span className={`rounded-full border px-2 py-0.5 ${strictMethod ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
          {strictMethod ? "D3 · ETF 首尾持仓严格口径" : "D1 · 公司市值代理口径"}
        </span>
        {strictMethod ? (
          <span className="tabular-nums">
            持仓快照 {bridge.holdingSnapshotStart ?? "—"} → {bridge.holdingSnapshotEnd ?? "—"}
          </span>
        ) : null}
        {row.strictAudit?.applied ? (
          <span className="tabular-nums">
            残差对账：D1 {logContribution(row.strictAudit.bridgeResidual.d1)} · D3 {logContribution(row.strictAudit.bridgeResidual.strict)}
          </span>
        ) : null}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-5">
        {parts.map(([label, value, className], index) => (
          <div key={label} className={`rounded-md border px-2.5 py-2 ${className}`}>
            <div className="flex items-center justify-between gap-1 text-[9px] font-medium">
              <span>{label}</span>
              {index > 0 ? <span>{index === 1 ? "=" : "+"}</span> : null}
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums">{logContribution(value)}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] leading-4 text-fs-muted">
        各项为可加总的对数收益百分点；残差保留 ETF 权重、成分变化、股本变动、分类近似与 T0/T1 时间错位，不强行分摊。
      </div>
      {bridge.warnings.length ? (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[10px] leading-4 text-fs-muted">
          {bridge.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function LoadingPanel() {
  return (
    <div
      id="sector-stage-transmission"
      className="scroll-mt-3 border-b border-fs-border bg-fs-bg px-4 py-5 sm:px-5"
      aria-label="宏观到行业收益传导验证"
      aria-live="polite"
    >
      <div className="animate-pulse space-y-3">
        <div className="h-6 w-72 rounded bg-fs-elevated" />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-16 rounded-lg bg-fs-elevated" />
          ))}
        </div>
        <div className="h-36 rounded-lg bg-fs-elevated" />
      </div>
    </div>
  );
}

export function SectorStageTransmissionPanel({
  stageId,
  mode,
  aggregation,
  selectedSectorSlug,
  onModeChange,
  onAggregationChange,
  onSectorChange,
  onClearStage,
}: Props) {
  const [data, setData] = useState<SectorStageTransmissionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [sortByExcess, setSortByExcess] = useState(false);

  const load = useCallback(async (
    id: string,
    selectedMode: SectorTransmissionMode,
    selectedAggregation: SectorAggregationMode,
    signal: AbortSignal,
  ) => {
    const key = `${id}|${selectedMode}|${selectedAggregation}`;
    const cached = clientCache.get(key);
    if (cached) return cached;
    const response = await fetch(
      `/api/equity/sector-history/stages/${encodeURIComponent(id)}/transmission?mode=${selectedMode}&aggregation=${selectedAggregation}`,
      { cache: "no-store", signal },
    );
    const payload = (await response.json().catch(() => null)) as
      | SectorStageTransmissionResponse
      | { error?: string }
      | null;
    if (!response.ok) {
      throw new Error(payload && "error" in payload ? payload.error || "阶段传导数据加载失败" : "阶段传导数据加载失败");
    }
    const result = payload as SectorStageTransmissionResponse;
    clientCache.set(key, result);
    return result;
  }, []);

  useEffect(() => {
    if (!stageId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const cached = clientCache.get(`${stageId}|${mode}|${aggregation}`);
    setData(cached ?? null);
    setLoading(true);
    setError(null);
    load(stageId, mode, aggregation, controller.signal)
      .then((payload) => setData(payload))
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(reason instanceof Error ? reason.message : "阶段传导数据加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [aggregation, load, mode, retryToken, stageId]);

  const selectedRow = useMemo(() => {
    if (!data) return null;
    return (
      data.sectors.find((row) => row.slug === selectedSectorSlug) ??
      data.sectors.find((row) => row.expectedLeader && row.market.absoluteReturn != null) ??
      data.sectors[0] ??
      null
    );
  }, [data, selectedSectorSlug]);

  useEffect(() => {
    if (stageId && selectedRow && selectedRow.slug !== selectedSectorSlug) {
      onSectorChange(selectedRow.slug, selectedRow.etf);
    }
  }, [onSectorChange, selectedRow, selectedSectorSlug, stageId]);

  const stageDefinition = useMemo(
    () => SECTOR_HISTORICAL_PERIODS.find((stage) => stage.id === stageId) ?? null,
    [stageId],
  );

  const tableGroups = useMemo(() => {
    if (!data) return [];
    if (sortByExcess) {
      return [
        {
          id: "ranked",
          label: "按相对 SPY 超额排序",
          rows: [...data.sectors].sort((left, right) => {
            if (left.market.excessVsSpy == null) return 1;
            if (right.market.excessVsSpy == null) return -1;
            return right.market.excessVsSpy - left.market.excessVsSpy;
          }),
        },
      ];
    }
    return STYLE_BUCKETS.map((bucket) => ({
      id: bucket.id,
      label: `${bucket.nameZh}行业`,
      rows: data.sectors.filter((row) => row.style === bucket.id),
    }));
  }, [data, sortByExcess]);

  if (!stageId) {
    return (
      <div className="border-b border-fs-border bg-fs-elevated/25 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2 text-xs text-fs-muted">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-fs-accent-soft font-medium text-fs-accent-text">↓</span>
          选择下方任一历史阶段，查看“宏观 → 行业基本面 → 估值 → 行业收益”的传导验证。
        </div>
      </div>
    );
  }

  if (loading && !data) return <LoadingPanel />;

  if (error || !data) {
    return (
      <div
        id="sector-stage-transmission"
        className="scroll-mt-3 border-b border-fs-border bg-fs-bg px-4 py-6 text-center sm:px-5"
        aria-label="宏观到行业收益传导验证"
      >
        <div className="text-sm font-medium text-fs-text">阶段传导数据暂不可用</div>
        <div className="mt-1 text-xs text-fs-muted">{error ?? "未返回有效数据"}</div>
        <button
          type="button"
          onClick={() => setRetryToken((value) => value + 1)}
          className="mt-3 rounded-md border border-fs-border bg-fs-elevated px-3 py-1.5 text-xs text-fs-text hover:border-fs-accent/40"
        >
          重新加载
        </button>
      </div>
    );
  }

  const summary = selectedRow ? stageSummary(selectedRow) : null;

  return (
    <section id="sector-stage-transmission" className="scroll-mt-3 border-b border-fs-border bg-fs-bg" aria-label="宏观到行业收益传导验证">
      <header className="flex flex-col gap-3 border-b border-fs-border bg-fs-elevated/30 px-4 py-3 sm:px-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold tracking-[0.16em] text-fs-accent-text">STAGE TRANSMISSION</span>
            <QualityBadge quality={data.quality} />
            {data.stage.open ? (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">开放阶段 · 排序仍在变化</span>
            ) : null}
          </div>
          <h2 className="mt-1 text-base font-semibold text-fs-text">{data.stage.label}</h2>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-fs-muted">
            <span>收益：{data.stage.start} → {data.stage.end}</span>
            <span>基本面：T0 {data.stage.t0 ?? "—"} → {mode === "realized" ? `T2 ${data.stage.t2 ?? "—"}` : `T1 ${data.stage.t1 ?? "—"}`}</span>
            <span>定义版本：{data.definitionsVersion}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-fs-border bg-fs-bg p-0.5" aria-label="行业聚合口径">
            {(["median", "capWeighted"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onAggregationChange(item)}
                aria-pressed={aggregation === item}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${aggregation === item ? "bg-fs-accent-soft text-fs-accent-text" : "text-fs-muted hover:text-fs-text"}`}
              >
                {item === "median" ? "典型公司 median" : "行业总量 capWeighted"}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-md border border-fs-border bg-fs-bg p-0.5" aria-label="观察模式">
            {(["asOf", "realized"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onModeChange(item)}
                aria-pressed={mode === item}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${mode === item ? "bg-fs-accent-soft text-fs-accent-text" : "text-fs-muted hover:text-fs-text"}`}
              >
                {item === "asOf" ? "当时可见 asOf" : "事后确认 realized"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClearStage}
            className="rounded-md border border-fs-border bg-fs-bg px-2.5 py-1.5 text-[11px] text-fs-muted hover:text-fs-text"
          >
            回到最新阶段
          </button>
        </div>
      </header>

      {mode === "realized" ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-5">
          事后确认模式包含阶段结束后的财报，只能用于复盘“后来是否兑现”，不能作为阶段终点当时可见的判断。
        </div>
      ) : null}

      {aggregation === "capWeighted" ? (
        <div className="border-b border-blue-200 bg-blue-50/70 px-4 py-2 text-[11px] leading-5 text-blue-900 sm:px-5">
          {selectedRow?.quality.strictPipelineApplied
            ? "所选行业已切换到 D3 严格口径：财报按 filing vintage、分类按历史 GICS 有效期、指标按 ETF 首尾真实持仓加权；收益桥仍显式保留调仓与时间错位残差。"
            : "行业总量默认使用 D1 月末 PIT 市值代理。只有某行业首尾两端的 filing vintage、历史 GICS 与 ETF 持仓三层闸门全部通过，才整条切换到 D3；否则不混算并保留 D1。"}
        </div>
      ) : null}

      <HistoricalFactGate quality={data.quality} />

      <div className="grid border-b border-fs-border sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ["增长", data.macro.summary.growth],
            ["通胀", data.macro.summary.inflation],
            ["政策", data.macro.summary.policy],
            ["信用", data.macro.summary.credit],
          ] as const
        ).map(([label, value], index) => (
          <div
            key={label}
            className={`px-4 py-3 sm:px-5 ${
              index === 0
                ? ""
                : index === 1
                  ? "border-t border-fs-border sm:border-l sm:border-t-0"
                  : index === 2
                    ? "border-t border-fs-border xl:border-l xl:border-t-0"
                    : "border-t border-fs-border sm:border-l xl:border-t-0"
            }`}
          >
            <div className="text-[10px] font-medium tracking-wide text-fs-muted">{label}</div>
            <div className="mt-1 text-xs leading-5 text-fs-text">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid border-b border-fs-border xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.55fr)]">
        <div className="px-4 py-3 sm:px-5 xl:border-r xl:border-fs-border">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-fs-text">增长方向 × 通胀方向 Regime 路径</div>
              <div className="mt-0.5 text-[10px] text-fs-muted">{data.macro.regimePath.length} 个可用月 · {data.macro.transitions} 次状态转换</div>
            </div>
            <div className="text-right text-[10px] text-fs-muted">
              SPY <span className={`ml-1 font-semibold tabular-nums ${valueClass(data.benchmark.return)}`}>{pct(data.benchmark.return)}</span>
              {selectedRow ? (
                <span className="ml-3">{selectedRow.etf} 超额 <span className={`ml-1 font-semibold tabular-nums ${valueClass(selectedRow.market.excessVsSpy)}`}>{pct(selectedRow.market.excessVsSpy)}</span></span>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex h-9 gap-0.5 overflow-hidden rounded-md border border-fs-border bg-fs-elevated p-0.5" aria-label="Regime 月度色带">
            {data.macro.regimePath.length ? (
              data.macro.regimePath.map((point) => {
                const key = point.dalioRegime ?? "unknown";
                const meta = REGIME_META[key] ?? REGIME_META.unknown!;
                return (
                  <div
                    key={point.date}
                    className={`min-w-1 flex-1 rounded-sm ${meta.className}`}
                    title={`${point.date} · ${meta.label}`}
                  />
                );
              })
            ) : (
              <div className="flex flex-1 items-center justify-center text-[10px] text-fs-muted">该阶段暂无月度 Regime</div>
            )}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-fs-muted">
            <span>{data.macro.regimePath[0]?.date ?? data.stage.start}</span>
            <span>{data.macro.regimePath.at(-1)?.date ?? data.stage.end}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {Object.entries(REGIME_META).map(([key, meta]) => (
              <span key={key} className="inline-flex items-center gap-1.5 text-[10px] text-fs-muted">
                <span className={`h-2 w-2 rounded-full ${meta.dotClassName}`} />
                {meta.label}
              </span>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 sm:px-5">
          <div className="text-xs font-medium text-fs-text">关键事件与传导假设</div>
          <ol className="mt-2 space-y-2">
            {stageDefinition?.events.map((event) => (
              <li key={`${event.date}-${event.title}`} className="grid grid-cols-[5.25rem_1fr] gap-2 text-[10px] leading-4">
                <span className="tabular-nums text-fs-muted">{event.date}</span>
                <span className="text-fs-text"><strong className="font-medium">{event.title}</strong><span className="text-fs-muted"> · {event.impact}</span></span>
              </li>
            ))}
          </ol>
          {stageDefinition ? (
            <p className="mt-2 border-l-2 border-fs-accent/40 pl-2 text-[10px] leading-4 text-fs-muted">
              <span className="font-medium text-fs-text">研究假设：</span>{stageDefinition.mechanism}
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-b border-fs-border">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
          <div>
            <div className="text-xs font-medium text-fs-text">11 行业传导矩阵</div>
            <div className="mt-0.5 text-[10px] text-fs-muted">
              {aggregation === "median"
                ? "点击行业查看证据；数值为行业公司中位数，用于观察典型公司。"
                : "点击行业查看收益桥；指标按 PIT 市值加权，ETF 与公司总量差异保留为残差。"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSortByExcess((value) => !value)}
            aria-pressed={sortByExcess}
            className={`rounded-md border px-2.5 py-1 text-[10px] transition ${sortByExcess ? "border-fs-accent/30 bg-fs-accent-soft text-fs-accent-text" : "border-fs-border bg-fs-bg text-fs-muted hover:text-fs-text"}`}
          >
            {sortByExcess ? "恢复成长 → 周期 → 防御" : "按超额排序"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-left text-[11px]">
            <thead className="sticky top-0 z-20 bg-fs-elevated text-fs-muted shadow-[0_1px_0_var(--fs-border)]">
              <tr>
                <th className="sticky left-0 z-30 w-32 bg-fs-elevated px-3 py-2 font-medium sm:px-5">行业</th>
                <th className="w-32 px-3 py-2 font-medium">{aggregation === "median" ? "营收同比" : "营收同比（市值加权）"}</th>
                <th className="w-32 px-3 py-2 font-medium">{aggregation === "median" ? "EPS 同比" : "盈利同比（市值加权）"}</th>
                <th className="w-32 px-3 py-2 font-medium">{aggregation === "median" ? "营业利润率" : "营业利润率（市值加权）"}</th>
                <th className="w-32 px-3 py-2 font-medium">盈利收益率 E/P</th>
                <th className="w-20 px-3 py-2 text-right font-medium">ETF 收益</th>
                <th className="w-20 px-3 py-2 text-right font-medium">相对 SPY</th>
                <th className="w-40 px-3 py-2 font-medium">解释标签</th>
              </tr>
            </thead>
            <tbody>
              {tableGroups.flatMap((group) => [
                <tr key={`group-${group.id}`} className="bg-fs-elevated/70">
                  <td colSpan={8} className="px-3 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-fs-muted sm:px-5">
                    {group.label}
                  </td>
                </tr>,
                ...group.rows.map((row) => {
                  const active = row.slug === selectedRow?.slug;
                  const theory = THEORY_META[row.theoryValidation];
                  return (
                    <tr
                      key={row.sector}
                      onClick={() => onSectorChange(row.slug, row.etf)}
                      className={`cursor-pointer border-t border-fs-border/65 transition ${active ? "bg-fs-accent-soft/55" : "hover:bg-fs-elevated/45"}`}
                    >
                      <td className={`sticky left-0 z-10 px-3 py-2.5 sm:px-5 ${active ? "bg-[#f1f8ff]" : "bg-fs-bg"}`}>
                        <button
                          type="button"
                          className="text-left"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSectorChange(row.slug, row.etf);
                          }}
                        >
                          <span className="font-medium text-fs-text">{row.nameZh}</span>
                          <span className="ml-1.5 tabular-nums text-fs-muted">{row.etf}</span>
                          {row.expectedLeader ? <span className="mt-0.5 block text-[9px] text-fs-accent-text">理论受益行业</span> : null}
                        </button>
                      </td>
                      <td className="px-3 py-2.5"><MetricCell metric={row.fundamentals.revenueYoY} /></td>
                      <td className="px-3 py-2.5"><MetricCell metric={row.fundamentals.epsYoY} /></td>
                      <td className="px-3 py-2.5"><MetricCell metric={row.fundamentals.opMargin} /></td>
                      <td className="px-3 py-2.5"><MetricCell metric={row.fundamentals.earningsYield} /></td>
                      <td className={`px-3 py-2.5 text-right text-sm font-semibold tabular-nums ${valueClass(row.market.absoluteReturn)}`}>{pct(row.market.absoluteReturn)}</td>
                      <td className={`px-3 py-2.5 text-right text-sm font-semibold tabular-nums ${valueClass(row.market.excessVsSpy)}`}>{pct(row.market.excessVsSpy)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] ${row.attribution.label ? "bg-fs-accent-soft text-fs-accent-text" : "bg-fs-elevated text-fs-muted"}`}>
                            {row.attribution.label ?? "未形成单一驱动"}
                          </span>
                          <span className={`rounded border px-1.5 py-0.5 text-[9px] ${theory.className}`}>{theory.label}</span>
                        </div>
                        <div className="mt-1 text-[9px] tabular-nums text-fs-muted">F {score(row.attribution.fundamentalScore)} · V {score(row.attribution.valuationScore)}</div>
                      </td>
                    </tr>
                  );
                }),
              ])}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRow ? (
        <div className="grid xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
          <div className="px-4 py-4 sm:px-5 xl:border-r xl:border-fs-border">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold tracking-[0.14em] text-fs-accent-text">SELECTED SECTOR</div>
                <h3 className="mt-0.5 text-sm font-semibold text-fs-text">{selectedRow.nameZh} · {selectedRow.etf}</h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <QualityBadge quality={selectedRow.quality} />
                <span className="rounded-full border border-fs-border bg-fs-elevated px-2 py-0.5 text-[10px] text-fs-muted">
                  最大回撤 {pct(selectedRow.market.maxDrawdown)}
                </span>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {(
                [
                  ["revenueYoY", selectedRow.fundamentals.revenueYoY],
                  ["epsYoY", selectedRow.fundamentals.epsYoY],
                  ["opMargin", selectedRow.fundamentals.opMargin],
                  ["earningsYield", selectedRow.fundamentals.earningsYield],
                ] as const
              ).map(([factorKey, metric]) => {
                const aggregateLabel =
                  factorKey === "epsYoY"
                    ? "盈利同比（市值加权）"
                    : factorKey === "revenueYoY"
                      ? "营收同比（市值加权）"
                      : factorKey === "opMargin"
                        ? "营业利润率（市值加权）"
                        : "行业盈利收益率 E/P";
                return (
                  <div key={factorKey} className="rounded-lg border border-fs-border bg-fs-elevated/25 p-2.5">
                    <div className="text-[10px] text-fs-muted">
                      {aggregation === "capWeighted" ? aggregateLabel : METRIC_LABELS[factorKey]}
                    </div>
                    <div className="mt-1 text-xs font-medium tabular-nums text-fs-text">{metricPath(metric)}</div>
                    <div className={`mt-1 text-[10px] tabular-nums ${valueClass(metric.delta)}`}>{metricDelta(metric)}</div>
                  </div>
                );
              })}
            </div>

            {aggregation === "capWeighted" ? <ReturnBridge row={selectedRow} /> : null}

            {summary ? (
              <div className="mt-3 space-y-1.5 rounded-lg border border-fs-border bg-fs-bg p-3 text-[11px] leading-5">
                <p className="text-fs-text">{summary[0]}</p>
                <p className="text-fs-text">{summary[1]}</p>
                <p className="text-fs-muted">{summary[2]}</p>
              </div>
            ) : null}
          </div>

          <aside className="px-4 py-4 sm:px-5">
            <div className="text-xs font-medium text-fs-text">证据与研究风险</div>
            {selectedRow.attribution.evidence.length ? (
              <ul className="mt-2 space-y-1.5">
                {selectedRow.attribution.evidence.map((item, index) => (
                  <li key={`${item.metric}-${index}`} className="rounded-md border border-fs-border/70 bg-fs-elevated/30 px-2.5 py-2 text-[10px] leading-4 text-fs-muted">
                    <span className="font-medium text-fs-text">{item.message}</span>
                    <span className="ml-1 tabular-nums">值 {score(item.value)} · 阈值 {score(item.threshold)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[10px] leading-4 text-fs-muted">当前没有达到固定归因阈值；保留空标签比强行解释更可靠。</p>
            )}

            <details className="mt-3 rounded-md border border-fs-border bg-fs-elevated/20 px-2.5 py-2">
              <summary className="cursor-pointer text-[10px] font-medium text-fs-text">查看全部口径警告（{selectedRow.quality.warnings.length}）</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] leading-4 text-fs-muted">
                {selectedRow.quality.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </details>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
