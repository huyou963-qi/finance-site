import assert from "node:assert/strict";
import { test } from "node:test";
import { regimeInputNeedsFreshnessCheck } from "./regimeCurrentInputs";

const NOW = new Date("2026-08-22T12:00:00.000Z");

test("高频 Regime 输入超过 30 小时触发补检", () => {
  assert.equal(regimeInputNeedsFreshnessCheck({
    code: "sched_fred_VIXCLS",
    lastSuccessAt: new Date("2026-08-21T04:00:00.000Z"),
    now: NOW,
  }), true);
  assert.equal(regimeInputNeedsFreshnessCheck({
    code: "sched_fred_VIXCLS",
    lastSuccessAt: new Date("2026-08-22T04:00:00.000Z"),
    now: NOW,
  }), false);
});

test("月度 Regime 输入每周补检且无成功记录时立即检查", () => {
  assert.equal(regimeInputNeedsFreshnessCheck({
    code: "sched_fred_CPIAUCSL",
    lastSuccessAt: new Date("2026-08-14T12:00:00.000Z"),
    now: NOW,
  }), true);
  assert.equal(regimeInputNeedsFreshnessCheck({
    code: "sched_fred_CPIAUCSL",
    lastSuccessAt: new Date("2026-08-20T12:00:00.000Z"),
    now: NOW,
  }), false);
  assert.equal(regimeInputNeedsFreshnessCheck({
    code: "ism_us_ism_headline",
    lastSuccessAt: null,
    now: NOW,
  }), true);
});
