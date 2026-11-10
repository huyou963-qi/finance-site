"use client";

/**
 * 稳健性分析列表 + 新建表单（P2 WS4）：/equity/robustness。
 * - 策略来源：已存策略下拉，或从选股器「稳健性分析」经 sessionStorage 带入的 config。
 * - 三模式：scan / oos / walkforward；参数网格由「扫描轴」勾选生成（topN / 排序因子 / 加权）。
 * - 提交 → POST 创建 run（进程内异步）→ 跳报告页轮询。
 * - 不用 useSearchParams，不包 Suspense（Phase 2 陷阱）。
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ScreenerConfig } from "@/lib/quant/screener";
import type { StrategyRow } from "@/lib/quant/screenerStrategies";
import type { ScanAxis, RobustnessMode, RobustnessSpec } from "@/lib/quant/robustnessData";
import { useTr } from "@/i18n/TextProvider";

const INCOMING_CONFIG_KEY = "equityRobustnessNewConfig.v1";

/** 排序因子扫描候选（价格/技术类，全区间可回测，不受基本面下限限制） */
const FACTOR_SCAN_CHOICES: { key: string; label: string }[] = [
  { key: "mom12_1", label: "12-1 动量" },
  { key: "ret1m", label: "1 月收益" },
  { key: "ret3m", label: "3 月收益" },
  { key: "ret6m", label: "6 月收益" },
  { key: "vol60d", label: "60 日波动" },
  { key: "dist52wHigh", label: "距 52 周高" },
  { key: "turnover20d", label: "20 日换手" },
];

type RunSummary = {
  mode: RobustnessMode;
  gridSize: number;
  headlineSharpe: number | null;
  dsr: number | null;
  dsrSignificant: boolean | null;
  oosCollapsed: boolean | null;
};
type RunListItem = {
  id: string;
  name: string;
  mode: RobustnessMode;
  status: "queued" | "running" | "done" | "failed";
  summary: RunSummary | null;
  createdAt: string;
  error: string | null;
};

const MODE_LABEL: Record<string, string> = {
  scan: "参数扫描",
  oos: "样本外分割",
  walkforward: "Walk-Forward",
};
const STATUS_LABEL: Record<string, string> = {
  queued: "排队",
  running: "执行中",
  done: "完成",
  failed: "失败",
};
const STATUS_CLASS: Record<string, string> = {
  queued: "text-fs-muted",
  running: "text-fs-accent-text",
  done: "text-emerald-400",
  failed: "text-red-400",
};

function num(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(d);
}
function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
function parseNums(s: string): number[] {
  return s
    .split(/[,，\s]+/)
    .map((t) => Number(t.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function EquityRobustnessClient() {
  const tr = useTr();
  const router = useRouter();
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [strategies, setStrategies] = useState<StrategyRow[] | null>(null);

  // 表单
  const [name, setName] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [incomingConfig, setIncomingConfig] = useState<ScreenerConfig | null>(null);
  const [mode, setMode] = useState<RobustnessMode>("oos");
  const [weighting, setWeighting] = useState("equal");
  const [costBps, setCostBps] = useState(10);
  const [start, setStart] = useState("2005-01-01");
  const [end, setEnd] = useState("2023-12-31");
  const [splitDate, setSplitDate] = useState("2017-12-31");
  const [folds, setFolds] = useState(4);
  const [minTrainPeriods, setMinTrainPeriods] = useState(36);

  // 扫描轴
  const [scanTopN, setScanTopN] = useState(true);
  const [topNValues, setTopNValues] = useState("20,50,100");
  const [scanFactor, setScanFactor] = useState(false);
  const [factorKeys, setFactorKeys] = useState<string[]>(["mom12_1", "ret1m", "vol60d"]);
  const [scanWeighting, setScanWeighting] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reloadRuns = useCallback(async () => {
    try {
      const r = await fetch("/api/equity/robustness", { cache: "no-store" });
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
    try {
      const raw = sessionStorage.getItem(INCOMING_CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { config: ScreenerConfig; name?: string };
        if (parsed?.config) {
          setIncomingConfig(parsed.config);
          if (parsed.name) setName(tr("稳健性：{name}", { name: parsed.name }));
        }
        sessionStorage.removeItem(INCOMING_CONFIG_KEY);
      }
    } catch {
      // 忽略损坏数据
    }
  }, [reloadRuns, tr]);

  useEffect(() => {
    if (!runs?.some((r) => r.status === "queued" || r.status === "running")) return;
    const timer = setInterval(() => void reloadRuns(), 2500);
    return () => clearInterval(timer);
  }, [runs, reloadRuns]);

  const selectedStrategy = strategies?.find((s) => s.id === strategyId) ?? null;
  const configToRun: ScreenerConfig | null = incomingConfig ?? selectedStrategy?.config ?? null;

  // 构建扫描轴（客户端预估点数）
  const buildAxes = (): ScanAxis[] => {
    const axes: ScanAxis[] = [];
    if (scanTopN) {
      const vals = parseNums(topNValues);
      if (vals.length) axes.push({ key: "topN", kind: "topN", values: vals });
    }
    if (scanFactor && factorKeys.length >= 2) {
      axes.push({ key: tr("因子"), kind: "sortFactor", values: factorKeys });
    }
    if (scanWeighting) {
      axes.push({ key: tr("加权"), kind: "weighting", values: ["equal", "mcap"] });
    }
    return axes;
  };
  const axes = buildAxes();
  const gridSize = axes.reduce((n, a) => n * a.values.length, 1);

  const toggleFactor = (k: string) =>
    setFactorKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const submit = async () => {
    setFormError(null);
    if (!configToRun) {
      setFormError(tr("请选择一个已存策略，或从选股器带入配置"));
      return;
    }
    if ((mode === "scan" || mode === "walkforward" || mode === "oos") && gridSize > 64) {
      setFormError(tr("参数网格 {gridSize} 点过大（上限 64），请收窄扫描轴", { gridSize }));
      return;
    }
    if (mode === "scan" && axes.length === 0) {
      setFormError(tr("参数扫描模式需至少启用一个扫描轴"));
      return;
    }
    const spec: RobustnessSpec = {
      mode,
      axes,
      splitDate: mode === "oos" ? splitDate || null : null,
      folds: mode === "walkforward" ? folds : undefined,
      minTrainPeriods: mode === "walkforward" ? minTrainPeriods : undefined,
      selectMetric: "sharpe",
    };
    setSubmitting(true);
    try {
      const r = await fetch("/api/equity/robustness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || (selectedStrategy ? tr("稳健性：{name}", { name: selectedStrategy.name }) : tr("未命名稳健性分析")),
          config: configToRun,
          params: { start: start || null, end: end || null, weighting, execution: "nextClose", costBps },
          spec,
        }),
      });
      const j = (await r.json()) as { id?: string; error?: string; code?: string };
      if (!r.ok || !j.id) {
        if (j.code === "NEEDS_PRO" || j.code === "NEEDS_PRO_OR_CREDITS") {
          throw new Error(tr("{v0} — 前往 /pricing 升级或购买积分", { v0: j.error ?? tr("需要 Pro") }));
        }
        throw new Error(j.error ?? tr("创建失败"));
      }
      router.push(`/quant/robustness/${j.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tr("创建失败"));
      setSubmitting(false);
    }
  };

  const deleteRun = async (id: string, runName: string) => {
    if (!window.confirm(tr("删除稳健性分析「{runName}」？", { runName }))) return;
    try {
      await fetch(`/api/equity/robustness/${id}`, { method: "DELETE" });
      await reloadRuns();
    } catch {
      // 忽略
    }
  };

  const fieldCls = "rounded-md border border-fs-border bg-fs-elevated px-2 py-1";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{tr("过拟合防护 · 稳健性分析")}</h1>
        <span className="text-xs text-fs-muted">{tr("样本外分割 · Walk-Forward · 参数扫描 + Deflated Sharpe，靶向「选择性过拟合」")}</span>
        <Link href="/quant/backtest" className="ml-auto text-sm text-fs-accent-text hover:underline">{tr("单策略回测 →")}</Link>
      </div>

      <div className="mb-4 rounded-md border border-fs-border bg-fs-elevated/30 px-3 py-2 text-xs text-fs-muted">{tr("平台因子已 PIT、无前视；过拟合风险在")}<span className="text-fs-text">{tr("人工的策略选择")}</span>{tr("（挑哪些因子/阈值/topN）。 本工具把「从一堆参数里挑最优」这一动作放到样本外与多重检验下检验——单跑一个固定策略只测时间稳定性，不等于免疫。")}</div>

      {/* ── 新建表单 ── */}
      <div className="mb-6 rounded-lg border border-fs-border bg-fs-elevated/40 p-4">
        {anonymous ? (
          <div className="mb-3 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-800">{tr("登录后可发起并保存稳健性分析。")}</div>
        ) : null}
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">{tr("策略来源")}</label>
            {incomingConfig ? (
              <span className="rounded-md border border-fs-accent/40 bg-fs-accent-soft px-2 py-1 text-fs-accent-text">{tr("来自选股器的配置 ✓")}</span>
            ) : (
              <select value={strategyId} onChange={(e) => setStrategyId(e.target.value)} className={fieldCls}>
                <option value="">{tr("— 选择已存策略 —")}</option>
                {(strategies ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">{tr("名称")}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("未命名稳健性分析")} className={`w-48 ${fieldCls}`} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">{tr("模式")}</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as RobustnessMode)} className={fieldCls}>
              <option value="oos">{tr("样本外分割（IS 挑参 / OOS 检验）")}</option>
              <option value="scan">{tr("参数扫描（稳健性面 + DSR）")}</option>
              <option value="walkforward">{tr("Walk-Forward（滚动 OOS 拼接）")}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">{tr("加权")}</label>
            <select value={weighting} onChange={(e) => setWeighting(e.target.value)} className={fieldCls}>
              <option value="equal">{tr("等权")}</option>
              <option value="mcap">{tr("市值加权")}</option>
              <option value="score">{tr("打分加权")}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">{tr("成本(bp)")}</label>
            <input type="number" min={0} step={1} value={costBps} onChange={(e) => setCostBps(Number(e.target.value))} className={`w-20 ${fieldCls}`} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">{tr("起始")}</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={fieldCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">{tr("结束")}</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={fieldCls} />
          </div>
          {mode === "oos" ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-fs-muted">{tr("IS/OOS 分割日")}</label>
              <input type="date" value={splitDate} onChange={(e) => setSplitDate(e.target.value)} className={fieldCls} />
            </div>
          ) : null}
          {mode === "walkforward" ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-fs-muted">{tr("测试折数")}</label>
                <input type="number" min={1} max={12} value={folds} onChange={(e) => setFolds(Number(e.target.value))} className={`w-20 ${fieldCls}`} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-fs-muted">{tr("最少训练期")}</label>
                <input type="number" min={6} value={minTrainPeriods} onChange={(e) => setMinTrainPeriods(Number(e.target.value))} className={`w-20 ${fieldCls}`} />
              </div>
            </>
          ) : null}
        </div>

        {/* 扫描轴 */}
        <div className="mt-3 rounded-md border border-fs-border/60 bg-fs-elevated/30 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-fs-muted">
            <span className="font-medium text-fs-text">{tr("扫描轴")}</span>
            <span>{tr("参数网格 = 各轴取值笛卡尔积")}</span>
            <span className={`ml-auto rounded px-1.5 py-0.5 tabular-nums ${gridSize > 64 ? "bg-red-400/15 text-red-400" : "bg-fs-elevated text-fs-text"}`}>
              {gridSize} {tr("点 / N=")}{gridSize}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={scanTopN} onChange={(e) => setScanTopN(e.target.checked)} />
              <span>topN</span>
              <input value={topNValues} onChange={(e) => setTopNValues(e.target.value)} disabled={!scanTopN} className={`w-32 ${fieldCls} disabled:opacity-40`} />
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={scanWeighting} onChange={(e) => setScanWeighting(e.target.checked)} />
              <span>{tr("加权 (equal×mcap)")}</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={scanFactor} onChange={(e) => setScanFactor(e.target.checked)} />
              <span>{tr("排序因子")}</span>
            </label>
          </div>
          {scanFactor ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FACTOR_SCAN_CHOICES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleFactor(c.key)}
                  className={`rounded-md border px-2 py-0.5 text-xs transition ${
                    factorKeys.includes(c.key)
                      ? "border-fs-accent/40 bg-fs-accent-soft text-fs-accent-text"
                      : "border-fs-border text-fs-muted hover:text-fs-text"
                  }`}
                >
                  {tr(c.label)}
                </button>
              ))}
              {factorKeys.length < 2 ? <span className="self-center text-xs text-red-400">{tr("至少选 2 个")}</span> : null}
            </div>
          ) : null}
          <div className="mt-2 text-[11px] text-fs-muted">{tr("提示：网格别开太大（3×3=9、3×3×2=18 足够展示邻域）。空网格 = 固定策略（walk-forward 只测时间稳定性）。")}</div>
        </div>

        <div className="mt-3 flex items-center">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || anonymous}
            className="ml-auto rounded-md bg-fs-accent-soft px-4 py-1.5 font-medium text-fs-accent-text ring-1 ring-fs-accent/25 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? tr("创建中…") : tr("发起稳健性分析")}
          </button>
        </div>
        {formError ? <div className="mt-2 text-xs text-red-400">{formError}</div> : null}
      </div>

      {/* ── run 列表 ── */}
      {runs == null ? (
        <div className="py-10 text-center text-sm text-fs-muted">{tr("加载中…")}</div>
      ) : runs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-fs-border px-4 py-10 text-center text-sm text-fs-muted">{tr("还没有稳健性分析。选择策略、设定模式与扫描轴，「发起稳健性分析」。")}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-fs-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-fs-border bg-fs-elevated/60 text-left text-xs text-fs-muted">
                <th className="px-3 py-2">{tr("名称")}</th>
                <th className="px-3 py-2">{tr("模式")}</th>
                <th className="px-3 py-2">{tr("状态")}</th>
                <th className="px-3 py-2 text-right">{tr("网格")}</th>
                <th className="px-3 py-2 text-right">{tr("头条夏普")}</th>
                <th className="px-3 py-2 text-right">DSR</th>
                <th className="px-3 py-2">{tr("创建")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-fs-border/60 last:border-0 hover:bg-fs-elevated/40">
                  <td className="px-3 py-2">
                    <Link href={`/quant/robustness/${r.id}`} className="font-medium text-fs-accent-text hover:underline">
                      {r.name}
                    </Link>
                    {r.summary?.oosCollapsed ? <span className="ml-1 text-xs text-red-400" title={tr("样本外崩溃")}>⚠</span> : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-fs-muted">{tr(MODE_LABEL[r.mode]) ?? r.mode}</td>
                  <td className={`px-3 py-2 text-xs ${STATUS_CLASS[r.status]}`}>
                    {tr(STATUS_LABEL[r.status])}
                    {r.status === "failed" && r.error ? <span className="ml-1 text-fs-muted" title={r.error}>ⓘ</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-fs-muted">{r.summary?.gridSize ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(r.summary?.headlineSharpe)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.summary?.dsr == null ? (
                      "—"
                    ) : (
                      <span className={r.summary.dsrSignificant ? "text-emerald-400" : "text-red-400"}>{pct(r.summary.dsr)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-fs-muted tabular-nums">{r.createdAt.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => void deleteRun(r.id, r.name)} className="text-xs text-fs-muted hover:text-red-400">{tr("删除")}</button>
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
