/**
 * CPI 预测的核心算法。服务端组件：只在管理员请求里渲染，文案与分项代理不进入公开页面的客户端包。
 */
import type { UsCpiModelDetails } from "@/lib/forecast/usCpi/service";
import { GROUP_COLOR } from "./UsCpiNowcastCharts";

const pct = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const signed = (v: number, d = 2) => (Number.isFinite(v) ? (v > 0 ? "+" : "") + v.toFixed(d) : "—");

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

export function UsCpiModelDetails({
  model,
  latestCpiMonth,
}: {
  model: UsCpiModelDetails;
  latestCpiMonth: string;
}) {
  const prevLabel = `${Number(latestCpiMonth.slice(5, 7))} 月`;
  const freshness = HF_INPUT_KEYS.map((k) => model.freshness.find((f) => f.key === k)).filter(
    (f): f is NonNullable<typeof f> => Boolean(f),
  );
  const fallbackNames = model.fallbackComponents.map((k) => model.components.find((c) => c.key === k)?.label ?? k);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-8">
      <section className="flex flex-col gap-3 rounded-md border border-fs-border bg-fs-elevated/40 p-4">
        <h2 className="text-lg font-semibold text-fs-text">模型细节（仅管理员）</h2>
        <p className="max-w-3xl text-sm text-fs-secondary">
          把 CPI 拆成 18 个分项，各用高频价格代理做滚动回归，再按 BLS 相对权重加总。下面的代理、权重和输入序列不下发给普通用户。
        </p>
        {fallbackNames.length > 0 ? (
          <p className="rounded-md border border-[#f1c40f]/40 bg-[#fdf6d8] px-3 py-2 text-[13px] text-fs-secondary">
            以下分项本月代理数据不足，已退回过去 12 个月均值：{fallbackNames.join("、")}
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-md border border-fs-border bg-fs-bg">
          <table className="w-full min-w-[960px] border-collapse text-[13px]">
            <thead className="bg-fs-elevated text-xs text-fs-muted">
              <tr>
                <th className="px-2.5 py-2 text-left font-medium">分项</th>
                <th className="px-2.5 py-2 text-right font-medium">权重 %</th>
                <th className="px-2.5 py-2 text-right font-medium">{prevLabel}实际</th>
                <th className="px-2.5 py-2 text-right font-medium">本月预测</th>
                <th className="px-2.5 py-2 text-right font-medium">贡献 bp</th>
                <th className="px-2.5 py-2 text-right font-medium">回测 MAE</th>
                <th className="px-2.5 py-2 text-right font-medium">均值基准 MAE</th>
                <th className="px-2.5 py-2 text-right font-medium">相关</th>
                <th className="px-2.5 py-2 text-left font-medium">高频代理 / 方法</th>
              </tr>
            </thead>
            <tbody>
              {model.components.map((c) => (
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
          权重为 BLS {model.relativeImportanceYear} 年 12 月相对权重，按此后相对价格漂移到上月。回测 MAE 低于均值基准的分项以蓝色标出。
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
      </section>

      <section className="rounded-md border border-fs-border bg-fs-elevated/50 px-4 py-3 text-sm text-fs-secondary">
        <h2 className="font-medium text-fs-text">方法与局限</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
          <li>汽油：零售油价月均环比几乎一一对应未季调汽油 CPI，再加上过去 3 年同月「季调 − 未季调」差，得到季调口径。当月尚无油价时沿用上月末价格（视为持平）。</li>
          <li>住房：Zillow 观测租金领先 CPI 租金约 9–12 个月（CPI 按 6 个月一轮的存量租约采价）。</li>
          <li>残差分项（其他核心商品 / 交通服务 / 核心服务）由上级指数减已建模分项倒推，保证加总与官方一致。</li>
          <li>回测使用当前版本季调数据；BLS 每年 2 月修订过去 5 年季节因子，历史误差可能略被低估。</li>
          <li>2025 年 10 月政府停摆期间 CPI 未发布，该月与 11 月不参与估计和评估。</li>
          <li>BLS 每年 1 月发布新一年相对权重，需在 relativeImportance.ts 追加。</li>
        </ul>
      </section>
    </div>
  );
}
