import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  annualToPerPeriodSharpe,
  deflatedSharpe,
  expectedMaxSharpe,
  icTStatToPValue,
  multipleTestingCorrection,
  normalCdf,
  normalPpf,
  oosDegradation,
  probabilisticSharpe,
  returnMoments,
  sharpeStd,
  stitchWalkForward,
  studentTTwoSidedP,
} from "./robustness";

/** 确定性 LCG（不依赖全局随机源） */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** Box-Muller 标准正态 */
function gauss(rnd: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

describe("normalCdf / normalPpf", () => {
  it("已知分位点", () => {
    assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-9);
    assert.ok(Math.abs(normalCdf(1.6448536269514722) - 0.95) < 1e-6);
    assert.ok(Math.abs(normalCdf(-1.959963984540054) - 0.025) < 1e-6);
  });
  it("ppf 是 cdf 的逆（round-trip，受 erf ~1.5e-7 精度限制）", () => {
    for (const p of [0.001, 0.05, 0.25, 0.5, 0.75, 0.95, 0.999]) {
      assert.ok(Math.abs(normalCdf(normalPpf(p)) - p) < 1e-6, `p=${p}`);
    }
    assert.ok(Math.abs(normalPpf(0.975) - 1.959963984540054) < 1e-7);
    assert.equal(normalPpf(0.5), 0); // 中支 q=0 → 精确 0
  });
  it("边界返回 ±Infinity", () => {
    assert.equal(normalPpf(0), -Infinity);
    assert.equal(normalPpf(1), Infinity);
  });
});

describe("studentTTwoSidedP", () => {
  it("t=0 → p=1；|t| 增大 p 减小", () => {
    assert.ok(Math.abs(studentTTwoSidedP(0, 30) - 1) < 1e-12);
    assert.ok(studentTTwoSidedP(3, 30) < studentTTwoSidedP(1, 30));
  });
  it("df=∞ 收敛到正态双尾", () => {
    // t=1.96, 大 df → ~0.05
    const p = studentTTwoSidedP(1.959963984540054, 100000);
    assert.ok(Math.abs(p - 0.05) < 1e-3, `p=${p}`);
  });
  it("已知值 df=10, t=2.228 → ~0.05", () => {
    const p = studentTTwoSidedP(2.228, 10);
    assert.ok(Math.abs(p - 0.05) < 2e-3, `p=${p}`);
  });
});

describe("returnMoments", () => {
  it("正态样本：偏度≈0、峰度≈3", () => {
    const rnd = lcg(42);
    const xs = Array.from({ length: 20000 }, () => gauss(rnd));
    const m = returnMoments(xs);
    assert.equal(m.n, 20000);
    assert.ok(Math.abs(m.skew) < 0.1, `skew=${m.skew}`);
    assert.ok(Math.abs(m.kurtosis - 3) < 0.2, `kurt=${m.kurtosis}`);
  });
  it("sharpe = mean/std；n<2 退化", () => {
    const m = returnMoments([0.01, 0.02, 0.03, 0.04]);
    assert.ok(Math.abs(m.sharpe - m.mean / m.std) < 1e-12);
    assert.equal(returnMoments([0.01]).n, 1);
    assert.equal(returnMoments([0.01]).sharpe, 0);
  });
  it("常数序列（方差 0）sharpe=0", () => {
    assert.equal(returnMoments([0.5, 0.5, 0.5]).sharpe, 0);
  });
});

describe("probabilisticSharpe", () => {
  it("正态、SR>0：n 越大 PSR 越高", () => {
    const p100 = probabilisticSharpe(0.1, 100, 0, 3, 0);
    const p1000 = probabilisticSharpe(0.1, 1000, 0, 3, 0);
    assert.ok(p1000 > p100);
    assert.ok(p100 > 0.5 && p1000 > 0.5);
  });
  it("观测夏普 = 基准 → PSR = 0.5", () => {
    assert.ok(Math.abs(probabilisticSharpe(0.2, 500, 0, 3, 0.2) - 0.5) < 1e-9);
  });
  it("负偏 + 厚尾降低 PSR（相对正态）", () => {
    const normal = probabilisticSharpe(0.15, 250, 0, 3, 0);
    const fatTail = probabilisticSharpe(0.15, 250, -1.0, 8, 0);
    assert.ok(fatTail < normal, `fat=${fatTail} normal=${normal}`);
  });
  it("样本不足返回 0.5", () => {
    assert.equal(probabilisticSharpe(0.5, 1, 0, 3, 0), 0.5);
  });
});

describe("expectedMaxSharpe / sharpeStd", () => {
  it("N 越多、离散度越大 → 期望最大夏普越高", () => {
    assert.ok(expectedMaxSharpe(0.1, 100) > expectedMaxSharpe(0.1, 10));
    assert.ok(expectedMaxSharpe(0.2, 50) > expectedMaxSharpe(0.1, 50));
  });
  it("N<2 或 σ=0 → 0（无多重检验）", () => {
    assert.equal(expectedMaxSharpe(0.1, 1), 0);
    assert.equal(expectedMaxSharpe(0, 100), 0);
  });
  it("sharpeStd 样本标准差", () => {
    assert.ok(Math.abs(sharpeStd([1, 2, 3, 4, 5]) - Math.sqrt(2.5)) < 1e-12);
    assert.equal(sharpeStd([1]), 0);
  });
});

describe("deflatedSharpe（核心：多重检验抓选择性过拟合）", () => {
  it("试验数越多，同一入选夏普的 DSR 越低", () => {
    const rnd = lcg(7);
    // 一堆随机试验夏普（每期口径，围绕 0 波动）
    const trialsFew = Array.from({ length: 5 }, () => gauss(rnd) * 0.08);
    const trialsMany = Array.from({ length: 200 }, () => gauss(rnd) * 0.08);
    const base = { observedSharpe: 0.12, n: 250, skew: 0, kurtosis: 3 };
    const few = deflatedSharpe({ ...base, trialSharpes: trialsFew });
    const many = deflatedSharpe({ ...base, trialSharpes: trialsMany });
    assert.ok(many.dsr < few.dsr, `many=${many.dsr} few=${few.dsr}`);
    assert.equal(many.nTrials, 200);
  });
  it("从多试验里挑的「最优」随机策略：DSR 判不显著", () => {
    const rnd = lcg(99);
    const N = 100;
    const nObs = 250;
    // 100 个真实无 alpha 的策略：每策略 250 期正态收益，取夏普最高者
    let bestSharpe = -Infinity;
    let bestMoments = returnMoments([0, 1]);
    const trialSharpes: number[] = [];
    for (let k = 0; k < N; k++) {
      const rets = Array.from({ length: nObs }, () => gauss(rnd) * 0.01);
      const m = returnMoments(rets);
      trialSharpes.push(m.sharpe);
      if (m.sharpe > bestSharpe) {
        bestSharpe = m.sharpe;
        bestMoments = m;
      }
    }
    const dsr = deflatedSharpe({
      observedSharpe: bestMoments.sharpe,
      n: bestMoments.n,
      skew: bestMoments.skew,
      kurtosis: bestMoments.kurtosis,
      trialSharpes,
    });
    // 纯噪音里挑最优 → 扣除多重检验后不应显著
    assert.equal(dsr.significant, false, `dsr=${dsr.dsr} sr0=${dsr.expectedMaxSharpe}`);
  });
  it("真有强 alpha 的单策略：即便有试验背景仍显著", () => {
    const rnd = lcg(3);
    // 强信号：每期均值 0.006、std 0.01 → 每期夏普 ~0.6，250 期
    const rets = Array.from({ length: 250 }, () => 0.006 + gauss(rnd) * 0.01);
    const m = returnMoments(rets);
    const trials = Array.from({ length: 20 }, () => gauss(rnd) * 0.05);
    trials.push(m.sharpe);
    const dsr = deflatedSharpe({
      observedSharpe: m.sharpe,
      n: m.n,
      skew: m.skew,
      kurtosis: m.kurtosis,
      trialSharpes: trials,
    });
    assert.equal(dsr.significant, true, `dsr=${dsr.dsr}`);
  });
});

describe("multipleTestingCorrection", () => {
  it("Bonferroni = min(1, p·m)", () => {
    const res = multipleTestingCorrection([
      { label: "a", pValue: 0.01 },
      { label: "b", pValue: 0.2 },
      { label: "c", pValue: 0.6 },
    ]);
    assert.ok(Math.abs(res[0]!.bonferroni - 0.03) < 1e-12);
    assert.ok(Math.abs(res[1]!.bonferroni - 0.6) < 1e-12);
    assert.equal(res[2]!.bonferroni, 1); // 0.6*3=1.8 → 截断 1
  });
  it("单个检验 m=1：校正 = 原始 p", () => {
    const res = multipleTestingCorrection([{ label: "x", pValue: 0.03 }]);
    assert.ok(Math.abs(res[0]!.bonferroni - 0.03) < 1e-12);
    assert.ok(Math.abs(res[0]!.bh - 0.03) < 1e-12);
    assert.equal(res[0]!.bonferroniSignificant, true);
  });
  it("BH 比 Bonferroni 更宽松（更易显著），且 ≤ Bonferroni", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      label: `f${i}`,
      pValue: 0.001 * (i + 1),
    }));
    const res = multipleTestingCorrection(items, 0.05);
    for (const r of res) assert.ok(r.bh <= r.bonferroni + 1e-12, `${r.label}`);
    const bhSig = res.filter((r) => r.bhSignificant).length;
    const bonfSig = res.filter((r) => r.bonferroniSignificant).length;
    assert.ok(bhSig >= bonfSig);
  });
  it("BH 单调（按原始 p 升序不减）", () => {
    const items = [
      { label: "a", pValue: 0.04 },
      { label: "b", pValue: 0.01 },
      { label: "c", pValue: 0.03 },
    ];
    const res = multipleTestingCorrection(items);
    const byP = [...res].sort((x, y) => x.pValue - y.pValue);
    for (let i = 1; i < byP.length; i++) {
      assert.ok(byP[i]!.bh >= byP[i - 1]!.bh - 1e-12);
    }
  });
});

describe("icTStatToPValue", () => {
  it("大 tStat → 小 p；对齐 studentT", () => {
    assert.ok(icTStatToPValue(3, 300) < 0.01);
    assert.ok(Math.abs(icTStatToPValue(0, 300) - 1) < 1e-12);
  });
});

describe("oosDegradation", () => {
  it("样本外崩溃标记 + 保留率", () => {
    const d = oosDegradation(
      { cagr: 0.15, sharpe: 1.2, maxDrawdown: -0.2, vol: 0.12 },
      { cagr: -0.03, sharpe: -0.2, maxDrawdown: -0.35, vol: 0.15 },
    );
    assert.equal(d.collapsed, true);
    assert.ok(d.sharpeRetention! < 0);
    assert.ok(Math.abs(d.sharpeDelta - -1.4) < 1e-12);
  });
  it("稳健策略不算崩溃", () => {
    const d = oosDegradation(
      { cagr: 0.12, sharpe: 1.0, maxDrawdown: -0.2, vol: 0.12 },
      { cagr: 0.1, sharpe: 0.9, maxDrawdown: -0.22, vol: 0.13 },
    );
    assert.equal(d.collapsed, false);
    assert.ok(Math.abs(d.sharpeRetention! - 0.9) < 1e-12);
  });
});

describe("stitchWalkForward", () => {
  it("按收益率链接：连续、段界不重复、比值正确", () => {
    const segA = [
      { date: "2020-01-31", nav: 1 },
      { date: "2020-02-29", nav: 1.1 },
      { date: "2020-03-31", nav: 1.2 },
    ];
    const segB = [
      { date: "2020-03-31", nav: 1 }, // 各段自归一起点
      { date: "2020-04-30", nav: 0.9 },
      { date: "2020-05-31", nav: 1.05 },
    ];
    const out = stitchWalkForward([segA, segB]);
    // segA 3 点 + segB 后 2 点（段界 i=0 跳过）= 5
    assert.equal(out.length, 5);
    assert.equal(out[0]!.segment, 0);
    assert.equal(out[4]!.segment, 1);
    // segA 末尾 = 1.2；segB 末尾比值 1.05 → 1.2 * 1.05 = 1.26
    assert.ok(Math.abs(out[out.length - 1]!.nav - 1.26) < 1e-12);
    // 无重复日期
    assert.equal(new Set(out.map((p) => p.date)).size, out.length);
  });
  it("过短/非法段跳过", () => {
    const out = stitchWalkForward([
      [{ date: "a", nav: 1 }],
      [
        { date: "b", nav: 1 },
        { date: "c", nav: 1.5 },
      ],
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[out.length - 1]!.nav, 1.5);
  });
  it("年化↔每期夏普转换往返", () => {
    assert.ok(Math.abs(annualToPerPeriodSharpe(1.5 * Math.sqrt(252), 252) - 1.5) < 1e-12);
  });
});
