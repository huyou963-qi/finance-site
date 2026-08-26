"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SectorNavChart } from "@/components/equity/SectorCharts";
import { SectorStageTransmissionPanel } from "@/components/equity/SectorStageTransmissionPanel";
import { GICS_SECTOR_DEFS } from "@/lib/equity/gicsCatalog";
import {
  SECTOR_HISTORICAL_PERIODS,
  type SectorHistoricalPeriod,
} from "@/lib/equity/sectorHistoricalPeriods";
import { STYLE_BUCKETS } from "@/lib/equity/styleBuckets";
import type {
  SectorAggregationMode,
  SectorTransmissionMode,
} from "@/lib/equity/sectorStageTransmission";

type NavPoint = { time: number; value: number };
type ApiResponse = {
  nav?: Record<string, NavPoint[]>;
  priceSource?: string | null;
};
type PeriodSectorRow = {
  sector: string;
  nameZh: string;
  etf: string;
  absoluteReturn: number | null;
  excessVsSpy: number | null;
};
type PeriodReturnData = {
  spyReturn: number | null;
  sectors: PeriodSectorRow[];
  availableCount: number;
};

/** Select Sector SPDR 的共同历史从 1998-12 开始；2099 仅作为“最新可得交易日”哨兵。 */
const CHART_HISTORY_START = "1998-12-16";
const LATEST_DATE_SENTINEL = "2099-12-31";
const CHART_STYLE_GROUPS = STYLE_BUCKETS.map((bucket) => ({
  id: bucket.id,
  label: bucket.nameZh,
  rows: bucket.sectors.map((sector) => {
    const definition = GICS_SECTOR_DEFS.find((item) => item.sector === sector)!;
    return { etf: definition.etf, label: definition.nameZh };
  }),
}));
const ALL_CHART_ETFS = [
  "SPY",
  ...CHART_STYLE_GROUPS.flatMap((group) => group.rows.map((row) => row.etf)),
];
const DEFAULT_STAGE_ID = SECTOR_HISTORICAL_PERIODS.at(-1)?.id ?? null;

function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function valueClass(value: number | null | undefined) {
  if (value == null) return "text-fs-muted";
  return value >= 0 ? "text-emerald-400" : "text-red-400";
}

function periodEnd(period: SectorHistoricalPeriod) {
  return period.end === LATEST_DATE_SENTINEL ? "最新交易日" : period.end;
}

function dateStartSec(date: string) {
  return Date.parse(`${date}T00:00:00Z`) / 1000;
}

function dateEndSec(date: string) {
  const requested = Date.parse(`${date}T23:59:59Z`) / 1000;
  return Math.min(requested, Date.now() / 1000);
}

function validStageId(value: string | null): string | null {
  return value && SECTOR_HISTORICAL_PERIODS.some((period) => period.id === value)
    ? value
    : null;
}

function validMode(value: string | null): SectorTransmissionMode {
  return value === "realized" ? "realized" : "asOf";
}

function validAggregation(value: string | null): SectorAggregationMode {
  return value === "capWeighted" ? "capWeighted" : "median";
}

/**
 * 从同一份完整净值序列计算阶段收益，避免为 30 张卡重复请求 30 次历史数据。
 * ETF 晚于阶段上市时，首尾点无法同时落入窗口，严格返回 null，不跨期补样本。
 */
function navReturn(points: NavPoint[] | undefined, period: SectorHistoricalPeriod) {
  if (!points?.length) return null;
  const fromSec = dateStartSec(period.start);
  const toSec = dateEndSec(period.end);
  const first = points.find((point) => point.time >= fromSec && point.time <= toSec);
  let last: NavPoint | undefined;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]!;
    if (point.time <= toSec && point.time >= fromSec) {
      last = point;
      break;
    }
  }
  if (!first || !last || last.time <= first.time || first.value === 0) return null;
  return last.value / first.value - 1;
}

function derivePeriodData(
  nav: Record<string, NavPoint[]> | undefined,
  period: SectorHistoricalPeriod,
): PeriodReturnData {
  const spyReturn = navReturn(nav?.SPY, period);
  const sectors = GICS_SECTOR_DEFS.map((definition) => {
    const absoluteReturn = navReturn(nav?.[definition.etf], period);
    return {
      sector: definition.sector,
      nameZh: definition.nameZh,
      etf: definition.etf,
      absoluteReturn,
      excessVsSpy:
        absoluteReturn != null && spyReturn != null ? absoluteReturn - spyReturn : null,
    };
  }).sort((left, right) => {
    if (left.excessVsSpy == null && right.excessVsSpy == null) return left.etf.localeCompare(right.etf);
    if (left.excessVsSpy == null) return 1;
    if (right.excessVsSpy == null) return -1;
    return right.excessVsSpy - left.excessVsSpy;
  });
  return {
    spyReturn,
    sectors,
    availableCount: sectors.filter((row) => row.absoluteReturn != null).length,
  };
}

/** 草图布局：上方可选行业主图，下方为横向滚动的细颗粒历史阶段研究卡。 */
export function HistoricalSectorRotation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    validStageId(searchParams.get("stage")) ?? DEFAULT_STAGE_ID,
  );
  const [transmissionMode, setTransmissionMode] = useState<SectorTransmissionMode>(() =>
    validMode(searchParams.get("mode")),
  );
  const [aggregation, setAggregation] = useState<SectorAggregationMode>(() =>
    validAggregation(searchParams.get("aggregation")),
  );
  const [selectedSectorSlug, setSelectedSectorSlug] = useState<string | null>(() =>
    searchParams.get("sector"),
  );
  const [chartData, setChartData] = useState<ApiResponse | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const [selectedEtfs, setSelectedEtfs] = useState<string[]>(ALL_CHART_ETFS);
  const period = selectedId
    ? SECTOR_HISTORICAL_PERIODS.find((item) => item.id === selectedId) ?? null
    : null;

  useEffect(() => {
    setSelectedId(validStageId(searchParams.get("stage")) ?? DEFAULT_STAGE_ID);
    setTransmissionMode(validMode(searchParams.get("mode")));
    setAggregation(validAggregation(searchParams.get("aggregation")));
    setSelectedSectorSlug(searchParams.get("sector"));
  }, [searchParams]);

  const replaceResearchParams = useCallback(
    (next: {
      stage?: string | null;
      sector?: string | null;
      mode?: SectorTransmissionMode | null;
      aggregation?: SectorAggregationMode | null;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value == null || value === "") params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const selectStage = useCallback(
    (stageId: string) => {
      setSelectedId(stageId);
      replaceResearchParams({ stage: stageId, mode: transmissionMode, aggregation });
    },
    [aggregation, replaceResearchParams, transmissionMode],
  );

  const clearStage = useCallback(() => {
    setSelectedId(DEFAULT_STAGE_ID);
    setSelectedSectorSlug(null);
    setTransmissionMode("asOf");
    setAggregation("median");
    replaceResearchParams({ stage: DEFAULT_STAGE_ID, sector: null, mode: null, aggregation: null });
  }, [replaceResearchParams]);

  const changeMode = useCallback(
    (mode: SectorTransmissionMode) => {
      setTransmissionMode(mode);
      replaceResearchParams({ mode, stage: selectedId });
    },
    [replaceResearchParams, selectedId],
  );

  const changeAggregation = useCallback(
    (nextAggregation: SectorAggregationMode) => {
      setAggregation(nextAggregation);
      replaceResearchParams({ aggregation: nextAggregation, stage: selectedId });
    },
    [replaceResearchParams, selectedId],
  );

  const changeSector = useCallback(
    (slug: string, etf: string) => {
      setSelectedSectorSlug(slug);
      setSelectedEtfs((previous) => [...new Set([...previous, "SPY", etf])]);
      replaceResearchParams({
        sector: slug,
        stage: selectedId,
        mode: transmissionMode,
        aggregation,
      });
    },
    [aggregation, replaceResearchParams, selectedId, transmissionMode],
  );

  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    setChartError(null);
    fetch(
      `/api/equity/sector-returns?from=${CHART_HISTORY_START}&to=${LATEST_DATE_SENTINEL}&nav=1`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        if (response.ok) return response.json();
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "历史行情加载失败");
      })
      .then((payload: ApiResponse) => {
        if (!cancelled) setChartData(payload);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setChartData(null);
        setChartError(error instanceof Error ? error.message : "历史行情加载失败");
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chartRows = useMemo(
    () => [
      { etf: "SPY", label: "标普 500" },
      ...CHART_STYLE_GROUPS.flatMap((group) => group.rows),
    ],
    [],
  );

  const chartSeries = useMemo(() => {
    if (!chartData?.nav) return [];
    return chartRows
      .filter((row) => selectedEtfs.includes(row.etf))
      .map((row) => ({
        name: `${row.label} · ${row.etf}`,
        data: chartData.nav?.[row.etf] ?? [],
      }))
      .filter((row) => row.data.length > 1);
  }, [chartData, chartRows, selectedEtfs]);

  const latestChartDate = useMemo(() => {
    const lastPoint = chartData?.nav?.SPY?.at(-1);
    return lastPoint ? new Date(lastPoint.time * 1000).toISOString().slice(0, 10) : null;
  }, [chartData?.nav]);

  const periodData = useMemo(
    () =>
      Object.fromEntries(
        SECTOR_HISTORICAL_PERIODS.map((item) => [
          item.id,
          derivePeriodData(chartData?.nav, item),
        ]),
      ) as Record<string, PeriodReturnData>,
    [chartData?.nav],
  );

  const toggleEtf = (etf: string) => {
    setSelectedEtfs((previous) =>
      previous.includes(etf)
        ? previous.length > 1
          ? previous.filter((item) => item !== etf)
          : previous
        : [...previous, etf],
    );
  };

  return (
    <section className="overflow-hidden rounded-xl border border-fs-border bg-fs-elevated/20 xl:min-h-0 xl:flex-1">
      <div className="grid xl:h-full xl:min-h-0 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-fs-border bg-fs-bg/25 xl:h-full xl:border-b-0 xl:border-r">
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {SECTOR_HISTORICAL_PERIODS.slice().reverse().map((item) => {
              const stageNumber = SECTOR_HISTORICAL_PERIODS.findIndex((entry) => entry.id === item.id) + 1;
              const active = item.id === selectedId;
              return (
                <button key={item.id} type="button" onClick={() => selectStage(item.id)} aria-pressed={active} className={`w-full border-b border-fs-border px-2.5 py-2.5 text-left transition last:border-b-0 ${active ? "bg-fs-accent-soft text-fs-accent-text" : "text-fs-muted hover:bg-fs-elevated/60 hover:text-fs-text"}`}>
                  <span className="block text-[11px] font-semibold">阶段 {String(stageNumber).padStart(2, "0")} · {item.start} → {periodEnd(item)}</span>
                  <span className="mt-1 block text-xs font-semibold leading-5">{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col xl:min-h-0 xl:overflow-y-auto">
        {period ? (() => {
          const data = periodData[period.id];
          return (
            <div className="min-w-0 p-3 sm:p-4">
              <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(24rem,0.95fr)]">
                <article className="h-full rounded-lg bg-fs-bg/45 p-3 sm:p-4">
                  <div className="border-l-2 border-fs-accent/60 pl-3">
                    <p className="text-base font-bold text-fs-text">宏观主线</p>
                    <p className="mt-1 text-sm leading-6 text-fs-text">{period.macro}</p>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg border border-fs-border bg-fs-elevated/30 p-3 text-xs">
                    <div><dt className="text-fs-muted">增长</dt><dd className="mt-1 font-medium text-fs-text">{period.regime.growth}</dd></div>
                    <div><dt className="text-fs-muted">通胀</dt><dd className="mt-1 font-medium text-fs-text">{period.regime.inflation}</dd></div>
                    <div><dt className="text-fs-muted">政策</dt><dd className="mt-1 font-medium text-fs-text">{period.regime.policy}</dd></div>
                    <div><dt className="text-fs-muted">信用</dt><dd className="mt-1 font-medium text-fs-text">{period.regime.credit}</dd></div>
                  </dl>
                  <div className="mt-4">
                    <h3 className="text-xs font-medium text-fs-text">关键事件与影响</h3>
                    <ol className="mt-2 space-y-2.5">
                      {period.events.map((event) => <li key={`${event.date}-${event.title}`} className="grid grid-cols-[5.5rem_1fr] gap-2 text-xs leading-5"><span className="tabular-nums text-fs-muted">{event.date}</span><span className="text-fs-text"><strong className="font-medium">{event.title}</strong><span className="text-fs-muted"> · {event.impact}</span></span></li>)}
                    </ol>
                  </div>
                  <div className="mt-4 rounded-lg border border-fs-border bg-fs-elevated/25 p-3">
                    <p className="text-[11px] font-bold text-fs-text">行业传导机制：为什么会强 / 弱</p>
                    <p className="mt-1 text-xs leading-5 text-fs-text">{period.mechanism}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1"><span className="mr-1 text-[10px] text-fs-muted">理论受益</span>{period.expectedLeaders.map((leader) => <span key={leader} className="rounded bg-fs-accent-soft px-1.5 py-0.5 text-[10px] text-fs-accent-text">{leader}</span>)}</div>
                  </div>
                  {period.caveat ? <p className="mt-2 text-[10px] leading-4 text-amber-800">注：{period.caveat}</p> : null}
                </article>

                <article className="flex h-full flex-col rounded-lg bg-fs-bg/45 p-3">
                  <div className="overflow-hidden rounded-lg border border-fs-border">
                    <div className="grid grid-cols-[2rem_minmax(0,1fr)_4.5rem_4.5rem] items-center bg-fs-elevated/65 px-2.5 py-2 text-[10px] text-fs-muted"><span>排名</span><span>行业指数</span><span className="text-right">收益</span><span className="text-right">超额</span></div>
                    <div className="grid grid-cols-[2rem_minmax(0,1fr)_4.5rem_4.5rem] items-center border-t border-fs-border/70 px-2.5 py-2 text-xs"><span className="text-fs-muted">—</span><span className="text-fs-text">标普 500 <span className="text-fs-muted">SPY</span></span><span className={`text-right font-medium tabular-nums ${valueClass(data.spyReturn)}`}>{pct(data.spyReturn)}</span><span className="text-right text-fs-muted">基准</span></div>
                    <ol>{data.sectors.map((row, rank) => <li key={row.sector} className="grid grid-cols-[2rem_minmax(0,1fr)_4.5rem_4.5rem] items-center border-t border-fs-border/55 px-2.5 py-1.5 text-xs"><span className="tabular-nums text-fs-muted">{row.absoluteReturn == null ? "—" : rank + 1}</span><span className="truncate text-fs-text">{row.nameZh} <span className="text-fs-muted">{row.etf}</span></span><span className={`text-right tabular-nums ${valueClass(row.absoluteReturn)}`}>{pct(row.absoluteReturn)}</span><span className={`text-right tabular-nums ${valueClass(row.excessVsSpy)}`}>{pct(row.excessVsSpy)}</span></li>)}</ol>
                    <p className="border-t border-fs-border/70 px-2.5 py-1.5 text-[10px] text-fs-muted">可比样本 {data.availableCount}/11 · “—”表示 ETF 尚未上市或区间不足</p>
                  </div>
                </article>
              </div>
            </div>
          );
        })() : null}

      <details className="order-2 border-b border-fs-border bg-fs-bg/20">
        <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-fs-text sm:px-5">查看完整历史行情轨迹与行业 ETF 对比</summary>
      <div className="border-t border-fs-border px-3 py-3 sm:px-5">
        <div className="mb-3 flex min-h-7 flex-wrap items-center gap-x-3 gap-y-2" aria-label="主图行业选择">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-fs-muted">基准</span>
            {(() => {
              const active = selectedEtfs.includes("SPY");
              return <button type="button" onClick={() => toggleEtf("SPY")} className={`rounded px-2 py-1 text-xs font-medium transition ${active ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/30" : "bg-fs-elevated/50 text-fs-muted hover:text-fs-text"}`} aria-pressed={active}>SPY</button>;
            })()}
          </div>
          {CHART_STYLE_GROUPS.map((group) => <div key={group.id} className="flex items-center gap-1.5 border-l border-fs-border pl-3"><span className="text-[10px] font-medium text-fs-muted">{group.label}</span>{group.rows.map((row) => { const active = selectedEtfs.includes(row.etf); return <button key={row.etf} type="button" onClick={() => toggleEtf(row.etf)} className={`rounded px-2 py-1 text-xs font-medium transition ${active ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/30" : "bg-fs-elevated/50 text-fs-muted hover:text-fs-text"}`} aria-pressed={active} title={`${row.label} ${row.etf}`}>{row.etf}</button>; })}</div>)}
          <span className="ml-auto text-[10px] text-fs-muted">数据源：{chartData?.priceSource ?? "前复权 ETF 日线"}</span>
        </div>
        {chartLoading ? (
          <div className="flex h-[336px] items-center justify-center text-sm text-fs-muted">正在加载完整历史行情…</div>
        ) : chartSeries.length ? (
          <SectorNavChart
            series={chartSeries}
            height={336}
            showDataZoom
            zoomWindow={
              period
                ? {
                    start: period.start,
                    end:
                      period.end === LATEST_DATE_SENTINEL
                        ? latestChartDate ?? new Date().toISOString().slice(0, 10)
                        : period.end,
                  }
                : null
            }
          />
        ) : (
          <div className="flex h-[336px] flex-col items-center justify-center gap-1 text-sm text-fs-muted">
            <span>{chartError ?? "暂无可绘制的 ETF 时间序列。"}</span>
            <span className="text-xs">请确认数据库已回填 SPY 与 Sector SPDR 的历史日线。</span>
          </div>
        )}
      </div>
      </details>

      <div className="order-1 border-b border-fs-border bg-fs-elevated/15">
        <SectorStageTransmissionPanel
          stageId={selectedId}
          mode={transmissionMode}
          aggregation={aggregation}
          selectedSectorSlug={selectedSectorSlug}
          onModeChange={changeMode}
          onAggregationChange={changeAggregation}
          onSectorChange={changeSector}
          onClearStage={clearStage}
        />
      </div>

      <footer className="order-3 border-t border-fs-border px-4 py-2 text-[11px] leading-4 text-fs-muted sm:px-5">
        口径：SPY 与 Sector SPDR ETF 前复权日线，按阶段内首尾可得交易日计算总收益；超额 = 行业收益 − SPY 收益。阶段依据 NBER 周期、FOMC 政策、信用事件与市场主线转折划分，不按事后行业赢家反推边界，也不把 ETF 上市前的缺失期补造成历史结论。
      </footer>
        </div>
      </div>
    </section>
  );
}
