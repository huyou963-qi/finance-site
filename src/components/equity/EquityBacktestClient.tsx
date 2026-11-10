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
import { FACTOR_DEFS } from "@/lib/quant/factorRegistry";
import { useTr } from "@/i18n/TextProvider";

const INCOMING_CONFIG_KEY = "equityBacktestNewConfig.v1";

/**
 * 各类因子的数据下限年 = 注册表里该类因子最小 startYear，从注册表推导、勿硬编码
 * （早先提示写死 2021，深历史回填 + 13F 补全后基本面到 2012、资金面到 2013，写死就成了错误提示）。
 */
const FUNDAMENTAL_MIN_YEAR = Math.min(
  ...FACTOR_DEFS.filter((d) => d.requires === "fundamental" || d.requires === "price+fundamental").map((d) => d.startYear),
);
const FUNDING_MIN_YEAR = Math.min(
  ...FACTOR_DEFS.filter((d) => d.requires === "funding").map((d) => d.startYear),
);

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
  running: "text-fs-accent-text",
  done: "text-emerald-400",
  failed: "text-red-400",
};

function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * regime 择时可选集。两套口径并列（引擎按 `dalio:` 前缀区分）：
 * 水平口径象限含「增长低于近十年均值」条件，Dalio 口径只看两轴方向，
 * 同名的 stagflation 语义不同，故分两行展示避免混淆。
 */
const REGIME_CHOICES: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: "水平象限",
    items: [
      { key: "recovery", label: "复苏" },
      { key: "overheat", label: "过热" },
      { key: "stagflation", label: "滞胀" },
      { key: "contraction", label: "衰退" },
    ],
  },
  {
    group: "Dalio 象限",
    items: [
      { key: "dalio:goldilocks", label: "金发女孩" },
      { key: "dalio:reflation", label: "再通胀" },
      { key: "dalio:stagflation", label: "滞胀" },
      { key: "dalio:deflation", label: "通缩" },
    ],
  },
];

export function EquityBacktestClient() {
  const tr = useTr();
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
  const [rebalanceFrequency, setRebalanceFrequency] = useState("monthly");
  const [regimeFilter, setRegimeFilter] = useState<Set<string>>(new Set());
  const [blockedExposure, setBlockedExposure] = useState(0);
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
          if (parsed.name) setName(tr("回测：{name}", { name: parsed.name }));
        }
        sessionStorage.removeItem(INCOMING_CONFIG_KEY);
      }
    } catch {
      // 忽略损坏数据
    }
  }, [reloadRuns, tr]);

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
      setFormError(tr("请选择一个已存策略，或从选股器点「回测此策略」带入配置"));
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/equity/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || (selectedStrategy ? tr("回测：{name}", { name: selectedStrategy.name }) : tr("未命名回测")),
          config: configToRun,
          params: {
            start: start || null,
            end: end || null,
            weighting,
            execution,
            costBps,
            rebalanceFrequency,
            regimeFilter: regimeFilter.size ? [...regimeFilter] : null,
            regimeBlockedExposure: regimeFilter.size ? blockedExposure : null,
          },
        }),
      });
      const j = (await r.json()) as { id?: string; error?: string; code?: string };
      if (!r.ok || !j.id) {
        if (j.code === "NEEDS_PRO" || j.code === "NEEDS_PRO_OR_CREDITS") {
          throw new Error(tr("{v0} — 前往 /pricing 升级或购买积分", { v0: j.error ?? tr("需要 Pro") }));
        }
        throw new Error(j.error ?? tr("创建失败"));
      }
      router.push(`/quant/backtest/${j.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tr("创建失败"));
      setSubmitting(false);
    }
  };

  const deleteRun = async (id: string, runName: string) => {
    if (!window.confirm(tr("删除回测「{runName}」？", { runName }))) return;
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
        <h1 className="text-xl font-semibold">{tr("策略回测")}</h1>
        <span className="text-xs text-fs-muted">{tr("月度调仓 · 次日收盘成交 · buy-and-hold 漂移 · vs SPY")}</span>
        <Link href="/quant/screener" className="ml-auto text-sm text-fs-accent-text hover:underline">{tr("去选股器 →")}</Link>
      </div>

      {/* ── 新建表单 ── */}
      <div className="mb-6 rounded-lg border border-fs-border bg-fs-elevated/40 p-4">
        {anonymous ? (
          <div className="mb-3 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-800">{tr("登录后可发起并保存回测。")}</div>
        ) : null}
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">{tr("策略来源")}</label>
            {incomingConfig ? (
              <span className="rounded-md border border-fs-accent/40 bg-fs-accent-soft px-2 py-1 text-fs-accent-text">{tr("来自选股器的配置 ✓")}</span>
            ) : (
              <select
                value={strategyId}
                onChange={(e) => setStrategyId(e.target.value)}
                className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1"
              >
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
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr("未命名回测")}
              className="w-48 rounded-md border border-fs-border bg-fs-elevated px-2 py-1"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">{tr("加权方式")}</label>
            <select value={weighting} onChange={(e) => setWeighting(e.target.value)} className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1">
              <option value="equal">{tr("等权")}</option>
              <option value="mcap">{tr("市值加权")}</option>
              <option value="score">{tr("打分加权（复合分）")}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">{tr("执行时点")}</label>
            <select value={execution} onChange={(e) => setExecution(e.target.value)} className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1">
              <option value="nextClose">{tr("次日收盘（防前视）")}</option>
              <option value="sameClose">{tr("当日收盘")}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">{tr("单边成本(bp)")}</label>
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
            <label className="text-xs text-fs-muted">{tr("调仓频率")}</label>
            <select
              value={rebalanceFrequency}
              onChange={(e) => setRebalanceFrequency(e.target.value)}
              className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1"
            >
              <option value="monthly">{tr("月频")}</option>
              <option value="quarterly">{tr("季频")}</option>
              <option value="semiannual">{tr("半年")}</option>
              <option value="annual">{tr("年频")}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">{tr("起始（可空）")}</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-fs-muted">{tr("结束（可空）")}</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1" />
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || anonymous}
            className="ml-auto rounded-md bg-fs-accent-soft px-4 py-1.5 font-medium text-fs-accent-text ring-1 ring-fs-accent/25 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? tr("创建中…") : tr("发起回测")}
          </button>
        </div>
        {/* regime 择时（可选） */}
        <div className="mt-3 border-t border-fs-border pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="text-xs text-fs-muted">{tr("regime 择时（可选，勾选 = 允许持仓的宏观状态）")}</span>
            {REGIME_CHOICES.map((g) => (
              <div key={tr(g.group)} className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-fs-muted">{tr(g.group)}</span>
                {g.items.map((it) => {
                  const on = regimeFilter.has(it.key);
                  return (
                    <button
                      key={it.key}
                      type="button"
                      onClick={() =>
                        setRegimeFilter((prev) => {
                          const next = new Set(prev);
                          if (next.has(it.key)) next.delete(it.key);
                          else next.add(it.key);
                          return next;
                        })
                      }
                      className={`rounded-md px-2 py-0.5 text-xs ring-1 transition ${
                        on
                          ? "bg-fs-accent-soft text-fs-accent-text ring-fs-accent/30"
                          : "text-fs-muted ring-fs-border hover:text-fs-text"
                      }`}
                    >
                      {tr(it.label)}
                    </button>
                  );
                })}
              </div>
            ))}
            {regimeFilter.size ? (
              <>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-fs-muted">{tr("未命中时仓位")}</label>
                  <select
                    value={blockedExposure}
                    onChange={(e) => setBlockedExposure(Number(e.target.value))}
                    className="rounded-md border border-fs-border bg-fs-elevated px-2 py-1 text-sm"
                  >
                    <option value={0}>{tr("0（清仓持现金）")}</option>
                    <option value={0.25}>25%</option>
                    <option value={0.5}>50%</option>
                    <option value={0.75}>75%</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setRegimeFilter(new Set())}
                  className="text-xs text-fs-muted hover:text-fs-text"
                >{tr("清空")}</button>
              </>
            ) : null}
          </div>
          {regimeFilter.size ? (
            <div className="mt-1.5 text-xs text-fs-muted">{tr("未勾选的 regime 期减仓到上述比例。择时降波动的收益里混着「单纯降暴露」的成分—— 请另跑一次不择时、但把选股数放宽/仓位调低到")}<span className="text-fs-text">{tr("相同平均暴露")}</span>{tr("的对照组，两者之差才是真正的择时能力。")}</div>
          ) : null}
        </div>

        <div className="mt-2 text-xs text-fs-muted">{tr("起点若早于策略数据下限将自动裁剪（基本面因子")}{" "}{FUNDAMENTAL_MIN_YEAR} {tr("起、资金面")} {FUNDING_MIN_YEAR}{" "}{tr("起）；成本按调仓日双边成交额扣减。")}</div>
        {formError ? <div className="mt-2 text-xs text-red-400">{formError}</div> : null}
      </div>

      {/* ── run 列表 ── */}
      {runs == null ? (
        <div className="py-10 text-center text-sm text-fs-muted">{tr("加载中…")}</div>
      ) : runs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-fs-border px-4 py-10 text-center text-sm text-fs-muted">{tr("还没有回测。选择策略并「发起回测」，或从选股器点「回测此策略」。")}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-fs-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-fs-border bg-fs-elevated/60 text-left text-xs text-fs-muted">
                <th className="px-3 py-2">{tr("名称")}</th>
                <th className="px-3 py-2">{tr("状态")}</th>
                <th className="px-3 py-2">{tr("加权")}</th>
                <th className="px-3 py-2 text-right">CAGR</th>
                <th className="px-3 py-2 text-right">{tr("夏普")}</th>
                <th className="px-3 py-2 text-right">{tr("最大回撤")}</th>
                <th className="px-3 py-2">{tr("创建")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-fs-border/60 last:border-0 hover:bg-fs-elevated/40">
                  <td className="px-3 py-2">
                    <Link href={`/quant/backtest/${r.id}`} className="font-medium text-fs-accent-text hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className={`px-3 py-2 text-xs ${STATUS_CLASS[r.status]}`}>
                    {tr(STATUS_LABEL[r.status])}
                    {r.status === "failed" && r.error ? (
                      <span className="ml-1 text-fs-muted" title={r.error}>ⓘ</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-fs-muted">{tr(WEIGHTING_LABEL[r.weighting]) ?? r.weighting}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(r.cagr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.sharpe != null ? r.sharpe.toFixed(2) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(r.maxDrawdown)}</td>
                  <td className="px-3 py-2 text-xs text-fs-muted tabular-nums">{r.createdAt.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void deleteRun(r.id, r.name)}
                      className="text-xs text-fs-muted hover:text-red-400"
                    >{tr("删除")}</button>
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
