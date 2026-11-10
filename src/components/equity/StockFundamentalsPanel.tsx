"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  DimensionChartView,
  ValuationBandChart,
  type FundamentalQuarterPoint,
  type RatioPoint,
  type ValuationBandPoint,
} from "@/components/equity/StockFundamentalCharts";
import {
  formatCompactMoney,
  formatEps,
  formatPct,
  formatPp,
  formatRatio,
  formatMultiplier,
  formatSignedPct,
} from "@/lib/equity/formatFundamentalsDisplay";
import { StockStatementsTable } from "@/components/equity/StockStatementsTable";
import {
  STATEMENT_PROFILE_NAMES,
  type StatementLines,
  type StatementProfile,
} from "@/lib/equity/statementTemplate";
import { buildOverviewDimensions, sliceOverviewDimensions } from "@/lib/equity/overviewDimensions";

// ---------------------------------------------------------------------------
// 类型（与 /api/equity/stocks/[symbol]/fundamentals、/peers 响应对齐）
// ---------------------------------------------------------------------------

type StatementRow = FundamentalQuarterPoint & {
  netIncome: number | null;
  dividendsPaid: number | null;
  buybackPaid: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  equity: number | null;
  longTermDebt: number | null;
  cash: number | null;
  sharesOutstanding: number | null;
  /** 三张报表其余标准化科目 */
  lines?: StatementLines;
  /** 年报行：组内季度标签（升序） */
  quarterPeriods?: string[];
};

type RatioRow = RatioPoint & {
  fiscalDate: string;
  roaTtm: number | null;
  assetTurnoverTtm: number | null;
  debtRatio: number | null;
  netDebt: number | null;
  payoutRatioTtm: number | null;
  buybackRate: number | null;
  bvps: number | null;
  fcfPerShareTtm: number | null;
  epsTtm: number | null;
};

type FundamentalsPayload = {
  quarters: StatementRow[];
  fiscalYears: StatementRow[];
  ratios: RatioRow[];
  ttm: { periods: string[] } | null;
  valuation: {
    price: number | null;
    marketCap: number | null;
    marketCapSource: "shares" | "profile" | null;
    peTtm: number | null;
    pb: number | null;
    psTtm: number | null;
    ev: number | null;
    fcfYield: number | null;
    dividendYield: number | null;
    buybackYield: number | null;
  } | null;
  valuationHistory: {
    points: ValuationBandPoint[];
    peCurrent: number | null;
    pePercentile: number | null;
    peMin: number | null;
    peMax: number | null;
    pbCurrent: number | null;
    pbPercentile: number | null;
  } | null;
  /** 估值带口径：一般为 PE，REIT 为 P/FFO */
  valuationMetric?: "pe" | "pffo";
  /** 按披露科目判定的报表格式 */
  profile?: StatementProfile;
  industry: {
    nameEn: string;
    medians: {
      sampleCount: number;
      revenueYoYMedian: number | null;
      grossMarginMedian: number | null;
      opMarginMedian: number | null;
      netMarginMedian: number | null;
    };
  } | null;
};

type PeerRow = {
  symbol: string;
  name: string;
  marketCap: number | null;
  revenueYoY: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  roeTtm: number | null;
  peTtm: number | null;
  pb: number | null;
  psTtm: number | null;
  latestPeriod: string | null;
};

// ---------------------------------------------------------------------------
// 格式化（金额缩写 / 比率百分比；实现见 formatFundamentalsDisplay）
// ---------------------------------------------------------------------------

const fmtMoney = formatCompactMoney;
const fmtRatio = formatRatio;
const fmtPct = formatPct;
const fmtSignedPct = formatSignedPct;
const fmtPp = formatPp;
const fmtEps = formatEps;

/** 一次载入的季度数，与深历史回填（--quarters=70）对齐 */
const MAX_QUARTERS = 70;
/** 默认展示近 5 年 */
const DEFAULT_QUARTERS = 20;

const DIMENSION_MARKS = ["①", "②", "③", "④", "⑤", "⑥", "⑦"];

function signClass(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-fs-muted";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-fs-muted";
}

// ---------------------------------------------------------------------------
// 面板
// ---------------------------------------------------------------------------

type TabId = "overview" | "statements" | "peers";
type PeerSortKey = keyof Pick<
  PeerRow,
  "marketCap" | "revenueYoY" | "grossMargin" | "netMargin" | "roeTtm" | "peTtm" | "pb" | "psTtm"
>;

export function StockFundamentalsPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<FundamentalsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * 展示区间（按财季末日期，含两端），季报 / 年报共用；null = 默认近 5 年。
   * 一次载入全部历史（与深回填 70 季对齐），切换区间不再请求。
   */
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  const [tab, setTab] = useState<TabId>("overview");
  const [viewMode, setViewMode] = useState<"Q" | "FY">("Q");
  const [valueMode, setValueMode] = useState<"value" | "yoy">("value");

  const [peers, setPeers] = useState<PeerRow[] | null>(null);
  const [peerUniverseCount, setPeerUniverseCount] = useState<number | null>(null);
  const [peersLoading, setPeersLoading] = useState(false);
  const [peersError, setPeersError] = useState<string | null>(null);
  const [peerSort, setPeerSort] = useState<{ key: PeerSortKey; desc: boolean }>({
    key: "marketCap",
    desc: true,
  });
  /** Forward PE（FMP estimates；与行情叠加同源） */
  const [forwardPe, setForwardPe] = useState<number | null>(null);
  const [forwardEps, setForwardEps] = useState<number | null>(null);
  const [forwardPeError, setForwardPeError] = useState<string | null>(null);

  useEffect(() => {
    setRange(null);
    setPeers(null);
    setPeerUniverseCount(null);
    setForwardPe(null);
    setForwardEps(null);
    setForwardPeError(null);
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setForwardPeError(null);
      try {
        const r = await fetch(
          `/api/data/forward-pe?symbol=${encodeURIComponent(symbol)}`,
          { cache: "no-store" },
        );
        const j = (await r.json().catch(() => ({}))) as {
          error?: string;
          timeline?: { date: string; forwardEps: number }[];
        };
        if (!r.ok) throw new Error(j.error ?? `${r.status}`);
        const timeline = j.timeline ?? [];
        if (!timeline.length) throw new Error("无 Forward EPS");
        const latest = timeline[timeline.length - 1]!;
        if (cancelled) return;
        setForwardEps(latest.forwardEps);
      } catch (e) {
        if (cancelled) return;
        setForwardEps(null);
        setForwardPe(null);
        setForwardPeError(e instanceof Error ? e.message : "Forward PE 不可用");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => {
    const price = data?.valuation?.price;
    if (price != null && price > 0 && forwardEps != null && forwardEps > 0) {
      setForwardPe(price / forwardEps);
    } else if (forwardEps == null) {
      setForwardPe(null);
    }
  }, [data?.valuation?.price, forwardEps]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ quarters: String(MAX_QUARTERS) });
        const r = await fetch(
          `/api/equity/stocks/${encodeURIComponent(symbol)}/fundamentals?${qs}`,
          { cache: "no-store" },
        );
        const j = (await r.json()) as FundamentalsPayload & { error?: string };
        if (!r.ok) throw new Error(j.error ?? "基本面加载失败");
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "基本面加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => {
    if (tab !== "peers" || peers != null) return;
    let cancelled = false;
    (async () => {
      setPeersLoading(true);
      setPeersError(null);
      try {
        const r = await fetch(`/api/equity/stocks/${encodeURIComponent(symbol)}/peers`, {
          cache: "no-store",
        });
        const j = (await r.json()) as {
          error?: string;
          peers?: PeerRow[];
          industry?: { peerCount?: number };
        };
        if (!r.ok) throw new Error(j.error ?? "同业数据加载失败");
        if (!cancelled) {
          setPeers(j.peers ?? []);
          setPeerUniverseCount(j.industry?.peerCount ?? j.peers?.length ?? null);
        }
      } catch (e) {
        if (!cancelled) setPeersError(e instanceof Error ? e.message : "同业数据加载失败");
      } finally {
        if (!cancelled) setPeersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, peers, symbol]);

  const lastRatio = data?.ratios.length ? data.ratios[data.ratios.length - 1]! : null;
  const profile: StatementProfile = data?.profile ?? "general";
  const isFinancial = profile === "bank" || profile === "insurer" || profile === "broker";
  const valuationLabel = data?.valuationMetric === "pffo" ? "P/FFO" : "PE";

  const periodRows: StatementRow[] = useMemo(
    () => (viewMode === "Q" ? (data?.quarters ?? []) : (data?.fiscalYears ?? [])),
    [data, viewMode],
  );

  /** 默认近 5 年：起点 = 倒数第 20 季的季末 */
  const effectiveRange = useMemo(() => {
    if (range) return range;
    const qs = data?.quarters ?? [];
    if (!qs.length) return null;
    return { from: qs[Math.max(0, qs.length - DEFAULT_QUARTERS)]!.fiscalDate, to: qs[qs.length - 1]!.fiscalDate };
  }, [range, data]);

  /** 当前频率下区间对应的行下标 [start, end] */
  const [rangeStart, rangeEnd] = useMemo(() => {
    if (!effectiveRange || !periodRows.length) return [0, Math.max(0, periodRows.length - 1)];
    let start = periodRows.findIndex((r) => r.fiscalDate >= effectiveRange.from);
    let end = -1;
    periodRows.forEach((r, i) => {
      if (r.fiscalDate <= effectiveRange.to) end = i;
    });
    if (start < 0) start = periodRows.length - 1;
    if (end < start) end = start;
    return [start, end];
  }, [effectiveRange, periodRows]);

  /** 年报的起点取该财年第一季的季末，切回季报时区间不缩水 */
  const startBound = useCallback(
    (row: StatementRow): string => {
      if (viewMode === "Q") return row.fiscalDate;
      const firstQ = row.quarterPeriods?.[0];
      return data?.quarters.find((q) => q.period === firstQ)?.fiscalDate ?? row.fiscalDate;
    },
    [data, viewMode],
  );

  const dimensions = useMemo(() => {
    if (!data || !periodRows.length) return null;
    // 在全量序列上算 TTM / 同比，再截区间
    return sliceOverviewDimensions(buildOverviewDimensions(periodRows, profile, viewMode), rangeStart, rangeEnd);
  }, [data, periodRows, profile, viewMode, rangeStart, rangeEnd]);

  const valuationPoints = useMemo(() => {
    const pts = data?.valuationHistory?.points ?? [];
    if (!periodRows.length) return pts;
    const fromSec = Date.parse(`${startBound(periodRows[rangeStart]!)}T00:00:00Z`) / 1000;
    // 区间止于最新一期时画到今天；否则画到期末后一季（财报披露滞后）
    const toSec =
      rangeEnd >= periodRows.length - 1
        ? Infinity
        : Date.parse(`${periodRows[rangeEnd]!.fiscalDate}T00:00:00Z`) / 1000 + 90 * 86_400;
    return pts.filter((p) => p.t >= fromSec && p.t <= toSec);
  }, [data, periodRows, rangeStart, rangeEnd, startBound]);

  const sortedPeers = useMemo(() => {
    if (!peers) return null;
    const { key, desc } = peerSort;
    return [...peers].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return desc ? bv - av : av - bv;
    });
  }, [peers, peerSort]);

  const yoyLag = viewMode === "Q" ? 4 : 1;

  const kpis: [string, string, string?][] = lastRatio
    ? [
        ["ROE (TTM)", fmtPct(lastRatio.roeTtm)],
        ["ROA (TTM)", fmtPct(lastRatio.roaTtm)],
        ["净利率 (TTM)", fmtPct(lastRatio.netMarginTtm)],
        ["资产负债率", fmtPct(lastRatio.debtRatio)],
        // 金融公司的负债主要是存款、保单与客户资金，净债务没有意义，改看杠杆
        isFinancial
          ? ["杠杆（总资产/权益）", formatMultiplier(lastRatio.equityMultiplier)]
          : ["净债务", fmtMoney(lastRatio.netDebt)],
        ["派息率 (TTM)", fmtPct(lastRatio.payoutRatioTtm)],
        ["近 4 季回购", fmtSignedPct(lastRatio.buybackRate)],
        [
          `${valuationLabel} 历史分位`,
          data?.valuationHistory?.pePercentile != null
            ? `${(data.valuationHistory.pePercentile * 100).toFixed(0)}%`
            : "—",
          data?.valuationHistory?.peMin != null && data?.valuationHistory?.peMax != null
            ? `区间 ${data.valuationHistory.peMin.toFixed(1)}–${data.valuationHistory.peMax.toFixed(1)}`
            : undefined,
        ],
      ]
    : [];

  const peerCols: { key: PeerSortKey; label: string; fmt: (r: PeerRow) => string; cls?: (r: PeerRow) => string }[] = [
    { key: "marketCap", label: "市值", fmt: (r) => fmtMoney(r.marketCap) },
    { key: "revenueYoY", label: "营收 YoY", fmt: (r) => fmtSignedPct(r.revenueYoY), cls: (r) => signClass(r.revenueYoY) },
    { key: "grossMargin", label: "毛利率", fmt: (r) => fmtPct(r.grossMargin) },
    { key: "netMargin", label: "净利率", fmt: (r) => fmtPct(r.netMargin) },
    { key: "roeTtm", label: "ROE(TTM)", fmt: (r) => fmtPct(r.roeTtm) },
    { key: "peTtm", label: "PE(TTM)", fmt: (r) => fmtRatio(r.peTtm) },
    { key: "pb", label: "PB", fmt: (r) => fmtRatio(r.pb) },
    { key: "psTtm", label: "PS(TTM)", fmt: (r) => fmtRatio(r.psTtm) },
  ];

  return (
    <section className="rounded-md border border-fs-border">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-fs-border bg-fs-bg/95 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">基本面</span>
          <div className="flex items-center gap-1">
            {(
              [
                ["overview", "概览"],
                ["statements", "报表"],
                ["peers", "同业"],
              ] as [TabId, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  tab === id
                    ? "bg-fs-accent/20 text-fs-accent-text"
                    : "text-fs-muted hover:text-fs-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {data && periodRows.length && tab !== "peers" ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center rounded border border-fs-border p-0.5" role="group" aria-label="报告期类型">
              {(
                [
                  ["Q", "季报"],
                  ["FY", "年报"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={viewMode === id}
                  onClick={() => setViewMode(id)}
                  className={`rounded px-2 py-0.5 transition-colors ${
                    viewMode === id ? "bg-fs-accent/20 text-fs-accent-text" : "text-fs-muted hover:text-fs-text"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              aria-label="起始报告期"
              value={rangeStart}
              onChange={(e) => {
                const row = periodRows[Number(e.target.value)]!;
                setRange({ from: startBound(row), to: periodRows[rangeEnd]!.fiscalDate });
              }}
              className="rounded border border-fs-border bg-fs-bg px-1.5 py-1 text-xs text-fs-text tabular-nums"
            >
              {periodRows.map((r, i) => (
                <option key={r.period} value={i} disabled={i > rangeEnd}>
                  {r.period}
                </option>
              ))}
            </select>
            <span className="text-fs-muted">至</span>
            <select
              aria-label="结束报告期"
              value={rangeEnd}
              onChange={(e) => {
                const row = periodRows[Number(e.target.value)]!;
                setRange({ from: startBound(periodRows[rangeStart]!), to: row.fiscalDate });
              }}
              className="rounded border border-fs-border bg-fs-bg px-1.5 py-1 text-xs text-fs-text tabular-nums"
            >
              {periodRows.map((r, i) => (
                <option key={r.period} value={i} disabled={i < rangeStart}>
                  {r.period}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="px-3 py-3 text-sm text-red-300">{error}</div>
      ) : loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-fs-muted">加载中…</div>
      ) : !data || data.quarters.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-fs-muted">
          暂无季度财报数据（可运行 equity:sync-fundamentals -- --period-type=Q 回补）
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-3 py-3">
          {/* KPI 条（各 tab 常驻） */}
          {kpis.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {kpis.map(([label, value, hint]) => (
                <div
                  key={label}
                  className="rounded-md border border-fs-border bg-fs-elevated/40 px-2.5 py-1.5"
                  title={hint}
                >
                  <div className="text-[10px] text-fs-muted">{label}</div>
                  <div className="mt-0.5 text-sm font-medium text-fs-text tabular-nums">{value}</div>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "overview" ? (
            <>
              {data.valuation ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-8">
                  {(
                    [
                      [
                        "市值",
                        `${fmtMoney(data.valuation.marketCap)}${data.valuation.marketCapSource === "profile" ? "*" : ""}`,
                      ],
                      ["PE (TTM)", fmtRatio(data.valuation.peTtm)],
                      [
                        "Forward PE",
                        forwardPe != null
                          ? fmtRatio(forwardPe)
                          : forwardPeError
                            ? "—"
                            : "…",
                      ],
                      ["PB", fmtRatio(data.valuation.pb)],
                      ["PS (TTM)", fmtRatio(data.valuation.psTtm)],
                      ["EV", fmtMoney(data.valuation.ev)],
                      [
                        "FCF 收益率 / 股息率",
                        `${fmtPct(data.valuation.fcfYield)} / ${fmtPct(data.valuation.dividendYield)}`,
                      ],
                      ["回购收益率", fmtPct(data.valuation.buybackYield)],
                    ] as const
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2"
                      title={
                        label === "Forward PE"
                          ? forwardPeError
                            ? "Forward PE 暂时无法计算"
                            : forwardEps != null
                              ? `现价 / 一致预期 EPS ≈ ${forwardEps.toFixed(2)}`
                              : "现价 / 一致预期 EPS"
                          : undefined
                      }
                    >
                      <div className="text-[11px] text-fs-muted">{label}</div>
                      <div className="mt-0.5 text-sm font-medium text-fs-text tabular-nums">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {profile !== "general" ? (
                <p className="text-[11px] text-fs-muted">
                  按「{STATEMENT_PROFILE_NAMES[profile]}」披露格式选取指标；不良率、资本充足率、出租率等不在财报科目内，未展示。
                </p>
              ) : null}

              <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {dimensions?.charts.map((chart) => (
                  <div key={chart.id} className="min-w-0">
                    <DimensionTitle mark={DIMENSION_MARKS[chart.index - 1]!} title={chart.title} note={chart.note} />
                    {chart.series.length ? (
                      <DimensionChartView periods={dimensions.periods} chart={chart} />
                    ) : (
                      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-fs-border text-xs text-fs-muted">
                        该公司未披露所需科目
                      </div>
                    )}
                  </div>
                ))}

                <div className="min-w-0 lg:col-span-2 2xl:col-span-3">
                  <DimensionTitle
                    mark={DIMENSION_MARKS[6]!}
                    title="估值（约 5 年）"
                    note={
                      data.valuationMetric === "pffo"
                        ? "P/FFO = 股价 / TTM 每股 FFO（近似）；REIT 折旧大，PE 失真。财报按季末 + 40 天视为可得，避免前视"
                        : "PE = 股价 / TTM EPS，PB = 股价 / 每股净资产；财报按季末 + 40 天视为可得，避免前视"
                    }
                    extra={
                      data.valuationHistory?.pePercentile != null ? (
                        <>
                          当前 {valuationLabel} {fmtRatio(data.valuationHistory.peCurrent)} · 分位{" "}
                          {(data.valuationHistory.pePercentile * 100).toFixed(0)}%
                          {data.valuationHistory.pbPercentile != null
                            ? ` · PB 分位 ${(data.valuationHistory.pbPercentile * 100).toFixed(0)}%`
                            : ""}
                        </>
                      ) : null
                    }
                  />
                  {data.valuationHistory && data.valuationHistory.points.length >= 8 ? (
                    <ValuationBandChart
                      points={valuationPoints}
                      primaryName={`${valuationLabel} (TTM)`}
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center text-sm text-fs-muted">
                      历史不足
                    </div>
                  )}
                </div>
              </div>

              {data.industry && data.industry.medians.sampleCount >= 3 ? (
                <div className="overflow-x-auto rounded-md border border-fs-border/60">
                  <div className="border-b border-fs-border/60 px-3 py-1.5 text-xs text-fs-muted">
                    最新季度 vs {data.industry.nameEn} 中位数（样本{" "}
                    {data.industry.medians.sampleCount}）· 逐行对比见「同业」页签
                  </div>
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs text-fs-muted">
                      <tr>
                        <th className="px-3 py-1.5">指标</th>
                        <th className="px-3 py-1.5 text-right">{symbol}</th>
                        <th className="px-3 py-1.5 text-right">行业中位数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const last = data.quarters[data.quarters.length - 1]!;
                        const m = data.industry.medians;
                        const rows: [string, number | null, number | null, "signed" | "pct"][] = [
                          ["营收 YoY", last.revenueYoY, m.revenueYoYMedian, "signed"],
                          ["毛利率", last.grossMargin, m.grossMarginMedian, "pct"],
                          ["营业利润率", last.opMargin, m.opMarginMedian, "pct"],
                          ["净利率", last.netMargin, m.netMarginMedian, "pct"],
                        ];
                        return rows.map(([label, own, med, kind]) => (
                          <tr key={label} className="border-t border-fs-border/50">
                            <td className="px-3 py-1.5 text-fs-text">{label}</td>
                            <td
                              className={`px-3 py-1.5 text-right tabular-nums ${
                                kind === "signed" ? signClass(own) : "text-fs-text"
                              }`}
                            >
                              {kind === "signed" ? fmtSignedPct(own) : fmtPct(own)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-fs-muted">
                              {kind === "signed" ? fmtSignedPct(med) : fmtPct(med)}
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : null}

          {tab === "statements" ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  {(
                    [
                      ["value", "数值"],
                      ["yoy", "同比"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setValueMode(id)}
                      className={`rounded px-2 py-0.5 text-xs transition-colors ${
                        valueMode === id
                          ? "bg-fs-accent/20 text-fs-accent-text"
                          : "text-fs-muted hover:text-fs-text"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-fs-muted">
                  {valueMode === "yoy"
                    ? viewMode === "Q"
                      ? "同比 = vs 上年同季；利润率为百分点差"
                      : "同比 = vs 上一财年；利润率为百分点差"
                    : "单位 USD；股本为股数"}
                </span>
              </div>

              <StockStatementsTable
                rows={periodRows}
                valueMode={valueMode}
                yoyLag={yoyLag}
                visibleRange={[rangeStart, rangeEnd]}
              />
            </>
          ) : null}

          {tab === "peers" ? (
            peersError ? (
              <div className="py-3 text-sm text-red-300">{peersError}</div>
            ) : peersLoading || sortedPeers == null ? (
              <div className="flex h-24 items-center justify-center text-sm text-fs-muted">
                加载同业数据…
              </div>
            ) : sortedPeers.length === 0 ? (
              <div className="flex h-24 items-center justify-center text-sm text-fs-muted">
                无同业数据
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-fs-border/60">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs text-fs-muted">
                    <tr>
                      <th className="sticky left-0 bg-fs-bg px-3 py-1.5">代码 / 名称</th>
                      {peerCols.map((c) => (
                        <th
                          key={c.key}
                          className="cursor-pointer select-none whitespace-nowrap px-3 py-1.5 text-right hover:text-fs-text"
                          onClick={() =>
                            setPeerSort((s) =>
                              s.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: true },
                            )
                          }
                        >
                          {c.label}
                          {peerSort.key === c.key ? (peerSort.desc ? " ↓" : " ↑") : ""}
                        </th>
                      ))}
                      <th className="px-3 py-1.5 text-right">最新季</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPeers.map((p) => (
                      <tr
                        key={p.symbol}
                        className={`border-t border-fs-border/40 ${
                          p.symbol === symbol ? "bg-fs-accent/10" : ""
                        }`}
                      >
                        <td className="sticky left-0 whitespace-nowrap bg-fs-bg px-3 py-1.5">
                          {p.symbol === symbol ? (
                            <span className="font-medium text-fs-accent-text">{p.symbol}</span>
                          ) : (
                            <Link
                              href={`/equity/stocks/${encodeURIComponent(p.symbol)}`}
                              className="font-medium text-fs-accent-text hover:underline"
                            >
                              {p.symbol}
                            </Link>
                          )}
                          <span className="ml-2 text-xs text-fs-muted">{p.name}</span>
                        </td>
                        {peerCols.map((c) => (
                          <td
                            key={c.key}
                            className={`px-3 py-1.5 text-right tabular-nums ${
                              c.cls ? c.cls(p) : "text-fs-text"
                            }`}
                          >
                            {c.fmt(p)}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-right text-xs text-fs-muted">
                          {p.latestPeriod ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}

          {tab === "peers" &&
          sortedPeers &&
          peerUniverseCount != null &&
          peerUniverseCount > sortedPeers.length ? (
            <p className="text-[11px] text-fs-muted">
              同业 Industry 共 {peerUniverseCount} 只，本表按市值展示前 {sortedPeers.length}{" "}
              只。
            </p>
          ) : null}

        </div>
      )}
    </section>
  );
}

/** 维度图标题：编号 + 名称；口径说明点开查看（手机无 hover，用 details 而非 title） */
function DimensionTitle({
  mark,
  title,
  note,
  extra,
}: {
  mark: string;
  title: string;
  note?: string;
  extra?: ReactNode;
}) {
  return (
    <details className="group px-1 pb-1">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-2 [&::-webkit-details-marker]:hidden">
        <span className="text-xs text-fs-muted">
          <span className="mr-1 text-fs-text">{mark}</span>
          {title}
          {note ? (
            <span className="ml-1.5 text-[10px] text-fs-muted/70 group-open:text-fs-accent-text">口径</span>
          ) : null}
        </span>
        {extra ? <span className="text-[11px] text-fs-muted">{extra}</span> : null}
      </summary>
      {note ? <p className="mt-1 text-[11px] leading-relaxed text-fs-muted">{note}</p> : null}
    </details>
  );
}
