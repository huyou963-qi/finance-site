import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeInsiderFactors, MIN_INSIDER_TRANSACTIONS } from "./insiderFactors";

const m = (month: string, buyShares: number, sellShares: number, buyFilings = 1, buyTxns = 1, sellTxns = 1) =>
  ({ month, buyShares, sellShares, buyFilings, buyTxns, sellTxns });

describe("computeInsiderFactors", () => {
  it("净买入比例为 +1 表示窗口内只买、−1 只卖", () => {
    const onlyBuy = computeInsiderFactors([m("2026-01-01", 900, 0, 1, 3, 0)], "2026-03-31");
    assert.equal(onlyBuy.insiderNetBuyRatio, 1);
    const onlySell = computeInsiderFactors([m("2026-01-01", 0, 900, 0, 0, 3)], "2026-03-31");
    assert.equal(onlySell.insiderNetBuyRatio, -1);
  });

  it("比例按股数加总，不被单月规模主导", () => {
    const r = computeInsiderFactors(
      [m("2026-01-01", 300, 100, 1, 2, 1), m("2026-02-01", 100, 300, 1, 1, 2)],
      "2026-03-31",
    );
    // 合计买 400 卖 400 → 0
    assert.equal(r.insiderNetBuyRatio, 0);
    assert.equal(r.insiderBuyBreadth, 2);
  });

  it("窗口外的月份不计入", () => {
    // 6 个月窗口，asOf 2026-06-30 → 下界 2026-01；2025-12 应被排除
    const r = computeInsiderFactors(
      [m("2025-12-01", 1000, 0, 1, 5, 0), m("2026-02-01", 0, 400, 0, 0, 4)],
      "2026-06-30",
    );
    assert.equal(r.insiderNetBuyRatio, -1, "窗口外的买入不该把比例拉正");
  });

  /**
   * 最关键的一条：月桶只在整月已过去时计入。若 asOf 落在月中而把当月整桶算进来，
   * 就会吃到 asOf 之后才申报的交易——即前视。
   */
  it("asOf 在月中时，当月整桶被剔除（防前视）", () => {
    const mid = computeInsiderFactors([m("2026-03-01", 900, 0, 1, 3, 0)], "2026-03-15");
    assert.deepEqual(mid, {}, "3 月未过完，其申报不得在 3-15 可见");
    const end = computeInsiderFactors([m("2026-03-01", 900, 0, 1, 3, 0)], "2026-03-31");
    assert.equal(end.insiderNetBuyRatio, 1, "月末时当月完整可用");
  });

  it("窗口内笔数不足时整只不出值，而非产出极值", () => {
    const thin = computeInsiderFactors([m("2026-02-01", 500, 0, 1, 1, 0)], "2026-03-31");
    assert.deepEqual(thin, {}, `不足 ${MIN_INSIDER_TRANSACTIONS} 笔应不出值，否则单笔交易就给出 ±1`);
    const enough = computeInsiderFactors([m("2026-02-01", 500, 0, 1, 3, 0)], "2026-03-31");
    assert.equal(enough.insiderNetBuyRatio, 1);
  });

  it("无可用月份时返回空对象", () => {
    assert.deepEqual(computeInsiderFactors([], "2026-03-31"), {});
  });
});
