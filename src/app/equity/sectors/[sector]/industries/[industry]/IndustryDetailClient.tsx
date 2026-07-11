"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Constituent = {
  symbol: string;
  name: string;
  marketCap: number | null;
  gicsSubIndustry: string | null;
  returns: { absoluteReturn: number | null; excessVsSpy: number | null } | null;
};

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

function fmtCap(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toLocaleString();
}

function pctClass(v: number | null | undefined): string {
  if (v == null) return "text-fs-muted";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-fs-muted";
}

function styleLabel(style: string | null | undefined): string {
  if (style === "cyclical") return "周期";
  if (style === "defensive") return "防御";
  if (style === "both") return "两者";
  return "—";
}

export function IndustryDetailClient({
  sectorSlug,
  industrySlug,
}: {
  sectorSlug: string;
  industrySlug: string;
}) {
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(searchParams.get("from") ?? isoDaysAgo(63));
  const [to, setTo] = useState(searchParams.get("to") ?? todayIso());
  const [sectorNameZh, setSectorNameZh] = useState("");
  const [industryName, setIndustryName] = useState("");
  const [style, setStyle] = useState<string | null>(null);
  const [basket, setBasket] = useState<{
    equalWeightReturn: number | null;
    excessVsSpy: number | null;
    spyReturn: number | null;
    coverage: number;
  } | null>(null);
  const [constituents, setConstituents] = useState<Constituent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ from, to });
      const r = await fetch(
        `/api/equity/sectors/${encodeURIComponent(sectorSlug)}/industries/${encodeURIComponent(industrySlug)}/constituents?${q}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as {
        error?: string;
        nameZh?: string;
        industry?: { nameEn: string; style: string };
        basket?: {
          equalWeightReturn: number | null;
          excessVsSpy: number | null;
          spyReturn: number | null;
          coverage: number;
        };
        constituents?: Constituent[];
      };
      if (!r.ok) throw new Error(j.error ?? "加载失败");
      setSectorNameZh(j.nameZh ?? "");
      setIndustryName(j.industry?.nameEn ?? industrySlug);
      setStyle(j.industry?.style ?? null);
      setBasket(j.basket ?? null);
      setConstituents(j.constituents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [sectorSlug, industrySlug, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-3 sm:px-4">
      <div className="text-xs text-fs-muted">
        <Link href="/equity/sectors" className="hover:text-fs-accent-text">
          美股行业
        </Link>
        <span className="mx-1">/</span>
        <Link
          href={`/equity/sectors/${encodeURIComponent(sectorSlug)}`}
          className="hover:text-fs-accent-text"
        >
          {sectorNameZh || sectorSlug}
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-fs-text">{industryName}</h1>
          <p className="mt-0.5 text-sm text-fs-muted">
            GICS Industry · 风格 {styleLabel(style)}
            {loading ? " · 加载中…" : ` · ${constituents.length} 只成分`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label className="text-fs-muted">
            开始
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="ml-1 rounded border border-fs-border bg-white px-1.5 py-0.5 text-fs-text"
            />
          </label>
          <label className="text-fs-muted">
            截止
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="ml-1 rounded border border-fs-border bg-white px-1.5 py-0.5 text-fs-text"
            />
          </label>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {basket ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2">
            <div className="text-[11px] text-fs-muted">等权绝对收益</div>
            <div className={`mt-0.5 text-sm font-medium ${pctClass(basket.equalWeightReturn)}`}>
              {fmtPct(basket.equalWeightReturn)}
            </div>
          </div>
          <div className="rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2">
            <div className="text-[11px] text-fs-muted">相对 SPY</div>
            <div className={`mt-0.5 text-sm font-medium ${pctClass(basket.excessVsSpy)}`}>
              {fmtPct(basket.excessVsSpy)}
            </div>
          </div>
          <div className="rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2">
            <div className="text-[11px] text-fs-muted">SPY</div>
            <div className={`mt-0.5 text-sm font-medium ${pctClass(basket.spyReturn)}`}>
              {fmtPct(basket.spyReturn)}
            </div>
          </div>
          <div className="rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2">
            <div className="text-[11px] text-fs-muted">行情覆盖</div>
            <div className="mt-0.5 text-sm font-medium text-fs-text">
              {(basket.coverage * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      ) : null}

      <section className="overflow-x-auto rounded-md border border-fs-border">
        <div className="border-b border-fs-border bg-fs-elevated/40 px-3 py-2 text-sm font-medium">
          成分股
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs text-fs-muted">
            <tr>
              <th className="px-3 py-2">代码</th>
              <th className="px-3 py-2">名称</th>
              <th className="px-3 py-2">Sub-Industry</th>
              <th className="px-3 py-2 text-right">市值</th>
              <th className="px-3 py-2 text-right">绝对收益</th>
              <th className="px-3 py-2 text-right">相对 SPY</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {constituents.map((c) => (
              <tr key={c.symbol} className="border-t border-fs-border/60">
                <td className="px-3 py-2 font-medium">
                  <Link
                    href={`/equity/stocks/${encodeURIComponent(c.symbol)}`}
                    className="text-fs-text hover:text-fs-accent-text hover:underline"
                  >
                    {c.symbol}
                  </Link>
                </td>
                <td className="px-3 py-2 text-fs-muted">{c.name}</td>
                <td className="px-3 py-2 text-fs-muted">{c.gicsSubIndustry ?? "—"}</td>
                <td className="px-3 py-2 text-right text-fs-text">{fmtCap(c.marketCap)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${pctClass(c.returns?.absoluteReturn)}`}>
                  {loading ? "…" : fmtPct(c.returns?.absoluteReturn)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${pctClass(c.returns?.excessVsSpy)}`}>
                  {loading ? "…" : fmtPct(c.returns?.excessVsSpy)}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/equity/stocks/${encodeURIComponent(c.symbol)}`}
                    className="mr-2 text-xs text-fs-accent-text hover:underline"
                  >
                    个股
                  </Link>
                  <Link
                    href={`/markets?symbol=${encodeURIComponent(c.symbol)}`}
                    className="text-xs text-fs-muted hover:text-fs-accent-text hover:underline"
                  >
                    K线
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
