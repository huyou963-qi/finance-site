import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  averageRanks,
  cumulativeIC,
  pearson,
  quantileGroupReturns,
  quantileSpread,
  spearmanIC,
  summarizeIC,
  summarizeLayering,
} from "./factorResearch";

/** 确定性 LCG，避免测试依赖全局随机源 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("averageRanks", () => {
  it("并列取平均秩，null 保持 null", () => {
    assert.deepEqual(averageRanks([10, 30, 20]), [1, 3, 2]);
    assert.deepEqual(averageRanks([5, 5, 9]), [1.5, 1.5, 3]);
    assert.deepEqual(averageRanks([1, null, 2]), [1, null, 2]);
  });
});

describe("pearson", () => {
  it("完全正相关 = 1，完全负相关 = −1", () => {
    assert.ok(Math.abs(pearson([1, 2, 3, 4], [2, 4, 6, 8])! - 1) < 1e-12);
    assert.ok(Math.abs(pearson([1, 2, 3, 4], [8, 6, 4, 2])! + 1) < 1e-12);
  });
  it("方差为零或样本不足返回 null", () => {
    assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
    assert.equal(pearson([1], [2]), null);
  });
});

describe("spearmanIC", () => {
  it("因子为次期收益的单调函数时 IC≈1", () => {
    const fwd = [-0.1, 0.03, 0.2, -0.05, 0.12, 0.08, -0.2, 0.15];
    // 单调递增变换（平方保号 + 指数），秩序与 fwd 完全一致
    const factor = fwd.map((r) => Math.exp(r * 3) + r);
    const ic = spearmanIC(factor, fwd)!;
    assert.ok(Math.abs(ic - 1) < 1e-9, `IC=${ic}`);
  });

  it("单调递减变换时 IC≈−1", () => {
    const fwd = [-0.1, 0.03, 0.2, -0.05, 0.12, 0.08];
    const factor = fwd.map((r) => -r);
    assert.ok(Math.abs(spearmanIC(factor, fwd)! + 1) < 1e-9);
  });

  it("独立随机数据 IC≈0（大样本）", () => {
    const rnd = lcg(42);
    const n = 4000;
    const factor: number[] = [];
    const fwd: number[] = [];
    for (let i = 0; i < n; i++) {
      factor.push(rnd());
      fwd.push(rnd());
    }
    const ic = spearmanIC(factor, fwd)!;
    assert.ok(Math.abs(ic) < 0.05, `IC=${ic}`);
  });

  it("成对完整：单侧 null 的股票剔除后仍算", () => {
    const factor = [1, 2, null, 4, 5];
    const fwd = [0.1, 0.2, 0.3, null, 0.5];
    // 完整对 = (1,0.1)(2,0.2)(5,0.5) → 完全正相关
    assert.ok(Math.abs(spearmanIC(factor, fwd)! - 1) < 1e-9);
  });

  it("有效对不足 2 返回 null", () => {
    assert.equal(spearmanIC([1, null], [null, 2]), null);
  });
});

describe("summarizeIC", () => {
  it("均值/IR/t/胜率/年化", () => {
    const ics = [0.05, 0.05, 0.05, 0.05];
    const s = summarizeIC(ics);
    assert.equal(s.n, 4);
    assert.ok(Math.abs(s.meanIC - 0.05) < 1e-12);
    assert.equal(s.hitRate, 1);
    // 全等 → std=0 → ir=0（守卫）
    assert.equal(s.ir, 0);
  });
  it("跳过 null 期，胜率按有效期算", () => {
    const s = summarizeIC([0.1, null, -0.1, 0.2]);
    assert.equal(s.n, 3);
    assert.ok(Math.abs(s.hitRate - 2 / 3) < 1e-12);
  });
  it("正 IR 与年化关系 = √12", () => {
    const s = summarizeIC([0.02, 0.06, 0.01, 0.05, -0.01, 0.04]);
    assert.ok(s.ir > 0);
    assert.ok(Math.abs(s.irAnnualized - s.ir * Math.sqrt(12)) < 1e-12);
  });
});

describe("cumulativeIC", () => {
  it("累加，null 贡献 0，等长", () => {
    const cum = cumulativeIC([0.1, null, 0.2, -0.05]);
    const expected = [0.1, 0.1, 0.3, 0.25];
    assert.equal(cum.length, 4);
    cum.forEach((v, i) => assert.ok(Math.abs(v - expected[i]!) < 1e-9));
  });
});

describe("quantileGroupReturns / spread", () => {
  it("因子与收益完全同序时组收益单调、价差 >0", () => {
    // 因子值 = i，前向收益 = i（同序）
    const n = 100;
    const factor = Array.from({ length: n }, (_, i) => i);
    const fwd = Array.from({ length: n }, (_, i) => i * 0.001);
    const groups = quantileGroupReturns(factor, fwd, 5);
    for (let g = 1; g < 5; g++) {
      assert.ok(groups[g]! > groups[g - 1]!, `组 ${g} 应高于 ${g - 1}`);
    }
    assert.ok(quantileSpread(factor, fwd, 5)! > 0);
  });

  it("样本不足 q 组时组为 null、价差 null", () => {
    const groups = quantileGroupReturns([1, 2, 3], [0.1, 0.2, 0.3], 5);
    assert.equal(groups.filter((x) => x != null).length, 0);
    assert.equal(quantileSpread([1, 2, 3], [0.1, 0.2, 0.3], 5), null);
  });
});

describe("summarizeLayering — 与 IC 符号一致（验收标准）", () => {
  it("正相关多期：meanSpread>0 且底<顶", () => {
    const rnd = lcg(7);
    const periods = Array.from({ length: 24 }, () => {
      const n = 200;
      const factor: number[] = [];
      const fwd: number[] = [];
      for (let i = 0; i < n; i++) {
        const x = rnd();
        factor.push(x);
        fwd.push(x * 0.1 + (rnd() - 0.5) * 0.02); // 收益 = 因子的正线性 + 噪声
      }
      return { factorValues: factor, fwdReturns: fwd };
    });
    const lay = summarizeLayering(periods, 5);
    assert.ok(lay.meanSpread > 0, `meanSpread=${lay.meanSpread}`);
    assert.ok(lay.meanGroupReturns[4]! > lay.meanGroupReturns[0]!);
    // IC 也应为正，符号一致
    const ics = periods.map((p) => spearmanIC(p.factorValues, p.fwdReturns));
    assert.ok(summarizeIC(ics).meanIC > 0);
    assert.equal(Math.sign(lay.meanSpread), Math.sign(summarizeIC(ics).meanIC));
  });

  it("负相关多期：meanSpread<0，符号与 IC 一致", () => {
    const rnd = lcg(9);
    const periods = Array.from({ length: 24 }, () => {
      const n = 200;
      const factor: number[] = [];
      const fwd: number[] = [];
      for (let i = 0; i < n; i++) {
        const x = rnd();
        factor.push(x);
        fwd.push(-x * 0.1 + (rnd() - 0.5) * 0.02);
      }
      return { factorValues: factor, fwdReturns: fwd };
    });
    const lay = summarizeLayering(periods, 5);
    const ics = periods.map((p) => spearmanIC(p.factorValues, p.fwdReturns));
    assert.ok(lay.meanSpread < 0);
    assert.equal(Math.sign(lay.meanSpread), Math.sign(summarizeIC(ics).meanIC));
  });
});
