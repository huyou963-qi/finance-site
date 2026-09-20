import assert from "node:assert/strict";
import { test } from "node:test";
import { worldBankTargetFromSubscriptionKey } from "./sourceProbe";

test("世行订阅键解析出国家与指标码", () => {
  assert.deepEqual(worldBankTargetFromSubscriptionKey("AU:BX.KLT.DINV.WD.GD.ZS"), {
    countryCode: "AU",
    indicatorId: "BX.KLT.DINV.WD.GD.ZS",
  });
  assert.deepEqual(worldBankTargetFromSubscriptionKey("cn:NY.GDP.MKTP.KD.ZG"), {
    countryCode: "CN",
    indicatorId: "NY.GDP.MKTP.KD.ZG",
  });
  // 两段式指标码也合法
  assert.deepEqual(worldBankTargetFromSubscriptionKey("JP:SP.POP.GROW"), {
    countryCode: "JP",
    indicatorId: "SP.POP.GROW",
  });
});

test("不是世行键的一律返回 null，不去乱猜", () => {
  // FRED 序列键没有冒号
  assert.equal(worldBankTargetFromSubscriptionKey("BUSINV"), null);
  // 国家码必须两位字母
  assert.equal(worldBankTargetFromSubscriptionKey("USA:NY.GDP.MKTP.KD.ZG"), null);
  assert.equal(worldBankTargetFromSubscriptionKey("1A:NY.GDP.MKTP.KD.ZG"), null);
  // 指标码必须带点分段，否则可能是别的源的 "前缀:键"
  assert.equal(worldBankTargetFromSubscriptionKey("AU:SOMETHING"), null);
  // 空 / 缺失
  assert.equal(worldBankTargetFromSubscriptionKey(""), null);
  assert.equal(worldBankTargetFromSubscriptionKey(null), null);
  assert.equal(worldBankTargetFromSubscriptionKey(undefined), null);
  assert.equal(worldBankTargetFromSubscriptionKey(":NY.GDP.MKTP.KD.ZG"), null);
  assert.equal(worldBankTargetFromSubscriptionKey("AU:"), null);
});

test("首尾空白与大小写归一", () => {
  assert.deepEqual(worldBankTargetFromSubscriptionKey("  au : bx.klt.dinv.wd.gd.zs  "), {
    countryCode: "AU",
    indicatorId: "BX.KLT.DINV.WD.GD.ZS",
  });
});
