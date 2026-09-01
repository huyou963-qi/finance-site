import assert from "node:assert/strict";
import test from "node:test";
import {
  nonProFeatureRestrictionsEnabled,
  userCanAccessProFeatures,
} from "./access";

const standardUser = { role: "user" as const, plan: "standard" as const };

test("non-Pro restrictions default to enabled and fail closed for unknown values", () => {
  assert.equal(nonProFeatureRestrictionsEnabled(undefined), true);
  assert.equal(nonProFeatureRestrictionsEnabled("true"), true);
  assert.equal(nonProFeatureRestrictionsEnabled("unexpected"), true);
});

test("false-like values disable non-Pro feature restrictions", () => {
  for (const value of ["false", "FALSE", "0", "no", "off"]) {
    assert.equal(nonProFeatureRestrictionsEnabled(value), false);
  }
});

test("feature switch grants gated capability without changing subscription checks", () => {
  assert.equal(userCanAccessProFeatures(standardUser, Date.now(), true), false);
  assert.equal(userCanAccessProFeatures(standardUser, Date.now(), false), true);
});
