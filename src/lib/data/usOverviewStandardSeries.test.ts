import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rewriteRetiredUsovKeys } from "./usOverviewStandardSeries";

describe("rewriteRetiredUsovKeys", () => {
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
    const { value, changed } = rewriteRetiredUsovKeys(hkOverride);
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
    assert.equal(calc["fred:UNRATE"]?.op, "none");
  });

  it("is idempotent and leaves untouched templates alone", () => {
    const once = rewriteRetiredUsovKeys(hkOverride).value;
    const twice = rewriteRetiredUsovKeys(once);
    assert.equal(twice.changed, false);
    const clean = { selectedKeys: ["mds:usov_c03_sp500"] };
    assert.equal(rewriteRetiredUsovKeys(clean).value, clean);
  });

  it("does not overwrite an existing standard key's config", () => {
    const { value } = rewriteRetiredUsovKeys({
      selectedKeys: ["fred:UNRATE", "mds:usov_c20_unrate_sa"],
      seriesVisualMap: { "fred:UNRATE": { color: "#111" }, "mds:usov_c20_unrate_sa": { color: "#222" } },
    });
    assert.deepEqual(value.selectedKeys, ["fred:UNRATE"]);
    assert.deepEqual(value.seriesVisualMap, { "fred:UNRATE": { color: "#111" } });
  });
});
