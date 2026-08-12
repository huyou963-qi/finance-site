import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILTIN_US_BALANCE_OF_PAYMENTS_OVERVIEW_TEMPLATE,
  US_BALANCE_OF_PAYMENTS_SERIES,
} from "./usBalanceOfPaymentsAnalysisLayout";

test("美国国际收支模板包含四图和 12 条唯一序列", () => {
  const template = BUILTIN_US_BALANCE_OF_PAYMENTS_OVERVIEW_TEMPLATE;
  assert.equal(template.layoutMode, 4);
  assert.equal(template.selectedKeys.length, 12);
  assert.equal(new Set(template.selectedKeys).size, 12);
  assert.deepEqual(new Set(Object.values(template.slotAssignment)), new Set([0, 1, 2, 3]));
  assert.equal(Object.keys(template.chartIntroNotes ?? {}).length, 4);
});

test("资金流与负债存量按 Spec 使用正确图型和堆叠组", () => {
  const template = BUILTIN_US_BALANCE_OF_PAYMENTS_OVERVIEW_TEMPLATE;
  assert.equal(template.seriesVisualMap["fred:IEANLF"]?.chartType, "line");
  assert.equal(template.seriesVisualMap["fred:IEAIDI"]?.chartType, "stackBar");
  assert.equal(
    template.seriesVisualMap["fred:IEAIDI"]?.stackGroup,
    "us-bop-liability-flow",
  );
  assert.equal(template.seriesVisualMap["fred:IIPPORTLQ"]?.chartType, "stackArea");
  assert.equal(
    template.seriesVisualMap["fred:IIPPORTLQ"]?.stackGroup,
    "us-bop-liability-stock",
  );
  assert.equal(US_BALANCE_OF_PAYMENTS_SERIES.filter((row) => row.panel === 1).length, 3);
});
