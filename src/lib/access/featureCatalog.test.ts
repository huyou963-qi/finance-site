import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FEATURE_CATALOG,
  FEATURE_GROUP_ORDER,
  defaultFeatureAccessPolicy,
  featureIdForPath,
  normalizeFeatureAccessPolicy,
  resolveFeatureAccess,
  viewerAudience,
  viewerFeatureMap,
  type FeatureAccessPolicy,
  type FeatureRule,
  type FeatureViewer,
} from "./featureCatalog";

const ADMIN: FeatureViewer = { role: "admin", hasProAccess: true };
const PRO: FeatureViewer = { role: "user", hasProAccess: true };
const STANDARD: FeatureViewer = { role: "user", hasProAccess: false, trialEnded: true };
const VISITOR: FeatureViewer = { role: null, hasProAccess: false };

test("industry financials and renamed history have independent feature entries", () => {
  assert.equal(featureIdForPath("/equity/industries"), "equity-industries");
  assert.equal(featureIdForPath("/equity/sectors"), "equity-sectors");
  assert.equal(FEATURE_CATALOG.find(row => row.id === "equity-industries")?.label, "美股行业");
  assert.equal(FEATURE_CATALOG.find(row => row.id === "equity-sectors")?.label, "美股历史");
  const policy = withRule("equity-industries", { status: "development", preview: { visitor: false, standard: false, pro: false } });
  assert.equal(resolveFeatureAccess(policy, "equity-industries", VISITOR), "hidden");
  assert.equal(resolveFeatureAccess(policy, "equity-sectors", VISITOR), "allowed");
});

function withRule(id: string, rule: Partial<FeatureRule>): FeatureAccessPolicy {
  const policy = defaultFeatureAccessPolicy();
  policy.features[id] = {
    ...policy.features[id],
    ...rule,
    preview: { ...policy.features[id].preview, ...(rule.preview ?? {}) },
  };
  return normalizeFeatureAccessPolicy(policy);
}

test("catalog ids are unique and groups are declared", () => {
  const ids = FEATURE_CATALOG.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of FEATURE_CATALOG) {
    assert.ok(FEATURE_GROUP_ORDER.includes(f.group), `未登记的分组: ${f.group}`);
    if (f.kind === "setting") assert.equal(f.paths.length, 0, f.id);
    else assert.ok(f.paths.length > 0, f.id);
    for (const p of f.paths) assert.ok(p.startsWith("/"), p);
    if (f.adminOnly) assert.equal(f.defaults.status, "development", f.id);
  }
});

test("viewerAudience 区分四类用户（试用期内算 Pro）", () => {
  assert.equal(viewerAudience(ADMIN), "admin");
  assert.equal(viewerAudience(PRO), "pro");
  assert.equal(viewerAudience(STANDARD), "standard");
  assert.equal(viewerAudience(VISITOR), "visitor");
});

test("开发中：按三列控制可见，管理员永远可用", () => {
  const policy = withRule("weekly", {
    status: "development",
    preview: { visitor: false, standard: false, pro: true },
  });
  assert.equal(resolveFeatureAccess(policy, "weekly", ADMIN), "allowed");
  assert.equal(resolveFeatureAccess(policy, "weekly", PRO), "allowed");
  assert.equal(resolveFeatureAccess(policy, "weekly", STANDARD), "hidden");
  assert.equal(resolveFeatureAccess(policy, "weekly", VISITOR), "hidden");

  const visitorOnly = withRule("weekly", {
    status: "development",
    preview: { visitor: true, standard: false, pro: false },
  });
  assert.equal(resolveFeatureAccess(visitorOnly, "weekly", VISITOR), "allowed");
  assert.equal(resolveFeatureAccess(visitorOnly, "weekly", PRO), "hidden");
});

test("开发中忽略 proOnly；已上线忽略 preview", () => {
  const dev = withRule("weekly", {
    status: "development",
    proOnly: true,
    preview: { visitor: true, standard: true, pro: true },
  });
  assert.equal(resolveFeatureAccess(dev, "weekly", VISITOR), "allowed");

  const released = withRule("weekly", {
    status: "released",
    proOnly: false,
    preview: { visitor: false, standard: false, pro: false },
  });
  assert.equal(resolveFeatureAccess(released, "weekly", VISITOR), "allowed");
});

test("已上线 Pro 专属：游客引导注册、普通用户引导升级、Pro 与管理员可用", () => {
  const policy = withRule("weekly", { status: "released", proOnly: true });
  assert.equal(resolveFeatureAccess(policy, "weekly", VISITOR), "needs-register");
  assert.equal(resolveFeatureAccess(policy, "weekly", STANDARD), "needs-upgrade");
  assert.equal(resolveFeatureAccess(policy, "weekly", PRO), "allowed");
  assert.equal(resolveFeatureAccess(policy, "weekly", ADMIN), "allowed");
});

test("导航：开发中不可见的隐藏；Pro 专属照常列出并标记 locked", () => {
  const policy = defaultFeatureAccessPolicy();
  const visitor = viewerFeatureMap(policy, VISITOR);
  assert.ok(visitor.listed.includes("quant-factor-research"));
  assert.ok(visitor.locked.includes("quant-factor-research"));
  assert.ok(!visitor.listed.includes("tools-kline-range"));
  assert.ok(!visitor.listed.includes("forecast-us-gdp"));
  assert.ok(!visitor.listed.includes("macro-framework"));
  assert.ok(!visitor.locked.includes("macro"));

  const pro = viewerFeatureMap(policy, PRO);
  assert.deepEqual(pro.locked, []);

  const admin = viewerFeatureMap(policy, ADMIN);
  assert.equal(admin.listed.length, FEATURE_CATALOG.length);
  assert.deepEqual(admin.locked, []);
});

test("normalize 补齐缺失项、丢弃未知和已删除的功能 id", () => {
  const policy = normalizeFeatureAccessPolicy({
    version: 2,
    features: {
      "macro-framework": {
        status: "released",
        proOnly: false,
        preview: { visitor: true, standard: true, pro: true },
      },
      "no-such-feature": { status: "released", proOnly: false },
      weekly: { status: "bogus", proOnly: "yes" },
    },
  });
  assert.equal(policy.version, 2);
  assert.equal(policy.features["macro-framework"], undefined);
  assert.equal(policy.features["no-such-feature"], undefined);
  assert.equal(policy.features.weekly.status, "released");
  assert.equal(policy.features.weekly.proOnly, false);
  assert.equal(Object.keys(policy.features).length, FEATURE_CATALOG.length);
});

test("normalize 兼容 v1 旧格式 {standard, pro}", () => {
  const policy = normalizeFeatureAccessPolicy({
    version: 1,
    features: {
      macro: { standard: true, pro: true },
      weekly: { standard: false, pro: true },
      events: { standard: false, pro: false },
    },
  });
  assert.equal(policy.features.macro.status, "released");
  assert.equal(policy.features.macro.proOnly, false);
  assert.equal(policy.features.weekly.status, "released");
  assert.equal(policy.features.weekly.proOnly, true);
  assert.equal(policy.features.events.status, "development");
  assert.equal(resolveFeatureAccess(policy, "events", PRO), "hidden");
});

test("normalize 容忍垃圾输入并退回默认值", () => {
  for (const raw of [null, undefined, 42, "x", { features: "nope" }]) {
    assert.deepEqual(normalizeFeatureAccessPolicy(raw), defaultFeatureAccessPolicy());
  }
});

test("美国 GDP Now 默认开发中，由功能页权限打开后才对用户可见", () => {
  const policy = defaultFeatureAccessPolicy();
  assert.equal(policy.features["forecast-us-gdp"].status, "development");
  assert.deepEqual(policy.features["forecast-us-gdp"].preview, {
    visitor: false,
    standard: false,
    pro: false,
  });
  assert.equal(resolveFeatureAccess(policy, "forecast-us-gdp", VISITOR), "hidden");
  assert.equal(resolveFeatureAccess(policy, "forecast-us-gdp", STANDARD), "hidden");
  assert.equal(resolveFeatureAccess(policy, "forecast-us-gdp", PRO), "hidden");
  assert.equal(resolveFeatureAccess(policy, "forecast-us-gdp", ADMIN), "allowed");
  assert.ok(!viewerFeatureMap(policy, VISITOR).listed.includes("forecast-us-gdp"));
  assert.ok(viewerFeatureMap(policy, ADMIN).listed.includes("forecast-us-gdp"));

  const opened = normalizeFeatureAccessPolicy({
    version: 2,
    features: {
      "forecast-us-gdp": {
        status: "development",
        proOnly: false,
        preview: { visitor: false, standard: true, pro: true },
      },
    },
  });
  assert.equal(resolveFeatureAccess(opened, "forecast-us-gdp", VISITOR), "hidden");
  assert.equal(resolveFeatureAccess(opened, "forecast-us-gdp", STANDARD), "allowed");
  assert.equal(resolveFeatureAccess(opened, "forecast-us-gdp", PRO), "allowed");

  const released = withRule("forecast-us-gdp", { status: "released", proOnly: true });
  assert.equal(resolveFeatureAccess(released, "forecast-us-gdp", VISITOR), "needs-register");
  assert.equal(resolveFeatureAccess(released, "forecast-us-gdp", STANDARD), "needs-upgrade");
  assert.equal(resolveFeatureAccess(released, "forecast-us-gdp", PRO), "allowed");
});

test("未登记的功能 id 不受管控", () => {
  assert.equal(resolveFeatureAccess(defaultFeatureAccessPolicy(), "pricing", VISITOR), "allowed");
});

test("路由映射取最长前缀", () => {
  assert.equal(featureIdForPath("/macro"), "macro");
  assert.equal(featureIdForPath("/macro/detail"), "macro");
  assert.equal(featureIdForPath("/equity/sectors/it"), "equity-sectors");
  assert.equal(featureIdForPath("/equity/stocks/AAPL"), "markets");
  assert.equal(featureIdForPath("/quant/backtest/abc"), "quant-backtest");
  assert.equal(featureIdForPath("/pricing"), null);
  assert.equal(featureIdForPath("/macrofoo"), null);
});

test("英文界面默认保持开发中（上线由管理员在 /admin/feature-access 操作，不改代码默认值）", () => {
  const def = FEATURE_CATALOG.find((f) => f.id === "site-language-en");
  assert.ok(def);
  assert.equal(def.defaults.status, "development");
});
