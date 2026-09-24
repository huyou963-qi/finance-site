import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REMOVED_EXCEL_INDICATOR_CODES,
  removeExcelIndicatorReferences,
} from "./removedExcelIndicators";

test("deletion list contains exactly the requested 22 indicators", () => {
  assert.equal(REMOVED_EXCEL_INDICATOR_CODES.length, 22);
  assert.equal(new Set(REMOVED_EXCEL_INDICATOR_CODES).size, 22);
});

test("removes deleted keys from saved layout and chart settings without touching other series", () => {
  const saved = {
    itemKeys: ["mds:jpov_c01_nikkei225", "mds:jpov_c06_jgb_10y"],
    selectedKeys: ["mds:goldov_c02_london_gold::yoy", "mds:wgc_gold_price_usd"],
    slotAssignment: { "mds:jpov_c01_nikkei225": 0, "mds:jpov_c06_jgb_10y": 1 },
    selectedListItems: [{ key: "mds:goldov_c27_brent" }, { key: "mds:wgc_gold_price_usd" }],
    derivedCalcs: [{ leftKey: "mds:usov_c05_comex_gold", rightKey: "mds:wgc_gold_price_usd" }],
  };
  assert.deepEqual(removeExcelIndicatorReferences(saved), {
    itemKeys: ["mds:jpov_c06_jgb_10y"],
    selectedKeys: ["mds:wgc_gold_price_usd"],
    slotAssignment: { "mds:jpov_c06_jgb_10y": 1 },
    selectedListItems: [{ key: "mds:wgc_gold_price_usd" }],
    derivedCalcs: [],
  });
});
