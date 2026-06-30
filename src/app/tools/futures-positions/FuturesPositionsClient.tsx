"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CotReportPayload, CotReportRow } from "@/lib/data/cot/cotReportTypes";
import type { CotSector } from "@/lib/data/cot/cotProductCatalog";

function fmtInt(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString("en-US");
}

function fmtChg(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = Math.round(v);
  if (n > 0) return `+${n.toLocaleString("en-US")}`;
  return n.toLocaleString("en-US");
}

function fmtPct(v: number | null, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = Number(v.toFixed(digits));
  if (n > 0) return `+${n}%`;
  return `${n}%`;
}

function chgClass(v: number | null): string {
  if (v == null || v === 0) return "text-fs-secondary";
  return v < 0 ? "text-fs-negative" : "text-fs-text";
}

function heatBg(v: number | null, kind: "pct" | "rel"): string {
  if (v == null || !Number.isFinite(v)) return "";
  if (kind === "rel") {
    if (v >= 85) return "bg-sky-900/50";
    if (v <= 25) return "bg-red-950/40";
    return "";
  }
  if (v <= -15) return "bg-red-950/50";
  if (v >= 15) return "bg-sky-900/40";
  return "";
}

function NetSparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <span className="text-fs-secondary">—</span>;
  }
  const w = 72;
  const h = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const last = values[values.length - 1]!;
  const lastY = h - ((last - min) / span) * (h - 4) - 2;
  const lastX = w;
  return (
    <svg width={w} height={h} className="inline-block" aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        className="text-fs-muted"
        points={pts}
      />
      <circle cx={lastX} cy={lastY} r="2.5" className="fill-red-500" />
    </svg>
  );
}

function DataRow({ row }: { row: CotReportRow }) {
  return (
    <tr className="border-b border-fs-border hover:bg-fs-elevated/40">
      <td className="whitespace-nowrap px-2 py-1.5 text-sm text-fs-text">{row.label}</td>
      <td className="px-2 py-1.5 text-right text-sm tabular-nums text-fs-text">
        {fmtInt(row.long)}
      </td>
      <td className={`px-2 py-1.5 text-right text-sm tabular-nums ${chgClass(row.longChange)}`}>
        {fmtChg(row.longChange)}
      </td>
      <td className="px-2 py-1.5 text-right text-sm tabular-nums text-fs-text">
        {fmtInt(row.short)}
      </td>
      <td className={`px-2 py-1.5 text-right text-sm tabular-nums ${chgClass(row.shortChange)}`}>
        {fmtChg(row.shortChange)}
      </td>
      <td className="px-2 py-1.5 text-right text-sm tabular-nums text-fs-text">
        {fmtInt(row.net)}
      </td>
      <td className={`px-2 py-1.5 text-right text-sm tabular-nums ${chgClass(row.netChange)}`}>
        {fmtChg(row.netChange)}
      </td>
      <td
        className={`px-2 py-1.5 text-right text-sm tabular-nums ${chgClass(row.netChangePct)} ${heatBg(row.netChangePct, "pct")}`}
      >
        {fmtPct(row.netChangePct)}
      </td>
      <td className="px-2 py-1.5 text-center">
        <NetSparkline values={row.netHistory} />
      </td>
      <td className="px-2 py-1.5 text-right text-sm tabular-nums text-fs-secondary">
        {fmtInt(row.yearHigh)}
      </td>
      <td className="px-2 py-1.5 text-right text-sm tabular-nums text-fs-secondary">
        {fmtInt(row.yearLow)}
      </td>
      <td
        className={`px-2 py-1.5 text-right text-sm tabular-nums text-fs-text ${heatBg(row.relativeToMax, "rel")}`}
      >
        {row.relativeToMax != null ? `${Math.round(row.relativeToMax)}%` : "—"}
      </td>
    </tr>
  );
}

const SECTOR_ORDER: CotSector[] = ["energy", "metals", "grains", "softs", "livestock"];

export function FuturesPositionsClient() {
  const [data, setData] = useState<CotReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tools/cot-report", { cache: "no-store" });
      const json = (await res.json()) as CotReportPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const bySector = useMemo(() => {
    if (!data) return new Map<CotSector, CotReportRow[]>();
    const map = new Map<CotSector, CotReportRow[]>();
    for (const row of data.rows) {
      const arr = map.get(row.sector) ?? [];
      arr.push(row);
      map.set(row.sector, arr);
    }
    return map;
  }, [data]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-fs-text">期货持仓报告</h1>
          <p className="mt-1 text-sm text-fs-muted">
            Managed Money 持仓 · CFTC Disaggregated Combined
            {data?.reportDateLabel ? (
              <span className="ml-2 text-fs-secondary">
                Week to Tuesday: {data.reportDateLabel}
              </span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load().catch(() => {})}
          disabled={loading}
          className="rounded-md border border-fs-border bg-fs-elevated px-3 py-1.5 text-sm text-fs-text hover:bg-fs-elevated disabled:opacity-50"
        >
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
          <p className="mt-2 text-xs text-fs-negative/80">
            若尚未初始化数据，请在服务器运行：npm run data:seed-cot
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-fs-border bg-fs-bg/60 shadow-lg">
        <table className="w-full min-w-[1100px] border-collapse text-left">
          <thead>
            <tr className="bg-fs-elevated/90 text-xs font-medium uppercase tracking-wide text-fs-text">
              <th className="px-2 py-2" rowSpan={2}>
                品种
              </th>
              <th className="border-l border-fs-border px-2 py-2 text-center" colSpan={7}>
                Managed Money Positions
              </th>
              <th className="border-l border-fs-border px-2 py-2 text-center" rowSpan={2}>
                Trend
              </th>
              <th className="border-l border-fs-border px-2 py-2 text-center" colSpan={3}>
                One-year Position Extremes
              </th>
            </tr>
            <tr className="bg-fs-elevated text-[11px] text-fs-secondary">
              <th className="border-l border-fs-border/80 px-2 py-1 text-right">Long</th>
              <th className="px-2 py-1 text-right">Change</th>
              <th className="px-2 py-1 text-right">Short</th>
              <th className="px-2 py-1 text-right">Change</th>
              <th className="px-2 py-1 text-right">Net</th>
              <th className="px-2 py-1 text-right">Change</th>
              <th className="px-2 py-1 text-right">Change Pct</th>
              <th className="border-l border-fs-border/80 px-2 py-1 text-right">High</th>
              <th className="px-2 py-1 text-right">Low</th>
              <th className="px-2 py-1 text-right">Relative to max</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-sm text-fs-muted">
                  加载 COT 数据…
                </td>
              </tr>
            ) : null}

            {data
              ? SECTOR_ORDER.map((sector) => {
                  const rows = bySector.get(sector) ?? [];
                  if (!rows.length) return null;
                  const sectorLabel = rows[0]?.sectorLabel ?? sector;
                  return (
                    <SectorBlock key={sector} label={sectorLabel} rows={rows} />
                  );
                })
              : null}

            {data ? (
              <tr className="bg-fs-elevated font-medium text-fs-text">
                <td className="px-2 py-2 text-sm">Total</td>
                <td className="px-2 py-2 text-right text-sm tabular-nums">
                  {fmtInt(data.totals.long)}
                </td>
                <td
                  className={`px-2 py-2 text-right text-sm tabular-nums ${chgClass(data.totals.longChange)}`}
                >
                  {fmtChg(data.totals.longChange)}
                </td>
                <td className="px-2 py-2 text-right text-sm tabular-nums">
                  {fmtInt(data.totals.short)}
                </td>
                <td
                  className={`px-2 py-2 text-right text-sm tabular-nums ${chgClass(data.totals.shortChange)}`}
                >
                  {fmtChg(data.totals.shortChange)}
                </td>
                <td className="px-2 py-2 text-right text-sm tabular-nums">
                  {fmtInt(data.totals.net)}
                </td>
                <td
                  className={`px-2 py-2 text-right text-sm tabular-nums ${chgClass(data.totals.netChange)}`}
                >
                  {fmtChg(data.totals.netChange)}
                </td>
                <td
                  className={`px-2 py-2 text-right text-sm tabular-nums ${chgClass(data.totals.netChangePct)}`}
                >
                  {fmtPct(data.totals.netChangePct)}
                </td>
                <td colSpan={4} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-fs-muted">
        数据来源：{data?.source ?? "CFTC"}。净仓 = 管理基金多头 − 空头；未含 spread。Brent (ICE)、Gas
        Oil (ICE)、价格涨跌列暂未接入。周频自动更新由 data:worker 调度。
      </p>
    </div>
  );
}

function SectorBlock({ label, rows }: { label: string; rows: CotReportRow[] }) {
  return (
    <>
      <tr className="bg-fs-elevated">
        <td
          colSpan={12}
          className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-fs-accent-text/90"
        >
          {label}
        </td>
      </tr>
      {rows.map((row) => (
        <DataRow key={row.slug} row={row} />
      ))}
    </>
  );
}
