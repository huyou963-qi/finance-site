import assert from "node:assert/strict";
import test from "node:test";
import { resolveMacroSeriesLabel } from "./macroCatalog";

test("mds 变体虚拟键（::yoy / ::pct / ::diff）取基础序列的名称，不显示原始键", () => {
  const catalogLabelByKey = new Map([
    ["mds:esri_jp_gdp_gdp_real_saar", "日本:GDP:实际季调年率"],
    ["mds:goldov_c23_comex_stock_oz", "COMEX:库存量:黄金"],
  ]);
  assert.equal(
    resolveMacroSeriesLabel("mds:esri_jp_gdp_gdp_real_saar::yoy", { catalogLabelByKey }),
    "日本:GDP:实际季调年率",
  );
  assert.equal(
    resolveMacroSeriesLabel("mds:goldov_c23_comex_stock_oz::diff", { catalogLabelByKey }),
    "COMEX:库存量:黄金",
  );
});

test("变体键自身有覆盖名称时优先用覆盖名称", () => {
  const overrides = new Map([["mds:boj_jp_m2::yoy", "M2 同比"]]);
  assert.equal(resolveMacroSeriesLabel("mds:boj_jp_m2::yoy", { overrides }), "M2 同比");
});
