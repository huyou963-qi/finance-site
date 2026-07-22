import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
