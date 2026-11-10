"use client";

/**
 * 美国 GDP Now 的公开部分：当前预测、季内精度曲线、历史回测和亚特兰大联储对照。
 * 方程、权重和输入在服务端 `UsGdpModelDetails`，只渲染给管理员。
 */
import type { ErrorStats, GdpAccuracy, UsGdpNowcastPublicPayload } from "@/lib/forecast/usGdp/service";
import { GDPNOW_LINE, GdpBacktestChart, MODEL_LINE } from "./UsGdpNowcastCharts";
import { useTr } from "@/i18n/TextProvider";

const quarterZh = (iso: string) => `${iso.slice(0, 4)}Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
const pct = (v: number | null | undefined, d = 2) => (v != null && Number.isFinite(v) ? v.toFixed(d) : "—");
const signed = (v: number) => (Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(2)}` : "—");

function Kpi({ label, value, sub, lead }: { label: string; value: string; sub: string; lead?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 bg-fs-bg px-4 py-3.5">
      <span className="text-[13px] text-fs-muted">{label}</span>
      <span className={`font-mono text-[30px] leading-none tabular-nums ${lead ? "text-fs-accent-text" : "text-fs-text"}`}>
        {value}
        <span className="ml-0.5 text-base text-fs-muted">%</span>
      </span>
      <span className="font-mono text-xs tabular-nums text-fs-muted">{sub}</span>
    </div>
  );
}

function StatCells({ s }: { s: ErrorStats | undefined }) {
  if (!s || !s.n) return <td colSpan={3} className="px-2.5 py-2 text-right text-fs-muted">—</td>;
  return (
    <>
      <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(s.mae)}</td>
      <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(s.rmse)}</td>
      <td className="px-2.5 py-2 text-right font-mono tabular-nums">{s.n}</td>
    </>
  );
}

function AccuracyTable({ title, row, showGdpNow }: { title: string; row: GdpAccuracy; showGdpNow: boolean }) {
  const tr = useTr();
  const lines: Array<{ key: string; label: string; s: ErrorStats | undefined; me?: boolean }> = [
    { key: "model", label: tr("本模型"), s: row.model, me: true },
    ...(showGdpNow ? [{ key: "gdpNow", label: tr("亚特兰大联储 GDPNow"), s: row.gdpNow }] : []),
    { key: "mean40", label: tr("过去 40 个季度均值"), s: row.mean40 },
    { key: "prevQ", label: tr("上一季度增速"), s: row.prevQ },
  ];
  return (
    <div className="overflow-x-auto rounded-md border border-fs-border">
      <table className="w-full min-w-[480px] border-collapse text-[13px]">
        <thead className="bg-fs-elevated text-xs text-fs-muted">
          <tr>
            <th className="px-2.5 py-2 text-left font-medium">{title}</th>
            <th className="px-2.5 py-2 text-right font-medium">MAE</th>
            <th className="px-2.5 py-2 text-right font-medium">RMSE</th>
            <th className="px-2.5 py-2 text-right font-medium">{tr("季度数")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr
              key={l.key}
              className={`border-t border-fs-border ${l.me ? "bg-fs-accent-soft/60 font-medium text-fs-text" : "text-fs-secondary"}`}
            >
              <td className="px-2.5 py-2">{l.label}</td>
              <StatCells s={l.s} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UsGdpNowcastView({ data }: { data: UsGdpNowcastPublicPayload }) {
  const tr = useTr();
  const target = quarterZh(data.targetQuarter);
  const last = data.recent.at(-1);
  const chartPoints = data.backtest
    .filter((p) => !p.covid)
    .map((p) => ({ quarter: quarterZh(p.quarter), forecast: p.forecast, actual: p.actual, gdpNow: p.gdpNow }));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6">
      <header className="flex flex-col gap-2 border-b border-fs-border pb-5">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-fs-accent-text">{tr("实际 GDP · 目标")}{" "}{target} {tr("· 数据截至")} {data.asOf}{tr("（季度第")} {data.offsetDays + 1}{" "}{tr("天）")}</p>
        <h1 className="text-2xl font-semibold text-balance text-fs-text">{tr("美国 GDP Now")}</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-fs-secondary">{tr("预测下一次公布的")}{" "}{target}{" "}{tr("实际 GDP 季度环比折年率首发值，并按同样的信息时点回测历史误差。新数据入库后自动重算。")}</p>
      </header>

      <section className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-fs-border bg-fs-border sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            lead
            label={tr("{target} 折年增速（预测）", { target })}
            value={signed(data.nowcast)}
            sub={tr("80% 区间 {v0} ~ {v1}", { v0: signed(data.low), v1: signed(data.high) })}
          />
          <Kpi
            label={tr("{v0}（首发 → 最新）", { v0: last ? quarterZh(last.quarter) : tr("上季") })}
            value={signed(last?.latest ?? NaN)}
            sub={tr("首发 {v0}，修订 {v1}", { v0: pct(last?.first), v1: pct((last?.latest ?? NaN) - (last?.first ?? NaN)) })}
          />
          <Kpi
            label={tr("2012 年以来当前时点 MAE")}
            value={pct(data.accuracy.test.model.mae)}
            sub={tr("40 季均值基准 {v0} 个百分点", { v0: pct(data.accuracy.test.mean40.mae) })}
          />
          <Kpi
            label={data.gdpNow ? tr("亚特兰大联储 GDPNow") : tr("亚特兰大联储 GDPNow")}
            value={data.gdpNow ? signed(data.gdpNow.value) : "—"}
            sub={tr("第三方模型，仅作对照")}
          />
        </div>
        {data.gdpNow ? (
          <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-fs-secondary">
            <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: GDPNOW_LINE }} />
            <span>{tr("对照：亚特兰大联储 GDPNow 对")}{" "}{target} {tr("的最新读数为")}{" "}
              <span className="font-mono tabular-nums text-fs-text">{pct(data.gdpNow.value)}%</span>{tr("（本模型")}{" "}{pct(data.nowcast)}{tr("%，差")} {signed(data.nowcast - data.gdpNow.value)}{" "}{tr("个百分点）。")}</span>
            <a href={data.gdpNow.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-fs-accent-text hover:underline">{tr("来源")}</a>
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">{tr("季内看到的数据越多，预测越准")}</h2>
        <p className="max-w-3xl text-sm text-fs-secondary">{tr("随着季度内官方数据陆续公布，历史误差通常下降。80% 区间按当前时点（目标季度第")}{" "}{data.offsetDays + 1}{" "}{tr("天）的历史误差校准。")}</p>
        <div className="overflow-x-auto rounded-md border border-fs-border">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead className="bg-fs-elevated text-xs text-fs-muted">
              <tr>
                <th className="px-2.5 py-2 text-left font-medium">{tr("预测时点")}</th>
                <th className="px-2.5 py-2 text-right font-medium">{tr("本模型 MAE")}</th>
                <th className="px-2.5 py-2 text-right font-medium">RMSE</th>
                <th className="px-2.5 py-2 text-right font-medium">{tr("同一样本 MAE")}</th>
                <th className="px-2.5 py-2 text-right font-medium">GDPNow MAE</th>
              </tr>
            </thead>
            <tbody>
              {data.curve.map((c) => (
                <tr
                  key={c.key}
                  className={`border-t border-fs-border ${c.current ? "bg-fs-accent-soft/60 font-medium text-fs-text" : "text-fs-secondary"}`}
                >
                  <td className="px-2.5 py-2">
                    {c.label}
                    {c.current ? <span className="ml-2 text-xs text-fs-accent-text">{tr("本次")}</span> : null}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(c.mae)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(c.rmse)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(c.sameSampleModelMae)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">
                    {c.gdpNowMae == null ? "—" : pct(c.gdpNowMae)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-fs-muted">
          {data.accuracy.testFrom.slice(0, 4)}{" "}{tr("年以来样本外回测，剔除 2020Q1–2021Q2；单位为百分点。GDPNow 列只统计 2016Q2 起两者在同一天都有读数的季度。")}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">{tr("历史回测")}</h2>
        <div className="rounded-md border border-fs-border bg-fs-bg p-3">
          <div className="mb-1 flex flex-wrap gap-x-4 text-xs text-fs-muted">
            <span>
              <span className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: MODEL_LINE }} />{tr("模型按当前时点（季度第")}{" "}{data.offsetDays + 1}{" "}{tr("天）回测")}</span>
            <span>
              <span className="mr-1 inline-block h-0 w-4 border-t border-dashed align-middle" style={{ borderColor: GDPNOW_LINE }} />{tr("GDPNow 为同一天之前的最后一次读数")}</span>
          </div>
          <GdpBacktestChart points={chartPoints} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AccuracyTable title={tr("{v0} 年以来（当前时点，剔除疫情段）", { v0: data.accuracy.testFrom.slice(0, 4) })} row={data.accuracy.test} showGdpNow={false} />
          {data.accuracy.vsGdpNowNow ? (
            <AccuracyTable title={tr("2016Q2 起同一样本（当前时点）")} row={data.accuracy.vsGdpNowNow} showGdpNow />
          ) : null}
          {data.accuracy.vsGdpNowPre ? (
            <AccuracyTable title={tr("2016Q2 起同一样本（首发前一天）")} row={data.accuracy.vsGdpNowPre} showGdpNow />
          ) : null}
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-fs-muted">{tr("图中不含 2020Q1–2021Q2。GDPNow 是第三方模型输出，只在页面上对照，不写入宏观库。季初本模型的历史误差通常更小；临近首发时 GDPNow 往往更准。")}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">{tr("最近几个季度：首发与修订")}</h2>
        <div className="overflow-x-auto rounded-md border border-fs-border">
          <table className="w-full min-w-[420px] border-collapse text-[13px]">
            <thead className="bg-fs-elevated text-xs text-fs-muted">
              <tr>
                <th className="px-2.5 py-2 text-left font-medium">{tr("季度")}</th>
                <th className="px-2.5 py-2 text-right font-medium">{tr("首发")}</th>
                <th className="px-2.5 py-2 text-right font-medium">{tr("最新")}</th>
                <th className="px-2.5 py-2 text-right font-medium">{tr("累计修订")}</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((q) => (
                <tr key={q.quarter} className="border-t border-fs-border text-fs-secondary">
                  <td className="px-2.5 py-2">{quarterZh(q.quarter)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(q.first)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums text-fs-text">{pct(q.latest)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(q.latest - q.first)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-fs-muted">{tr("结果按最新入库数据定期重算；计算时间")}{" "}{data.generatedAt.slice(0, 16).replace("T", " ")} UTC。
      </p>
    </div>
  );
}
