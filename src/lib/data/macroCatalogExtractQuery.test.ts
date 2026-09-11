import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildExtractQueryFromKeys } from "./macroCatalog";

describe("buildExtractQueryFromKeys", () => {
  const allowlist = new Set(["mds:usov_c03_sp500", "mds:us_sp500_pe", "fred:PAYEMS", "fred:CPIAUCSL", "fred:DGS10"]);

  it("keeps fred virtual keys alongside mds keys (mixed templates)", () => {
    const q = buildExtractQueryFromKeys(
      ["mds:usov_c03_sp500", "fred:PAYEMS::diff", "mds:us_sp500_pe", "fred:CPIAUCSL::yoy", "fred:DGS10"],
      allowlist,
    );
    assert.equal(q, "mds:usov_c03_sp500,fred:PAYEMS::diff,mds:us_sp500_pe,fred:CPIAUCSL::yoy,fred:DGS10");
  });

  it("drops keys outside the catalog allowlist", () => {
    const q = buildExtractQueryFromKeys(["mds:usov_c22_nfp", "fred:NOPE", "fred:PAYEMS::diff"], allowlist);
    assert.equal(q, "fred:PAYEMS::diff");
  });

  it("returns null when nothing is extractable", () => {
    assert.equal(buildExtractQueryFromKeys(["mds:usov_c22_nfp"], allowlist), null);
  });
});
