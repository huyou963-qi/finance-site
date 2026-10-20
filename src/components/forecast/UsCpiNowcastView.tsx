"use client";

/**
 * 美国 CPI 预测页（/forecast/us-cpi）：本月 nowcast、分项驱动、历史回测与输入时效。
 * 数据由服务端 `getUsCpiNowcast()` 计算后传入（模型输出不入宏观库）。
 */
import { Fragment, useMemo, useState } from "react";
import type { AccuracyStats } from "@/lib/forecast/usCpi/backtest";
import type { HeadlineForecast, UsCpiNowcastPayload } from "@/lib/forecast/usCpi/service";
import { BacktestChart, CLEVELAND_LINE, ContributionChart, GROUP_COLOR } from "./UsCpiNowcastCharts";

const monthZh = (iso: string) => `${iso.slice(0, 4)} 年 ${Number(iso.slice(5, 7))} 月`;
const pct = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const signed = (v: number, d = 2) => (Number.isFinite(v) ? (v > 0 ? "+" : "") + v.toFixed(d) : "—");
/** 截止日文案：31 表示全月 */
const cutoffText = (d: number) => (d >= 31 ? "全月" : d <= 0 ? "尚无当月数据" : `1–${d} 日`);
const rate = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : "—");

const INPUT_LABELS: Record<string, string> = {
  ALL: "CPI 总体（季调）",
  ALLNSA: "CPI 总体（未季调）",
  CORE: "核心 CPI（季调）",
  CORENSA: "核心 CPI（未季调）",
  PPIFOOD: "PPI 最终需求食品",
  GASRETAIL: "EIA 周度零售汽油价",
  HEATOIL: "纽约港取暖油现货",
  JET: "墨西哥湾航空煤油现货",
  HH: "亨利港天然气现货",
  MANHEIM: "Manheim 二手车批发价指数",
  ZORI: "Zillow 观测租金指数",
};
const HF_INPUT_KEYS = ["GASRETAIL", "HEATOIL", "JET", "HH", "MANHEIM", "ZORI", "PPIFOOD", "ALL"];

function Kpi({ label, value, unit = "%", sub, lead }: { label: string; value: string; unit?: string; sub: string; lead?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 bg-fs-bg px-4 py-3.5">
      <span className="text-[13px] text-fs-muted">{label}</span>
      <span className={`font-mono text-[30px] leading-none tabular-nums ${lead ? "text-fs-accent-text" : "text-fs-text"}`}>
        {value}
        <span className="ml-0.5 text-base text-fs-muted">{unit}</span>
      </span>
      <span className="font-mono text-xs tabular-nums text-fs-muted">{sub}</span>
    </div>
  );
}

function headlineSub(h: HeadlineForecast, prevLabel: string) {
  return `80% 区间 ${pct(h.low)} ~ ${pct(h.high)} · ${prevLabel} ${pct(h.prevMom)}`;
}

function AccuracyTable({ data }: { data: UsCpiNowcastPayload["backtest"]["accuracy"] }) {
  const rows: Array<{ key: "model" | "cleveland" | "mean12" | "lastMonth"; label: string }> = [
    { key: "model", label: "本模型" },
    { key: "cleveland", label: "克利夫兰联储 nowcast" },
    { key: "mean12", label: "过去 12 个月均值" },
    { key: "lastMonth", label: "上月值" },
  ];
  const cells = (s: AccuracyStats) => (
    <>
      <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(s.mae, 3)}</td>
      <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(s.rmse, 3)}</td>
      <td className="px-2.5 py-2 text-right font-mono tabular-nums">{rate(s.within01)}</td>
      <td className="px-2.5 py-2 text-right font-mono tabular-nums">{rate(s.roundHit)}</td>
    </>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="text-xs text-fs-muted">
            <th className="px-2.5 py-2 text-left font-medium">环比预测误差（百分点）</th>
            <th className="px-2.5 py-2 text-right font-medium">MAE</th>
            <th className="px-2.5 py-2 text-right font-medium">RMSE</th>
            <th className="px-2.5 py-2 text-right font-medium">|误差|≤0.1</th>
            <th className="px-2.5 py-2 text-right font-medium">取整命中</th>
          </tr>
        </thead>
        <tbody>
          {(["exCovid", "recent"] as const).map((period) =>
            (["ALL", "CORE"] as const).map((k) => (
              <Fragment key={`${period}-${k}`}>
                <tr className="border-t border-fs-border">
                  <td colSpan={5} className="px-2.5 pb-1 pt-3 text-xs font-medium text-fs-secondary">
                    {k === "ALL" ? "总体 CPI" : "核心 CPI"} ·{" "}
                    {period === "exCovid" ? `2018 年以来，剔除 2020 年 3–6 月（N=${data.exCovid.n}）` : `2023 年以来（N=${data.recent.n}）`}
                  </td>
                </tr>
                {rows.map((r) => {
                  const stats = data[period][k][r.key];
                  if (!stats) return null;
                  return (
                    <tr key={r.key} className={r.key === "model" ? "bg-fs-accent-soft/60 font-medium text-fs-text" : "text-fs-secondary"}>
                      <td className="px-2.5 py-2">{r.label}</td>
                      {cells(stats)}
                    </tr>
                  );
                })}
              </Fragment>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

export function UsCpiNowcastView({ data }: { data: UsCpiNowcastPayload }) {
  const [backtestKey, setBacktestKey] = useState<"ALL" | "CORE">("ALL");
  const prevLabel = `${Number(data.latestCpiMonth.slice(5, 7))} 月`;
  const target = monthZh(data.targetMonth);
  const energyPp = data.components.filter((c) => c.group === "能源").reduce((s, c) => s + c.contribution, 0);
  const otherPp = data.components.filter((c) => c.group !== "能源").reduce((s, c) => s + c.contribution, 0);

  const btPoints = useMemo(
    () =>
      data.backtest.rows.map((r) => ({
        month: r.month,
        forecast: backtestKey === "ALL" ? r.forecastAll : r.forecastCore,
        actual: backtestKey === "ALL" ? r.actualAll : r.actualCore,
        cleveland: backtestKey === "ALL" ? r.clevelandAll : r.clevelandCore,
      })),
    [data.backtest.rows, backtestKey],
  );
  const accEx = data.backtest.accuracy.exCovid;

  const freshness = HF_INPUT_KEYS.map((k) => data.freshness.find((f) => f.key === k)).filter(
    (f): f is NonNullable<typeof f> => Boolean(f),
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6">
      <header className="flex flex-col gap-2 border-b border-fs-border pb-5">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-fs-accent-text">
          CPI-U · 目标月 {target} · 高频数据已观测{cutoffText(data.cutoffDay)}
        </p>
        <h1 className="text-2xl font-semibold text-balance text-fs-text">美国 CPI 预测</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-fs-secondary">
          把 CPI 拆成 18 个分项，各用最直接的高频价格代理建模，再按 BLS 权重加总。最新已公布 CPI 为{" "}
          {monthZh(data.latestCpiMonth)}，本页预测下一次公布的 {target} 数据。所有数值为季调环比，同比按官方未季调口径换算。
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-fs-border bg-fs-border sm:grid-cols-2 lg:grid-cols-4">
          <Kpi lead label="总体 CPI 环比（季调）" value={pct(data.headline.mom)} sub={headlineSub(data.headline, prevLabel)} />
          <Kpi lead label="核心 CPI 环比（季调）" value={pct(data.core.mom)} sub={headlineSub(data.core, prevLabel)} />
          <Kpi label="总体 CPI 同比" value={pct(data.headline.yoy)} sub={`${prevLabel} ${pct(data.headline.prevYoy)}%`} />
          <Kpi label="核心 CPI 同比" value={pct(data.core.yoy)} sub={`${prevLabel} ${pct(data.core.prevYoy)}%`} />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] text-fs-secondary sm:grid-cols-4">
          {(
            [
              ["食品", data.aggregates.FOOD],
              ["能源", data.aggregates.ENE],
              ["核心商品", data.aggregates.CG],
              ["核心服务", data.aggregates.CS],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="flex items-baseline gap-2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: GROUP_COLOR[label] }} />
              <span>{label}</span>
              <span className="font-mono tabular-nums text-fs-text">{signed(v.forecast)}%</span>
              <span className="font-mono text-xs tabular-nums text-fs-muted">
                {prevLabel} {signed(v.prevActual)}
              </span>
            </div>
          ))}
        </div>
        {data.cleveland ? (
          <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-fs-secondary">
            <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: CLEVELAND_LINE }} />
            <span>
              对照：克利夫兰联储 {data.cleveland.label} 对 {target} 的 nowcast 为总体{" "}
              <span className="font-mono tabular-nums text-fs-text">{pct(data.cleveland.all)}%</span>、核心{" "}
              <span className="font-mono tabular-nums text-fs-text">{pct(data.cleveland.core)}%</span>
              （本模型 {pct(data.headline.mom)}% / {pct(data.core.mom)}%，差{" "}
              {signed(data.headline.mom - data.cleveland.all)} / {signed(data.core.mom - data.cleveland.core)} 个百分点）。
            </span>
            <a href={data.cleveland.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-fs-accent-text hover:underline">
              来源
            </a>
          </p>
        ) : null}
        {data.fallbackComponents.length > 0 ? (
          <p className="rounded-md border border-[#f1c40f]/40 bg-[#fdf6d8] px-3 py-2 text-[13px] text-fs-secondary">
            以下分项本月代理数据不足，已退回过去 12 个月均值：
            {data.fallbackComponents
              .map((k) => data.components.find((c) => c.key === k)?.label ?? k)
              .join("、")}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">当月看到的数据越多，预测越准</h2>
        <p className="max-w-3xl text-sm text-fs-secondary">
          总体 CPI 的误差主要来自汽油，取决于当月已经看到几周零售油价。本次预测用到{" "}
          <span className="font-medium text-fs-text">{cutoffText(data.cutoffDay)}</span>
          {data.observedThrough ? `（零售汽油价最新至 ${data.observedThrough}）` : ""}，误差区间按同样的观测天数回测校准：
          月初区间更宽，月末到 CPI 公布前用满整月数据。核心 CPI 主要靠住房和二手车的滞后数据，基本不随观测天数变化。
        </p>
        <div className="overflow-x-auto rounded-md border border-fs-border">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead className="bg-fs-elevated text-xs text-fs-muted">
              <tr>
                <th className="px-2.5 py-2 text-left font-medium">当月高频数据截至</th>
                <th className="px-2.5 py-2 text-right font-medium">总体 MAE</th>
                <th className="px-2.5 py-2 text-right font-medium">总体 80% 区间宽度</th>
                <th className="px-2.5 py-2 text-right font-medium">核心 MAE</th>
                <th className="px-2.5 py-2 text-right font-medium">克利夫兰联储 总体 MAE</th>
              </tr>
            </thead>
            <tbody>
              {data.cutoffCurve.map((c) => (
                <tr
                  key={c.cutoffDay}
                  className={`border-t border-fs-border ${c.current ? "bg-fs-accent-soft/60 font-medium text-fs-text" : "text-fs-secondary"}`}
                >
                  <td className="px-2.5 py-2">
                    {cutoffText(c.cutoffDay)}
                    {c.current ? <span className="ml-2 text-xs text-fs-accent-text">本次</span> : null}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(c.allMae, 3)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">±{pct(c.allBandWidth / 2, 2)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(c.coreMae, 3)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">
                    {c.clevelandAllMae == null ? "—" : pct(c.clevelandAllMae, 3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-fs-muted">2018 年以来逐月样本外回测，剔除 2020 年 3–6 月；单位为百分点。</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">本月由什么驱动</h2>
        <p className="max-w-3xl text-sm text-fs-secondary">
          各分项对总体环比的贡献 = 权重 × 分项预测环比。能源合计约{" "}
          <span className="font-mono tabular-nums text-fs-text">{signed(energyPp)}</span> 个百分点，其余分项合计约{" "}
          <span className="font-mono tabular-nums text-fs-text">{signed(otherPp)}</span>。黑色竖线为 {prevLabel} 实际贡献。
        </p>
        <div className="rounded-md border border-fs-border bg-fs-bg p-3">
          <ContributionChart
            prevLabel={`${prevLabel}实际`}
            items={data.components.map((c) => ({
              label: c.label,
              group: c.group,
              contribution: c.contribution,
              prevContribution: c.prevContribution,
            }))}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">分项预测与代理指标</h2>
        <div className="overflow-x-auto rounded-md border border-fs-border">
          <table className="w-full min-w-[960px] border-collapse text-[13px]">
            <thead className="bg-fs-elevated text-xs text-fs-muted">
              <tr>
                <th className="px-2.5 py-2 text-left font-medium">分项</th>
                <th className="px-2.5 py-2 text-right font-medium">权重 %</th>
                <th className="px-2.5 py-2 text-right font-medium">{prevLabel}实际</th>
                <th className="px-2.5 py-2 text-right font-medium">本月预测</th>
                <th className="px-2.5 py-2 text-right font-medium">贡献 bp</th>
                <th className="px-2.5 py-2 text-right font-medium" title="2018 年以来样本外，剔除疫情月">
                  回测 MAE
                </th>
                <th className="px-2.5 py-2 text-right font-medium" title="过去 12 个月均值作为预测的误差">
                  均值基准 MAE
                </th>
                <th className="px-2.5 py-2 text-right font-medium">相关</th>
                <th className="px-2.5 py-2 text-left font-medium">高频代理 / 方法</th>
              </tr>
            </thead>
            <tbody>
              {data.components.map((c) => (
                <tr key={c.key} className="border-t border-fs-border align-top">
                  <td className="px-2.5 py-2">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: GROUP_COLOR[c.group] }} />
                    <span className="text-fs-text">{c.label}</span>
                    <span className="block pl-4 font-mono text-[11px] text-fs-muted">{c.labelEn}</span>
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(c.weight)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{signed(c.prevActual)}</td>
                  <td className="px-2.5 py-2 text-right font-mono font-medium tabular-nums text-fs-text">{signed(c.forecast)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{signed(c.contribution * 100, 1)}</td>
                  <td
                    className={`px-2.5 py-2 text-right font-mono tabular-nums ${
                      c.backtestMae < c.mean12Mae ? "text-fs-accent-text" : "text-fs-muted"
                    }`}
                  >
                    {pct(c.backtestMae)}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums text-fs-muted">{pct(c.mean12Mae)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(c.correlation)}</td>
                  <td className="max-w-[360px] px-2.5 py-2 text-xs leading-relaxed text-fs-secondary">{c.proxy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-fs-muted">
          权重为 BLS {data.relativeImportanceYear} 年 12 月相对权重，按此后相对价格漂移到上月。回测 MAE 低于均值基准的分项以蓝色标出；
          相关系数接近零的分项（服装、医疗商品、酒店等）月度波动主要是抽样噪声，公开高频数据解释不了。
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-fs-text">历史回测</h2>
          <div className="flex gap-1 rounded-md border border-fs-border p-0.5 text-[13px]" role="tablist">
            {(["ALL", "CORE"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={backtestKey === k}
                onClick={() => setBacktestKey(k)}
                className={`rounded px-2.5 py-1 transition ${
                  backtestKey === k ? "bg-fs-accent-soft font-medium text-fs-accent-text" : "text-fs-muted hover:text-fs-text"
                }`}
              >
                {k === "ALL" ? "总体 CPI" : "核心 CPI"}
              </button>
            ))}
          </div>
        </div>
        <p className="max-w-3xl text-sm text-fs-secondary">
          {data.backtest.from.slice(0, 7)} 至 {data.backtest.to.slice(0, 7)} 逐月滚动：每个月只用当时可得的数据重新估计（CPI 截至上月、
          高频价格与本月同样只取当月{cutoffText(data.cutoffDay)}），预测当月再与公布值比较。剔除疫情月后，总体环比平均误差{" "}
          <span className="font-mono tabular-nums text-fs-text">{pct(accEx.ALL.model.mae, 3)}</span> 个百分点（12 个月均值基准{" "}
          {pct(accEx.ALL.mean12.mae, 3)}），核心{" "}
          <span className="font-mono tabular-nums text-fs-text">{pct(accEx.CORE.model.mae, 3)}</span>（基准 {pct(accEx.CORE.mean12.mae, 3)}）。
        </p>
        <div className="rounded-md border border-fs-border bg-fs-bg p-3">
          <BacktestChart points={btPoints} />
        </div>
        <div className="rounded-md border border-fs-border bg-fs-bg p-3">
          <AccuracyTable data={data.backtest.accuracy} />
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-fs-muted">
          「取整命中」指预测与公布值四舍五入到 0.1 后完全相同；公布值落在 0.05 边界附近时，误差 0.03 也会翻格，因此更应看区间。
          克利夫兰联储取每个目标月同一截止日（含）之前的最后一次 nowcast，与本模型同一信息时点；其数据为第三方模型输出，仅作对照、不入库。
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">输入数据时效</h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-1 text-[13px] sm:grid-cols-2">
          {freshness.map((f) => (
            <div key={f.key} className="flex items-baseline justify-between gap-3 border-b border-fs-border py-1.5">
              <span className="text-fs-secondary">
                {INPUT_LABELS[f.key] ?? f.key}
                <span className="ml-2 font-mono text-[11px] text-fs-muted">{f.seriesKey}</span>
              </span>
              <span className="font-mono tabular-nums text-fs-text">{f.latestDate ?? "—"}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-fs-muted">
          模型结果每 30 分钟按最新入库数据重算一次；计算时间 {data.generatedAt.slice(0, 16).replace("T", " ")} UTC。
        </p>
      </section>

      <details className="rounded-md border border-fs-border bg-fs-elevated/50 px-4 py-3 text-sm text-fs-secondary">
        <summary className="cursor-pointer font-medium text-fs-text">方法与局限</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
          <li>汽油：零售油价月均环比几乎一一对应未季调汽油 CPI，再加上过去 3 年同月「季调 − 未季调」差，得到季调口径。当月尚无油价时沿用上月末价格（视为持平）。</li>
          <li>住房：Zillow 观测租金领先 CPI 租金约 9–12 个月（CPI 按 6 个月一轮的存量租约采价）。</li>
          <li>残差分项（其他核心商品 / 交通服务 / 核心服务）由上级指数减已建模分项倒推，保证加总与官方一致。</li>
          <li>回测使用当前版本季调数据；BLS 每年 2 月修订过去 5 年季节因子，历史误差可能略被低估。</li>
          <li>2025 年 10 月政府停摆期间 CPI 未发布，该月与 11 月不参与估计和评估。</li>
          <li>BLS 每年 1 月发布新一年相对权重，需在 <code className="font-mono text-xs">relativeImportance.ts</code> 追加。</li>
        </ul>
      </details>
    </div>
  );
}
