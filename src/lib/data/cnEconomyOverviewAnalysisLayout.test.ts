import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_CN_ECONOMY_OVERVIEW_GROWTH_TEMPLATE, BUILTIN_CN_ECONOMY_OVERVIEW_POLICY_TEMPLATE } from "./cnEconomyOverviewAnalysisLayout";

test("China economy overview templates preserve the approved four-chart structure", () => {
  assert.equal(BUILTIN_CN_ECONOMY_OVERVIEW_GROWTH_TEMPLATE.layoutMode, 4);
  assert.equal(BUILTIN_CN_ECONOMY_OVERVIEW_POLICY_TEMPLATE.layoutMode, 4);
  assert.equal(BUILTIN_CN_ECONOMY_OVERVIEW_GROWTH_TEMPLATE.slotAssignment["calc:cn-overview-gdp-deflator-yoy"], 0);
  assert.equal(BUILTIN_CN_ECONOMY_OVERVIEW_POLICY_TEMPLATE.slotAssignment["calc:cn-overview-broad-fiscal-expenditure"], 1);
  assert.equal(BUILTIN_CN_ECONOMY_OVERVIEW_POLICY_TEMPLATE.seriesVisualMap["calc:cn-overview-broad-fiscal-expenditure-yoy"]?.axis, "right");
});

test("fixed investment total is the only intentional cross-template raw duplicate", () => {
  const growth = new Set(BUILTIN_CN_ECONOMY_OVERVIEW_GROWTH_TEMPLATE.selectedKeys.filter((key) => key.startsWith("mds:")));
  const duplicates = BUILTIN_CN_ECONOMY_OVERVIEW_POLICY_TEMPLATE.selectedKeys.filter((key) => growth.has(key));
  assert.deepEqual(duplicates, ["mds:nbs_cn_fai_m_5129067b_7e570cf8"]);
});
