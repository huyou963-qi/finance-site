import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FEATURE_CATALOG,
  FEATURE_GROUP_ORDER,
  defaultFeatureAccessPolicy,
  featureIdForPath,
  isFeatureVisibleTo,
  isProOnlyFeature,
  normalizeFeatureAccessPolicy,
  visibleFeatureIds,
  type FeatureViewer,
} from "./featureCatalog";

const ADMIN: FeatureViewer = { role: "admin", hasProAccess: true };
const PRO: FeatureViewer = { role: "user", hasProAccess: true };
const STANDARD: FeatureViewer = { role: "user", hasProAccess: false };
const VISITOR: FeatureViewer = { role: null, hasProAccess: false };

test("catalog ids are unique and groups are declared", () => {
  const ids = FEATURE_CATALOG.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of FEATURE_CATALOG) {
    assert.ok(FEATURE_GROUP_ORDER.includes(f.group), `未登记的分组: ${f.group}`);
    assert.ok(f.paths.length > 0);
    for (const p of f.paths) assert.ok(p.startsWith("/"), p);
  }
});

test("默认策略满足单调约束：普通可见 ⇒ Pro 可见", () => {
  const policy = defaultFeatureAccessPolicy();
  for (const f of FEATURE_CATALOG) {
    const vis = policy.features[f.id];
    assert.ok(vis, f.id);
    if (vis.standard) assert.equal(vis.pro, true, f.id);
  }
});

test("normalize 补齐缺失项、丢弃未知 id、强制单调与管理员专属", () => {
  const policy = normalizeFeatureAccessPolicy({
    version: 1,
    features: {
      weekly: { standard: true, pro: false },
      "macro-framework": { standard: true, pro: true },
      "no-such-feature": { standard: true, pro: true },
    },
  });
  assert.deepEqual(policy.features.weekly, { standard: true, pro: true });
  assert.deepEqual(policy.features["macro-framework"], { standard: false, pro: false });
  assert.equal(policy.features["no-such-feature"], undefined);
  assert.equal(Object.keys(policy.features).length, FEATURE_CATALOG.length);
});

test("normalize 容忍垃圾输入并退回默认值", () => {
  for (const raw of [null, undefined, 42, "x", { features: "nope" }]) {
    assert.deepEqual(normalizeFeatureAccessPolicy(raw), defaultFeatureAccessPolicy());
  }
});

test("管理员永远可见全部功能，包括管理员专属项", () => {
  const policy = normalizeFeatureAccessPolicy({
    version: 1,
    features: Object.fromEntries(
      FEATURE_CATALOG.map((f) => [f.id, { standard: false, pro: false }]),
    ),
  });
  assert.deepEqual(visibleFeatureIds(policy, ADMIN).sort(), FEATURE_CATALOG.map((f) => f.id).sort());
  assert.deepEqual(visibleFeatureIds(policy, PRO), []);
  assert.deepEqual(visibleFeatureIds(policy, STANDARD), []);
});

test("Pro 看 pro 列；普通用户与访客看 standard 列", () => {
  const policy = normalizeFeatureAccessPolicy({
    version: 1,
    features: { weekly: { standard: false, pro: true }, macro: { standard: true, pro: true } },
  });
  assert.equal(isFeatureVisibleTo(policy, "weekly", PRO), true);
  assert.equal(isFeatureVisibleTo(policy, "weekly", STANDARD), false);
  assert.equal(isFeatureVisibleTo(policy, "weekly", VISITOR), false);
  assert.equal(isFeatureVisibleTo(policy, "macro", VISITOR), true);
  assert.equal(isProOnlyFeature(policy, "weekly"), true);
  assert.equal(isProOnlyFeature(policy, "macro"), false);
});

test("未登记的功能 id 不受管控", () => {
  assert.equal(isFeatureVisibleTo(defaultFeatureAccessPolicy(), "pricing", STANDARD), true);
});

test("路由映射取最长前缀", () => {
  assert.equal(featureIdForPath("/macro"), "macro");
  assert.equal(featureIdForPath("/macro/framework"), "macro-framework");
  assert.equal(featureIdForPath("/macro/framework/detail"), "macro-framework");
  assert.equal(featureIdForPath("/equity/sectors/it"), "equity-sectors");
  assert.equal(featureIdForPath("/equity/stocks/AAPL"), "markets");
  assert.equal(featureIdForPath("/quant/backtest/abc"), "quant-backtest");
  assert.equal(featureIdForPath("/pricing"), null);
  assert.equal(featureIdForPath("/macrofoo"), null);
});
