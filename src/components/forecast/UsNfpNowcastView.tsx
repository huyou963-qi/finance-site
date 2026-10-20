"use client";

/**
 * 美国非农预测页（/forecast/us-nfp）：本月 nowcast、模型拆解、按月内时点的精度曲线、
 * 真实时点回测，以及 ADP、费城联储 SPF 两个第三方对照。数据由服务端计算后传入（不入库）。
 */
import type { ErrorStats } from "@/lib/forecast/usNfp/model";
import type { AccuracyRow, UsNfpNowcastPayload } from "@/lib/forecast/usNfp/service";
import { ADP_DOT, MODEL_LINE, NfpBacktestChart, SPF_LINE, SpfComparisonChart } from "./UsNfpNowcastCharts";

const monthZh = (iso: string) => `${iso.slice(0, 4)} 年 ${Number(iso.slice(5, 7))} 月`;
const signedK = (v: number | null | undefined) =>
  v != null && Number.isFinite(v) ? `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("en-US")}` : "—";
const f1 = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? v.toFixed(1) : "—");

function Kpi({ label, value, sub, lead }: { label: string; value: string; sub: string; lead?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 bg-fs-bg px-4 py-3.5">
      <span className="text-[13px] text-fs-muted">{label}</span>
      <span className={`font-mono text-[30px] leading-none tabular-nums ${lead ? "text-fs-accent-text" : "text-fs-text"}`}>
        {value}
        <span className="ml-1 text-base text-fs-muted">千人</span>
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
  const lines: Array<{ key: string; label: string; s: ErrorStats | undefined; me?: boolean }> = [
    { key: "model", label: "本模型", s: row.model, me: true },
    ...(showAdp ? [{ key: "adp", label: "ADP 私营就业首发（第三方）", s: row.adp }] : []),
    { key: "nfp6", label: "过去 6 个月均值", s: row.nfp6 },
    { key: "nfp1", label: "上月首发值", s: row.nfp1 },
  ];
  return (
    <div className="overflow-x-auto rounded-md border border-fs-border">
      <table className="w-full min-w-[520px] border-collapse text-[13px]">
        <thead className="bg-fs-elevated text-xs text-fs-muted">
          <tr>
            <th className="px-2.5 py-2 text-left font-medium">{title}</th>
            <th className="px-2.5 py-2 text-right font-medium">MAE</th>
            <th className="px-2.5 py-2 text-right font-medium">RMSE</th>
            <th className="px-2.5 py-2 text-right font-medium">月数</th>
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

export function UsNfpNowcastView({ data }: { data: UsNfpNowcastPayload }) {
  const target = monthZh(data.targetMonth);
  const last = data.recent.at(-1);
  const trend6 = data.recent.slice(-6).reduce((s, r) => s + r.latest, 0) / Math.max(1, data.recent.slice(-6).length);
  const t = data.accuracy.test;
  const r = data.accuracy.recent;
  const spf = data.spf;
  // 拆解：趋势项 = 训练期均值 + 趋势信号贡献（即「申领处于训练期均值时」的预测）；申领三项为在此基础上的调整
  const trendFeature = data.features.find((f) => f.key === "nfp12");
  const trendPart = data.baseline + (trendFeature?.contribution ?? 0);
  const claimFeatures = data.features.filter((f) => f.key !== "nfp12");
  const claimsTotal = claimFeatures.reduce((s, f) => s + f.contribution, 0);
  const pctText = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6">
      <header className="flex flex-col gap-2 border-b border-fs-border pb-5">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-fs-accent-text">
          非农新增就业 · 目标月 {target} · 数据截至 {data.asOf}（目标月第 {data.offsetDays + 1} 天）
        </p>
        <h1 className="text-2xl font-semibold text-balance text-fs-text">美国非农就业预测</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-fs-secondary">
          预测下一次公布的 {target} 非农新增就业「首发值」。模型用非农自身的实时趋势，加上每周四更新的初请失业金人数；
          每周申领数据入库后自动重算。回测完全按真实时点：每个历史月份只用当时能看到的非农版本和申领数据。
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-fs-border bg-fs-border sm:grid-cols-2 lg:grid-cols-4">
          <Kpi lead label={`${target}新增就业（预测）`} value={signedK(data.nowcast)} sub={`80% 区间 ${signedK(data.low)} ~ ${signedK(data.high)}`} />
          <Kpi
            label={`${monthZh(data.latestNfpMonth)}（首发 → 最新）`}
            value={signedK(last?.latest)}
            sub={`首发 ${signedK(last?.first)}，修订 ${signedK((last?.latest ?? NaN) - (last?.first ?? NaN))}`}
          />
          <Kpi label="近 6 个月平均（最新修订）" value={signedK(trend6)} sub="月均新增就业" />
          <Kpi
            label={data.adpLatest ? `ADP 私营就业 ${monthZh(data.adpLatest.month)}` : "ADP 私营就业"}
            value={signedK(data.adpLatest?.change)}
            sub="第三方统计，仅作对照"
          />
        </div>
        {spf?.current ? (
          <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-fs-secondary">
            <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: SPF_LINE }} />
            <span>
              对照：费城联储专业预测者调查（SPF）对 {spf.current.quarter} 的中位数预测，折合月均新增{" "}
              <span className="font-mono tabular-nums text-fs-text">{signedK(spf.current.spf)}</span> 千人；本模型（已公布{" "}
              {spf.current.knownMonths} 个月首发 + 本月预测）折合{" "}
              <span className="font-mono tabular-nums text-fs-text">{signedK(spf.current.model)}</span> 千人。
            </span>
            <a href={spf.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-fs-accent-text hover:underline">
              来源
            </a>
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">预测怎么来的</h2>
        <p className="max-w-3xl text-sm text-fs-secondary">
          先由非农自身趋势给出基准：过去 12 个月实时均值 {signedK(trendFeature?.value)} 千人，经回归映射后为{" "}
          <span className="font-mono tabular-nums text-fs-text">{signedK(trendPart)}</span> 千人（即申领处于历史常态时的预测）；
          再按参考周初请相对过去一年的高低调整{" "}
          <span className="font-mono tabular-nums text-fs-text">{signedK(claimsTotal)}</span> 千人——初请偏高意味着裁员增加、招聘放缓。
        </p>
        <div className="overflow-x-auto rounded-md border border-fs-border">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead className="bg-fs-elevated text-xs text-fs-muted">
              <tr>
                <th className="px-2.5 py-2 text-left font-medium">信号</th>
                <th className="px-2.5 py-2 text-right font-medium">本月值</th>
                <th className="px-2.5 py-2 text-right font-medium">贡献（千人）</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-fs-border">
                <td className="px-2.5 py-2 text-fs-text">趋势基准：{trendFeature?.label}</td>
                <td className="px-2.5 py-2 text-right font-mono tabular-nums">{signedK(trendFeature?.value)}</td>
                <td className="px-2.5 py-2 text-right font-mono tabular-nums">{signedK(trendPart)}</td>
              </tr>
              {claimFeatures.map((f) => (
                <tr key={f.key} className="border-t border-fs-border">
                  <td className="px-2.5 py-2 text-fs-text">{f.label}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">
                    {f.unit === "千人" ? signedK(f.value) : pctText(f.value)}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{signedK(f.contribution)}</td>
                </tr>
              ))}
              {data.context.map((c) => (
                <tr key={c.key} className="border-t border-fs-border text-fs-muted">
                  <td className="px-2.5 py-2">背景（不进模型）：{c.label}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pctText(c.value)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">—</td>
                </tr>
              ))}
              <tr className="border-t border-fs-border bg-fs-accent-soft/60 font-medium text-fs-text">
                <td className="px-2.5 py-2">预测</td>
                <td className="px-2.5 py-2" />
                <td className="px-2.5 py-2 text-right font-mono tabular-nums">{signedK(data.nowcast)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">月内看到的数据越多，预测越准</h2>
        <p className="max-w-3xl text-sm text-fs-secondary">
          关键信息是参考周（含 12 日的那一周）的申领数据，一般在目标月 20 日左右就能看到；之后再等到月末或 ADP 公布，精度基本不再提高。
          80% 区间按当前时点的历史误差校准。
        </p>
        <div className="overflow-x-auto rounded-md border border-fs-border">
          <table className="w-full min-w-[480px] border-collapse text-[13px]">
            <thead className="bg-fs-elevated text-xs text-fs-muted">
              <tr>
                <th className="px-2.5 py-2 text-left font-medium">预测时点</th>
                <th className="px-2.5 py-2 text-right font-medium">MAE</th>
                <th className="px-2.5 py-2 text-right font-medium">RMSE</th>
                <th className="px-2.5 py-2 text-right font-medium">80% 区间半宽</th>
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
          {data.accuracy.testFrom.slice(0, 4)} 年以来逐月样本外回测，剔除 2020 年 3 月–2021 年 6 月；单位千人。模型在 2006–2015 年的验证期里选定，测试期未参与任何选择。
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">历史回测与第三方对照</h2>
        <div className="rounded-md border border-fs-border bg-fs-bg p-3">
          <div className="mb-1 flex flex-wrap gap-x-4 text-xs text-fs-muted">
            <span>
              <span className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: MODEL_LINE }} />
              模型按当前时点（目标月第 {data.offsetDays + 1} 天）回测
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: ADP_DOT }} />
              ADP 为 2022-09 起的真实首发值
            </span>
          </div>
          <NfpBacktestChart points={data.backtest.map((p) => ({ month: p.month, forecast: p.forecast, actual: p.actual, adp: p.adp }))} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AccuracyTable title={`${data.accuracy.testFrom.slice(0, 4)} 年以来（当前时点，剔除疫情段）`} row={t} showAdp={false} />
          <AccuracyTable title={`${data.accuracy.recentFrom.slice(0, 7)} 起（非农公布前一天，含 ADP）`} row={r} showAdp />
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-fs-muted">
          ADP 统计的是私营部门、不含政府，直接拿来当总非农预测会系统性偏离；它也不是本模型的输入——在研究阶段加入 ADP 或 ISM 就业分项反而让误差变大。
          非农首发本身的抽样误差约 ±13.6 万（BLS 公布的 90% 置信区间），这是任何模型都无法消除的下限。
        </p>
      </section>

      {spf ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-fs-text">与专业预测者调查（SPF）对比</h2>
          <p className="max-w-3xl text-sm text-fs-secondary">
            SPF 每季度第二个月中旬收卷，给出当季平均就业水平的中位数预测。为同口径比较，本模型用同一时点能看到的非农版本、
            加上当季第二个月的 14 日预测，拼出当季平均月增量；实际值取当季最后一个月首次公布时的版本。
          </p>
          <div className="overflow-x-auto rounded-md border border-fs-border">
            <table className="w-full min-w-[480px] border-collapse text-[13px]">
              <thead className="bg-fs-elevated text-xs text-fs-muted">
                <tr>
                  <th className="px-2.5 py-2 text-left font-medium">季度平均月增量误差（千人）</th>
                  <th className="px-2.5 py-2 text-right font-medium">本模型 MAE</th>
                  <th className="px-2.5 py-2 text-right font-medium">SPF MAE</th>
                  <th className="px-2.5 py-2 text-right font-medium">季度数</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["2006 年以来", spf.stats.since2006],
                    ["2016 年以来", spf.stats.since2016],
                    ["2022 年以来", spf.stats.since2022],
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
          <p className="text-xs text-fs-muted">剔除 2020Q1–2021Q2。SPF 数据来自费城联储，仅作对照、不入库。</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">最近几个月：首发与修订</h2>
        <div className="overflow-x-auto rounded-md border border-fs-border">
          <table className="w-full min-w-[420px] border-collapse text-[13px]">
            <thead className="bg-fs-elevated text-xs text-fs-muted">
              <tr>
                <th className="px-2.5 py-2 text-left font-medium">月份</th>
                <th className="px-2.5 py-2 text-right font-medium">首发</th>
                <th className="px-2.5 py-2 text-right font-medium">最新</th>
                <th className="px-2.5 py-2 text-right font-medium">累计修订</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((m) => (
                <tr key={m.month} className="border-t border-fs-border text-fs-secondary">
                  <td className="px-2.5 py-2">{monthZh(m.month)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{signedK(m.first)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums text-fs-text">{signedK(m.latest)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{signedK(m.latest - m.first)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">输入数据时效</h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-1 text-[13px] sm:grid-cols-2">
          {data.freshness.map((f) => (
            <div key={f.key} className="flex items-baseline justify-between gap-3 border-b border-fs-border py-1.5">
              <span className="text-fs-secondary">
                {f.label}
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
          <li>目标是首发值（市场第一时间看到的数字），不是修订后的值；回测里每个月的「实际」都是它首次公布时的数。</li>
          <li>特征在 2006–2015 年验证期从 48 组候选（3 种趋势 × 申领子集 × 是否加地区联储）中选定：12 个月趋势 + 初请水平。初请/续请的月度变化、纽约/费城联储就业分项加入后验证期误差都变大，ISM 就业与 ADP 在研究阶段同样无增益。</li>
          <li>敏感性：若改用「趋势 + 初请变化 + 续请变化 + 初请水平」，2016 年后测试期误差约低 2–3 千人，但 2022 年后更高、续请系数符号与经济含义相反且不稳定；按测试期挑模型等于作弊，因此保留验证期的选择。</li>
          <li>非农趋势用 ALFRED 历次版本还原「当时能看到的数」；初请、续请用当前版本（季节因子每年小幅修订，影响很小）。</li>
          <li>2020 年 3 月–2021 年 6 月的疫情冲击不参与估计和评估；2025 年 10 月（停摆后与 11 月一起公布）按实际首发纳入。</li>
          <li>罢工、飓风、政府人员变动等一次性因素模型无法预见，这类月份误差会明显偏大。</li>
        </ul>
      </details>
    </div>
  );
}
