"use client";

/**
 * Regime 方法论说明（放在时间线图下方）：讲清两条 z 怎么算、四象限怎么判、门限取值，
 * 并如实列出已知弱点。数值取自 macroRegime.DEFAULT_REGIME_THRESHOLDS，
 * 样本值为实测（勿手改——改分类器参数后此处应同步）。
 */

import { useState } from "react";
import { useTr } from "@/i18n/TextProvider";

const TH = {
  zWindow: 120,
  minSample: 24,
  inflMomentumMonths: 3,
  growthLookback: 3,
  growthSmooth: 3,
  minPhase: 3,
  inflThreshold: 0,
  inflBand: 0.25,
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const tr = useTr();
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-[92px] shrink-0 text-fs-muted">{tr(label)}</span>
      <span className="text-fs-text">{children}</span>
    </div>
  );
}

export function RegimeMethodologyNote() {
  const tr = useTr();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-fs-border bg-fs-elevated/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-fs-text hover:bg-fs-elevated/40"
      >
        <span>{tr("两条 z 怎么算 · 四象限怎么判（含门限与已知弱点）")}</span>
        <span className="text-fs-muted">{open ? tr("收起 ▲") : tr("展开 ▼")}</span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-fs-border px-3 py-3 text-xs leading-relaxed">
          {/* ── 增长 z ── */}
          <section>
            <div className="mb-1 font-medium text-fs-text">{tr("① 增长 z（图中蓝线）")}</div>
            <div className="mb-1.5 text-fs-muted">{tr("四块")}<span className="text-fs-text">{tr("等权")}</span>{tr("合成。每块先算自身的同比/水平，再对")}<span className="text-fs-text"> {tr("滚动")} {TH.zWindow} {tr("个月")}</span>做标准化（有效样本 &lt;{TH.minSample}{" "}{tr("则该块为空），最后取均值。")}</div>
            <div className="rounded border border-fs-border/60 bg-fs-elevated/30 px-2.5 py-2 font-mono text-[11px]">
              <Row label={tr("就业块")}>{tr("PAYEMS 非农就业 → 同比 → 滚动 z")}</Row>
              <Row label={tr("收入块")}>{tr("W875RX1 实际个人收入（除转移支付）→ 同比 → 滚动 z")}</Row>
              <Row label={tr("生产块")}>{tr("INDPRO 工业产出 → 同比 → 滚动 z")}</Row>
              <Row label={tr("调查块")}>{tr("mean(ISM 制造 PMI 的 z, ISM 服务 PMI 的 z)")}</Row>
              <Row label={tr("合成")}>
                <span className="text-fs-accent-text">{tr("增长 z = mean(就业, 收入, 生产, 调查)")}</span>
              </Row>
            </div>
            <div className="mt-1.5 text-fs-muted">{tr("调查块内部")}<span className="text-fs-text">{tr("先把制造与服务平均成一票")}</span>{tr("，避免调查类占两票且两票都偏制造业 （制造业仅约占 GDP 11%）。")}</div>
          </section>

          {/* ── 通胀动量 z ── */}
          <section>
            <div className="mb-1 font-medium text-fs-text">{tr("② 通胀动量 z（图中橙线）")}</div>
            <div className="rounded border border-fs-border/60 bg-fs-elevated/30 px-2.5 py-2 font-mono text-[11px]">
              <Row label={tr("第 1 步")}>{tr("CPIAUCSL / PCEPI → 各自算同比 YoY")}</Row>
              <Row label={tr("第 2 步")}>{tr("动量 = YoY(本期) − YoY(")}{TH.inflMomentumMonths} {tr("个月前)")} <span className="text-fs-muted">{tr("← 二阶量")}</span>
              </Row>
              <Row label={tr("第 3 步")}>{tr("对滚动")} {TH.zWindow} {tr("个月标准化 → cpiMomZ / pceMomZ")}</Row>
              <Row label={tr("合成")}>
                <span className="text-fs-accent-text">{tr("通胀动量 z = mean(cpiMomZ, pceMomZ)")}</span>
              </Row>
            </div>
            <div className="mt-1.5 text-fs-muted">{tr("注意它是")}<span className="text-fs-text">{tr("「通胀在加速还是减速」")}</span>{tr("，不是「通胀高不高」—— 2023–2024 通胀绝对值仍有 3–4% 但在回落，此维读作「降」。")}</div>
          </section>

          {/* ── 四象限判定 ── */}
          <section>
            <div className="mb-1 font-medium text-fs-text">{tr("③ 四象限怎么判（Dalio 口径：两轴同为「方向」）")}</div>
            <div className="rounded border border-fs-border/60 bg-fs-elevated/30 px-2.5 py-2 font-mono text-[11px]">
              <Row label={tr("增长轴")}>{tr("对增长 z 先取")}{" "}<span className="text-fs-accent-text">{TH.growthSmooth} {tr("期尾部移动平均")}</span>{tr("， 再与")}{" "}{TH.growthLookback} 期前比：差值 &gt; 0 → 加速，否则减速
              </Row>
              <Row label={tr("通胀轴")}>{tr("动量 z 越过")}{" "}{TH.inflThreshold} ± <span className="text-fs-accent-text">{TH.inflBand}</span>{" "}{tr("才切换， 带内保持上期")}</Row>
              <Row label={tr("相位删失")}>{tr("新象限需")}<span className="text-fs-accent-text">{tr("连续")} {TH.minPhase} {tr("期")}</span>{tr("才被确认， 否则并入上一象限")}</Row>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-4">
              {[
                { t: tr("增↑ 通↓"), a: tr("金发女孩") },
                { t: tr("增↑ 通↑"), a: tr("再通胀") },
                { t: tr("增↓ 通↑"), a: tr("滞胀") },
                { t: tr("增↓ 通↓"), a: tr("通缩衰退") },
              ].map((b) => (
                <div key={b.t} className="rounded border border-fs-border/60 px-2 py-1.5">
                  <div className="text-fs-text">{b.t}</div>
                  <div className="text-fs-muted">{b.a}</div>
                </div>
              ))}
            </div>
            <div className="mt-1.5 text-fs-muted">{tr("两轴")}<span className="text-fs-text">{tr("同为「方向」")}</span>{tr("是关键。早先用「增长水平 × 通胀动量」 （两轴导数阶数不一致）时，实测")}{" "}<span className="text-fs-text">{tr("13 次离开「衰退式」13 次全跳「滞胀」")}</span>{tr("—— 周期见底时通胀动量必然先于增长水平转正，象限被机械锁死。该口径已停用。")}</div>
          </section>

          {/* ── 平滑与删失的依据 ── */}
          <section>
            <div className="mb-1 font-medium text-fs-text">{tr("④ 平滑与删失：来自公开方法论")}</div>
            <div className="overflow-x-auto">
              <table className="min-w-[540px] text-[11px]">
                <thead>
                  <tr className="border-b border-fs-border text-left text-fs-muted">
                    <th className="py-1 pr-3">{tr("措施")}</th>
                    <th className="py-1 pr-3">{tr("出处")}</th>
                    <th className="py-1">{tr("实测效果（2000+）")}</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  <tr className="border-b border-fs-border/60">
                    <td className="py-1.5 pr-3 text-fs-text">{TH.growthSmooth} {tr("期移动平均")}</td>
                    <td className="py-1.5 pr-3">Chicago Fed CFNAI-MA3</td>
                    <td className="py-1.5">{tr("NBER 衰退月落「增长弱」26/28 →")}{" "}<span className="text-fs-text">28/28</span>{tr("； 专家区间命中 59.8% → 61.6%；")}<span className="text-fs-text">{tr("8 个区间零回退")}</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3 text-fs-text">{tr("最短相位")} {TH.minPhase} {tr("期")}</td>
                    <td className="py-1.5 pr-3">{tr("Bry-Boschan 周期定标删失规则")}</td>
                    <td className="py-1.5">{tr("专家命中 61.6% →")}{" "}<span className="text-fs-text">71.9%</span>{tr("； 象限平均持续 3.5 →")}{" "}<span className="text-fs-text">{tr("6.8 期")}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-1.5 text-fs-muted">{tr("最短相位")}<span className="text-fs-text">{tr("取 3 而非实测最优的 4")}</span>{tr("（4 的专家命中 80.6% 更高）： 3 有独立先验（一个季度＝宏观数据的天然信息周期），取 4 只因它在这 8 个区间上分最高， 属")}<span className="text-fs-text">{tr("对评测指标调参")}</span>{tr("，故不取。删失只回看已确认的过去状态，无前视。")}</div>
          </section>

          {/* ── 实例 ── */}
          <section>
            <div className="mb-1 font-medium text-fs-text">{tr("⑤ 三个实例（真实落库值，未含平滑）")}</div>
            <div className="overflow-x-auto">
              <table className="min-w-[560px] text-[11px]">
                <thead>
                  <tr className="border-b border-fs-border text-left text-fs-muted">
                    <th className="py-1 pr-3">{tr("月份")}</th>
                    <th className="py-1 pr-3">{tr("增长 z / 3 期前 / 差值")}</th>
                    <th className="py-1 pr-3">{tr("通胀动量 z")}</th>
                    <th className="py-1">{tr("象限")}</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  <tr className="border-b border-fs-border/60">
                    <td className="py-1.5 pr-3">2020-11</td>
                    <td className="py-1.5 pr-3">−1.04 / −1.83 / <span className="text-fs-text">+0.79</span></td>
                    <td className="py-1.5 pr-3">{tr("+0.77 越上沿")}</td>
                    <td className="py-1.5 text-fs-text">{tr("再通胀")}</td>
                  </tr>
                  <tr className="border-b border-fs-border/60">
                    <td className="py-1.5 pr-3">2017-09</td>
                    <td className="py-1.5 pr-3">+0.55 / +0.52 / <span className="text-fs-text">+0.03</span></td>
                    <td className="py-1.5 pr-3">{tr("−0.12 带内→继承")}</td>
                    <td className="py-1.5 text-fs-text">{tr("金发女孩")}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3">2022-06</td>
                    <td className="py-1.5 pr-3">+0.09 / +0.68 / <span className="text-fs-text">−0.59</span></td>
                    <td className="py-1.5 pr-3">{tr("+0.53 越上沿")}</td>
                    <td className="py-1.5 text-fs-text">{tr("滞胀")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-1.5 text-fs-muted">{tr("2020-11 就业 z 仍是 −2.76（绝对水平极差）但三期内由 −1.83 升到 −1.04，")}<span className="text-fs-text">{tr("方向为加速")}</span>{" "}{tr("→ 再通胀（事后看是疫后大牛市）。 2022-06 增长 z=+0.09 绝对值仍为正，但捕捉到 0.68→0.09 的下滑判减速 → 滞胀。")}<span className="text-fs-text">{tr("看的是变化不是水平")}</span>{tr("，这是本口径的核心。 （上表为未加")}{" "}{TH.growthSmooth}{" "}{tr("期平滑的原始值，便于看清判据；落库值已含平滑与删失。）")}</div>
          </section>

          {/* ── 已知弱点 ── */}
          <section className="rounded border border-amber-500/25 bg-amber-500/[0.06] px-2.5 py-2">
            <div className="mb-1 font-medium text-amber-800">{tr("已知弱点（读数时按此打折）")}</div>
            <ul className="list-disc space-y-1 pl-4 text-fs-muted">
              <li>
                <span className="text-fs-text">{tr("方向判定仍会贴近门限")}</span>{tr("：原始 |增长差值| 中位数仅约 0.22， 而增长 z 本身量级常在 ±1~3（上表 2017-09 只有 +0.03）。")}{TH.growthSmooth} {tr("期平滑与")} {TH.minPhase}{" "}{tr("期删失把象限持续从 2.6 拉到 6.8 期，缓解但未根除。")}</li>
              <li>
                <span className="text-fs-text">{tr("删失换来的稳定有代价")}</span>{tr("：转折确认约晚 3 期； 2001 通缩期命中由 88% 降到 75%。稳定与及时不可兼得。")}</li>
              <li>
                <span className="text-fs-text">{tr("通胀有 17–31% 的月份靠滞回带继承上期")}</span>{tr("，非自身越阈值决定。")}</li>
              <li>
                <span className="text-fs-text">{tr("两轴门限机制不对称")}</span>{tr("：增长方向用平滑后的差分符号（无滞回带）， 通胀有 ±")}{TH.inflBand}{" "}{tr("带。两轴虽同为「方向」，平滑机制仍不同。")}</li>
              <li>
                <span className="text-fs-text">{tr("滞后确认而非领先预测")}</span>{tr("：分量本身滞后，叠加 15–45 天发布滞后 +")}{TH.growthLookback}{" "}{tr("期差分 + 平滑与删失，转折点通常晚 3–5 个月才被确认。")}<span className="text-fs-text">{tr("它回答「现在处于什么状态」，不回答「下个月会怎样」。")}</span>
              </li>
              <li>
                <span className="text-fs-text">{tr("用最新修订值而非 vintage")}</span>{tr("：GDP 类大幅修订序列有前视残留 （as-of 只保证「未来月不可见」的结构性隔离）。")}</li>
            </ul>
          </section>
        </div>
      ) : null}
    </div>
  );
}
