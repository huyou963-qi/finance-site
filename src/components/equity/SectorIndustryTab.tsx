"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { industrySlug } from "@/lib/equity/gicsIndustryCatalog";

type IndustryRow = {
  code: string;
  slug: string;
  nameEn: string;
  style: "cyclical" | "defensive" | "both";
  constituentCount: number;
  returns: {
    equalWeightReturn: number | null;
    excessVsSpy: number | null;
  } | null;
};

const PRESETS = [
  { id: "1w", days: 7 },
  { id: "1m", days: 21 },
  { id: "3m", days: 63 },
  { id: "YTD", days: "ytd" as const },
  { id: "1Y", days: 252 },
] as const;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ytdStartIso(): string {
  return `${new Date().getUTCFullYear()}-01-01`;
}

function rangeForPreset(id: (typeof PRESETS)[number]["id"]): { from: string; to: string } {
  const to = todayIso();
  const def = PRESETS.find((p) => p.id === id);
  if (!def) return { from: isoDaysAgo(63), to };
  if (def.days === "ytd") return { from: ytdStartIso(), to };
  return { from: isoDaysAgo(def.days), to };
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

function styleLabel(style: IndustryRow["style"]): string {
  if (style === "cyclical") return "周期";
  if (style === "defensive") return "防御";
  return "两者";
}

function styleBadgeClass(style: IndustryRow["style"]): string {
  if (style === "cyclical") return "bg-amber-500/10 text-amber-700 ring-amber-500/20";
  if (style === "defensive") return "bg-sky-500/10 text-sky-700 ring-sky-500/20";
  return "bg-violet-500/10 text-violet-700 ring-violet-500/20";
}

export function SectorIndustryTab({
  sectorSlug,
  sectorNameZh,
}: {
  sectorSlug: string;
  sectorNameZh: string;
}) {
  const [{ from, to }, setRange] = useState(() => rangeForPreset("3m"));
  const [rows, setRows] = useState<IndustryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ from, to });
      const r = await fetch(
        `/api/equity/sectors/${encodeURIComponent(sectorSlug)}/industries?${q}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as { error?: string; industries?: IndustryRow[] };
      if (!r.ok) throw new Error(j.error ?? "加载失败");
      setRows(j.industries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [sectorSlug, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPreset = (id: (typeof PRESETS)[number]["id"]) => {
    setRange(rangeForPreset(id));
  };

  const activePreset =
    PRESETS.find((p) => {
      const r = rangeForPreset(p.id);
      return r.from === from && r.to === to;
    })?.id ?? null;

  const onManualDate = (field: "from" | "to", value: string) => {
    setRange((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={
                activePreset === p.id
                  ? "rounded px-2 py-0.5 text-xs font-medium bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/30"
                  : "rounded px-2 py-0.5 text-xs font-medium text-fs-muted hover:bg-fs-elevated"
              }
            >
              {p.id}
            </button>
          ))}
        </div>
        <label className="text-xs text-fs-muted">
          开始
          <input
            type="date"
            value={from}
            onChange={(e) => onManualDate("from", e.target.value)}
            className="ml-1 rounded border border-fs-border bg-white px-1.5 py-0.5 text-xs text-fs-text"
          />
        </label>
        <label className="text-xs text-fs-muted">
          截止
          <input
            type="date"
            value={to}
            onChange={(e) => onManualDate("to", e.target.value)}
            className="ml-1 rounded border border-fs-border bg-white px-1.5 py-0.5 text-xs text-fs-text"
          />
        </label>
        {loading ? <span className="text-xs text-fs-muted">加载中…</span> : null}
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <section className="overflow-x-auto rounded-md border border-fs-border">
        <div className="border-b border-fs-border bg-fs-elevated/40 px-3 py-2 text-sm font-medium text-fs-text">
          GICS Industry（{sectorNameZh}）· 等权篮子
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs text-fs-muted">
            <tr>
              <th className="px-3 py-2">Industry</th>
              <th className="px-3 py-2">风格</th>
              <th className="px-3 py-2 text-right">成分数</th>
              <th className="px-3 py-2 text-right">绝对收益</th>
              <th className="px-3 py-2 text-right">相对 SPY</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code} className="border-t border-fs-border/60">
                <td className="px-3 py-2">
                  <Link
                    href={`/equity/sectors/${encodeURIComponent(sectorSlug)}/industries/${encodeURIComponent(row.slug)}?from=${from}&to=${to}`}
                    className="font-medium text-fs-accent-text hover:underline"
                  >
                    {row.nameEn}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${styleBadgeClass(row.style)}`}
                  >
                    {styleLabel(row.style)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-fs-muted">
                  {row.constituentCount}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${pctClass(row.returns?.equalWeightReturn)}`}>
                  {loading ? "…" : fmtPct(row.returns?.equalWeightReturn)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${pctClass(row.returns?.excessVsSpy)}`}>
                  {loading ? "…" : fmtPct(row.returns?.excessVsSpy)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/** 供测试 */
export function industryDetailPath(sectorSlug: string, nameEn: string, from: string, to: string): string {
  return `/equity/sectors/${sectorSlug}/industries/${industrySlug(nameEn)}?from=${from}&to=${to}`;
}
