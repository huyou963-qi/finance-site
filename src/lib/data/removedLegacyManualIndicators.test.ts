import assert from "node:assert/strict";
import { test } from "node:test";
import { isRemovedLegacyManualIndicatorKey, removeLegacyManualIndicatorReferences } from "./removedLegacyManualIndicators";

const legacy = "m_4b3b5982f8deb60ef030409d242a5f4e";

test("targets only legacy m hash keys and the requested Japan debt series", () => {
  assert.equal(isRemovedLegacyManualIndicatorKey(`mds:${legacy}::yoy`), true);
  assert.equal(isRemovedLegacyManualIndicatorKey("jpov_c22_public_debt_gdp"), true);
  assert.equal(isRemovedLegacyManualIndicatorKey("mds:m_other"), false);
  assert.equal(isRemovedLegacyManualIndicatorKey("mds:jpov_c06_jgb_10y"), false);
});

test("removes deleted series from saved chart and catalog JSON", () => {
  assert.deepEqual(removeLegacyManualIndicatorReferences({
    itemKeys: [`mds:${legacy}`, "mds:jpov_c06_jgb_10y"],
    selectedKeys: ["mds:jpov_c22_public_debt_gdp", "mds:jpov_c06_jgb_10y"],
    slots: { [`mds:${legacy}`]: 1, "mds:jpov_c06_jgb_10y": 2 },
    derivedCalcs: [{ leftKey: `mds:${legacy}`, rightKey: "mds:jpov_c06_jgb_10y" }],
  }), {
    itemKeys: ["mds:jpov_c06_jgb_10y"],
    selectedKeys: ["mds:jpov_c06_jgb_10y"],
    slots: { "mds:jpov_c06_jgb_10y": 2 },
    derivedCalcs: [],
  });
});
