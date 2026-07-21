"use client";

/**
 * 回测列表 + 新建表单（Phase 3 WS4）：/equity/backtest。
 * - 策略来源：已存策略下拉，或 screener「回测此策略」经 sessionStorage 传入的 config。
 * - 提交 → POST 创建 run（进程内异步执行）→ 跳报告页轮询。
 * - 不用 useSearchParams，故不包 Suspense（Phase 2 陷阱 1）。
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ScreenerConfig } from "@/lib/quant/screener";
import type { StrategyRow } from "@/lib/quant/screenerStrategies";

const INCOMING_CONFIG_KEY = "equityBacktestNewConfig.v1";

type RunListItem = {
  id: string;
  name: string;
  status: "queued" | "running" | "done" | "failed";
  weighting: string;
  start: string | null;
  end: string | null;
  cagr: number | null;
  sharpe: number | null;
  maxDrawdown: number | null;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
};

const WEIGHTING_LABEL: Record<string, string> = {
  equal: "等权",
  mcap: "市值加权",
  score: "打分加权",
};
const STATUS_LABEL: Record<string, string> = {
  queued: "排队",
  running: "执行中",
  done: "完成",
  failed: "失败",
};
const STATUS_CLASS: Record<string, string> = {
  queued: "text-fs-muted",
  running: "text-amber-400",
  done: "text-emerald-400",
  failed: "text-red-400",
};

function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export function EquityBacktestClient() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [strategies, setStrategies] = useState<StrategyRow[] | null>(null);

  // 新建表单状态
  const [name, setName] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [incomingConfig, setIncomingConfig] = useState<ScreenerConfig | null>(null);
  const [weighting, setWeighting] = useState("equal");
  const [execution, setExecution] = useState("nextClose");
  const [costBps, setCostBps] = useState(10);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reloadRuns = useCallback(async () => {
    try {
      const r = await fetch("/api/equity/backtest", { cache: "no-store" });
      const j = (await r.json()) as { runs?: RunListItem[]; anonymous?: boolean };
      setRuns(j.runs ?? []);
      setAnonymous(!!j.anonymous);
    } catch {
      setRuns([]);
    }
  }, []);

  useEffect(() => {
    void reloadRuns();
    fetch("/api/equity/screener/strategies", { cache: "no-store" })
      .then(async (r) => (r.status === 401 ? null : ((await r.json()) as { strategies?: StrategyRow[] })))
      .then((j) => setStrategies(j?.strategies ?? null))
      .catch(() => setStrategies(null));

    // screener「回测此策略」传入的 config
    try {
      const raw = sessionStorage.getItem(INCOMING_CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { config: ScreenerConfig; name?: string };
        if (parsed?.config) {
          setIncomingConfig(parsed.config);
          if (parsed.name) setName(`回测：${parsed.name}`);
        }
        sessionStorage.removeItem(INCOMING_CONFIG_KEY);
      }
    } catch {
      // 忽略损坏数据
    }
  }, [reloadRuns]);

  // running/queued 存在时轮询列表刷新状态与指标
  useEffect(() => {
    if (!runs?.some((r) => r.status === "queued" || r.status === "running")) return;
    const timer = setInterval(() => void reloadRuns(), 2000);
    return () => clearInterval(timer);
  }, [runs, reloadRuns]);

  const selectedStrategy = strategies?.find((s) => s.id === strategyId) ?? null;
  const configToRun: ScreenerConfig | null = incomingConfig ?? selectedStrategy?.config ?? null;

  const submit = async () => {
    setFormError(null);
    if (!configToRun) {
      setFormError("请选择一个已存策略，或从选股器点「回测此策略」带入配置");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/equity/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || (selectedStrategy ? `回测：${selectedStrategy.name}` : "未命名回测"),
          config: configToRun,
          params: {
            start: start || null,
            end: end || null,
            weighting,
            execution,
            costBps,
          },
        }),
      });
      const j = (await r.json()) as { id?: string; error?: string };
      if (!r.ok || !j.id) throw new Error(j.error ?? "创建失败");
      router.push(`/equity/backtest/${j.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "创建失败");
      setSubmitting(false);
    }
  };

  const deleteRun = async (id: string, runName: string) => {
    if (!window.confirm(`删除回测「${runName}」？`)) return;
    try {
      await fetch(`/api/equity/backtest/${id}`, { method: "DELETE" });
      await reloadRuns();
    } catch {
      // 忽略
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">策略回测</h1>
        <span className="text-xs text-fs-muted">月度调仓 · 次日收盘成交 · buy-and-hold 漂移 · vs SPY</span>
        <Link href="/equity/screener" className="ml-auto text-sm text-fs-accent-text hover:underline">
          去选股器 →
        </Link>
      </div>

      {/* ── 新建表单 ── */}
      <div className="mb-6 rounded-lg border border-fs-border bg-fs-elevated/40 p-4">
        {anonymous ? (
          <div className="mb-3 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-500/90">
            登录后可发起并保存回测。
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">策略来源</label>
            {incomingConfig ? (
              <span className="rounded-md border border-fs-accent/40 bg-fs-accent-soft px-2 py-1 text-fs-accent-text">
                来自选股器的配置 ✓
              </span>
            ) : (
              <select
                value={strategyId}
                onChange={(e) => setStrategyId(e.target.value)}
                className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1"
              >
                <option value="">— 选择已存策略 —</option>
                {(strategies ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="未命名回测"
              className="w-48 rounded-md border border-fs-border bg-fs-elevated px-2 py-1"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">加权方式</label>
            <select value={weighting} onChange={(e) => setWeighting(e.target.value)} className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1">
              <option value="equal">等权</option>
              <option value="mcap">市值加权</option>
              <option value="score">打分加权（复合分）</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">执行时点</label>
            <select value={execution} onChange={(e) => setExecution(e.target.value)} className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1">
              <option value="nextClose">次日收盘（防前视）</option>
              <option value="sameClose">当日收盘</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">单边成本(bp)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={costBps}
              onChange={(e) => setCostBps(Number(e.target.value))}
              className="w-24 rounded-md border border-fs-border bg-fs-elevated px-2 py-1"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">起始（可空）</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">结束（可空）</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1" />
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || anonymous}
            className="ml-auto rounded-md bg-fs-accent-soft px-4 py-1.5 font-medium text-fs-accent-text ring-1 ring-fs-accent/25 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "创建中…" : "发起回测"}
          </button>
        </div>
        <div className="mt-2 text-xs text-fs-muted">
          起点若早于策略数据下限（含基本面因子 → 2021）将自动裁剪；成本按调仓日双边成交额扣减。
        </div>
        {formError ? <div className="mt-2 text-xs text-red-400">{formError}</div> : null}
      </div>

      {/* ── run 列表 ── */}
      {runs == null ? (
        <div className="py-10 text-center text-sm text-fs-muted">加载中…</div>
      ) : runs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-fs-border px-4 py-10 text-center text-sm text-fs-muted">
          还没有回测。选择策略并「发起回测」，或从选股器点「回测此策略」。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-fs-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-fs-border bg-fs-elevated/60 text-left text-xs text-fs-muted">
                <th className="px-3 py-2">名称</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">加权</th>
                <th className="px-3 py-2 text-right">CAGR</th>
                <th className="px-3 py-2 text-right">夏普</th>
                <th className="px-3 py-2 text-right">最大回撤</th>
                <th className="px-3 py-2">创建</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-fs-border/60 last:border-0 hover:bg-fs-elevated/40">
                  <td className="px-3 py-2">
                    <Link href={`/equity/backtest/${r.id}`} className="font-medium text-fs-accent-text hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className={`px-3 py-2 text-xs ${STATUS_CLASS[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                    {r.status === "failed" && r.error ? (
                      <span className="ml-1 text-fs-muted" title={r.error}>ⓘ</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-fs-muted">{WEIGHTING_LABEL[r.weighting] ?? r.weighting}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(r.cagr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.sharpe != null ? r.sharpe.toFixed(2) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(r.maxDrawdown)}</td>
                  <td className="px-3 py-2 text-xs text-fs-muted tabular-nums">{r.createdAt.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void deleteRun(r.id, r.name)}
                      className="text-xs text-fs-muted hover:text-red-400"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
