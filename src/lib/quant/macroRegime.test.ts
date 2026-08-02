import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyHysteresis,
  growthDirectionOf,
  dalioQuadrant,
  trailingMean,
  censorMinPhase,
  classifyQuadrant,
  deriveMomentum,
  deriveYoY,
  latestVisibleIndex,
  meanOfDefined,
  rollingZ,
  type MonthlySeries,
} from "./macroRegime";
import { isoToDay } from "./backtest";

describe("classifyQuadrant", () => {
  it("四象限映射", () => {
    assert.equal(classifyQuadrant("above", "falling"), "recovery");
    assert.equal(classifyQuadrant("above", "rising"), "overheat");
    assert.equal(classifyQuadrant("below", "rising"), "stagflation");
    assert.equal(classifyQuadrant("below", "falling"), "contraction");
  });
});

describe("deriveYoY", () => {
  it("12 期同比，前 12 期 null", () => {
    const v = Array.from({ length: 24 }, (_, i) => 100 + i);
    const yoy = deriveYoY(v);
    assert.equal(yoy.slice(0, 12).every((x) => x === null), true);
    // 第 13 期（index 12）= 112/100 − 1 = 0.12
    assert.ok(Math.abs(yoy[12]! - 0.12) < 1e-12);
  });
  it("分母为 0 → null", () => {
    const v = [0, ...Array.from({ length: 12 }, () => 5)];
    assert.equal(deriveYoY(v)[12], null);
  });
});

describe("deriveMomentum", () => {
  it("YoY 的 k 月差分", () => {
    const yoy = [null, null, 0.01, 0.02, 0.05, 0.03];
    const mom = deriveMomentum(yoy, 3);
    // index 5: 0.03 − yoy[2]=0.01 → 0.02
    assert.ok(Math.abs(mom[5]! - 0.02) < 1e-12);
    assert.equal(mom[2], null); // index<3
  });
});

describe("rollingZ", () => {
  it("末值高于窗内均值 → 正 z", () => {
    const v = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5];
    const z = rollingZ(v, v.length - 1, 120, 24)!;
    assert.ok(z > 0);
  });
  it("样本不足 minSample → null", () => {
    const v = [1, 2, 3];
    assert.equal(rollingZ(v, 2, 120, 24), null);
  });
  it("窗内零方差 → null", () => {
    const v = Array.from({ length: 30 }, () => 7);
    assert.equal(rollingZ(v, 29, 120, 24), null);
  });
  it("滚动窗只回看，超窗旧值不参与", () => {
    // 前段大异常值在窗外应不影响
    const v = [1000, ...Array.from({ length: 40 }, () => 1), 2];
    // window=30 → 只看最近 30 期（均值≈1），末值 2 → 正 z
    const z = rollingZ(v, v.length - 1, 30, 24)!;
    assert.ok(z > 3, `z=${z}`);
  });
});

describe("meanOfDefined", () => {
  it("跳过 null 求均值", () => {
    assert.equal(meanOfDefined([1, null, 3]), 2);
    assert.equal(meanOfDefined([null, null]), null);
  });
});

describe("latestVisibleIndex", () => {
  const series: MonthlySeries = {
    code: "x",
    months: ["2020-01-01", "2020-02-01", "2020-03-01"],
    values: [1, 2, 3],
    // 各期估算发布日
    releaseDay: [isoToDay("2020-02-15"), isoToDay("2020-03-15"), isoToDay("2020-04-15")],
    lagDays: 15,
  };
  it("取 ≤T 的最新可见期（防前视）", () => {
    // T=2020-03-01：只有前两期已发布（2/15、3/15>3/1 不可见）
    assert.equal(latestVisibleIndex(series, isoToDay("2020-03-01")), 0);
    // T=2020-03-20：第 2 期（3/15）已可见
    assert.equal(latestVisibleIndex(series, isoToDay("2020-03-20")), 1);
    // T 早于所有发布日 → −1
    assert.equal(latestVisibleIndex(series, isoToDay("2020-01-01")), -1);
    // T 晚于全部 → 最后一期
    assert.equal(latestVisibleIndex(series, isoToDay("2020-05-01")), 2);
  });
});

describe("applyHysteresis", () => {
  it("带内保持上期状态，越过 阈值±band 才切换", () => {
    // band=0.25，阈值 0：z 在 (-0.25, 0.25) 内保持前值
    assert.equal(applyHysteresis(0.1, 0, 0.25, true), true);
    assert.equal(applyHysteresis(0.1, 0, 0.25, false), false); // 同一 z，前值不同 → 结果不同
    assert.equal(applyHysteresis(-0.2, 0, 0.25, true), true);
    // 越过上沿 → 切 true；越过下沿 → 切 false
    assert.equal(applyHysteresis(0.3, 0, 0.25, false), true);
    assert.equal(applyHysteresis(-0.3, 0, 0.25, true), false);
  });

  it("prev=null（首期）或 band=0 时退化为普通阈值判定", () => {
    assert.equal(applyHysteresis(0.1, 0, 0.25, null), true);
    assert.equal(applyHysteresis(-0.1, 0, 0.25, null), false);
    assert.equal(applyHysteresis(0.1, 0, 0, false), true); // band=0 → 无滞回
  });

  it("z 缺失时保持上期状态（不制造虚假切换）", () => {
    assert.equal(applyHysteresis(null, 0, 0.25, true), true);
    assert.equal(applyHysteresis(null, 0, 0.25, false), false);
    assert.equal(applyHysteresis(null, 0, 0.25, null), false); // 无前值兜底 false
  });

  it("滞回带确实减少抖动：z 在 0 附近来回时状态不翻转", () => {
    const zs = [0.05, -0.05, 0.08, -0.09, 0.06, -0.04];
    let noBand: boolean | null = null;
    let withBand: boolean | null = null;
    let flipsNoBand = 0;
    let flipsWithBand = 0;
    for (const z of zs) {
      const a = applyHysteresis(z, 0, 0, noBand);
      const b = applyHysteresis(z, 0, 0.25, withBand);
      if (noBand != null && a !== noBand) flipsNoBand += 1;
      if (withBand != null && b !== withBand) flipsWithBand += 1;
      noBand = a;
      withBand = b;
    }
    assert.equal(flipsNoBand, 5); // 每期都翻
    assert.equal(flipsWithBand, 0); // 全在带内，一次不翻
  });
  it("band 非有限（调用方漏传）退化为无滞回，绝不冻结状态", () => {
    // 回归：曾因 band=undefined 落到 NaN 比较 → 永远 return prev → 全序列同一象限
    const bad = undefined as unknown as number;
    assert.equal(applyHysteresis(0.5, 0, bad, false), true);
    assert.equal(applyHysteresis(-0.5, 0, bad, true), false);
    assert.equal(applyHysteresis(0.5, 0, NaN, false), true);
  });
});

describe("growthDirectionOf", () => {
  it("与 lookback 期前比较定升降", () => {
    // history 末尾是最近一期；lookback=3 → 取 history[len-3]
    assert.equal(growthDirectionOf(0.0, [-1.8, -1.2, -0.5], 3), "rising"); // 0.0 > -1.8
    assert.equal(growthDirectionOf(-1.0, [0.5, 0.2, -0.3], 3), "falling"); // -1.0 < 0.5
  });

  it("2020 疫后场景：水平仍「下」但方向「升」", () => {
    // 增长 z 从 -1.83 反弹到 +0.03：象限判 below（水平），方向应为 rising
    const dir = growthDirectionOf(0.03, [-1.83, -1.4, -0.9], 3);
    assert.equal(dir, "rising");
  });

  it("历史不足 lookback 期 / 端点缺失 → null（不猜方向）", () => {
    assert.equal(growthDirectionOf(0.5, [0.1, 0.2], 3), null); // 只有 2 期
    assert.equal(growthDirectionOf(null, [0.1, 0.2, 0.3], 3), null);
    assert.equal(growthDirectionOf(0.5, [null, 0.2, 0.3], 3), null); // 3 期前是 null
    assert.equal(growthDirectionOf(0.5, [], 3), null);
  });

  it("持平（差为 0）判 falling（严格大于才算升）", () => {
    assert.equal(growthDirectionOf(0.5, [0.5, 0.6, 0.7], 3), "falling");
  });
});

describe("dalioQuadrant（两轴同为方向）", () => {
  it("四组合映射", () => {
    assert.equal(dalioQuadrant("rising", "rising"), "reflation");
    assert.equal(dalioQuadrant("rising", "falling"), "goldilocks");
    assert.equal(dalioQuadrant("falling", "rising"), "stagflation");
    assert.equal(dalioQuadrant("falling", "falling"), "deflation");
  });

  it("与水平口径语义不同：2020 疫后水平判滞胀、Dalio 判再通胀", () => {
    // 2020-08：增长水平 below（z −1.83）但方向 rising，通胀动量 rising
    assert.equal(classifyQuadrant("below", "rising"), "stagflation"); // 水平口径
    assert.equal(dalioQuadrant("rising", "rising"), "reflation");     // Dalio 口径
  });

  it("方向未知 → null（不猜）", () => {
    assert.equal(dalioQuadrant(null, "rising"), null);
    assert.equal(dalioQuadrant("rising", null), null);
  });
});

describe("trailingMean（CFNAI-MA3 式平滑）", () => {
  it("尾部 k 期均值，只回看", () => {
    assert.deepEqual(trailingMean([1, 2, 3, 4], 3), [1, 1.5, 2, 3]);
  });
  it("跳过 null；窗内全 null → null", () => {
    assert.deepEqual(trailingMean([1, null, 3], 2), [1, 1, 3]);
    assert.equal(trailingMean([null, null], 2)[0], null);
  });
  it("k ≤ 1 原样返回", () => {
    assert.deepEqual(trailingMean([1, 2, 3], 1), [1, 2, 3]);
  });
});

describe("censorMinPhase（Bry-Boschan 式最短相位删失）", () => {
  it("短于 minRun 的段并入上一状态", () => {
    // B 只出现 1 期 < 3 → 被抹平为 A
    assert.deepEqual(censorMinPhase(["A", "A", "B", "A", "A"], 3), ["A", "A", "A", "A", "A"]);
  });

  it("连续达 minRun 才确认新状态（转折点被推迟 minRun−1 期）", () => {
    // B 连续 3 期：前两期仍记 A，第三期才切 B
    assert.deepEqual(censorMinPhase(["A", "B", "B", "B", "B"], 3), ["A", "A", "A", "B", "B"]);
  });

  it("交替噪音被完全压平", () => {
    assert.deepEqual(censorMinPhase(["A", "B", "A", "B", "A"], 3), ["A", "A", "A", "A", "A"]);
  });

  it("null 沿用已确认状态，不制造切换", () => {
    assert.deepEqual(censorMinPhase(["A", null, "A"], 3), ["A", "A", "A"]);
  });

  it("minRun ≤ 1 原样返回（关闭删失）", () => {
    assert.deepEqual(censorMinPhase(["A", "B", "A"], 1), ["A", "B", "A"]);
  });

  it("只回看：输出第 i 项不依赖 i 之后的输入（无前视）", () => {
    const base = ["A", "A", "B", "B", "B", "A"];
    const full = censorMinPhase(base, 3);
    for (let i = 1; i <= base.length; i++) {
      const partial = censorMinPhase(base.slice(0, i), 3);
      assert.deepEqual(partial, full.slice(0, i), `前 ${i} 期应与全序列一致`);
    }
  });
});
