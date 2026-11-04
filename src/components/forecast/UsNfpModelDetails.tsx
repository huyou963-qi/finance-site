/**
 * 非农预测的核心算法。服务端组件：只在管理员请求里渲染，特征与系数不下发到公开页面。
 */
import type { UsNfpModelDetails } from "@/lib/forecast/usNfp/service";

const signedK = (v: number | null | undefined) =>
  v != null && Number.isFinite(v) ? `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("en-US")}` : "—";
const pctText = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

export function UsNfpModelDetails({ model }: { model: UsNfpModelDetails }) {
  const trendFeature = model.features.find((f) => f.key === "nfp12");
  const trendPart = model.baseline + (trendFeature?.contribution ?? 0);
  const claimFeatures = model.features.filter((f) => f.key !== "nfp12");
  const claimsTotal = claimFeatures.reduce((s, f) => s + f.contribution, 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-8">
      <section className="flex flex-col gap-3 rounded-md border border-fs-border bg-fs-elevated/40 p-4">
        <h2 className="text-lg font-semibold text-fs-text">模型细节（仅管理员）</h2>
        <p className="max-w-3xl text-sm text-fs-secondary">
          先由非农自身趋势给出基准：过去 12 个月实时均值 {signedK(trendFeature?.value)} 千人，经回归映射后为{" "}
          <span className="font-mono tabular-nums text-fs-text">{signedK(trendPart)}</span> 千人（即申领处于历史常态时的预测）；
          再按参考周初请相对过去一年的高低调整{" "}
          <span className="font-mono tabular-nums text-fs-text">{signedK(claimsTotal)}</span> 千人。
        </p>
        <div className="overflow-x-auto rounded-md border border-fs-border bg-fs-bg">
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
              {model.context.map((c) => (
                <tr key={c.key} className="border-t border-fs-border text-fs-muted">
                  <td className="px-2.5 py-2">背景（不进模型）：{c.label}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pctText(c.value)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-fs-muted">
          截距（训练期均值项）{signedK(model.baseline)} 千人。关键信息是参考周（含 12 日的那一周）的申领，一般在目标月 20 日左右可见；之后精度基本不再提高。
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">输入数据时效</h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-1 text-[13px] sm:grid-cols-2">
          {model.freshness.map((f) => (
            <div key={f.key} className="flex items-baseline justify-between gap-3 border-b border-fs-border py-1.5">
              <span className="text-fs-secondary">
                {f.label}
                <span className="ml-2 font-mono text-[11px] text-fs-muted">{f.seriesKey}</span>
              </span>
              <span className="font-mono tabular-nums text-fs-text">{f.latestDate ?? "—"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-fs-border bg-fs-elevated/50 px-4 py-3 text-sm text-fs-secondary">
        <h2 className="font-medium text-fs-text">方法与局限</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
          <li>目标是首发值（市场第一时间看到的数字），不是修订后的值；回测里每个月的「实际」都是它首次公布时的数。</li>
          <li>特征在 2006–2015 年验证期从 48 组候选（3 种趋势 × 申领子集 × 是否加地区联储）中选定：12 个月趋势 + 初请水平。初请/续请的月度变化、纽约/费城联储就业分项加入后验证期误差都变大，ISM 就业与 ADP 在研究阶段同样无增益。</li>
          <li>敏感性：若改用「趋势 + 初请变化 + 续请变化 + 初请水平」，2016 年后测试期误差约低 2–3 千人，但 2022 年后更高、续请系数符号与经济含义相反且不稳定；按测试期挑模型等于作弊，因此保留验证期的选择。</li>
          <li>非农趋势用 ALFRED 历次版本还原「当时能看到的数」；初请、续请用当前版本（季节因子每年小幅修订，影响很小）。</li>
          <li>SPF 对照用同一收卷时点能看到的非农版本，加上当季第二个月的 14 日预测，拼出当季平均月增量。</li>
          <li>2020 年 3 月–2021 年 6 月的疫情冲击不参与估计和评估；2025 年 10 月（停摆后与 11 月一起公布）按实际首发纳入。</li>
          <li>非农首发抽样误差约 ±13.6 万（BLS 公布的 90% 置信区间）。ADP 不是本模型的输入。</li>
        </ul>
      </section>
    </div>
  );
}
