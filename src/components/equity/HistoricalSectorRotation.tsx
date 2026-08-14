"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SectorNavChart } from "@/components/equity/SectorCharts";
import { SectorStageTransmissionPanel } from "@/components/equity/SectorStageTransmissionPanel";
import { SectorRegimeForwardStudyPanel } from "@/components/equity/SectorRegimeForwardStudyPanel";
import { SectorRegimeLiveLedgerPanel } from "@/components/equity/SectorRegimeLiveLedgerPanel";
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
    validStageId(searchParams.get("stage")),
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
    setSelectedId(validStageId(searchParams.get("stage")));
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
      window.setTimeout(() => {
        document.getElementById("sector-stage-transmission")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 60);
    },
    [aggregation, replaceResearchParams, transmissionMode],
  );

  const clearStage = useCallback(() => {
    setSelectedId(null);
    setSelectedSectorSlug(null);
    setTransmissionMode("asOf");
    setAggregation("median");
    replaceResearchParams({ stage: null, sector: null, mode: null, aggregation: null });
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
    <section className="overflow-hidden rounded-xl border border-fs-border bg-fs-elevated/20">
      <header className="flex flex-col gap-3 border-b border-fs-border px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium tracking-[0.16em] text-fs-accent-text">US SECTOR HISTORY</p>
            <h1 className="mt-0.5 text-lg font-semibold text-fs-text">历史情境下的行业轮动</h1>
          </div>
          <div className="text-right text-xs text-fs-muted">
            <div>{SECTOR_HISTORICAL_PERIODS.length} 个细分阶段 · 11 个行业完整列示</div>
            <div className="mt-0.5 text-[10px]">数据源：{chartData?.priceSource ?? "前复权 ETF 日线"}</div>
          </div>
        </div>
        <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-2" aria-label="主图行业选择">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-fs-muted">基准</span>
            {(() => {
              const active = selectedEtfs.includes("SPY");
              return (
                <button
                  type="button"
                  onClick={() => toggleEtf("SPY")}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${active ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/30" : "bg-fs-elevated/50 text-fs-muted hover:text-fs-text"}`}
                  aria-pressed={active}
                  title="标普 500 SPY"
                >
                  SPY
                </button>
              );
            })()}
          </div>
          {CHART_STYLE_GROUPS.map((group) => (
            <div key={group.id} className="flex items-center gap-1.5 border-l border-fs-border pl-3">
              <span className="text-[10px] font-medium text-fs-muted">{group.label}</span>
              {group.rows.map((row) => {
                const active = selectedEtfs.includes(row.etf);
                return (
                  <button
                    key={row.etf}
                    type="button"
                    onClick={() => toggleEtf(row.etf)}
                    className={`rounded px-2 py-1 text-xs font-medium transition ${active ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/30" : "bg-fs-elevated/50 text-fs-muted hover:text-fs-text"}`}
                    aria-pressed={active}
                    title={`${row.label} ${row.etf}`}
                  >
                    {row.etf}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="flex items-center gap-1.5 border-l border-fs-border pl-3">
            <button
              type="button"
              onClick={clearStage}
              className={`rounded px-2 py-1 text-xs transition ${period == null ? "bg-fs-elevated text-fs-text" : "text-fs-muted hover:text-fs-text"}`}
              aria-pressed={period == null}
            >
              全历史
            </button>
            <span className="text-xs text-fs-muted">
              {period ? `${period.shortLabel} · ${period.label}` : "1998-12 至今 · SPY + 11 个行业 ETF"}
            </span>
          </div>
        </div>
      </header>

      <div className="border-b border-fs-border bg-fs-bg/20 px-3 pt-2 sm:px-5">
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

      <SectorRegimeForwardStudyPanel />
      <SectorRegimeLiveLedgerPanel />

      <div className="border-b border-fs-border bg-fs-elevated/30 px-4 py-2 text-xs text-fs-muted sm:px-5">
        横向历史阶段 · 点击任一阶段，主图会缩放到对应窗口；卡片按相对 SPY 的超额收益排序，并固定列出全部 11 个行业。
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-max items-stretch divide-x divide-fs-border">
          {SECTOR_HISTORICAL_PERIODS.map((item, index) => {
            const data = periodData[item.id];
            const active = item.id === selectedId;
            return (
              <article
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => selectStage(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectStage(item.id);
                  }
                }}
                className={`relative w-[25rem] shrink-0 cursor-pointer px-4 py-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fs-accent ${active ? "bg-fs-accent-soft/35" : "bg-fs-bg/10 hover:bg-fs-elevated/35"}`}
                aria-pressed={active}
                aria-label={`阶段 ${index + 1}：${item.label}`}
              >
                <span className={`absolute inset-x-0 top-0 h-0.5 ${active ? "bg-fs-accent" : "bg-transparent"}`} />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-fs-muted">阶段 {String(index + 1).padStart(2, "0")}</div>
                    <h2 className="mt-1 min-h-10 text-sm font-semibold leading-5 text-fs-text">{item.label}</h2>
                  </div>
                  <span className="shrink-0 rounded border border-fs-border bg-fs-elevated/60 px-1.5 py-0.5 text-[11px] text-fs-muted">{item.shortLabel}</span>
                </div>

                <div className="mt-2 text-[11px] tabular-nums text-fs-muted">
                  收益窗口 · {item.start} → {periodEnd(item)}
                </div>

                <div className="mt-3 border-l-2 border-fs-accent/50 pl-2.5">
                  <div className="text-[11px] text-fs-muted">宏观主线</div>
                  <p className="mt-1 text-xs leading-5 text-fs-text">{item.macro}</p>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-fs-border/70 bg-fs-elevated/25 p-2.5 text-[11px]">
                  <div><dt className="text-fs-muted">增长</dt><dd className="mt-0.5 leading-4 text-fs-text">{item.regime.growth}</dd></div>
                  <div><dt className="text-fs-muted">通胀</dt><dd className="mt-0.5 leading-4 text-fs-text">{item.regime.inflation}</dd></div>
                  <div><dt className="text-fs-muted">政策</dt><dd className="mt-0.5 leading-4 text-fs-text">{item.regime.policy}</dd></div>
                  <div><dt className="text-fs-muted">信用</dt><dd className="mt-0.5 leading-4 text-fs-text">{item.regime.credit}</dd></div>
                </dl>

                <div className="mt-3">
                  <div className="text-[11px] text-fs-muted">关键事件与影响</div>
                  <ol className="mt-1.5 space-y-2">
                    {item.events.map((event) => (
                      <li key={`${event.date}-${event.title}`} className="grid grid-cols-[4.8rem_1fr] gap-2 text-[11px] leading-4">
                        <span className="tabular-nums text-fs-muted">{event.date}</span>
                        <span className="text-fs-text"><strong className="font-medium">{event.title}</strong><span className="text-fs-muted"> · {event.impact}</span></span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="mt-3 overflow-hidden rounded-lg border border-fs-border/80">
                  <div className="grid grid-cols-[2rem_1fr_4.2rem_4.2rem] items-center bg-fs-elevated/55 px-2 py-1.5 text-[10px] text-fs-muted">
                    <span>排名</span><span>行业指数</span><span className="text-right">收益</span><span className="text-right">超额</span>
                  </div>
                  <div className="grid grid-cols-[2rem_1fr_4.2rem_4.2rem] items-center border-t border-fs-border/70 bg-fs-bg/20 px-2 py-1.5 text-xs">
                    <span className="text-fs-muted">—</span><span className="text-fs-text">标普 500 <span className="text-fs-muted">SPY</span></span><span className={`text-right font-medium tabular-nums ${valueClass(data.spyReturn)}`}>{pct(data.spyReturn)}</span><span className="text-right tabular-nums text-fs-muted">基准</span>
                  </div>
                  <ol>
                    {data.sectors.map((row, rank) => (
                      <li key={row.sector} className="grid grid-cols-[2rem_1fr_4.2rem_4.2rem] items-center border-t border-fs-border/55 px-2 py-1.5 text-xs">
                        <span className="tabular-nums text-fs-muted">{row.absoluteReturn == null ? "—" : rank + 1}</span>
                        <span className="min-w-0 truncate text-fs-text">{row.nameZh} <span className="text-fs-muted">{row.etf}</span></span>
                        <span className={`text-right tabular-nums ${valueClass(row.absoluteReturn)}`}>{pct(row.absoluteReturn)}</span>
                        <span className={`text-right tabular-nums ${valueClass(row.excessVsSpy)}`}>{pct(row.excessVsSpy)}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="border-t border-fs-border/70 px-2 py-1.5 text-[10px] text-fs-muted">
                    可比样本 {data.availableCount}/11 · “—”表示 ETF 尚未上市或区间不足
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-fs-elevated/30 p-2.5">
                  <div className="text-[11px] text-fs-muted">行业传导机制：为什么会强 / 弱</div>
                  <p className="mt-1 text-[11px] leading-[1.1rem] text-fs-text">{item.mechanism}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="mr-0.5 text-[10px] text-fs-muted">理论受益</span>
                    {item.expectedLeaders.map((leader) => (
                      <span key={leader} className="rounded bg-fs-accent-soft px-1.5 py-0.5 text-[10px] text-fs-accent-text">{leader}</span>
                    ))}
                  </div>
                </div>

                {item.caveat ? <p className="mt-2 text-[10px] leading-4 text-amber-300/80">注：{item.caveat}</p> : null}
              </article>
            );
          })}
        </div>
      </div>

      <footer className="border-t border-fs-border px-4 py-2 text-[11px] leading-4 text-fs-muted sm:px-5">
        口径：SPY 与 Sector SPDR ETF 前复权日线，按阶段内首尾可得交易日计算总收益；超额 = 行业收益 − SPY 收益。阶段依据 NBER 周期、FOMC 政策、信用事件与市场主线转折划分，不按事后行业赢家反推边界，也不把 ETF 上市前的缺失期补造成历史结论。
      </footer>
    </section>
  );
}
