"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { KlinePayload, MacroPayload } from "@/lib/data/types";

type QuadrantId = "goldilocks" | "reflation" | "deflation" | "stagflation";
type AssetId = "stocks" | "bond" | "commodity" | "gold" | "tips" | "cash";

type AssetMetric = {
  id: AssetId;
  name: string;
  symbol: string;
  d1: number | null;
  w1: number | null;
  m1: number | null;
};

type MacroDimensionIndicator = {
  key: string;
  sign: 1 | -1;
  label: string;
  meaning: string;
  timing: string;
};

type IndicatorDetailRow = {
  key: string;
  label: string;
  timing: string;
  latestYoy: number | null;
  baselineYoy: number | null;
  surprise: number | null;
  weight: number;
};

const GROWTH_INDICATORS: readonly MacroDimensionIndicator[] = [
  {
    key: "fred:NAPM",
    sign: 1,
    label: "ISM制造业PMI（NAPM）",
    meaning: ">50 扩张，<50 收缩",
    timing: "领先3-6月",
  },
  {
    key: "fred:PAYEMS",
    sign: 1,
    label: "非农就业（PAYEMS）",
    meaning: "就业扩张速度",
    timing: "同步",
  },
  {
    key: "fred:RSAFS",
    sign: 1,
    label: "零售销售（RSAFS）",
    meaning: "消费强弱",
    timing: "同步",
  },
  {
    key: "fred:T10Y2Y",
    sign: 1,
    label: "收益率曲线斜率（T10Y2Y）",
    meaning: "倒挂提示衰退",
    timing: "领先12-18月",
  },
  {
    key: "fred:INDPRO",
    sign: 1,
    label: "工业生产（INDPRO）",
    meaning: "生产活动景气",
    timing: "同步",
  },
  {
    key: "fred:UNRATE",
    sign: -1,
    label: "失业率（UNRATE）",
    meaning: "失业率上升=增长转弱",
    timing: "同步/滞后",
  },
];

const INFLATION_INDICATORS: readonly MacroDimensionIndicator[] = [
  {
    key: "fred:CPILFESL",
    sign: 1,
    label: "核心CPI（CPILFESL）",
    meaning: "服务通胀黏性",
    timing: "同步",
  },
  {
    key: "fred:PCEPI",
    sign: 1,
    label: "PCE（PCEPI）",
    meaning: "美联储目标口径",
    timing: "同步",
  },
  {
    key: "fred:T5YIE",
    sign: 1,
    label: "5Y通胀预期（T5YIE）",
    meaning: "债市通胀定价",
    timing: "领先",
  },
  {
    key: "fred:DCOILWTICO",
    sign: 1,
    label: "WTI原油（DCOILWTICO）",
    meaning: "能源价格传导",
    timing: "领先1-3月",
  },
  {
    key: "fred:CES0500000003",
    sign: 1,
    label: "平均时薪（AHE）",
    meaning: "工资通胀压力",
    timing: "同步/滞后",
  },
];

const DEFAULT_GROWTH_KEYS = ["fred:NAPM", "fred:PAYEMS", "fred:T10Y2Y", "fred:UNRATE"] as const;
const DEFAULT_INFLATION_KEYS = ["fred:CPILFESL", "fred:PCEPI", "fred:T5YIE", "fred:DCOILWTICO"] as const;

const ASSETS = [
  { id: "stocks", name: "美股（SPY）", symbol: "SPY" },
  { id: "bond", name: "长债（TLT）", symbol: "TLT" },
  { id: "commodity", name: "大宗商品（DBC）", symbol: "DBC" },
  { id: "gold", name: "黄金（GLD）", symbol: "GLD" },
  { id: "tips", name: "通胀保值债（TIP）", symbol: "TIP" },
  { id: "cash", name: "短债现金替代（SHY）", symbol: "SHY" },
] as const;

type QuadrantScoreRule = Record<AssetId, number>;

const QUADRANT_RULES: Record<QuadrantId, QuadrantScoreRule> = {
  goldilocks: { stocks: 1, bond: 1, commodity: -1, gold: -0.5, tips: 0.5, cash: -0.3 },
  reflation: { stocks: 0.8, bond: -1, commodity: 1, gold: 0.8, tips: 0.8, cash: -0.2 },
  deflation: { stocks: -1, bond: 1, commodity: -0.8, gold: 0.4, tips: -0.5, cash: 0.5 },
  stagflation: { stocks: -1, bond: -0.8, commodity: 1, gold: 1, tips: 0.8, cash: 0.2 },
};

const QUADRANT_META: Record<
  QuadrantId,
  { title: string; subtitle: string; border: string; bg: string; text: string }
> = {
  goldilocks: {
    title: "增长上行 + 通胀下行",
    subtitle: "黄金时期 / 低通胀繁荣",
    border: "border-fs-accent/40/70",
    bg: "bg-fs-accent-soft",
    text: "text-fs-accent-text",
  },
  reflation: {
    title: "增长上行 + 通胀上行",
    subtitle: "再通胀 / 过热",
    border: "border-amber-700/70",
    bg: "bg-amber-950/20",
    text: "text-amber-100",
  },
  deflation: {
    title: "增长下行 + 通胀下行",
    subtitle: "通缩衰退 / 经济危机",
    border: "border-sky-700/70",
    bg: "bg-sky-950/20",
    text: "text-sky-100",
  },
  stagflation: {
    title: "增长下行 + 通胀上行",
    subtitle: "滞胀 / 最难熬时期",
    border: "border-rose-700/70",
    bg: "bg-rose-950/20",
    text: "text-rose-100",
  },
};

function fmtPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function pctColor(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "text-fs-muted";
  if (v > 0) return "text-fs-accent-text";
  if (v < 0) return "text-rose-300";
  return "text-fs-secondary";
}

function closeFromCandle(candle: unknown): number | null {
  if (!candle || typeof candle !== "object") return null;
  const close = (candle as { close?: unknown }).close;
  if (typeof close === "number" && Number.isFinite(close)) return close;
  return null;
}

function ret(closes: number[], lag: number): number | null {
  if (closes.length <= lag) return null;
  const latest = closes[closes.length - 1];
  const prev = closes[closes.length - 1 - lag];
  if (!latest || !prev || prev === 0) return null;
  return ((latest - prev) / Math.abs(prev)) * 100;
}

function yoy(values: (number | null)[]): (number | null)[] {
  return values.map((v, idx) => {
    if (idx < 12 || v == null || !Number.isFinite(v)) return null;
    const prev = values[idx - 12];
    if (prev == null || !Number.isFinite(prev) || prev === 0) return null;
    return ((v - prev) / Math.abs(prev)) * 100;
  });
}

function smoothSeries(values: number[], windowSize: number): number[] {
  if (windowSize <= 1) return values;
  return values.map((_, idx) => {
    const start = Math.max(0, idx - windowSize + 1);
    const seg = values.slice(start, idx + 1);
    return seg.reduce((a, b) => a + b, 0) / seg.length;
  });
}

function calcSurpriseDetails(
  values: (number | null)[],
  sign: 1 | -1,
  smoothWindow: number,
): { latestYoy: number | null; baselineYoy: number | null; surprise: number | null } {
  const rawY = yoy(values).filter((v): v is number => v != null && Number.isFinite(v));
  const y = smoothSeries(rawY, smoothWindow);
  if (y.length < 18) {
    return { latestYoy: null, baselineYoy: null, surprise: null };
  }
  const latest = y[y.length - 1];
  const baselineWindow = y.slice(Math.max(0, y.length - 24), y.length - 1);
  if (baselineWindow.length < 8) {
    return { latestYoy: latest, baselineYoy: null, surprise: null };
  }
  const baseline = baselineWindow.reduce((a, b) => a + b, 0) / baselineWindow.length;
  return {
    latestYoy: latest,
    baselineYoy: baseline,
    surprise: (latest - baseline) * sign,
  };
}

function calcDetailRows(
  payload: MacroPayload | null,
  defs: readonly MacroDimensionIndicator[],
  smoothWindow: number,
  weightByKey: Record<string, number>,
): IndicatorDetailRow[] {
  if (!payload) {
    return defs.map((def) => ({
      key: def.key,
      label: def.label,
      timing: def.timing,
      latestYoy: null,
      baselineYoy: null,
      surprise: null,
      weight: weightByKey[def.key] ?? 1,
    }));
  }
  return defs.map((def) => {
    const s = payload.series.find((x) => x.key === def.key);
    if (!s) {
      return {
        key: def.key,
        label: def.label,
        timing: def.timing,
        latestYoy: null,
        baselineYoy: null,
        surprise: null,
        weight: weightByKey[def.key] ?? 1,
      };
    }
    const detail = calcSurpriseDetails(s.data, def.sign, smoothWindow);
    return {
      key: def.key,
      label: def.label,
      timing: def.timing,
      ...detail,
      weight: weightByKey[def.key] ?? 1,
    };
  });
}

function calcAxisScoreFromRows(rows: IndicatorDetailRow[]): number | null {
  const pairs = rows
    .filter((r) => r.surprise != null && Number.isFinite(r.surprise))
    .map((r) => ({ value: r.surprise as number, weight: Math.max(0, r.weight) }))
    .filter((x) => x.weight > 0);
  if (pairs.length === 0) return null;
  const sumW = pairs.reduce((a, b) => a + b.weight, 0);
  if (sumW <= 0) return null;
  return pairs.reduce((a, b) => a + b.value * b.weight, 0) / sumW;
}

function quadrantByScore(growth: number | null, inflation: number | null): QuadrantId | null {
  if (growth == null || inflation == null) return null;
  if (growth >= 0 && inflation < 0) return "goldilocks";
  if (growth >= 0 && inflation >= 0) return "reflation";
  if (growth < 0 && inflation < 0) return "deflation";
  return "stagflation";
}

function marketImpliedQuadrant(rows: AssetMetric[]): QuadrantId | null {
  if (rows.length === 0) return null;
  const weighted = new Map<AssetId, number>();
  for (const row of rows) {
    const score =
      (row.d1 ?? 0) * 0.5 +
      (row.w1 ?? 0) * 0.3 +
      (row.m1 ?? 0) * 0.2;
    weighted.set(row.id, score);
  }
  const entries = (Object.keys(QUADRANT_RULES) as QuadrantId[]).map((id) => {
    const rule = QUADRANT_RULES[id];
    let score = 0;
    for (const [asset, factor] of Object.entries(rule) as [AssetId, number][]) {
      score += (weighted.get(asset) ?? 0) * factor;
    }
    return { id, score };
  });
  entries.sort((a, b) => b.score - a.score);
  return entries[0]?.id ?? null;
}

function consistencyScore(econ: QuadrantId | null, market: QuadrantId | null): number | null {
  if (!econ || !market) return null;
  const signMap: Record<QuadrantId, { growthUp: boolean; inflationUp: boolean }> = {
    goldilocks: { growthUp: true, inflationUp: false },
    reflation: { growthUp: true, inflationUp: true },
    deflation: { growthUp: false, inflationUp: false },
    stagflation: { growthUp: false, inflationUp: true },
  };
  const e = signMap[econ];
  const m = signMap[market];
  const diff = Number(e.growthUp !== m.growthUp) + Number(e.inflationUp !== m.inflationUp);
  return Math.max(0, 100 - diff * 40);
}

function consistencyTone(v: number | null): string {
  if (v == null) return "text-fs-muted";
  if (v >= 80) return "text-fs-accent-text";
  if (v >= 50) return "text-amber-300";
  return "text-rose-300";
}

export function MacroAllWeatherDashboard() {
  const [macroPayload, setMacroPayload] = useState<MacroPayload | null>(null);
  const [assetRows, setAssetRows] = useState<AssetMetric[]>([]);
  const [loadingMacro, setLoadingMacro] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [useSmooth3m, setUseSmooth3m] = useState(true);
  const [growthSelectedKeys, setGrowthSelectedKeys] = useState<string[]>(() => [...DEFAULT_GROWTH_KEYS]);
  const [inflationSelectedKeys, setInflationSelectedKeys] = useState<string[]>(() => [
    ...DEFAULT_INFLATION_KEYS,
  ]);
  const [growthWeights, setGrowthWeights] = useState<Record<string, number>>(
    () => Object.fromEntries(GROWTH_INDICATORS.map((x) => [x.key, 1])),
  );
  const [inflationWeights, setInflationWeights] = useState<Record<string, number>>(
    () => Object.fromEntries(INFLATION_INDICATORS.map((x) => [x.key, 1])),
  );
  const [error, setError] = useState<string | null>(null);

  const activeGrowthDefs = useMemo(
    () => GROWTH_INDICATORS.filter((x) => growthSelectedKeys.includes(x.key)),
    [growthSelectedKeys],
  );
  const activeInflationDefs = useMemo(
    () => INFLATION_INDICATORS.filter((x) => inflationSelectedKeys.includes(x.key)),
    [inflationSelectedKeys],
  );
  const macroSeriesKeys = useMemo(
    () => [...new Set([...activeGrowthDefs.map((x) => x.key), ...activeInflationDefs.map((x) => x.key)])],
    [activeGrowthDefs, activeInflationDefs],
  );

  useEffect(() => {
    const run = async () => {
      if (macroSeriesKeys.length === 0) {
        setMacroPayload(null);
        return;
      }
      setError(null);
      setLoadingMacro(true);
      try {
        const keys = macroSeriesKeys.join(",");
        const res = await fetch(`/api/data/macro?source=unified&series=${encodeURIComponent(keys)}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as MacroPayload & { error?: string };
        if (!res.ok || json.error) throw new Error(json.error || "宏观维度数据加载失败");
        setMacroPayload(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "宏观维度数据加载失败");
      } finally {
        setLoadingMacro(false);
      }
    };
    run().catch(() => {});
  }, [macroSeriesKeys]);

  useEffect(() => {
    const run = async () => {
      setLoadingAssets(true);
      try {
        const results = await Promise.all(
          ASSETS.map(async (asset) => {
            const qs = new URLSearchParams({
              source: "auto",
              symbol: asset.symbol,
              interval: "1d",
              limit: "70",
            });
            const res = await fetch(`/api/data/klines?${qs.toString()}`, { cache: "no-store" });
            const json = (await res.json().catch(() => ({}))) as KlinePayload & { error?: string };
            if (!res.ok || json.error || !Array.isArray(json.candles)) {
              return { ...asset, d1: null, w1: null, m1: null };
            }
            const closes = json.candles.map(closeFromCandle).filter((x): x is number => x != null);
            return {
              ...asset,
              d1: ret(closes, 1),
              w1: ret(closes, 5),
              m1: ret(closes, 21),
            };
          }),
        );
        setAssetRows(results);
      } finally {
        setLoadingAssets(false);
      }
    };
    run().catch(() => {});
  }, []);

  const growthDetails = useMemo(
    () => calcDetailRows(macroPayload, activeGrowthDefs, useSmooth3m ? 3 : 1, growthWeights),
    [macroPayload, activeGrowthDefs, useSmooth3m, growthWeights],
  );
  const inflationDetails = useMemo(
    () => calcDetailRows(macroPayload, activeInflationDefs, useSmooth3m ? 3 : 1, inflationWeights),
    [macroPayload, activeInflationDefs, useSmooth3m, inflationWeights],
  );
  const growthScore = useMemo(() => calcAxisScoreFromRows(growthDetails), [growthDetails]);
  const inflationScore = useMemo(() => calcAxisScoreFromRows(inflationDetails), [inflationDetails]);
  const econQuadrant = useMemo(
    () => quadrantByScore(growthScore, inflationScore),
    [growthScore, inflationScore],
  );
  const marketQuadrant = useMemo(() => marketImpliedQuadrant(assetRows), [assetRows]);
  const econMarketConsistency = useMemo(
    () => consistencyScore(econQuadrant, marketQuadrant),
    [econQuadrant, marketQuadrant],
  );

  const toggleSelected = (
    current: string[],
    setter: (next: string[]) => void,
    key: string,
  ) => {
    if (current.includes(key)) {
      if (current.length <= 1) return;
      setter(current.filter((x) => x !== key));
      return;
    }
    setter([...current, key]);
  };

  const updateWeight = (
    setter: Dispatch<SetStateAction<Record<string, number>>>,
    key: string,
    raw: string,
  ) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const w = Math.min(5, Math.max(0, n));
    setter((prev) => ({ ...prev, [key]: w }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      <div className="rounded-md border border-fs-border bg-fs-elevated p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-fs-text">All Weather Dashboard</div>
            <p className="mt-0.5 text-[10px] leading-snug text-fs-muted">Ray Dalio All Weather 象限。</p>
          </div>
          {loadingMacro ? <span className="text-[10px] text-fs-muted">加载中…</span> : null}
        </div>
        <div className="mb-2 rounded border border-fs-border/90 bg-fs-elevated/35 p-1.5">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[10px] font-medium text-fs-secondary">维度指标配置</div>
            <label className="flex items-center gap-1 text-[10px] text-fs-muted">
              <input
                type="checkbox"
                checked={useSmooth3m}
                onChange={(e) => setUseSmooth3m(e.target.checked)}
                className="h-3 w-3 accent-cyan-600"
              />
              3个月平滑
            </label>
          </div>
          <div className="mt-1 grid grid-cols-1 gap-1.5">
            <div className="rounded border border-fs-border bg-fs-bg/45 p-1.5">
              <div className="mb-1 flex items-center justify-between text-[10px]">
                <span className="font-medium text-fs-secondary">增长维度（{growthSelectedKeys.length}）</span>
                <button
                  type="button"
                  onClick={() => setGrowthSelectedKeys([...DEFAULT_GROWTH_KEYS])}
                  className="rounded border border-fs-border px-1.5 py-0 text-fs-muted hover:border-fs-border"
                >
                  默认
                </button>
              </div>
              <div className="space-y-1">
                {GROWTH_INDICATORS.map((item) => (
                  <div key={item.key} className="flex items-start gap-1 text-[10px] text-fs-muted">
                    <input
                      type="checkbox"
                      checked={growthSelectedKeys.includes(item.key)}
                      onChange={() =>
                        toggleSelected(growthSelectedKeys, setGrowthSelectedKeys, item.key)
                      }
                      className="mt-0.5 h-3 w-3 accent-fs-accent"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-fs-text">{item.label}</span>
                      <span className="block truncate text-fs-muted">{item.meaning}</span>
                    </span>
                    <label className="ml-auto flex items-center gap-1 text-fs-muted">
                      权重
                      <input
                        type="number"
                        value={(growthWeights[item.key] ?? 1).toFixed(1)}
                        min={0}
                        max={5}
                        step={0.1}
                        onChange={(e) => updateWeight(setGrowthWeights, item.key, e.target.value)}
                        className="w-14 rounded border border-fs-border bg-fs-elevated px-1 py-0 text-right text-[10px] text-fs-text"
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded border border-fs-border bg-fs-bg/45 p-1.5">
              <div className="mb-1 flex items-center justify-between text-[10px]">
                <span className="font-medium text-fs-secondary">通胀维度（{inflationSelectedKeys.length}）</span>
                <button
                  type="button"
                  onClick={() => setInflationSelectedKeys([...DEFAULT_INFLATION_KEYS])}
                  className="rounded border border-fs-border px-1.5 py-0 text-fs-muted hover:border-fs-border"
                >
                  默认
                </button>
              </div>
              <div className="space-y-1">
                {INFLATION_INDICATORS.map((item) => (
                  <div key={item.key} className="flex items-start gap-1 text-[10px] text-fs-muted">
                    <input
                      type="checkbox"
                      checked={inflationSelectedKeys.includes(item.key)}
                      onChange={() =>
                        toggleSelected(inflationSelectedKeys, setInflationSelectedKeys, item.key)
                      }
                      className="mt-0.5 h-3 w-3 accent-cyan-600"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-fs-text">{item.label}</span>
                      <span className="block truncate text-fs-muted">{item.meaning}</span>
                    </span>
                    <label className="ml-auto flex items-center gap-1 text-fs-muted">
                      权重
                      <input
                        type="number"
                        value={(inflationWeights[item.key] ?? 1).toFixed(1)}
                        min={0}
                        max={5}
                        step={0.1}
                        onChange={(e) => updateWeight(setInflationWeights, item.key, e.target.value)}
                        className="w-14 rounded border border-fs-border bg-fs-elevated px-1 py-0 text-right text-[10px] text-fs-text"
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(QUADRANT_META) as QuadrantId[]).map((id) => {
            const meta = QUADRANT_META[id];
            const active = econQuadrant === id;
            const market = marketQuadrant === id;
            return (
              <div
                key={id}
                className={`rounded border px-2 py-1.5 transition ${
                  active
                    ? `${meta.border} ${meta.bg} shadow-[0_0_0_1px_rgba(16,185,129,0.28)]`
                    : "border-fs-border bg-fs-elevated/35"
                }`}
              >
                <div className={`text-[11px] font-semibold ${active ? meta.text : "text-fs-text"}`}>
                  {meta.title}
                </div>
                <div className="mt-0.5 text-[10px] text-fs-muted">{meta.subtitle}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {active ? (
                    <span className="rounded border border-fs-accent/40 bg-fs-accent-soft px-1 py-0 text-[9px] text-fs-accent-text">
                      当前经济
                    </span>
                  ) : null}
                  {market ? (
                    <span className="rounded border border-cyan-700/70 bg-cyan-950/35 px-1 py-0 text-[9px] text-cyan-200">
                      市场隐含
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded border border-fs-border bg-fs-elevated/30 px-2 py-1.5">
            <div className="text-fs-muted">增长预期差（均值）</div>
            <div className={`mt-0.5 text-xs font-semibold ${pctColor(growthScore)}`}>
              {fmtPct(growthScore)}
            </div>
          </div>
          <div className="rounded border border-fs-border bg-fs-elevated/30 px-2 py-1.5">
            <div className="text-fs-muted">通胀预期差（均值）</div>
            <div className={`mt-0.5 text-xs font-semibold ${pctColor(inflationScore)}`}>
              {fmtPct(inflationScore)}
            </div>
          </div>
        </div>
        <div className="mt-2 rounded border border-fs-border bg-fs-elevated/30 px-2 py-1.5 text-[10px]">
          <div className="text-fs-muted">经济象限 vs 市场隐含象限 一致性</div>
          <div className="mt-0.5 flex items-center justify-between">
            <span className={`text-xs font-semibold ${consistencyTone(econMarketConsistency)}`}>
              {econMarketConsistency == null ? "-" : `${econMarketConsistency.toFixed(0)} / 100`}
            </span>
            <span className="text-[10px] text-fs-muted">
              {econMarketConsistency == null
                ? "数据不足"
                : econMarketConsistency >= 80
                  ? "高度一致"
                  : econMarketConsistency >= 50
                    ? "部分一致"
                    : "分化明显"}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-fs-border bg-fs-elevated p-2.5">
        <div className="mb-1 text-xs font-semibold text-fs-text">增长维度明细（预期差 = 当前同比 - 24月均值）</div>
        <div className="overflow-auto">
          <table className="min-w-full border-collapse text-[10px]">
            <thead className="bg-fs-elevated text-fs-muted">
              <tr>
                <th className="border border-fs-border px-1.5 py-1 text-left">指标</th>
                <th className="border border-fs-border px-1.5 py-1 text-right">当前同比</th>
                <th className="border border-fs-border px-1.5 py-1 text-right">24月均值</th>
                <th className="border border-fs-border px-1.5 py-1 text-right">预期差</th>
                <th className="border border-fs-border px-1.5 py-1 text-right">权重</th>
                <th className="border border-fs-border px-1.5 py-1 text-left">领先/同步</th>
              </tr>
            </thead>
            <tbody>
              {growthDetails.map((row) => (
                <tr key={row.key} className="odd:bg-fs-bg even:bg-fs-elevated/30">
                  <td className="border border-fs-border px-1.5 py-1 text-fs-text">{row.label}</td>
                  <td className={`border border-fs-border px-1.5 py-1 text-right ${pctColor(row.latestYoy)}`}>
                    {fmtPct(row.latestYoy)}
                  </td>
                  <td className={`border border-fs-border px-1.5 py-1 text-right ${pctColor(row.baselineYoy)}`}>
                    {fmtPct(row.baselineYoy)}
                  </td>
                  <td className={`border border-fs-border px-1.5 py-1 text-right ${pctColor(row.surprise)}`}>
                    {fmtPct(row.surprise)}
                  </td>
                  <td className="border border-fs-border px-1.5 py-1 text-right text-fs-secondary">
                    {row.weight.toFixed(1)}
                  </td>
                  <td className="border border-fs-border px-1.5 py-1 text-fs-muted">{row.timing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-md border border-fs-border bg-fs-elevated p-2.5">
        <div className="mb-1 text-xs font-semibold text-fs-text">通胀维度明细（预期差 = 当前同比 - 24月均值）</div>
        <div className="overflow-auto">
          <table className="min-w-full border-collapse text-[10px]">
            <thead className="bg-fs-elevated text-fs-muted">
              <tr>
                <th className="border border-fs-border px-1.5 py-1 text-left">指标</th>
                <th className="border border-fs-border px-1.5 py-1 text-right">当前同比</th>
                <th className="border border-fs-border px-1.5 py-1 text-right">24月均值</th>
                <th className="border border-fs-border px-1.5 py-1 text-right">预期差</th>
                <th className="border border-fs-border px-1.5 py-1 text-right">权重</th>
                <th className="border border-fs-border px-1.5 py-1 text-left">领先/同步</th>
              </tr>
            </thead>
            <tbody>
              {inflationDetails.map((row) => (
                <tr key={row.key} className="odd:bg-fs-bg even:bg-fs-elevated/30">
                  <td className="border border-fs-border px-1.5 py-1 text-fs-text">{row.label}</td>
                  <td className={`border border-fs-border px-1.5 py-1 text-right ${pctColor(row.latestYoy)}`}>
                    {fmtPct(row.latestYoy)}
                  </td>
                  <td className={`border border-fs-border px-1.5 py-1 text-right ${pctColor(row.baselineYoy)}`}>
                    {fmtPct(row.baselineYoy)}
                  </td>
                  <td className={`border border-fs-border px-1.5 py-1 text-right ${pctColor(row.surprise)}`}>
                    {fmtPct(row.surprise)}
                  </td>
                  <td className="border border-fs-border px-1.5 py-1 text-right text-fs-secondary">
                    {row.weight.toFixed(1)}
                  </td>
                  <td className="border border-fs-border px-1.5 py-1 text-fs-muted">{row.timing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="min-h-0 rounded-md border border-fs-border bg-fs-elevated p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="text-xs font-semibold text-fs-text">大类资产短周期表现</div>
          {loadingAssets ? <span className="text-[10px] text-fs-muted">更新中…</span> : null}
        </div>
        <div className="overflow-auto">
          <table className="min-w-full border-collapse text-[10px]">
            <thead className="bg-fs-elevated text-fs-muted">
              <tr>
                <th className="border border-fs-border px-1.5 py-1 text-left">资产</th>
                <th className="border border-fs-border px-1.5 py-1 text-right">当日</th>
                <th className="border border-fs-border px-1.5 py-1 text-right">近1周</th>
                <th className="border border-fs-border px-1.5 py-1 text-right">近1月</th>
              </tr>
            </thead>
            <tbody>
              {assetRows.map((row) => (
                <tr key={row.id} className="odd:bg-fs-bg even:bg-fs-elevated/30">
                  <td className="border border-fs-border px-1.5 py-1 text-fs-text">{row.name}</td>
                  <td className={`border border-fs-border px-1.5 py-1 text-right ${pctColor(row.d1)}`}>
                    {fmtPct(row.d1)}
                  </td>
                  <td className={`border border-fs-border px-1.5 py-1 text-right ${pctColor(row.w1)}`}>
                    {fmtPct(row.w1)}
                  </td>
                  <td className={`border border-fs-border px-1.5 py-1 text-right ${pctColor(row.m1)}`}>
                    {fmtPct(row.m1)}
                  </td>
                </tr>
              ))}
              {assetRows.length === 0 && !loadingAssets ? (
                <tr>
                  <td colSpan={4} className="border border-fs-border px-2 py-3 text-center text-fs-muted">
                    暂无资产行情数据
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {error ? (
        <p className="rounded border border-rose-900/60 bg-rose-950/20 px-2 py-1.5 text-[10px] text-rose-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
