"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SectorNavChart } from "@/components/equity/SectorCharts";
import { StockEventsPanel } from "@/components/equity/StockEventsPanel";
import { StockFundamentalsPanel } from "@/components/equity/StockFundamentalsPanel";
import {
  StockPriceChart,
  type ChartEarningsMark,
  type StockPriceBar,
} from "@/components/equity/StockPriceChart";

type WindowRow = {
  id: string;
  labelZh: string;
  absoluteReturn: number | null;
  excessVsSpy: number | null;
  excessVsSectorEtf: number | null;
  excessVsIndustry: number | null;
};

type NavSeries = { key: string; name: string; points: { time: number; value: number }[] };

const RANGE_PRESETS = [
  { id: "3M", labelZh: "3个月", calendarDays: 92 },
  { id: "6M", labelZh: "6个月", calendarDays: 183 },
  { id: "1Y", labelZh: "1年", calendarDays: 365 },
  { id: "2Y", labelZh: "2年", calendarDays: 730 },
] as const;

type RangeId = (typeof RANGE_PRESETS)[number]["id"];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(2)}%`;
}

function pctClass(v: number | null | undefined): string {
  if (v == null) return "text-fs-muted";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-fs-muted";
}

function fmtCap(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toLocaleString();
}

export function StockDetailClient({
  symbol,
  name,
  sectorSlug,
  sectorNameZh,
  industrySlug,
  industryName,
  gicsSubIndustry,
  marketCap,
}: {
  symbol: string;
  name: string;
  // 全美股未分类成分 sectorSlug/sectorNameZh 为 null
  sectorSlug: string | null;
  sectorNameZh: string | null;
  industrySlug: string | null;
  industryName: string | null;
  gicsSubIndustry: string | null;
  marketCap: number | null;
}) {
  const [rangeId, setRangeId] = useState<RangeId>("1Y");
  const [windows, setWindows] = useState<WindowRow[]>([]);
  const [bars, setBars] = useState<StockPriceBar[]>([]);
  const [series, setSeries] = useState<NavSeries[]>([]);
  const [rangeReturns, setRangeReturns] = useState<{
    absoluteReturn: number | null;
    excessVsSpy: number | null;
    excessVsSectorEtf: number | null;
    excessVsIndustry: number | null;
  } | null>(null);
  const [priceSource, setPriceSource] = useState<string | null>(null);
  const [earningsMarks, setEarningsMarks] = useState<ChartEarningsMark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // K 线业绩打点：季报/年报事件（低频，与行情并行加载，失败静默）
  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/equity/stocks/${encodeURIComponent(symbol)}/events?types=earnings,annual&limit=40`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) return [];
        const j = (await r.json()) as {
          events?: {
            date: string;
            titleZh: string;
            reaction: number | null;
            metrics: { period: string; revenueYoY: number | null; eps: number | null } | null;
          }[];
        };
        return (j.events ?? []).map((e) => {
          const parts = [e.metrics?.period ?? e.titleZh];
          if (e.metrics?.revenueYoY != null)
            parts.push(`营收 ${fmtPct(e.metrics.revenueYoY)}`);
          if (e.metrics?.eps != null) parts.push(`EPS ${e.metrics.eps.toFixed(2)}`);
          if (e.reaction != null) parts.push(`T+1 ${fmtPct(e.reaction)}`);
          return { date: e.date, labelZh: parts.join(" · ") };
        });
      })
      .then((marks) => {
        if (!cancelled) setEarningsMarks(marks);
      })
      .catch(() => {
        if (!cancelled) setEarningsMarks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const loadProfile = useCallback(async () => {
    const r = await fetch(`/api/equity/stocks/${encodeURIComponent(symbol)}/profile`, {
      cache: "no-store",
    });
    const j = (await r.json()) as { error?: string; windows?: WindowRow[] };
    if (!r.ok) throw new Error(j.error ?? "加载失败");
    setWindows(j.windows ?? []);
  }, [symbol]);

  const loadRange = useCallback(async () => {
    const preset = RANGE_PRESETS.find((p) => p.id === rangeId) ?? RANGE_PRESETS[2];
    const from = isoDaysAgo(preset.calendarDays);
    const to = todayIso();
    const tradingDays = Math.min(Math.ceil(preset.calendarDays * (5 / 7)) + 10, 1260);

    const [pricesRes, relRes] = await Promise.all([
      fetch(`/api/equity/stocks/${encodeURIComponent(symbol)}/prices?days=${tradingDays}`, {
        cache: "no-store",
      }),
      fetch(
        `/api/equity/stocks/${encodeURIComponent(symbol)}/relative?from=${from}&to=${to}`,
        { cache: "no-store" },
      ),
    ]);
    const pricesJson = (await pricesRes.json()) as {
      error?: string;
      bars?: StockPriceBar[];
      priceSource?: string | null;
    };
    const relJson = (await relRes.json()) as {
      error?: string;
      series?: NavSeries[];
      returns?: {
        absoluteReturn: number | null;
        excessVsSpy: number | null;
        excessVsSectorEtf: number | null;
        excessVsIndustry: number | null;
      };
    };
    if (!pricesRes.ok) throw new Error(pricesJson.error ?? "行情加载失败");
    if (!relRes.ok) throw new Error(relJson.error ?? "相对强弱加载失败");

    setBars(pricesJson.bars ?? []);
    setPriceSource(pricesJson.priceSource ?? null);
    setSeries(relJson.series ?? []);
    setRangeReturns(relJson.returns ?? null);
  }, [symbol, rangeId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadProfile(), loadRange()]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProfile, loadRange]);


  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-3 sm:px-4">
      <div className="text-xs text-fs-muted">
        <Link href="/equity/sectors" className="hover:text-fs-accent-text">
          美股行业
        </Link>
        <span className="mx-1">/</span>
        {sectorSlug && sectorNameZh ? (
          <Link
            href={`/equity/sectors/${encodeURIComponent(sectorSlug)}`}
            className="hover:text-fs-accent-text"
          >
            {sectorNameZh}
          </Link>
        ) : (
          <span>未分类</span>
        )}
        {sectorSlug && industrySlug && industryName ? (
          <>
            <span className="mx-1">/</span>
            <Link
              href={`/equity/sectors/${encodeURIComponent(sectorSlug)}/industries/${encodeURIComponent(industrySlug)}`}
              className="hover:text-fs-accent-text"
            >
              {industryName}
            </Link>
          </>
        ) : null}
        <span className="mx-1">/</span>
        <span className="text-fs-text">{symbol}</span>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-fs-text">
            {symbol}
            <span className="ml-2 text-sm font-normal text-fs-muted">{name}</span>
          </h1>
          <p className="mt-0.5 text-sm text-fs-muted">
            {gicsSubIndustry ?? industryName ?? sectorNameZh ?? "美股"}
            {marketCap != null ? ` · 市值 ${fmtCap(marketCap)}` : ""}
            {priceSource ? ` · 行情 ${priceSource}` : ""}
          </p>
        </div>
        <Link
          href={`/markets?symbol=${encodeURIComponent(symbol)}`}
          className="text-xs text-fs-accent-text hover:underline"
        >
          在行情工作台打开 →
        </Link>
      </header>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <section className="overflow-x-auto rounded-md border border-fs-border">
        <div className="border-b border-fs-border bg-fs-elevated/40 px-3 py-2 text-sm font-medium">
          区间收益（个股 vs 基准）
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs text-fs-muted">
            <tr>
              <th className="px-3 py-2">窗口</th>
              <th className="px-3 py-2 text-right">绝对收益</th>
              <th className="px-3 py-2 text-right">相对 SPY</th>
              <th className="px-3 py-2 text-right">相对 Sector ETF</th>
              <th className="px-3 py-2 text-right">相对 Industry 等权</th>
            </tr>
          </thead>
          <tbody>
            {windows.map((w) => (
              <tr key={w.id} className="border-t border-fs-border/60">
                <td className="px-3 py-2 text-fs-text">{w.labelZh}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${pctClass(w.absoluteReturn)}`}>
                  {loading ? "…" : fmtPct(w.absoluteReturn)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${pctClass(w.excessVsSpy)}`}>
                  {loading ? "…" : fmtPct(w.excessVsSpy)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${pctClass(w.excessVsSectorEtf)}`}
                >
                  {loading ? "…" : fmtPct(w.excessVsSectorEtf)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${pctClass(w.excessVsIndustry)}`}
                >
                  {loading ? "…" : fmtPct(w.excessVsIndustry)}
                </td>
              </tr>
            ))}
            {!loading && windows.length === 0 ? (
              <tr className="border-t border-fs-border/60">
                <td colSpan={5} className="px-3 py-3 text-center text-fs-muted">
                  暂无数据
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="rounded-md border border-fs-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-fs-border bg-fs-elevated/40 px-3 py-2">
          <span className="text-sm font-medium">走势</span>
          <div className="flex items-center gap-1">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setRangeId(p.id)}
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  rangeId === p.id
                    ? "bg-fs-accent/20 text-fs-accent-text"
                    : "text-fs-muted hover:text-fs-text"
                }`}
              >
                {p.labelZh}
              </button>
            ))}
          </div>
        </div>
        <div className="px-2 py-2">
          {bars.length >= 2 ? (
            <StockPriceChart bars={bars} earningsMarks={earningsMarks} />
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-fs-muted">
              {loading ? "加载中…" : "暂无行情数据"}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-md border border-fs-border">
        <div className="border-b border-fs-border bg-fs-elevated/40 px-3 py-2 text-sm font-medium">
          相对强弱（归一化净值，起点=100）
        </div>
        {rangeReturns ? (
          <div className="grid grid-cols-2 gap-2 px-3 pt-3 sm:grid-cols-4">
            <div className="rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2">
              <div className="text-[11px] text-fs-muted">区间绝对收益</div>
              <div
                className={`mt-0.5 text-sm font-medium ${pctClass(rangeReturns.absoluteReturn)}`}
              >
                {fmtPct(rangeReturns.absoluteReturn)}
              </div>
            </div>
            <div className="rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2">
              <div className="text-[11px] text-fs-muted">相对 SPY</div>
              <div className={`mt-0.5 text-sm font-medium ${pctClass(rangeReturns.excessVsSpy)}`}>
                {fmtPct(rangeReturns.excessVsSpy)}
              </div>
            </div>
            <div className="rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2">
              <div className="text-[11px] text-fs-muted">相对 Sector ETF</div>
              <div
                className={`mt-0.5 text-sm font-medium ${pctClass(rangeReturns.excessVsSectorEtf)}`}
              >
                {fmtPct(rangeReturns.excessVsSectorEtf)}
              </div>
            </div>
            <div className="rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2">
              <div className="text-[11px] text-fs-muted">相对 Industry 等权</div>
              <div
                className={`mt-0.5 text-sm font-medium ${pctClass(rangeReturns.excessVsIndustry)}`}
              >
                {fmtPct(rangeReturns.excessVsIndustry)}
              </div>
            </div>
          </div>
        ) : null}
        <div className="px-2 py-2">
          {series.length >= 2 ? (
            <SectorNavChart
              series={series.map((s) => ({ name: s.name, data: s.points }))}
            />
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-fs-muted">
              {loading ? "加载中…" : "暂无对比数据"}
            </div>
          )}
        </div>
      </section>

      <StockFundamentalsPanel symbol={symbol} />

      <StockEventsPanel symbol={symbol} />
    </div>
  );
}
