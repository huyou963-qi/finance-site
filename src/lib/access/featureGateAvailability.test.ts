import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFeatureGateAvailability } from "./featureGateAvailability";
import type { FeatureGateResult } from "./featureAccess";

test("权限数据库连接池超时不抛出渲染错误，也不放行页面", async () => {
  const error = Object.assign(new Error("sensitive query / token"), { code: "P2024" });
  const logs: object[] = [];
  const result = await checkFeatureGateAvailability("equity-ownership", async () => {
    throw error;
  }, (_message, details) => logs.push(details));
  assert.equal(result, null);
  assert.deepEqual(logs, [{ featureId: "equity-ownership", code: "P2024" }]);
  assert.equal(JSON.stringify(logs).includes("sensitive"), false);
});

test("连接不可用可以重试，恢复后重新读取权限，不保留故障结果", async () => {
  const allowed: FeatureGateResult = { allowed: true, state: "allowed", viewer: { role: "admin", hasProAccess: true } };
  for (const code of ["P1001", "P1002", "P1017"]) {
    let available = false;
    const check = async () => {
      if (!available) throw Object.assign(new Error("unavailable"), { code });
      return allowed;
    };
    assert.equal(await checkFeatureGateAvailability("equity-ownership", check, () => {}), null);
    available = true;
    assert.equal(await checkFeatureGateAvailability("equity-ownership", check), allowed);
  }
});

test("游客、普通用户、管理员原有权限判定保持不变", async () => {
  for (const state of ["allowed", "hidden", "needs-register", "needs-upgrade"] as const) {
    const gate: FeatureGateResult = { allowed: state === "allowed", state, viewer: { role: null, hasProAccess: false } };
    assert.equal(await checkFeatureGateAvailability("equity-ownership", async () => gate), gate);
  }
});

test("程序错误、迁移错误和 Next.js 重定向不能被吞掉", async () => {
  for (const error of [new Error("bug"), { code: "P2022" }, { digest: "NEXT_REDIRECT" }]) {
    await assert.rejects(checkFeatureGateAvailability("equity-ownership", async () => { throw error; }), e => e === error);
  }
});
