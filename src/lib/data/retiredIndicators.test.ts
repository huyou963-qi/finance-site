import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rewriteRetiredKeys } from "./retiredIndicators";

describe("rewriteRetiredKeys · usov 标准指标替换", () => {
  const hkOverride = {
    selectedKeys: ["mds:usov_c03_sp500", "mds:usov_c28_sp500_pe", "mds:usov_c16_cpi_yoy", "mds:usov_c21_unrate_sa_3mma", "mds:usov_c22_nfp", "fred:DGS10"],
    selectedListItems: [
      { key: "mds:usov_c03_sp500", type: "series" },
      { id: "div-1", type: "divider" },
      { key: "mds:usov_c22_nfp", type: "series" },
      { key: "mds:usov_c21_unrate_sa_3mma", type: "series" },
    ],
    slotAssignment: { "mds:usov_c22_nfp": 3, "mds:usov_c16_cpi_yoy": 4, "mds:usov_c21_unrate_sa_3mma": 3 },
    seriesVisualMap: { "mds:usov_c22_nfp": { axis: "left", color: "#ef3615", chartType: "bar" } },
    displayConfig: { slotSeriesOrder: { "3": ["mds:usov_c22_nfp", "mds:usov_c20_unrate_sa"] } },
    derivedCalcs: [
      { id: "a", leftKey: "mds:usov_c16_cpi_yoy", rightKey: "fred:DGS10", op: "spread", name: "real" },
      { id: "b", leftKey: "mds:usov_c21_unrate_sa_3mma", rightKey: "fred:DGS10", op: "spread", name: "drop" },
    ],
  };

  it("replaces retired keys everywhere and keeps user styling", () => {
    const { value, changed } = rewriteRetiredKeys(hkOverride);
    assert.equal(changed, true);
    assert.deepEqual(value.selectedKeys, ["mds:usov_c03_sp500", "mds:us_sp500_pe", "fred:CPIAUCSL::yoy", "fred:PAYEMS::diff", "fred:DGS10"]);
    assert.deepEqual(value.selectedListItems, [
      { key: "mds:usov_c03_sp500", type: "series" },
      { id: "div-1", type: "divider" },
      { key: "fred:PAYEMS::diff", type: "series" },
    ]);
    assert.deepEqual(value.slotAssignment, { "fred:PAYEMS::diff": 3, "fred:CPIAUCSL::yoy": 4 });
    assert.deepEqual(value.seriesVisualMap, { "fred:PAYEMS::diff": { axis: "left", color: "#ef3615", chartType: "bar" } });
    assert.deepEqual((value.displayConfig as { slotSeriesOrder: unknown }).slotSeriesOrder, {
      "3": ["fred:PAYEMS::diff", "fred:UNRATE"],
    });
    assert.deepEqual(
      (value.derivedCalcs as Array<{ id: string; leftKey: string }>).map((c) => [c.id, c.leftKey]),
      [["a", "fred:CPIAUCSL::yoy"]],
    );
    const calc = value.seriesCalcConfigMap as Record<string, { op: string }>;
    assert.equal(calc["fred:PAYEMS::diff"]?.op, "diff");
    assert.equal(calc["fred:CPIAUCSL::yoy"]?.op, "yoy");
  });

  it("is idempotent and leaves untouched templates alone", () => {
    const once = rewriteRetiredKeys(hkOverride).value;
    assert.equal(rewriteRetiredKeys(once).changed, false);
    const clean = { selectedKeys: ["mds:usov_c03_sp500"] };
    assert.equal(rewriteRetiredKeys(clean).value, clean);
  });

  it("swaps 10Y/2Y xlsx yields for daily DGS10/DGS2 and drops the 10Y-2Y spread", () => {
    const { value } = rewriteRetiredKeys({
      selectedKeys: ["mds:usov_c07_gs10", "mds:usov_c08_gs2", "mds:usov_c09_10y2y", "mds:usov_c11_effr", "fred:DGS10"],
      slotAssignment: { "mds:usov_c07_gs10": 1, "mds:usov_c08_gs2": 1, "mds:usov_c09_10y2y": 1 },
      displayConfig: { slotSeriesOrder: { "1": ["mds:usov_c09_10y2y", "mds:usov_c07_gs10", "mds:usov_c08_gs2", "mds:usov_c11_effr"] } },
    });
    assert.deepEqual(value.selectedKeys, ["fred:DGS10", "fred:DGS2", "mds:usov_c11_effr"]);
    assert.deepEqual(value.slotAssignment, { "fred:DGS10": 1, "fred:DGS2": 1 });
    assert.deepEqual((value.displayConfig as { slotSeriesOrder: unknown }).slotSeriesOrder, {
      "1": ["fred:DGS10", "fred:DGS2", "mds:usov_c11_effr"],
    });
  });

  it("does not overwrite an existing standard key's config", () => {
    const { value } = rewriteRetiredKeys({
      selectedKeys: ["fred:UNRATE", "mds:usov_c20_unrate_sa"],
      seriesVisualMap: { "fred:UNRATE": { color: "#111" }, "mds:usov_c20_unrate_sa": { color: "#222" } },
    });
    assert.deepEqual(value.selectedKeys, ["fred:UNRATE"]);
    assert.deepEqual(value.seriesVisualMap, { "fred:UNRATE": { color: "#111" } });
  });
});

describe("rewriteRetiredKeys · 计算型指标改为指标运算", () => {
  it("turns 2年-EFFR into a derived calc and pulls its inputs into the selection", () => {
    const { value } = rewriteRetiredKeys({
      selectedKeys: ["fred:DGS2", "mds:usov_c12_2y_effr"],
      selectedListItems: [
        { type: "series", key: "fred:DGS2" },
        { type: "series", key: "mds:usov_c12_2y_effr" },
      ],
      slotAssignment: { "fred:DGS2": 1, "mds:usov_c12_2y_effr": 1 },
      seriesVisualMap: { "mds:usov_c12_2y_effr": { axis: "left", color: "#d75a68" } },
    });
    assert.deepEqual(value.selectedKeys, ["fred:DGS2", "mds:usov_c11_effr"]);
    assert.deepEqual(value.selectedListItems, [
      { type: "series", key: "fred:DGS2" },
      { type: "derived", key: "calc:usov-2y-effr" },
    ]);
    assert.deepEqual(value.slotAssignment, { "fred:DGS2": 1, "calc:usov-2y-effr": 1 });
    assert.deepEqual(value.seriesVisualMap, { "calc:usov-2y-effr": { axis: "left", color: "#d75a68" } });
    assert.deepEqual(value.derivedCalcs, [
      { id: "usov-2y-effr", name: "2年-EFFR", op: "sub", leftKey: "fred:DGS2", rightKey: "mds:usov_c11_effr" },
    ]);
  });

  it("rebuilds the gold template: basis as calc, stock/reserve units as base series, ETF sums dropped", () => {
    const { value } = rewriteRetiredKeys({
      selectedKeys: [
        "mds:goldov_c01_comex_active", "mds:goldov_c02_london_gold", "mds:goldov_c03_basis",
        "mds:goldov_c07_comex_stock", "mds:goldov_c08_comex_stock_wow", "mds:goldov_c09_etf_holding",
        "mds:goldov_c11_global_reserve", "mds:goldov_c23_comex_stock_oz",
      ],
      slotAssignment: { "mds:goldov_c03_basis": null, "mds:goldov_c07_comex_stock": 3, "mds:goldov_c08_comex_stock_wow": 3, "mds:goldov_c09_etf_holding": 4, "mds:goldov_c11_global_reserve": 5 },
    });
    assert.deepEqual(value.selectedKeys, [
      "mds:goldov_c01_comex_active", "mds:goldov_c02_london_gold", "mds:goldov_c23_comex_stock_oz",
      "mds:goldov_c23_comex_stock_oz::diff", "mds:goldov_c24_global_reserve_tons",
    ]);
    assert.deepEqual(value.slotAssignment, {
      "calc:gold-basis": null,
      "mds:goldov_c23_comex_stock_oz": 3,
      "mds:goldov_c23_comex_stock_oz::diff": 3,
      "mds:goldov_c24_global_reserve_tons": 5,
    });
    assert.equal((value.derivedCalcs as Array<{ id: string }>)[0]?.id, "gold-basis");
    assert.equal((value.seriesCalcConfigMap as Record<string, { op: string }>)["mds:goldov_c23_comex_stock_oz::diff"]?.op, "diff");
  });
});
