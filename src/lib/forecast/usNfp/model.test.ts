import assert from "node:assert/strict";
import test from "node:test";
import {
  addMonths,
  asOfPreRelease,
  buildDataset,
  contributions,
  featuresAsOf,
  firstRelease,
  fitBefore,
  pastChangesAsOf,
  predict,
  refWeekEnd,
  valueAsOf,
  type NfpModelInputs,
  type RevisionLedger,
} from "./model";

test("reference week ends on the Saturday of the week containing the 12th", () => {
  assert.equal(refWeekEnd("2026-09-01"), "2026-09-12"); // 12 日本身是周六
  assert.equal(refWeekEnd("2026-08-01"), "2026-08-15"); // 12 日是周三
  assert.equal(refWeekEnd("2026-07-01"), "2026-07-18"); // 12 日是周日
});

const ledger: RevisionLedger = new Map([
  ["2026-06-01", [{ at: "2026-07-02", value: 1000 }, { at: "2026-08-07", value: 990 }]],
  ["2026-07-01", [{ at: "2026-08-07", value: 1050 }, { at: "2026-09-04", value: 1040 }]],
  ["2026-08-01", [{ at: "2026-09-04", value: 1100 }]],
]);

test("valueAsOf returns the latest revision visible on that date", () => {
  assert.equal(valueAsOf(ledger, "2026-06-01", "2026-07-15"), 1000);
  assert.equal(valueAsOf(ledger, "2026-06-01", "2026-08-07"), 990);
  assert.ok(Number.isNaN(valueAsOf(ledger, "2026-08-01", "2026-09-03")));
});

test("first release change uses both levels from the same vintage", () => {
  // 8 月首发：9-04 版本 1100 − 1040（7 月已被修订）
  assert.deepEqual(firstRelease(ledger, "2026-08-01"), { at: "2026-09-04", change: 60 });
  assert.deepEqual(firstRelease(ledger, "2026-07-01"), { at: "2026-08-07", change: 60 });
});

test("past changes as of a date stop at the latest visible month", () => {
  assert.deepEqual(pastChangesAsOf(ledger, "2026-09-01", "2026-09-10", 2), [50, 60]);
  // 9-04 之前 8 月未公布：从 7 月往前取
  assert.deepEqual(pastChangesAsOf(ledger, "2026-09-01", "2026-09-01", 1), [60]);
});

/** 合成数据：就业按「趋势 − 初请冲击」增长，模型应能识别初请的负向作用 */
function synthetic(): NfpModelInputs {
  const payems: RevisionLedger = new Map();
  const icsa: NfpModelInputs["icsa"] = [];
  const ccsa: NfpModelInputs["ccsa"] = [];
  let level = 130_000;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const monthlyClaims = new Map<string, number>();
  for (let m = "2000-01-01"; m <= "2026-08-01"; m = addMonths(m, 1)) monthlyClaims.set(m, 300_000 * (1 + 0.3 * rnd()));
  // 周度申领：每个周六一条，取当月的申领水平
  for (let d = Date.UTC(2000, 0, 1); d <= Date.UTC(2026, 8, 30); d += 86_400_000) {
    const iso = new Date(d).toISOString().slice(0, 10);
    if (new Date(d).getUTCDay() !== 6) continue;
    const v = monthlyClaims.get(`${iso.slice(0, 7)}-01`) ?? 300_000;
    icsa.push({ date: iso, value: v });
    ccsa.push({ date: iso, value: v * 6 });
  }
  let prevClaims = 300_000;
  for (let m = "2000-01-01"; m <= "2026-08-01"; m = addMonths(m, 1)) {
    const c = monthlyClaims.get(m)!;
    level += 150 - 400 * Math.log(c / prevClaims) + 20 * rnd();
    prevClaims = c;
    payems.set(m, [{ at: addMonths(m, 1).slice(0, 8) + "05", value: level }]);
  }
  return { payems, icsa, ccsa };
}

test("features are finite and the fitted model recovers the claims effect", () => {
  const inputs = synthetic();
  const x = featuresAsOf(inputs, "2026-08-01", "2026-09-04");
  assert.ok(x && Object.values(x).every(Number.isFinite));
  const rows = buildDataset(inputs, asOfPreRelease);
  assert.ok(rows.length > 200);
  const fit = fitBefore(rows, "2026-08-01")!;
  assert.ok(fit.coef.icLvl < 0, `初请偏高应压低非农，系数 ${fit.coef.icLvl}`);
  const last = rows[rows.length - 1]!;
  const { baseline, parts } = contributions(fit, last.x);
  const sum = baseline + Object.values(parts).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - predict(fit, last.x)) < 1e-6, "贡献分解之和应等于预测值");
});
