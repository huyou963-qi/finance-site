"use client";

/**
 * 美国非农预测页的公开部分：本月 nowcast、精度曲线、真实时点回测，以及 ADP、SPF 对照。
 * 特征、贡献和估计方法在服务端 `UsNfpModelDetails`，只渲染给管理员。
 */
import type { AccuracyRow, ErrorStats, UsNfpNowcastPublicPayload } from "@/lib/forecast/usNfp/service";
import { ADP_DOT, MODEL_LINE, NfpBacktestChart, SPF_LINE, SpfComparisonChart } from "./UsNfpNowcastCharts";
import { useTr } from "@/i18n/TextProvider";
import type { Tr } from "@/i18n/text";

const monthZh = (iso: string, tr: Tr) => tr("{year} 年 {month} 月", { year: iso.slice(0, 4), month: Number(iso.slice(5, 7)) });
const signedK = (v: number | null | undefined) =>
  v != null && Number.isFinite(v) ? `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("en-US")}` : "—";
const f1 = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? v.toFixed(1) : "—");

function Kpi({ label, value, sub, lead }: { label: string; value: string; sub: string; lead?: boolean }) {
  const tr = useTr();
  return (
    <div className="flex flex-col gap-1.5 bg-fs-bg px-4 py-3.5">
      <span className="text-[13px] text-fs-muted">{label}</span>
      <span className={`font-mono text-[30px] leading-none tabular-nums ${lead ? "text-fs-accent-text" : "text-fs-text"}`}>
        {value}
        <span className="ml-1 text-base text-fs-muted">{tr("千人")}</span>
      </span>
      <span className="font-mono text-xs tabular-nums text-fs-muted">{sub}</span>
    </div>
  );
}

function StatCells({ s }: { s: ErrorStats | undefined }) {
  if (!s) return <td colSpan={3} className="px-2.5 py-2 text-right text-fs-muted">—</td>;
  return (
    <>
      <td className="px-2.5 py-2 text-right font-mono tabular-nums">{f1(s.mae)}</td>
      <td className="px-2.5 py-2 text-right font-mono tabular-nums">{f1(s.rmse)}</td>
      <td className="px-2.5 py-2 text-right font-mono tabular-nums">{s.n}</td>
    </>
  );
}

function AccuracyTable({ title, row, showAdp }: { title: string; row: AccuracyRow; showAdp: boolean }) {
  const tr = useTr();
  const lines: Array<{ key: string; label: string; s: ErrorStats | undefined; me?: boolean }> = [
    { key: "model", label: tr("本模型"), s: row.model, me: true },
    ...(showAdp ? [{ key: "adp", label: tr("ADP 私营就业首发（第三方）"), s: row.adp }] : []),
    { key: "nfp6", label: tr("过去 6 个月均值"), s: row.nfp6 },
    { key: "nfp1", label: tr("上月首发值"), s: row.nfp1 },
  ];
  return (
    <div className="overflow-x-auto rounded-md border border-fs-border">
      <table className="w-full min-w-[520px] border-collapse text-[13px]">
        <thead className="bg-fs-elevated text-xs text-fs-muted">
          <tr>
            <th className="px-2.5 py-2 text-left font-medium">{title}</th>
            <th className="px-2.5 py-2 text-right font-medium">MAE</th>
            <th className="px-2.5 py-2 text-right font-medium">RMSE</th>
            <th className="px-2.5 py-2 text-right font-medium">{tr("月数")}</th>
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

export function UsNfpNowcastView({ data }: { data: UsNfpNowcastPublicPayload }) {
  const tr = useTr();
  const target = monthZh(data.targetMonth, tr);
  const last = data.recent.at(-1);
  const trend6 = data.recent.slice(-6).reduce((s, r) => s + r.latest, 0) / Math.max(1, data.recent.slice(-6).length);
  const t = data.accuracy.test;
  const r = data.accuracy.recent;
  const spf = data.spf;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6">
      <header className="flex flex-col gap-2 border-b border-fs-border pb-5">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-fs-accent-text">{tr("非农新增就业 · 目标月")}{" "}{target} {tr("· 数据截至")} {data.asOf}{tr("（目标月第")} {data.offsetDays + 1}{" "}{tr("天）")}</p>
        <h1 className="text-2xl font-semibold text-balance text-fs-text">{tr("美国非农就业预测")}</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-fs-secondary">{tr("预测下一次公布的")}{" "}{target}{" "}{tr("非农新增就业首发值。回测按真实时点：每个历史月份只用当时已经公布的数据。新数据入库后自动重算。")}</p>
      </header>

      <section className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-fs-border bg-fs-border sm:grid-cols-2 lg:grid-cols-4">
          <Kpi lead label={tr("{target}新增就业（预测）", { target })} value={signedK(data.nowcast)} sub={tr("80% 区间 {v0} ~ {v1}", { v0: signedK(data.low), v1: signedK(data.high) })} />
          <Kpi
            label={tr("{v0}（首发 → 最新）", { v0: monthZh(data.latestNfpMonth, tr) })}
            value={signedK(last?.latest)}
            sub={tr("首发 {v0}，修订 {v1}", { v0: signedK(last?.first), v1: signedK((last?.latest ?? NaN) - (last?.first ?? NaN)) })}
          />
          <Kpi label={tr("近 6 个月平均（最新修订）")} value={signedK(trend6)} sub={tr("月均新增就业")} />
          <Kpi
            label={data.adpLatest ? tr("ADP 私营就业 {v0}", { v0: monthZh(data.adpLatest.month, tr) }) : tr("ADP 私营就业")}
            value={signedK(data.adpLatest?.change)}
            sub={tr("第三方统计，仅作对照")}
          />
        </div>
        {spf?.current ? (
          <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-fs-secondary">
            <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: SPF_LINE }} />
            <span>{tr("对照：费城联储专业预测者调查（SPF）对")}{" "}{spf.current.quarter} {tr("的中位数预测，折合月均新增")}{" "}
              <span className="font-mono tabular-nums text-fs-text">{signedK(spf.current.spf)}</span> {tr("千人；本页预测折合")}{" "}
              <span className="font-mono tabular-nums text-fs-text">{signedK(spf.current.model)}</span>{" "}{tr("千人。")}</span>
            <a href={spf.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-fs-accent-text hover:underline">{tr("来源")}</a>
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">{tr("月内看到的数据越多，预测越准")}</h2>
        <p className="max-w-3xl text-sm text-fs-secondary">{tr("随着目标月内官方数据陆续公布，历史误差通常先下降、临近公布前趋于稳定。80% 区间按当前时点的历史误差校准。")}</p>
        <div className="overflow-x-auto rounded-md border border-fs-border">
          <table className="w-full min-w-[480px] border-collapse text-[13px]">
            <thead className="bg-fs-elevated text-xs text-fs-muted">
              <tr>
                <th className="px-2.5 py-2 text-left font-medium">{tr("预测时点")}</th>
                <th className="px-2.5 py-2 text-right font-medium">MAE</th>
                <th className="px-2.5 py-2 text-right font-medium">RMSE</th>
                <th className="px-2.5 py-2 text-right font-medium">{tr("80% 区间半宽")}</th>
              </tr>
            </thead>
            <tbody>
              {data.curve.map((c) => (
                <tr
                  key={c.key}
                  className={`border-t border-fs-border ${c.current ? "bg-fs-accent-soft/60 font-medium text-fs-text" : "text-fs-secondary"}`}
                >
                  <td className="px-2.5 py-2">{c.label}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{f1(c.mae)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{f1(c.rmse)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">±{f1(c.bandHalfWidth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-fs-muted">
          {data.accuracy.testFrom.slice(0, 4)}{" "}{tr("年以来逐月样本外回测，剔除 2020 年 3 月–2021 年 6 月；单位千人。")}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">{tr("历史回测与第三方对照")}</h2>
        <div className="rounded-md border border-fs-border bg-fs-bg p-3">
          <div className="mb-1 flex flex-wrap gap-x-4 text-xs text-fs-muted">
            <span>
              <span className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: MODEL_LINE }} />{tr("模型按当前时点（目标月第")}{" "}{data.offsetDays + 1}{" "}{tr("天）回测")}</span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: ADP_DOT }} />{tr("ADP 为 2022-09 起的真实首发值")}</span>
          </div>
          <NfpBacktestChart points={data.backtest.map((p) => ({ month: p.month, forecast: p.forecast, actual: p.actual, adp: p.adp }))} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AccuracyTable title={tr("{v0} 年以来（当前时点，剔除疫情段）", { v0: data.accuracy.testFrom.slice(0, 4) })} row={t} showAdp={false} />
          <AccuracyTable title={tr("{v0} 起（非农公布前一天，含 ADP）", { v0: data.accuracy.recentFrom.slice(0, 7) })} row={r} showAdp />
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-fs-muted">{tr("ADP 统计私营部门，口径与非农总数不同，只作对照。非农首发本身有抽样误差，罢工、飓风、政府人员变动等一次性因素会使个别月份偏差变大。")}</p>
      </section>

      {spf ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-fs-text">{tr("与专业预测者调查（SPF）对比")}</h2>
          <p className="max-w-3xl text-sm text-fs-secondary">{tr("SPF 每季度给出当季平均就业水平的中位数预测。下表把它折成季度平均月增量，与本页在相近时点的预测比较。")}</p>
          <div className="overflow-x-auto rounded-md border border-fs-border">
            <table className="w-full min-w-[480px] border-collapse text-[13px]">
              <thead className="bg-fs-elevated text-xs text-fs-muted">
                <tr>
                  <th className="px-2.5 py-2 text-left font-medium">{tr("季度平均月增量误差（千人）")}</th>
                  <th className="px-2.5 py-2 text-right font-medium">{tr("本模型 MAE")}</th>
                  <th className="px-2.5 py-2 text-right font-medium">SPF MAE</th>
                  <th className="px-2.5 py-2 text-right font-medium">{tr("季度数")}</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    [tr("2006 年以来"), spf.stats.since2006],
                    [tr("2016 年以来"), spf.stats.since2016],
                    [tr("2022 年以来"), spf.stats.since2022],
                  ] as const
                ).map(([label, s]) => (
                  <tr key={label} className="border-t border-fs-border text-fs-secondary">
                    <td className="px-2.5 py-2">{label}</td>
                    <td className="px-2.5 py-2 text-right font-mono font-medium tabular-nums text-fs-text">{f1(s.modelMae)}</td>
                    <td className="px-2.5 py-2 text-right font-mono tabular-nums">{f1(s.spfMae)}</td>
                    <td className="px-2.5 py-2 text-right font-mono tabular-nums">{s.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-md border border-fs-border bg-fs-bg p-3">
            <SpfComparisonChart rows={spf.rows.filter((row) => row.quarter >= "2016")} />
          </div>
          <p className="text-xs text-fs-muted">{tr("剔除 2020Q1–2021Q2。SPF 数据来自费城联储，仅作对照、不入库。")}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">{tr("最近几个月：首发与修订")}</h2>
        <div className="overflow-x-auto rounded-md border border-fs-border">
          <table className="w-full min-w-[420px] border-collapse text-[13px]">
            <thead className="bg-fs-elevated text-xs text-fs-muted">
              <tr>
                <th className="px-2.5 py-2 text-left font-medium">{tr("月份")}</th>
                <th className="px-2.5 py-2 text-right font-medium">{tr("首发")}</th>
                <th className="px-2.5 py-2 text-right font-medium">{tr("最新")}</th>
                <th className="px-2.5 py-2 text-right font-medium">{tr("累计修订")}</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((m) => (
                <tr key={m.month} className="border-t border-fs-border text-fs-secondary">
                  <td className="px-2.5 py-2">{monthZh(m.month, tr)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{signedK(m.first)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums text-fs-text">{signedK(m.latest)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{signedK(m.latest - m.first)}</td>
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
