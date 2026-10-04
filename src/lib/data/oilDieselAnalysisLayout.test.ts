import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILTIN_US_OIL_DIESEL_TEMPLATE,
  OIL_DIESEL_UNRESOLVED_PANELS,
} from "./oilDieselAnalysisLayout";

test("registers a six-panel oil and diesel monitoring template", () => {
  const template = BUILTIN_US_OIL_DIESEL_TEMPLATE;
  assert.equal(template.layoutMode, 6);
  assert.equal(template.folderId, "folder-builtin-us-oil-diesel");
  assert.deepEqual(Object.keys(template.displayConfig?.slotTitles ?? {}).sort(), [
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
  ]);
  assert.deepEqual(Object.keys(template.chartIntroNotes ?? {}).sort(), [
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
  ]);
});

test("keeps the ULSD crack spread as a display-layer calculation", () => {
  const crack = BUILTIN_US_OIL_DIESEL_TEMPLATE.derivedCalcs?.find(
    (calc) => calc.id === "oil-diesel-ulsd-crack",
  );
  assert.deepEqual(crack, {
    id: "oil-diesel-ulsd-crack",
    leftKey: "fred:DDFUELNYH",
    rightKey: "fred:DCOILWTICO",
    op: "sub",
    leftScale: 42,
    name: "ULSD 裂解价差（美元/桶）",
  });
  assert.equal(
    BUILTIN_US_OIL_DIESEL_TEMPLATE.slotAssignment["calc:oil-diesel-ulsd-crack"],
    1,
  );
});

test("does not invent unresolved EIA WPSR keys", () => {
  assert.deepEqual(OIL_DIESEL_UNRESOLVED_PANELS, [
    "库存补充：商业原油库存（当前模板已覆盖馏分油总库存与 ULSD 库存）",
    "炼厂补充：原油投入量（当前模板已覆盖炼厂产能利用率）",
  ]);
  assert.equal(
    BUILTIN_US_OIL_DIESEL_TEMPLATE.selectedKeys.some((key) => /placeholder|todo/i.test(key)),
    false,
  );
});

test("covers inventory, refinery, demand and SPR with verified EIA keys", () => {
  const template = BUILTIN_US_OIL_DIESEL_TEMPLATE;
  assert.equal(template.slotAssignment["mds:eia_wpsr_wdistus1"], 2);
  assert.equal(template.slotAssignment["mds:eia_wpsr_wd0st_nus_1"], 2);
  assert.equal(template.slotAssignment["mds:eia_wpsr_wpuleus3"], 3);
  assert.equal(template.slotAssignment["mds:eia_wpsr_wdiupus2"], 4);
  assert.equal(template.slotAssignment["mds:eia_wpsr_wdiupus2::ma4"], 4);
  assert.equal(template.slotAssignment["mds:eia_wpsr_wcsstus1"], 5);
  assert.equal(template.seriesCalcConfigMap?.["mds:eia_wpsr_wdiupus2::ma4"]?.rollingWindow, 4);
  assert.equal(template.seriesCalcConfigMap?.["mds:eia_wpsr_wcsstus1"]?.scale, 0.001);
});
