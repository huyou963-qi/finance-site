import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILTIN_CN_BALANCE_OF_PAYMENTS_OVERVIEW_TEMPLATE,
  CN_BALANCE_OF_PAYMENTS_DERIVED,
  CN_BALANCE_OF_PAYMENTS_SERIES,
} from "./cnBalanceOfPaymentsAnalysisLayout";

test("builds the approved single four-panel balance-of-payments template", () => {
  const template = BUILTIN_CN_BALANCE_OF_PAYMENTS_OVERVIEW_TEMPLATE;
  assert.equal(template.id, "builtin-cn-balance-of-payments-overview");
  assert.equal(template.folderId, "folder-builtin-cn-balance-of-payments");
  assert.equal(template.layoutMode, 4);
  assert.equal(CN_BALANCE_OF_PAYMENTS_SERIES.length, 11);
  assert.equal(CN_BALANCE_OF_PAYMENTS_DERIVED.length, 1);
  assert.equal(template.selectedKeys.length, 12);
  assert.deepEqual(
    new Set(Object.values(template.slotAssignment).filter((slot) => slot != null)),
    new Set([0, 1, 2, 3]),
  );
});

test("keeps reserve and debt hidden and renders their ratio on the right axis", () => {
  const template = BUILTIN_CN_BALANCE_OF_PAYMENTS_OVERVIEW_TEMPLATE;
  const reserveKey = "mds:safe_cn_iip_8d7e57a2760c";
  const debtKey = "mds:safe_cn_debt_ce941250bdad";
  const ratioKey = "calc:cn-bop-reserve-assets-to-external-debt";
  assert.equal(template.slotAssignment[reserveKey], null);
  assert.equal(template.slotAssignment[debtKey], null);
  assert.equal(template.slotAssignment[ratioKey], 3);
  assert.equal(template.seriesVisualMap[ratioKey]?.axis, "right");
  assert.equal(template.derivedCalcs?.[0]?.op, "ratio");
  assert.equal(template.derivedCalcs?.[0]?.scale, 100);
});

test("preserves BPM6 flows without transforms and uses approved chart types", () => {
  const template = BUILTIN_CN_BALANCE_OF_PAYMENTS_OVERVIEW_TEMPLATE;
  for (const series of CN_BALANCE_OF_PAYMENTS_SERIES) {
    assert.equal(template.seriesCalcConfigMap?.[series.virtualKey]?.op, "none");
  }
  assert.equal(template.seriesVisualMap["mds:safe_cn_bop_current_account"]?.chartType, "line");
  assert.equal(template.seriesVisualMap["mds:safe_cn_bop_goods_balance"]?.chartType, "bar");
  assert.equal(template.seriesVisualMap["mds:safe_cn_settlement_6b1b40a90c3a"]?.chartType, "bar");
  assert.equal(template.seriesVisualMap["mds:safe_cn_iip_d2af2fbaf002"]?.chartType, "line");
});
