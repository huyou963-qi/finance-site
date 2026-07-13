"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RoeDupontChart,
  StockFundamentalTrend,
  ValuationBandChart,
  type FundamentalQuarterPoint,
  type RatioPoint,
  type ValuationBandPoint,
} from "@/components/equity/StockFundamentalCharts";

// ---------------------------------------------------------------------------
// 类型（与 /api/equity/stocks/[symbol]/fundamentals、/peers 响应对齐）
// ---------------------------------------------------------------------------

type StatementRow = FundamentalQuarterPoint & {
  netIncome: number | null;
  dividendsPaid: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  equity: number | null;
  longTermDebt: number | null;
  cash: number | null;
  sharesOutstanding: number | null;
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
// 格式化
// ---------------------------------------------------------------------------

function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtRatio(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function fmtSignedPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function fmtPp(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}pp`;
}

function signClass(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-fs-muted";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-fs-muted";
}

// ---------------------------------------------------------------------------
// 报表明细行定义
// ---------------------------------------------------------------------------

type LineKind = "money" | "pct" | "eps";
type LineDef = { label: string; kind: LineKind; sel: (r: StatementRow) => number | null };
type SectionDef = { section: string; lines: LineDef[] };

const STATEMENT_SECTIONS: SectionDef[] = [
  {
    section: "利润表",
    lines: [
      { label: "营收", kind: "money", sel: (r) => r.revenue },
      { label: "净利润", kind: "money", sel: (r) => r.netIncome },
      { label: "稀释 EPS", kind: "eps", sel: (r) => r.eps },
      { label: "毛利率", kind: "pct", sel: (r) => r.grossMargin },
      { label: "营业利润率", kind: "pct", sel: (r) => r.opMargin },
      { label: "净利率", kind: "pct", sel: (r) => r.netMargin },
    ],
  },
  {
    section: "资产负债表",
    lines: [
      { label: "总资产", kind: "money", sel: (r) => r.totalAssets },
      { label: "总负债", kind: "money", sel: (r) => r.totalLiabilities },
      { label: "股东权益", kind: "money", sel: (r) => r.equity },
      { label: "长期债务", kind: "money", sel: (r) => r.longTermDebt },
      { label: "现金及等价物", kind: "money", sel: (r) => r.cash },
      { label: "流通股本", kind: "money", sel: (r) => r.sharesOutstanding },
    ],
  },
  {
    section: "现金流量表",
    lines: [
      { label: "经营现金流", kind: "money", sel: (r) => r.ocf },
      { label: "资本开支", kind: "money", sel: (r) => r.capex },
      { label: "自由现金流", kind: "money", sel: (r) => r.fcf },
      { label: "分红支付", kind: "money", sel: (r) => r.dividendsPaid },
    ],
  },
];

function statementCell(
  rows: StatementRow[],
  i: number,
  line: LineDef,
  valueMode: "value" | "yoy",
  yoyLag: number,
): { text: string; cls: string } {
  const v = line.sel(rows[i]!);
  if (valueMode === "value") {
    if (line.kind === "pct") return { text: fmtPct(v), cls: "text-fs-text" };
    if (line.kind === "eps") return { text: fmtRatio(v, 2), cls: "text-fs-text" };
    return { text: fmtMoney(v), cls: "text-fs-text" };
  }
  const j = i - yoyLag;
  if (j < 0) return { text: "—", cls: "text-fs-muted" };
  const prev = line.sel(rows[j]!);
  if (line.kind === "pct") {
    const d = v != null && prev != null ? v - prev : null;
    return { text: fmtPp(d), cls: signClass(d) };
  }
  if (v == null || prev == null || prev <= 0) return { text: "—", cls: "text-fs-muted" };
  const d = v / prev - 1;
  return { text: fmtSignedPct(d), cls: signClass(d) };
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

  const [tab, setTab] = useState<TabId>("overview");
  const [viewMode, setViewMode] = useState<"Q" | "FY">("Q");
  const [valueMode, setValueMode] = useState<"value" | "yoy">("value");

  const [peers, setPeers] = useState<PeerRow[] | null>(null);
  const [peersLoading, setPeersLoading] = useState(false);
  const [peersError, setPeersError] = useState<string | null>(null);
  const [peerSort, setPeerSort] = useState<{ key: PeerSortKey; desc: boolean }>({
    key: "marketCap",
    desc: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/equity/stocks/${encodeURIComponent(symbol)}/fundamentals`, {
          cache: "no-store",
        });
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
        const j = (await r.json()) as { error?: string; peers?: PeerRow[] };
        if (!r.ok) throw new Error(j.error ?? "同业数据加载失败");
        if (!cancelled) setPeers(j.peers ?? []);
      } catch (e) {
        if (!cancelled) setPeersError(e instanceof Error ? e.message : "同业数据加载失败");
      } finally {
        if (!cancelled) setPeersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // peersLoading 不进依赖：setPeersLoading(true) 会触发自身清理、丢弃 fetch 结果
  }, [tab, peers, symbol]);

  const lastRatio = data?.ratios.length ? data.ratios[data.ratios.length - 1]! : null;

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

  const statementRows = viewMode === "Q" ? (data?.quarters ?? []) : (data?.fiscalYears ?? []);
  const yoyLag = viewMode === "Q" ? 4 : 1;

  const kpis: [string, string, string?][] = lastRatio
    ? [
        ["ROE (TTM)", fmtPct(lastRatio.roeTtm)],
        ["ROA (TTM)", fmtPct(lastRatio.roaTtm)],
        ["净利率 (TTM)", fmtPct(lastRatio.netMarginTtm)],
        ["资产负债率", fmtPct(lastRatio.debtRatio)],
        ["净债务", fmtMoney(lastRatio.netDebt)],
        ["派息率 (TTM)", fmtPct(lastRatio.payoutRatioTtm)],
        ["近 4 季回购", fmtSignedPct(lastRatio.buybackRate)],
        [
          "PE 历史分位",
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-fs-border bg-fs-elevated/40 px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">基本面（SEC EDGAR · 三表标准化）</span>
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
        {data?.ttm ? (
          <span className="text-[11px] text-fs-muted">
            TTM 覆盖 {data.ttm.periods[0]} – {data.ttm.periods[3]}
          </span>
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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {(
                    [
                      [
                        "市值",
                        `${fmtMoney(data.valuation.marketCap)}${data.valuation.marketCapSource === "profile" ? "*" : ""}`,
                      ],
                      ["PE (TTM)", fmtRatio(data.valuation.peTtm)],
                      ["PB", fmtRatio(data.valuation.pb)],
                      ["PS (TTM)", fmtRatio(data.valuation.psTtm)],
                      ["EV", fmtMoney(data.valuation.ev)],
                      [
                        "FCF 收益率 / 股息率",
                        `${fmtPct(data.valuation.fcfYield)} / ${fmtPct(data.valuation.dividendYield)}`,
                      ],
                    ] as const
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2"
                    >
                      <div className="text-[11px] text-fs-muted">{label}</div>
                      <div className="mt-0.5 text-sm font-medium text-fs-text tabular-nums">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <StockFundamentalTrend quarters={data.quarters} />

              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <div className="px-1 pb-1 text-xs text-fs-muted">盈利能力与杜邦分解（TTM）</div>
                  <RoeDupontChart ratios={data.ratios} />
                </div>
                <div>
                  <div className="flex items-baseline justify-between px-1 pb-1">
                    <span className="text-xs text-fs-muted">估值历史带（约 5 年）</span>
                    {data.valuationHistory?.pePercentile != null ? (
                      <span className="text-[11px] text-fs-muted">
                        当前 PE {fmtRatio(data.valuationHistory.peCurrent)} · 分位{" "}
                        {(data.valuationHistory.pePercentile * 100).toFixed(0)}%
                        {data.valuationHistory.pbPercentile != null
                          ? ` · PB 分位 ${(data.valuationHistory.pbPercentile * 100).toFixed(0)}%`
                          : ""}
                      </span>
                    ) : null}
                  </div>
                  {data.valuationHistory && data.valuationHistory.points.length >= 8 ? (
                    <ValuationBandChart points={data.valuationHistory.points} />
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
                        const rows: [string, number | null, number | null][] = [
                          ["营收 YoY", last.revenueYoY, m.revenueYoYMedian],
                          ["毛利率", last.grossMargin, m.grossMarginMedian],
                          ["营业利润率", last.opMargin, m.opMarginMedian],
                          ["净利率", last.netMargin, m.netMarginMedian],
                        ];
                        return rows.map(([label, own, med]) => (
                          <tr key={label} className="border-t border-fs-border/50">
                            <td className="px-3 py-1.5 text-fs-text">{label}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-fs-text">
                              {fmtPct(own)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-fs-muted">
                              {fmtPct(med)}
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
                      ["Q", "季度"],
                      ["FY", "年度"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setViewMode(id)}
                      className={`rounded px-2 py-0.5 text-xs transition-colors ${
                        viewMode === id
                          ? "bg-fs-accent/20 text-fs-accent-text"
                          : "text-fs-muted hover:text-fs-text"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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

              <div className="overflow-x-auto rounded-md border border-fs-border/60">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs text-fs-muted">
                    <tr>
                      <th className="sticky left-0 bg-fs-bg px-3 py-1.5">科目</th>
                      {statementRows.map((r) => (
                        <th key={r.period} className="px-3 py-1.5 text-right" title={r.fiscalDate}>
                          {r.period}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {STATEMENT_SECTIONS.map((sec) => (
                      <SectionRows
                        key={sec.section}
                        section={sec}
                        rows={statementRows}
                        valueMode={valueMode}
                        yoyLag={yoyLag}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
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
                          <span className="font-medium text-fs-text">{p.symbol}</span>
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

          <p className="text-[11px] leading-relaxed text-fs-muted">
            数据源 SEC EDGAR companyfacts（US-GAAP XBRL），跨公司报表栏目已标准化到统一科目；
            财年错位公司的 Q4 由年报差分推导，拆股后 EPS/股本已统一到最新口径；
            估值历史按财报披露滞后 40 天计算避免前视。金融公司无毛利率/资本开支为正常现象；
            市值带 * 表示来自主档缓存（股本缺失）。TTM/比率均为读取时计算。
          </p>
        </div>
      )}
    </section>
  );
}

function SectionRows({
  section,
  rows,
  valueMode,
  yoyLag,
}: {
  section: SectionDef;
  rows: StatementRow[];
  valueMode: "value" | "yoy";
  yoyLag: number;
}) {
  return (
    <>
      <tr className="border-t border-fs-border/50 bg-fs-elevated/30">
        <td colSpan={rows.length + 1} className="px-3 py-1 text-[11px] font-medium text-fs-muted">
          {section.section}
        </td>
      </tr>
      {section.lines.map((line) => (
        <tr key={line.label} className="border-t border-fs-border/40">
          <td className="sticky left-0 whitespace-nowrap bg-fs-bg px-3 py-1.5 text-fs-text">
            {line.label}
          </td>
          {rows.map((_, i) => {
            const { text, cls } = statementCell(rows, i, line, valueMode, yoyLag);
            return (
              <td key={rows[i]!.period} className={`px-3 py-1.5 text-right tabular-nums ${cls}`}>
                {text}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
