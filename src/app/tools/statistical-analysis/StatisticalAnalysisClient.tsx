"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { MacroPayload } from "@/lib/data/types";
import { unifiedSeriesDisplayName } from "@/lib/data/macroCatalog";

function seriesDisplayLabel(key: string, labelByKey: Map<string, string>): string {
  return labelByKey.get(key) ?? unifiedSeriesDisplayName(key);
}

type PreprocessMode = "none" | "zscore" | "base100" | "pctchange";

type SeriesStats = {
  key: string;
  name: string;
  count: number;
  missing: number;
  min: number | null;
  p50: number | null;
  max: number | null;
  mean: number | null;
  std: number | null;
  last: number | null;
};

type HistogramBin = {
  start: number;
  end: number;
  count: number;
};

type SeriesHistogram = {
  key: string;
  name: string;
  step: number;
  min: number;
  max: number;
  total: number;
  maxCount: number;
  mean: number | null;
  std: number | null;
  bins: HistogramBin[];
};

function parseTimeLabelToMs(label: string): number | null {
  if (/^\d{4}$/.test(label)) return Date.UTC(Number(label), 0, 1);
  if (/^\d{4}-\d{2}$/.test(label)) {
    const y = Number(label.slice(0, 4));
    const m = Number(label.slice(5, 7)) - 1;
    return Date.UTC(y, m, 1);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const y = Number(label.slice(0, 4));
    const m = Number(label.slice(5, 7)) - 1;
    const d = Number(label.slice(8, 10));
    return Date.UTC(y, m, d);
  }
  const t = Date.parse(label);
  return Number.isFinite(t) ? t : null;
}

function fmt(v: number | null, digits = 4): string {
  if (v == null || !Number.isFinite(v)) return "-";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx] ?? null;
}

function mean(vals: number[]): number | null {
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function std(vals: number[], m: number | null): number | null {
  if (vals.length < 2 || m == null) return null;
  const v = vals.reduce((acc, x) => acc + (x - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v);
}

function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const f = raw / base;
  if (f <= 1) return 1 * base;
  if (f <= 2) return 2 * base;
  if (f <= 2.5) return 2.5 * base;
  if (f <= 5) return 5 * base;
  return 10 * base;
}

function buildHistogram(key: string, name: string, values: number[]): SeriesHistogram | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const range = max - min;
  const n = sorted.length;
  const m = mean(sorted);
  const s = std(sorted, m);
  if (range <= 0) {
    return {
      key,
      name,
      step: 1,
      min,
      max,
      total: n,
      maxCount: n,
      mean: m,
      std: s,
      bins: [{ start: min, end: min, count: n }],
    };
  }

  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q1 != null && q3 != null ? q3 - q1 : 0;
  const fdStep = iqr > 0 ? (2 * iqr) / Math.cbrt(n) : 0;
  const sturgesBins = Math.max(5, Math.ceil(Math.log2(n) + 1));
  const sturgesStep = range / sturgesBins;

  let step = niceStep(fdStep > 0 ? fdStep : sturgesStep);
  let binCount = Math.ceil(range / step);
  if (binCount < 4) {
    step = niceStep(range / 4);
    binCount = Math.ceil(range / step);
  }
  if (binCount > 32) {
    step = niceStep(range / 32);
    binCount = Math.ceil(range / step);
  }
  binCount = Math.max(1, Math.min(64, binCount));

  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    start: min + i * step,
    end: i === binCount - 1 ? max : min + (i + 1) * step,
    count: 0,
  }));

  for (const v of sorted) {
    const idx = Math.min(binCount - 1, Math.floor((v - min) / step));
    bins[idx]!.count += 1;
  }

  const maxCount = Math.max(...bins.map((b) => b.count));
  return { key, name, step, min, max, total: n, maxCount, mean: m, std: s, bins };
}

function preprocessSeries(data: (number | null)[], mode: PreprocessMode): (number | null)[] {
  if (mode === "none") return data;
  if (mode === "pctchange") {
    const out: (number | null)[] = [];
    let prev: number | null = null;
    for (const v of data) {
      if (v == null || !Number.isFinite(v)) {
        out.push(null);
        continue;
      }
      if (prev == null || prev === 0) out.push(null);
      else out.push((v - prev) / prev);
      prev = v;
    }
    return out;
  }
  const vals = data.filter((x): x is number => x != null && Number.isFinite(x));
  if (vals.length === 0) return data.map(() => null);
  if (mode === "base100") {
    const base = vals[0]!;
    if (base === 0) return data.map(() => null);
    return data.map((x) => (x == null || !Number.isFinite(x) ? null : (x / base) * 100));
  }
  const m = mean(vals);
  const s = std(vals, m);
  if (m == null || s == null || s === 0) return data.map(() => null);
  return data.map((x) => (x == null || !Number.isFinite(x) ? null : (x - m) / s));
}

function corr(a: (number | null)[], b: (number | null)[]): number | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x == null || y == null) continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    xs.push(x);
    ys.push(y);
  }
  if (xs.length < 3) return null;
  const mx = mean(xs)!;
  const my = mean(ys)!;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

export function StatisticalAnalysisClient() {
  const searchParams = useSearchParams();
  const initialSeries = (searchParams.get("series") ?? "").trim();
  const initialLabel = (searchParams.get("label") ?? "").trim();
  const [seriesInput, setSeriesInput] = useState(initialSeries);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [mode, setMode] = useState<PreprocessMode>("none");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<MacroPayload | null>(null);
  const [seriesEditing, setSeriesEditing] = useState(false);
  const [labelByKey, setLabelByKey] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    setSeriesInput(initialSeries);
  }, [initialSeries]);

  useEffect(() => {
    if (!initialSeries || !initialLabel) return;
    const keys = initialSeries
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const labels = initialLabel.split(",").map((s) => s.trim());
    if (keys.length === 0) return;
    setLabelByKey((prev) => {
      const next = new Map(prev);
      keys.forEach((key, i) => {
        const label = labels[i] ?? labels[0];
        if (label) next.set(key, label);
      });
      return next;
    });
  }, [initialSeries, initialLabel]);

  const parsedSeries = useMemo(
    () =>
      [...new Set(seriesInput.split(",").map((s) => s.trim()).filter(Boolean))]
        .filter((k) => /^(fred:|wb:|mds:)/.test(k))
        .slice(0, 80),
    [seriesInput],
  );

  const seriesDisplayInput = useMemo(
    () => parsedSeries.map((k) => seriesDisplayLabel(k, labelByKey)).join(", "),
    [parsedSeries, labelByKey],
  );

  useEffect(() => {
    const mdsCodes = parsedSeries.filter((k) => k.startsWith("mds:")).map((k) => k.slice(4)).filter(Boolean);
    if (mdsCodes.length === 0) return;

    let cancelled = false;
    const params = new URLSearchParams({
      kind: "MACRO_SERIES",
      limit: String(Math.max(100, mdsCodes.length + 20)),
      codes: mdsCodes.join(","),
    });
    fetch(`/api/data/instruments?${params.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return [] as Array<{ code?: string; name?: string; shortName?: string }>;
        const j = (await r.json().catch(() => ({}))) as {
          items?: Array<{ code?: string; name?: string; shortName?: string }>;
        };
        return Array.isArray(j.items) ? j.items : [];
      })
      .then((items) => {
        if (cancelled) return;
        setLabelByKey((prev) => {
          const next = new Map(prev);
          for (const item of items) {
            const code = typeof item.code === "string" ? item.code : "";
            if (!code) continue;
            const key = `mds:${code}`;
            const shortName = typeof item.shortName === "string" ? item.shortName.trim() : "";
            const name = typeof item.name === "string" ? item.name.trim() : "";
            next.set(key, shortName || name || unifiedSeriesDisplayName(key));
          }
          return next;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [parsedSeries]);

  const filteredPayload = useMemo(() => {
    if (!payload) return null;
    const startMs = start ? parseTimeLabelToMs(start) : null;
    const endMs = end ? parseTimeLabelToMs(end) : null;
    const keepIdx: number[] = [];
    payload.categories.forEach((c, i) => {
      const t = parseTimeLabelToMs(c);
      if (t == null) return;
      if (startMs != null && t < startMs) return;
      if (endMs != null && t > endMs) return;
      keepIdx.push(i);
    });
    if (keepIdx.length === 0) return null;
    return {
      ...payload,
      categories: keepIdx.map((i) => payload.categories[i]!),
      series: payload.series.map((s) => ({
        ...s,
        data: keepIdx.map((i) => s.data[i] ?? null),
      })),
    };
  }, [payload, start, end]);

  const processed = useMemo(() => {
    if (!filteredPayload) return null;
    return {
      ...filteredPayload,
      series: filteredPayload.series.map((s) => ({
        ...s,
        data: preprocessSeries(s.data, mode),
      })),
    };
  }, [filteredPayload, mode]);

  const statsRows = useMemo<SeriesStats[]>(() => {
    if (!processed) return [];
    return processed.series.map((s) => {
      const vals = s.data.filter((x): x is number => x != null && Number.isFinite(x));
      const sorted = [...vals].sort((a, b) => a - b);
      const m = mean(vals);
      return {
        key: s.key ?? s.name,
        name: s.name,
        count: vals.length,
        missing: s.data.length - vals.length,
        min: sorted[0] ?? null,
        p50: percentile(sorted, 0.5),
        max: sorted[sorted.length - 1] ?? null,
        mean: m,
        std: std(vals, m),
        last: vals.length > 0 ? vals[vals.length - 1]! : null,
      };
    });
  }, [processed]);

  const corrMatrix = useMemo(() => {
    if (!processed) return [];
    const names = processed.series.map((s) => s.name);
    const values = processed.series.map((s) => s.data);
    return names.map((_, i) =>
      names.map((__, j) => (i === j ? 1 : corr(values[i] ?? [], values[j] ?? []))),
    );
  }, [processed]);

  const histograms = useMemo<SeriesHistogram[]>(() => {
    if (!processed) return [];
    return processed.series
      .map((s) => {
        const vals = s.data.filter((x): x is number => x != null && Number.isFinite(x));
        return buildHistogram(s.key ?? s.name, s.name, vals);
      })
      .filter((x): x is SeriesHistogram => Boolean(x));
  }, [processed]);

  const runAnalysis = async () => {
    if (parsedSeries.length === 0) {
      setError("请先输入至少一个指标（fred:/wb:/mds:）。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        source: "unified",
        series: parsedSeries.join(","),
      });
      const res = await fetch(`/api/data/macro?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as MacroPayload & { error?: string };
      if (!res.ok || json.error) {
        throw new Error(json.error || "统计分析数据加载失败");
      }
      setPayload(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "统计分析数据加载失败");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-4 lg:px-6">
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="flex w-full shrink-0 flex-col gap-3 lg:sticky lg:top-4 lg:w-[min(100%,320px)] xl:w-[340px]">
          <div>
            <h1 className="text-xl font-semibold text-slate-50">统计分析</h1>
            <p className="mt-1 text-sm text-slate-400">
              面向宏观序列的完整分析工作台：支持样本筛选、预处理、描述统计与相关性矩阵。
            </p>
          </div>

          <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                指标
                <textarea
                  value={seriesEditing ? seriesInput : seriesDisplayInput}
                  onChange={(e) => setSeriesInput(e.target.value)}
                  onFocus={() => setSeriesEditing(true)}
                  onBlur={() => setSeriesEditing(false)}
                  readOnly={!seriesEditing}
                  rows={4}
                  title={
                    seriesEditing
                      ? "编辑指标代码（fred:/wb:/mds:，逗号分隔）"
                      : parsedSeries.join(", ")
                  }
                  className={`rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 ${
                    seriesEditing ? "" : "cursor-text"
                  }`}
                  placeholder="例如：mds:debtcap_us_leverage_household,fred:UNRATE"
                />
                <span className="text-[10px] text-slate-500">
                  {seriesEditing
                    ? "正在编辑代码；失焦后显示指标名"
                    : "点击可编辑代码（fred:/wb:/mds:，逗号分隔）"}
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  起始日期
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  结束日期
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                预处理
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as PreprocessMode)}
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                >
                  <option value="none">原始值</option>
                  <option value="zscore">Z-Score 标准化</option>
                  <option value="base100">首值=100 指数化</option>
                  <option value="pctchange">环比变化率</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => runAnalysis().catch(() => {})}
                disabled={loading}
                className="w-full rounded-md border border-emerald-700 bg-emerald-950/45 px-3 py-2 text-sm text-emerald-100 disabled:opacity-50"
              >
                {loading ? "分析中..." : "运行分析"}
              </button>
              <span className="text-xs text-slate-500">当前指标数：{parsedSeries.length}</span>
            </div>
            {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
          </section>
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          {processed ? (
            <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-xs text-slate-500">样本点（日期）</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">
                {processed.categories.length}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-xs text-slate-500">分析序列数</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">
                {processed.series.length}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-xs text-slate-500">样本区间</div>
              <div className="mt-1 text-sm text-slate-100">
                {processed.categories[0] ?? "-"} ~{" "}
                {processed.categories[processed.categories.length - 1] ?? "-"}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <h2 className="mb-2 text-sm font-medium text-slate-200">描述统计</h2>
            <div className="overflow-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-slate-900/80 text-slate-300">
                  <tr>
                    <th className="border border-slate-800 px-2 py-1 text-left">序列</th>
                    <th className="border border-slate-800 px-2 py-1 text-right">有效</th>
                    <th className="border border-slate-800 px-2 py-1 text-right">缺失</th>
                    <th className="border border-slate-800 px-2 py-1 text-right">最小</th>
                    <th className="border border-slate-800 px-2 py-1 text-right">中位数</th>
                    <th className="border border-slate-800 px-2 py-1 text-right">均值</th>
                    <th className="border border-slate-800 px-2 py-1 text-right">标准差</th>
                    <th className="border border-slate-800 px-2 py-1 text-right">最大</th>
                    <th className="border border-slate-800 px-2 py-1 text-right">最新</th>
                  </tr>
                </thead>
                <tbody>
                  {statsRows.map((r) => (
                    <tr key={r.key} className="odd:bg-slate-950 even:bg-slate-900/30">
                      <td className="border border-slate-800 px-2 py-1 text-slate-200">{r.name}</td>
                      <td className="border border-slate-800 px-2 py-1 text-right">{r.count}</td>
                      <td className="border border-slate-800 px-2 py-1 text-right">{r.missing}</td>
                      <td className="border border-slate-800 px-2 py-1 text-right">{fmt(r.min)}</td>
                      <td className="border border-slate-800 px-2 py-1 text-right">{fmt(r.p50)}</td>
                      <td className="border border-slate-800 px-2 py-1 text-right">{fmt(r.mean)}</td>
                      <td className="border border-slate-800 px-2 py-1 text-right">{fmt(r.std)}</td>
                      <td className="border border-slate-800 px-2 py-1 text-right">{fmt(r.max)}</td>
                      <td className="border border-slate-800 px-2 py-1 text-right">{fmt(r.last)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <h2 className="mb-1 text-sm font-medium text-slate-200">分布柱状图（自适应分箱）</h2>
            <p className="mb-3 text-xs text-slate-500">
              step 按每个指标数据自动计算：优先 IQR（Freedman–Diaconis），样本离散度不足时回退 Sturges。
            </p>
            <div className="space-y-3">
              {histograms.map((h) => (
                <div key={h.key} className="rounded border border-slate-800/80 bg-slate-900/35 p-2">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-200">{h.name}</span>
                    <span className="rounded border border-slate-700 px-1 py-0 text-[10px] text-slate-400">
                      step={fmt(h.step, 6)}
                    </span>
                    <span className="text-slate-500">
                      区间 {fmt(h.min)} ~ {fmt(h.max)}，样本 {h.total}
                    </span>
                    <span className="text-slate-500">
                      均值 {fmt(h.mean)}，标准差 {fmt(h.std)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    {(() => {
                      const W = 980;
                      const H = 300;
                      const padL = 42;
                      const padR = 56;
                      const padT = 14;
                      const padB = 86;
                      const plotW = W - padL - padR;
                      const plotH = H - padT - padB;
                      const binCount = Math.max(1, h.bins.length);
                      const barW = plotW / binCount;
                      const maxC = Math.max(1, h.maxCount);
                      const total = Math.max(1, h.total);
                      const range = Math.max(1e-12, h.max - h.min);
                      const xAt = (v: number) => padL + ((v - h.min) / range) * plotW;
                      const pctText = (v: number) => `${((v / total) * 100).toFixed(1)}%`;
                      const thresholdLines =
                        h.mean == null || h.std == null
                          ? []
                          : [
                              { label: "μ-3σ", x: xAt(h.mean - 3 * h.std), color: "#ef4444", dashed: true },
                              { label: "μ-1σ", x: xAt(h.mean - 1 * h.std), color: "#f59e0b", dashed: true },
                              { label: "μ", x: xAt(h.mean), color: "#38bdf8", dashed: false },
                              { label: "μ+1σ", x: xAt(h.mean + 1 * h.std), color: "#f59e0b", dashed: true },
                              { label: "μ+3σ", x: xAt(h.mean + 3 * h.std), color: "#ef4444", dashed: true },
                            ].filter((l) => Number.isFinite(l.x) && l.x >= padL && l.x <= padL + plotW);

                      return (
                        <svg viewBox={`0 0 ${W} ${H}`} className="h-[250px] min-w-[760px] w-full">
                          <rect
                            x={padL}
                            y={padT}
                            width={plotW}
                            height={plotH}
                            fill="rgba(15,23,42,0.45)"
                            stroke="rgba(71,85,105,0.45)"
                          />
                          {h.bins.map((b, i) => {
                            const bh = (b.count / maxC) * plotH;
                            const x = padL + i * barW + 0.8;
                            const y = padT + plotH - bh;
                            const binLabel = `${fmt(b.start, 4)} ~ ${fmt(b.end, 4)}`;
                            return (
                              <rect
                                key={`${h.key}-bar-${i}`}
                                x={x}
                                y={y}
                                width={Math.max(1.5, barW - 1.6)}
                                height={Math.max(0, bh)}
                                fill="rgba(16,185,129,0.78)"
                                className="cursor-pointer transition-opacity hover:opacity-100 opacity-90"
                              >
                                <title>{`${binLabel}
数量: ${b.count}
占比: ${pctText(b.count)}`}</title>
                              </rect>
                            );
                          })}
                          {h.bins.map((b, i) => {
                            const x = padL + i * barW + barW / 2;
                            const binLabel = `${fmt(b.start, 4)}~${fmt(b.end, 4)}`;
                            return (
                              <text
                                key={`${h.key}-tick-${i}`}
                                x={x}
                                y={padT + plotH + 16}
                                transform={`rotate(-38 ${x} ${padT + plotH + 16})`}
                                textAnchor="end"
                                fontSize="9"
                                fill="#64748b"
                              >
                                {binLabel}
                              </text>
                            );
                          })}
                          {thresholdLines.map((l) => (
                            <g key={`${h.key}-${l.label}`}>
                              <line
                                x1={l.x}
                                y1={padT}
                                x2={l.x}
                                y2={padT + plotH}
                                stroke={l.color}
                                strokeDasharray={l.dashed ? "4 3" : undefined}
                                strokeWidth={l.dashed ? "1.5" : "2"}
                              />
                              <text
                                x={l.x}
                                y={padT - 2}
                                textAnchor="middle"
                                fontSize="10"
                                fill={l.color}
                              >
                                {l.label}
                              </text>
                            </g>
                          ))}
                          <line
                            x1={padL}
                            y1={padT + plotH}
                            x2={padL + plotW}
                            y2={padT + plotH}
                            stroke="rgba(100,116,139,0.7)"
                          />
                          <line
                            x1={padL + plotW}
                            y1={padT}
                            x2={padL + plotW}
                            y2={padT + plotH}
                            stroke="rgba(100,116,139,0.55)"
                          />
                          <text x={padL} y={H - 10} textAnchor="start" fontSize="10" fill="#94a3b8">
                            {fmt(h.min, 4)}
                          </text>
                          <text
                            x={padL + plotW / 2}
                            y={H - 10}
                            textAnchor="middle"
                            fontSize="10"
                            fill="#94a3b8"
                          >
                            分布区间
                          </text>
                          <text
                            x={padL + plotW}
                            y={H - 10}
                            textAnchor="end"
                            fontSize="10"
                            fill="#94a3b8"
                          >
                            {fmt(h.max, 4)}
                          </text>
                          <text
                            x={padL - 6}
                            y={padT + 10}
                            textAnchor="end"
                            fontSize="10"
                            fill="#94a3b8"
                          >
                            {maxC}
                          </text>
                          <text
                            x={padL - 6}
                            y={padT + plotH}
                            textAnchor="end"
                            dominantBaseline="ideographic"
                            fontSize="10"
                            fill="#94a3b8"
                          >
                            0
                          </text>
                          <text
                            x={padL + plotW + 6}
                            y={padT + 10}
                            textAnchor="start"
                            fontSize="10"
                            fill="#94a3b8"
                          >
                            {pctText(maxC)}
                          </text>
                          <text
                            x={padL + plotW + 6}
                            y={padT + plotH / 2 + 4}
                            textAnchor="start"
                            fontSize="10"
                            fill="#64748b"
                          >
                            {pctText(maxC / 2)}
                          </text>
                          <text
                            x={padL + plotW + 6}
                            y={padT + plotH}
                            textAnchor="start"
                            dominantBaseline="ideographic"
                            fontSize="10"
                            fill="#94a3b8"
                          >
                            0%
                          </text>
                        </svg>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <h2 className="mb-2 text-sm font-medium text-slate-200">相关性矩阵（Pearson）</h2>
            <div className="overflow-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-slate-900/80 text-slate-300">
                  <tr>
                    <th className="border border-slate-800 px-2 py-1 text-left">序列</th>
                    {processed.series.map((s) => (
                      <th key={s.key ?? s.name} className="border border-slate-800 px-2 py-1 text-right">
                        {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {processed.series.map((s, i) => (
                    <tr key={s.key ?? s.name} className="odd:bg-slate-950 even:bg-slate-900/30">
                      <td className="border border-slate-800 px-2 py-1 text-slate-200">{s.name}</td>
                      {corrMatrix[i]?.map((v, j) => {
                        const abs = v == null ? 0 : Math.min(1, Math.abs(v));
                        const bg =
                          v == null
                            ? "transparent"
                            : v >= 0
                              ? `rgba(16,185,129,${0.08 + abs * 0.35})`
                              : `rgba(244,63,94,${0.08 + abs * 0.35})`;
                        return (
                          <td
                            key={`${i}-${j}`}
                            className="border border-slate-800 px-2 py-1 text-right text-slate-100"
                            style={{ backgroundColor: bg }}
                          >
                            {v == null ? "-" : v.toFixed(3)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
            </>
          ) : (
            <section className="rounded-lg border border-dashed border-slate-800 bg-slate-950/30 p-8 text-center">
              <p className="text-sm text-slate-400">配置左侧指标与日期范围，点击「运行分析」查看统计结果。</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

