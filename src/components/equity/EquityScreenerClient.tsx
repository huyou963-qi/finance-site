"use client";

/**
 * 选股器（Phase 2 WS3/WS4）：注册表驱动的条件构建 + 结果表 + 策略保存/加载。
 * - 因子清单/分组/方向/起始年全部来自 factorRegistry 的 FACTOR_DEFS，勿硬编码。
 * - 页面状态（配置+结果）写 sessionStorage：点入个股页返回后完整还原。
 * - 保存的 ScreenerConfig JSON 是 Phase 3 回测输入，字段结构与 screener.ts 同源。
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FACTOR_DEFS,
  FACTOR_MAP,
  type FactorCategory,
  type FactorDef,
} from "@/lib/quant/factorRegistry";
import { GICS_SECTOR_DEFS } from "@/lib/equity/gicsCatalog";
import type {
  ScreenerConfig,
  ScreenerCondition,
  ScreenerMetric,
  ScreenerOp,
  ScreenerResultRow,
  ScreenerStats,
} from "@/lib/quant/screener";
import type { StrategyRow } from "@/lib/quant/screenerStrategies";

const CATEGORY_LABELS: Record<FactorCategory, string> = {
  valuation: "估值",
  quality: "质量",
  growth: "成长",
  momentum: "动量",
  volatility: "波动",
  liquidity: "量价",
  size: "规模",
};

const CATEGORY_ORDER: FactorCategory[] = [
  "valuation",
  "quality",
  "growth",
  "momentum",
  "volatility",
  "liquidity",
  "size",
];

const METRIC_LABELS: Record<ScreenerMetric, string> = {
  value: "原始值",
  zscore: "全市场Z分",
  sectorZscore: "行业内Z分",
  percentile: "分位(0-1)",
};

const OP_LABELS: Record<ScreenerOp, string> = {
  gte: "≥",
  lte: "≤",
  between: "介于",
};

type SectorContext = {
  sector: string;
  rows: { factorKey: string; median: number; p25: number; p75: number; sampleCount: number }[];
};

type QueryResponse = {
  error?: string;
  date?: string;
  rows?: ScreenerResultRow[];
  stats?: ScreenerStats;
  sectorContext?: SectorContext | null;
};

const STORAGE_KEY = "equityScreenerState.v1";

type PersistedState = {
  config: ScreenerConfig;
  result: { date: string; rows: ScreenerResultRow[]; stats: ScreenerStats; sectorContext: SectorContext | null } | null;
  /** 结果表客户端排序状态（可缺省，兼容旧持久化数据） */
  sort?: { col: string | null; desc: boolean };
};

function defaultConfig(): ScreenerConfig {
  return {
    date: null,
    universe: {},
    conditions: [],
    ranking: { mode: "single", sortFactor: null, topN: 50 },
  };
}

function factorTooltip(d: FactorDef): string {
  return `${d.nameEn}\n${d.note}\n数据起点：${d.startYear} 年`;
}

function fmtValue(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(v) >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

function fmtZ(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
}

function zClass(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-fs-muted";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-fs-muted";
}

function fmtMcap(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  return `${(v / 1e9).toFixed(1)}B`;
}

const sectorNameZh = new Map<string, string>(
  GICS_SECTOR_DEFS.map((s) => [s.sector, s.nameZh]),
);

/** 按 category 分组的因子 select（startYear 晚于所选截面年的置灰） */
function FactorSelect({
  value,
  year,
  onChange,
  placeholder,
}: {
  value: string;
  year: number;
  onChange: (key: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1 text-sm"
    >
      {placeholder != null ? <option value="">{placeholder}</option> : null}
      {CATEGORY_ORDER.map((cat) => (
        <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
          {FACTOR_DEFS.filter((d) => d.category === cat).map((d) => (
            <option
              key={d.key}
              value={d.key}
              disabled={d.startYear > year}
              title={factorTooltip(d)}
            >
              {d.nameZh}
              {d.startYear > year ? `（${d.startYear} 起）` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

const BACKTEST_CONFIG_KEY = "equityBacktestNewConfig.v1";

export function EquityScreenerClient() {
  const router = useRouter();
  const [dates, setDates] = useState<string[]>([]);
  const [config, setConfig] = useState<ScreenerConfig>(defaultConfig);
  const [result, setResult] = useState<PersistedState["result"]>(null);
  /** sessionStorage 还原完成前禁止持久化写入（否则 remount 首帧默认态会覆写已存状态） */
  const [restored, setRestored] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 策略（WS4）
  const [strategies, setStrategies] = useState<StrategyRow[] | null>(null); // null = 未登录/未加载
  const [currentStrategyId, setCurrentStrategyId] = useState<string>("");
  const [strategyMsg, setStrategyMsg] = useState<string | null>(null);

  // 结果表排序
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(true);

  const reloadStrategies = useCallback(async () => {
    try {
      const r = await fetch("/api/equity/screener/strategies", { cache: "no-store" });
      if (r.status === 401) {
        setStrategies(null);
        return;
      }
      const j = (await r.json()) as { strategies?: StrategyRow[] };
      setStrategies(j.strategies ?? []);
    } catch {
      setStrategies(null);
    }
  }, []);

  // ── 初始化：期列表 + sessionStorage 还原 + 策略列表 ──────────────────────
  useEffect(() => {
    fetch("/api/equity/screener", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { dates?: string[] }) : null))
      .then((j) => setDates(j?.dates ?? []))
      .catch(() => setDates([]));

    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as PersistedState;
        if (saved?.config) setConfig(saved.config);
        if (saved?.result) setResult(saved.result);
        if (saved?.sort) {
          setSortCol(saved.sort.col);
          setSortDesc(saved.sort.desc);
        }
      }
    } catch {
      // 损坏的持久化状态直接忽略
    }
    setRestored(true);

    void reloadStrategies();
  }, [reloadStrategies]);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          config,
          result,
          sort: { col: sortCol, desc: sortDesc },
        } satisfies PersistedState),
      );
    } catch {
      // sessionStorage 满/禁用时静默降级
    }
  }, [restored, config, result, sortCol, sortDesc]);

  const latestDate = dates.length ? dates[dates.length - 1]! : null;
  const effectiveDate = config.date ?? latestDate;
  const effectiveYear = effectiveDate ? Number(effectiveDate.slice(0, 4)) : 9999;

  // ── 配置编辑 ──────────────────────────────────────────────────────────────
  const patchConfig = useCallback((p: Partial<ScreenerConfig>) => {
    setConfig((c) => ({ ...c, ...p }));
  }, []);

  const patchCondition = (idx: number, p: Partial<ScreenerCondition>) => {
    setConfig((c) => ({
      ...c,
      conditions: c.conditions.map((cond, i) => (i === idx ? { ...cond, ...p } : cond)),
    }));
  };

  const addCondition = (factorKey: string) => {
    if (!factorKey) return;
    setConfig((c) => ({
      ...c,
      conditions: [
        ...c.conditions,
        { factorKey, metric: "zscore", op: "gte", bounds: { min: 0 } },
      ],
    }));
  };

  const removeCondition = (idx: number) => {
    setConfig((c) => ({ ...c, conditions: c.conditions.filter((_, i) => i !== idx) }));
  };

  const toggleSector = (sector: string) => {
    setConfig((c) => {
      const cur = new Set(c.universe?.sectors ?? []);
      if (cur.has(sector)) cur.delete(sector);
      else cur.add(sector);
      return { ...c, universe: { ...c.universe, sectors: cur.size ? [...cur] : undefined } };
    });
  };

  const addWeight = (factorKey: string) => {
    if (!factorKey) return;
    setConfig((c) => {
      const weights = c.ranking.weights ?? [];
      if (weights.some((w) => w.factorKey === factorKey)) return c;
      return { ...c, ranking: { ...c.ranking, weights: [...weights, { factorKey, weight: 1 }] } };
    });
  };

  // ── 查询 ──────────────────────────────────────────────────────────────────
  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSortCol(null);
    try {
      const r = await fetch("/api/equity/screener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
        cache: "no-store",
      });
      const j = (await r.json()) as QueryResponse;
      if (!r.ok) throw new Error(j.error ?? "查询失败");
      setResult({
        date: j.date!,
        rows: j.rows ?? [],
        stats: j.stats!,
        sectorContext: j.sectorContext ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      setLoading(false);
    }
  }, [config]);

  // ── 策略操作（WS4） ───────────────────────────────────────────────────────
  const loadStrategy = (id: string) => {
    setCurrentStrategyId(id);
    setStrategyMsg(null);
    const s = strategies?.find((x) => x.id === id);
    if (s) {
      setConfig(s.config);
      setResult(null);
    }
  };

  const saveStrategy = async (asNew: boolean) => {
    setStrategyMsg(null);
    try {
      const current = strategies?.find((x) => x.id === currentStrategyId);
      if (asNew || !current) {
        const name = window.prompt("策略名称：", current ? `${current.name} 副本` : "我的策略");
        if (!name) return;
        const r = await fetch("/api/equity/screener/strategies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, config }),
        });
        const j = (await r.json()) as { error?: string; strategy?: StrategyRow };
        if (!r.ok) throw new Error(j.error ?? "保存失败");
        setCurrentStrategyId(j.strategy!.id);
        setStrategyMsg(`已保存「${j.strategy!.name}」`);
      } else {
        const r = await fetch(`/api/equity/screener/strategies/${current.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config }),
        });
        const j = (await r.json()) as { error?: string };
        if (!r.ok) throw new Error(j.error ?? "保存失败");
        setStrategyMsg(`已更新「${current.name}」`);
      }
      await reloadStrategies();
    } catch (e) {
      setStrategyMsg(e instanceof Error ? e.message : "保存失败");
    }
  };

  const renameStrategy = async () => {
    const current = strategies?.find((x) => x.id === currentStrategyId);
    if (!current) return;
    const name = window.prompt("新名称：", current.name);
    if (!name || name === current.name) return;
    try {
      const r = await fetch(`/api/equity/screener/strategies/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "重命名失败");
      setStrategyMsg("已重命名");
      await reloadStrategies();
    } catch (e) {
      setStrategyMsg(e instanceof Error ? e.message : "重命名失败");
    }
  };

  const deleteStrategy = async () => {
    const current = strategies?.find((x) => x.id === currentStrategyId);
    if (!current) return;
    if (!window.confirm(`删除策略「${current.name}」？`)) return;
    try {
      const r = await fetch(`/api/equity/screener/strategies/${current.id}`, {
        method: "DELETE",
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "删除失败");
      setCurrentStrategyId("");
      setStrategyMsg("已删除");
      await reloadStrategies();
    } catch (e) {
      setStrategyMsg(e instanceof Error ? e.message : "删除失败");
    }
  };

  // ── 回测此策略（带当前 config 跳转回测新建页） ────────────────────────────
  const backtestThisStrategy = () => {
    try {
      const current = strategies?.find((x) => x.id === currentStrategyId);
      sessionStorage.setItem(
        BACKTEST_CONFIG_KEY,
        JSON.stringify({ config, name: current?.name }),
      );
    } catch {
      // sessionStorage 不可用时仍导航（回测页会提示选择策略）
    }
    router.push("/equity/backtest");
  };

  // ── 结果表 ────────────────────────────────────────────────────────────────
  const shownFactorKeys = useMemo(() => {
    if (!result?.rows.length) return [];
    return Object.keys(result.rows[0]!.factors);
  }, [result]);

  const sortedRows = useMemo(() => {
    if (!result) return [];
    if (!sortCol) return result.rows;
    const rows = [...result.rows];
    const val = (r: ScreenerResultRow): number => {
      if (sortCol === "marketCap") return r.marketCap ?? -Infinity;
      if (sortCol === "score") return r.score ?? -Infinity;
      const v = r.factors[sortCol]?.value;
      return v != null && Number.isFinite(v) ? v : -Infinity;
    };
    rows.sort((a, b) => (val(b) - val(a)) * (sortDesc ? 1 : -1) || a.symbol.localeCompare(b.symbol));
    return rows;
  }, [result, sortCol, sortDesc]);

  const clickSort = (col: string) => {
    if (sortCol === col) setSortDesc((d) => !d);
    else {
      setSortCol(col);
      setSortDesc(true);
    }
  };

  const sectorMedians = useMemo(() => {
    if (!result?.sectorContext) return null;
    const m = new Map(result.sectorContext.rows.map((r) => [r.factorKey, r]));
    return { sector: result.sectorContext.sector, map: m };
  }, [result]);

  const sortIndicator = (col: string) =>
    sortCol === col ? (sortDesc ? " ▼" : " ▲") : "";

  const isComposite = config.ranking.mode === "composite";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">选股器</h1>
        <span className="text-xs text-fs-muted">
          标普500 历史成分月频 PIT 因子截面（{dates.length} 期）
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {strategies === null ? (
            <span className="text-xs text-fs-muted">登录后可保存/加载策略</span>
          ) : (
            <>
              <select
                value={currentStrategyId}
                onChange={(e) => loadStrategy(e.target.value)}
                className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1 text-sm"
              >
                <option value="">— 选择策略 —</option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void saveStrategy(false)} className="rounded-md border border-fs-border px-2 py-1 text-sm hover:bg-fs-elevated">
                保存
              </button>
              <button type="button" onClick={() => void saveStrategy(true)} className="rounded-md border border-fs-border px-2 py-1 text-sm hover:bg-fs-elevated">
                另存为
              </button>
              {currentStrategyId ? (
                <>
                  <button type="button" onClick={() => void renameStrategy()} className="rounded-md border border-fs-border px-2 py-1 text-sm hover:bg-fs-elevated">
                    重命名
                  </button>
                  <button type="button" onClick={() => void deleteStrategy()} className="rounded-md border border-fs-border px-2 py-1 text-sm text-red-400 hover:bg-fs-elevated">
                    删除
                  </button>
                </>
              ) : null}
            </>
          )}
          {strategyMsg ? <span className="text-xs text-fs-muted">{strategyMsg}</span> : null}
          <button
            type="button"
            onClick={backtestThisStrategy}
            className="rounded-md border border-fs-accent/40 bg-fs-accent-soft px-2.5 py-1 text-sm text-fs-accent-text hover:opacity-90"
            title="以当前条件/排序配置发起历史回测（月度调仓 vs SPY）"
          >
            回测此策略 →
          </button>
        </div>
      </div>

      {/* ── 配置面板 ── */}
      <div className="mb-4 rounded-lg border border-fs-border bg-fs-elevated/40 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="text-sm text-fs-muted">截面日期</label>
          <select
            value={config.date ?? ""}
            onChange={(e) => patchConfig({ date: e.target.value || null })}
            className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1 text-sm"
          >
            <option value="">最新（{latestDate ?? "…"}）</option>
            {[...dates].reverse().map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          {config.date != null ? (
            <span
              className="text-xs text-fs-muted"
              title="具体日期会随策略一起保存；加载该策略将按此历史截面查询（回测语义）。选「最新」则始终查最新期。"
            >
              已钉定该截面（随策略保存）
            </span>
          ) : null}
          {effectiveYear < 2021 ? (
            <span className="text-xs text-amber-500">
              所选日期早于 2021：基本面/估值类因子无数据，已置灰
            </span>
          ) : null}
          <label className="ml-4 text-sm text-fs-muted">最小市值</label>
          <input
            type="number"
            min={0}
            step={1}
            placeholder="不限"
            value={config.universe?.minMarketCap != null ? config.universe.minMarketCap / 1e9 : ""}
            onChange={(e) =>
              patchConfig({
                universe: {
                  ...config.universe,
                  minMarketCap: e.target.value === "" ? null : Number(e.target.value) * 1e9,
                },
              })
            }
            className="w-24 rounded-md border border-fs-border bg-fs-elevated px-2 py-1 text-sm"
          />
          <span className="text-xs text-fs-muted">十亿美元</span>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-fs-muted">行业</span>
          {GICS_SECTOR_DEFS.map((s) => {
            const active = config.universe?.sectors?.includes(s.sector) ?? false;
            return (
              <button
                key={s.sector}
                type="button"
                onClick={() => toggleSector(s.sector)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                  active
                    ? "border-fs-accent/40 bg-fs-accent-soft text-fs-accent-text"
                    : "border-fs-border text-fs-muted hover:bg-fs-elevated"
                }`}
              >
                {s.nameZh}
              </button>
            );
          })}
        </div>

        {/* 条件构建器 */}
        <div className="mb-3 space-y-2">
          {config.conditions.map((c, i) => {
            const def = FACTOR_MAP.get(c.factorKey);
            const unavailable = def != null && def.startYear > effectiveYear;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <FactorSelect
                  value={c.factorKey}
                  year={effectiveYear}
                  onChange={(k) => patchCondition(i, { factorKey: k })}
                />
                <select
                  value={c.metric}
                  onChange={(e) => patchCondition(i, { metric: e.target.value as ScreenerMetric })}
                  className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1 text-sm"
                >
                  {(Object.keys(METRIC_LABELS) as ScreenerMetric[]).map((m) => (
                    <option key={m} value={m}>
                      {METRIC_LABELS[m]}
                    </option>
                  ))}
                </select>
                <select
                  value={c.op}
                  onChange={(e) => {
                    const op = e.target.value as ScreenerOp;
                    const bounds =
                      op === "gte"
                        ? { min: c.bounds.min ?? 0 }
                        : op === "lte"
                          ? { max: c.bounds.max ?? 0 }
                          : { min: c.bounds.min ?? 0, max: c.bounds.max ?? 1 };
                    patchCondition(i, { op, bounds });
                  }}
                  className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1 text-sm"
                >
                  {(Object.keys(OP_LABELS) as ScreenerOp[]).map((o) => (
                    <option key={o} value={o}>
                      {OP_LABELS[o]}
                    </option>
                  ))}
                </select>
                {c.op !== "lte" ? (
                  <input
                    type="number"
                    step="any"
                    value={c.bounds.min ?? ""}
                    onChange={(e) =>
                      patchCondition(i, {
                        bounds: { ...c.bounds, min: e.target.value === "" ? null : Number(e.target.value) },
                      })
                    }
                    className="w-24 rounded-md border border-fs-border bg-fs-elevated px-2 py-1 text-sm"
                    placeholder="min"
                  />
                ) : null}
                {c.op === "between" ? <span className="text-fs-muted">—</span> : null}
                {c.op !== "gte" ? (
                  <input
                    type="number"
                    step="any"
                    value={c.bounds.max ?? ""}
                    onChange={(e) =>
                      patchCondition(i, {
                        bounds: { ...c.bounds, max: e.target.value === "" ? null : Number(e.target.value) },
                      })
                    }
                    className="w-24 rounded-md border border-fs-border bg-fs-elevated px-2 py-1 text-sm"
                    placeholder="max"
                  />
                ) : null}
                {def ? (
                  <span className="text-xs text-fs-muted" title={factorTooltip(def)}>
                    {def.higherIsBetter ? "↑优" : "↓优"} · {def.startYear} 起
                  </span>
                ) : null}
                {unavailable ? (
                  <span className="text-xs text-amber-500">所选日期无该因子数据</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeCondition(i)}
                  className="rounded-md px-1.5 text-fs-muted hover:text-red-400"
                  aria-label="删除条件"
                >
                  ✕
                </button>
              </div>
            );
          })}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-fs-muted">添加条件</span>
            <FactorSelect value="" year={effectiveYear} onChange={addCondition} placeholder="— 选择因子 —" />
          </div>
        </div>

        {/* 排序/复合打分 */}
        <div className="flex flex-wrap items-center gap-3 border-t border-fs-border pt-3 text-sm">
          <span className="text-fs-muted">排序</span>
          <div className="flex overflow-hidden rounded-md border border-fs-border">
            {(["single", "composite"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => patchConfig({ ranking: { ...config.ranking, mode: m } })}
                className={`px-2.5 py-1 ${
                  config.ranking.mode === m
                    ? "bg-fs-accent-soft text-fs-accent-text"
                    : "text-fs-muted hover:bg-fs-elevated"
                }`}
              >
                {m === "single" ? "单因子" : "复合打分"}
              </button>
            ))}
          </div>
          {!isComposite ? (
            <FactorSelect
              value={config.ranking.sortFactor ?? ""}
              year={effectiveYear}
              onChange={(k) =>
                patchConfig({ ranking: { ...config.ranking, sortFactor: k || null } })
              }
              placeholder="— 不排序 —"
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {(config.ranking.weights ?? []).map((w, i) => {
                const def = FACTOR_MAP.get(w.factorKey);
                return (
                  <span
                    key={w.factorKey}
                    className="flex items-center gap-1 rounded-md border border-fs-border bg-fs-elevated px-2 py-0.5"
                    title={def ? factorTooltip(def) : undefined}
                  >
                    {def?.nameZh ?? w.factorKey}
                    <span className="text-xs text-fs-muted">{def?.higherIsBetter ? "↑" : "↓"}</span>
                    ×
                    <input
                      type="number"
                      step="any"
                      value={w.weight}
                      onChange={(e) => {
                        const weight = Number(e.target.value);
                        patchConfig({
                          ranking: {
                            ...config.ranking,
                            weights: (config.ranking.weights ?? []).map((x, j) =>
                              j === i ? { ...x, weight } : x,
                            ),
                          },
                        });
                      }}
                      className="w-16 rounded border border-fs-border bg-transparent px-1 py-0.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        patchConfig({
                          ranking: {
                            ...config.ranking,
                            weights: (config.ranking.weights ?? []).filter((_, j) => j !== i),
                          },
                        })
                      }
                      className="px-0.5 text-fs-muted hover:text-red-400"
                      aria-label="移除权重"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
              <FactorSelect value="" year={effectiveYear} onChange={addWeight} placeholder="+ 加权因子" />
              <span className="text-xs text-fs-muted">复合分 = Σ 权重×Z分×方向</span>
            </div>
          )}
          <label className="ml-2 text-fs-muted">Top N</label>
          <input
            type="number"
            min={1}
            step={1}
            value={config.ranking.topN ?? ""}
            placeholder="全部"
            onChange={(e) =>
              patchConfig({
                ranking: {
                  ...config.ranking,
                  topN: e.target.value === "" ? null : Number(e.target.value),
                },
              })
            }
            className="w-20 rounded-md border border-fs-border bg-fs-elevated px-2 py-1"
          />
          <button
            type="button"
            onClick={() => void runQuery()}
            disabled={loading}
            className="ml-auto rounded-md bg-fs-accent-soft px-4 py-1.5 font-medium text-fs-accent-text ring-1 ring-fs-accent/25 hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "查询中…" : "查询"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {/* ── 结果 ── */}
      {result ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fs-muted">
            <span>
              截面 <span className="text-fs-text">{result.date}</span>
            </span>
            <span>
              宇宙 <span className="text-fs-text">{result.stats.universeTotal}</span> 只
            </span>
            {result.stats.excludedBySector ? <span>行业过滤剔除 {result.stats.excludedBySector}</span> : null}
            {result.stats.excludedByMarketCap ? <span>市值过滤剔除 {result.stats.excludedByMarketCap}</span> : null}
            {result.stats.droppedNull ? (
              <span title={Object.entries(result.stats.excludedByNull).map(([k, n]) => `${FACTOR_MAP.get(k)?.nameZh ?? k}: ${n}`).join("；")}>
                因子缺失剔除 {result.stats.droppedNull}
              </span>
            ) : null}
            <span>条件未过 {result.stats.filteredOut}</span>
            <span>
              命中 <span className="text-fs-text">{result.stats.matched}</span>
              {result.stats.returned < result.stats.matched ? `（显示前 ${result.stats.returned}）` : ""}
            </span>
          </div>

          {sectorMedians && shownFactorKeys.length ? (
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2 text-xs">
              <span className="text-fs-muted">
                {sectorNameZh.get(sectorMedians.sector) ?? sectorMedians.sector} 行业中位数（{result.date}）
              </span>
              {shownFactorKeys.map((k) => {
                const row = sectorMedians.map.get(k);
                const def = FACTOR_MAP.get(k);
                return (
                  <span key={k} className="text-fs-muted">
                    {def?.nameZh ?? k}：
                    <span className="text-fs-text">{row ? fmtValue(row.median) : "—"}</span>
                    {row ? (
                      <span className="opacity-70">
                        {" "}
                        [{fmtValue(row.p25)}, {fmtValue(row.p75)}]
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-fs-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-fs-border bg-fs-elevated/60 text-left text-xs text-fs-muted">
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">代码</th>
                  <th className="px-2 py-2">名称</th>
                  <th className="px-2 py-2">行业</th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => clickSort("marketCap")}>
                    市值{sortIndicator("marketCap")}
                  </th>
                  {isComposite ? (
                    <th className="cursor-pointer px-2 py-2 text-right" onClick={() => clickSort("score")}>
                      复合分{sortIndicator("score")}
                    </th>
                  ) : null}
                  {shownFactorKeys.map((k) => {
                    const def = FACTOR_MAP.get(k);
                    return (
                      <th
                        key={k}
                        className="cursor-pointer px-2 py-2 text-right"
                        title={def ? factorTooltip(def) : undefined}
                        onClick={() => clickSort(k)}
                      >
                        {def?.nameZh ?? k}
                        {sortIndicator(k)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => (
                  <tr key={r.symbol} className="border-b border-fs-border/60 last:border-0 hover:bg-fs-elevated/40">
                    <td className="px-2 py-1.5 text-xs text-fs-muted">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <Link href={`/equity/stocks/${r.symbol}`} className="font-medium text-fs-accent-text hover:underline">
                        {r.symbol}
                      </Link>
                    </td>
                    <td className="max-w-[16rem] truncate px-2 py-1.5">{r.name ?? "—"}</td>
                    <td className="px-2 py-1.5 text-xs text-fs-muted">
                      {r.sector ? (sectorNameZh.get(r.sector) ?? r.sector) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtMcap(r.marketCap)}</td>
                    {isComposite ? (
                      <td className={`px-2 py-1.5 text-right font-medium tabular-nums ${zClass(r.score)}`}>
                        {fmtZ(r.score)}
                      </td>
                    ) : null}
                    {shownFactorKeys.map((k) => {
                      const cell = r.factors[k];
                      return (
                        <td key={k} className="px-2 py-1.5 text-right tabular-nums">
                          <span>{fmtValue(cell?.value)}</span>
                          <span className={`ml-1 text-xs ${zClass(cell?.zscore)}`}>
                            {fmtZ(cell?.zscore)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!sortedRows.length ? (
                  <tr>
                    <td colSpan={6 + shownFactorKeys.length} className="px-3 py-6 text-center text-sm text-fs-muted">
                      无符合条件的股票（试放宽条件或检查因子缺失剔除数）
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-fs-muted">
            单元格 = 原始值 + <span className="text-emerald-400">全市场Z分</span>（红负绿正）；行业为现值 GICS 口径；市值为 PIT 口径（close×股本）。
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-fs-border px-4 py-10 text-center text-sm text-fs-muted">
          配置条件后点击「查询」；支持任意历史月末截面（2000 起技术面、2021 起基本面）。
        </div>
      )}
    </div>
  );
}
