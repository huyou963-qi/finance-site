import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysIso,
  aggregatePeriods,
  computeFundingFactors,
  FILING_WINDOW_DAYS,
  type FilerHolding,
} from "./fundingFactors";

const h = (
  filerCik: string,
  periodEndIso: string,
  filedAtIso: string,
  shares: number,
  value = shares * 10,
): FilerHolding => ({ filerCik, periodEndIso, filedAtIso, shares, value });

describe("addDaysIso", () => {
  it("加天数", () => {
    assert.equal(addDaysIso("2024-12-31", 50), "2025-02-19");
    assert.equal(addDaysIso("2024-01-01", 0), "2024-01-01");
  });
});

describe("aggregatePeriods", () => {
  it("跨 filer 求和 + holderCount + HHI", () => {
    const rows = [
      h("A", "2024-12-31", "2025-01-20", 60),
      h("B", "2024-12-31", "2025-01-25", 40),
    ];
    const [p] = aggregatePeriods(rows);
    assert.equal(p!.totalShares, 100);
    assert.equal(p!.holderCount, 2);
    // HHI = 0.6² + 0.4² = 0.52
    assert.ok(Math.abs(p!.hhi - 0.52) < 1e-9);
    assert.equal(p!.visibilityIso, addDaysIso("2024-12-31", FILING_WINDOW_DAYS));
  });

  it("同 filer 多份 filing 取窗口内最新（修正）", () => {
    const rows = [
      h("A", "2024-12-31", "2025-01-20", 50),
      h("A", "2024-12-31", "2025-02-10", 80), // 修正，仍在 50 天窗口内 → 取此
    ];
    const [p] = aggregatePeriods(rows);
    assert.equal(p!.totalShares, 80);
    assert.equal(p!.holderCount, 1);
  });

  it("超窗口的远期 filing 不计入", () => {
    const rows = [
      h("A", "2024-12-31", "2025-01-20", 50),
      h("B", "2024-12-31", "2025-06-01", 999), // 远超 50 天 → 排除
    ];
    const [p] = aggregatePeriods(rows);
    assert.equal(p!.totalShares, 50);
    assert.equal(p!.holderCount, 1);
  });

  it("多期按 periodEnd 升序", () => {
    const rows = [
      h("A", "2024-12-31", "2025-01-20", 10),
      h("A", "2024-09-30", "2024-10-20", 20),
    ];
    const ps = aggregatePeriods(rows);
    assert.deepEqual(ps.map((p) => p.periodEndIso), ["2024-09-30", "2024-12-31"]);
  });
});

describe("computeFundingFactors", () => {
  const periods = aggregatePeriods([
    // 2024-09-30 期
    h("A", "2024-09-30", "2024-10-20", 40),
    h("B", "2024-09-30", "2024-10-25", 60),
    // 2024-12-31 期
    h("A", "2024-12-31", "2025-01-20", 55),
    h("B", "2024-12-31", "2025-01-25", 45),
    h("C", "2024-12-31", "2025-02-10", 50),
  ]);

  it("取可见最新期 + 占比/家数/集中度/环比", () => {
    // T = 2025-03-01：两期均可见（12-31 可见日 = 2025-02-19）
    const f = computeFundingFactors(periods, "2025-03-01", 1000);
    assert.equal(f.instHolderCount, 3); // 12-31 期 3 家
    assert.equal(f.instOwnershipPct, (55 + 45 + 50) / 1000); // 0.15
    // 环比：本期 150 / 上期 100 − 1 = 0.5
    assert.ok(Math.abs(f.instOwnershipChgQoQ! - 0.5) < 1e-9);
    assert.ok(f.instConcentration! > 0 && f.instConcentration! < 1);
  });

  it("未到可见日则回退上一期（PIT）", () => {
    // T = 2025-02-01：12-31 期未可见（可见日 2025-02-19）→ 用 09-30 期
    const f = computeFundingFactors(periods, "2025-02-01", 1000);
    assert.equal(f.instHolderCount, 2); // 09-30 期 2 家
    assert.equal(f.instOwnershipPct, 100 / 1000);
    assert.equal(f.instOwnershipChgQoQ, undefined); // 09-30 无更早可见期
  });

  it("无可见期 → 空", () => {
    const f = computeFundingFactors(periods, "2024-10-01", 1000);
    assert.deepEqual(f, {});
  });

  it("无股本 → 不出占比但仍出家数/集中度", () => {
    const f = computeFundingFactors(periods, "2025-03-01", null);
    assert.equal(f.instOwnershipPct, undefined);
    assert.equal(f.instHolderCount, 3);
  });

  it("PIT 无前视：加入 T 之后 filed 的持仓，因子不变", () => {
    const t = "2025-03-01";
    const base = computeFundingFactors(periods, t, 1000);
    // 追加一条 filedAt 在 T 之后的持仓（新 filer D，12-31 期，2025-04-15 才申报）
    const withFuture = aggregatePeriods([
      ...[
        h("A", "2024-09-30", "2024-10-20", 40), h("B", "2024-09-30", "2024-10-25", 60),
        h("A", "2024-12-31", "2025-01-20", 55), h("B", "2024-12-31", "2025-01-25", 45),
        h("C", "2024-12-31", "2025-02-10", 50),
      ],
      h("D", "2024-12-31", "2025-04-15", 500), // T 之后 filed，且超 50 天窗口 → 不应计入
    ]);
    const after = computeFundingFactors(withFuture, t, 1000);
    assert.deepEqual(after, base);
  });
});
