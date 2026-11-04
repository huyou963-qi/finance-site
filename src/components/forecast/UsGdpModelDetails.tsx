/**
 * GDP Now 的核心算法。服务端组件：只在管理员请求里渲染，方程、系数和输入序列不进入公开页面。
 */
import type { UsGdpModelDetails } from "@/lib/forecast/usGdp/service";

const pct = (v: number | null | undefined, d = 2) => (v != null && Number.isFinite(v) ? v.toFixed(d) : "—");
const coefText = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : "—");

const TRANSFORM_LABEL: Record<string, string> = {
  growth: "季均折年增速",
  level: "季均水平（缺月沿用最后值）",
  nx: "贸易差额变化对 GDP 的折年拉动",
  inv: "存货投资变化对 GDP 的折年拉动",
};

export function UsGdpModelDetails({ model }: { model: UsGdpModelDetails }) {
  const labelOf = (key: string) => model.indicators.find((d) => d.key === key)?.label ?? model.equations.find((e) => e.key === key)?.label ?? key;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-8">
      <section className="flex flex-col gap-3 rounded-md border border-fs-border bg-fs-elevated/40 p-4">
        <h2 className="text-lg font-semibold text-fs-text">模型细节（仅管理员）</h2>
        <p className="max-w-3xl text-sm text-fs-secondary">
          {model.equations.length} 条桥接方程，滚动 {model.window} 个季度 OLS，按过去 {model.weightWindow} 个季度的样本外误差取逆 MSE 权重。下面的方程、系数和输入不下发给普通用户。
        </p>
        <div className="overflow-x-auto rounded-md border border-fs-border bg-fs-bg">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead className="bg-fs-elevated text-xs text-fs-muted">
              <tr>
                <th className="px-2.5 py-2 text-left font-medium">方程</th>
                <th className="px-2.5 py-2 text-right font-medium">预测</th>
                <th className="px-2.5 py-2 text-right font-medium">权重</th>
                <th className="px-2.5 py-2 text-right font-medium">样本</th>
                <th className="px-2.5 py-2 text-left font-medium">截距与系数</th>
              </tr>
            </thead>
            <tbody>
              {model.equations.map((eq) => (
                <tr key={eq.key} className="border-t border-fs-border align-top">
                  <td className="px-2.5 py-2 text-fs-text">
                    {eq.label}
                    <span className="mt-0.5 block text-xs text-fs-muted">{eq.inputs.map(labelOf).join("、")}</span>
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(eq.forecast)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(eq.weight * 100, 1)}%</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{eq.n}</td>
                  <td className="px-2.5 py-2 font-mono text-xs leading-relaxed text-fs-secondary">
                    {coefText(eq.intercept)}
                    {eq.inputs.map((k) => ` + ${coefText(eq.coef[k] ?? NaN)}×${k}`).join("")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-fs-text">本季输入</h2>
        <div className="overflow-x-auto rounded-md border border-fs-border">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead className="bg-fs-elevated text-xs text-fs-muted">
              <tr>
                <th className="px-2.5 py-2 text-left font-medium">指标</th>
                <th className="px-2.5 py-2 text-left font-medium">变换</th>
                <th className="px-2.5 py-2 text-right font-medium">本季取值</th>
                <th className="px-2.5 py-2 text-right font-medium">已公布月数</th>
                <th className="px-2.5 py-2 text-left font-medium">序列</th>
              </tr>
            </thead>
            <tbody>
              {model.indicators.map((d) => (
                <tr key={d.key} className="border-t border-fs-border text-fs-secondary">
                  <td className="px-2.5 py-2 text-fs-text">{d.label}</td>
                  <td className="px-2.5 py-2">{TRANSFORM_LABEL[d.transform] ?? d.transform}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{pct(d.value)}</td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums">{d.observed ?? "—"} / 3</td>
                  <td className="px-2.5 py-2 font-mono text-[11px]">{d.seriesKey}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-fs-muted">季内尚未公布的月份按该指标自身近 5 年的月度变化外推；扩散指数和贸易差额沿用最后值。</p>
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
              <span className="shrink-0 font-mono tabular-nums text-fs-text">{f.latestDate ?? "—"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-fs-border bg-fs-elevated/50 px-4 py-3 text-sm text-fs-secondary">
        <h2 className="font-medium text-fs-text">方法与局限</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
          <li>目标是 BEA advance 首发的实际 GDP 季度环比折年率。回测里每个季度的「实际」都是首次公布时、同一版本下两季水平之比的四次方减一。</li>
          <li>方程在 2000–2011 验证期选定：8 条单指标桥接，加上消费、净出口、存货、工业生产（及设备订单、住宅）的两条支出法组合。2012 年以后没有参与选择。</li>
          <li>训练窗 40 个季度、最少 16 个季度，剔除 2020Q1–2021Q2。权重用过去 8 个季度各方程的样本外 MSE；记录不足时等权。</li>
          <li>实际 GDP、名义 GDP 和月度 FRED 指标用 ALFRED 历次版本；ISM 两个 PMI 不是 FRED 序列，按发布滞后取当时可见值。GDPNow 经 FRED 读历次版本，只作对照、不入库。</li>
          <li>季初缺月多，单指标斜率噪声大；临近首发时 GDPNow 用到更全的官方分项，历史误差更小。本模型不使用未授权的高频交易数据。</li>
        </ul>
      </section>
    </div>
  );
}
