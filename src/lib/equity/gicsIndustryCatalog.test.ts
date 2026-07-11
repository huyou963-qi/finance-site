import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GICS_INDUSTRIES,
  GICS_SUB_INDUSTRIES,
  assertGicsIndustryCatalog,
  getIndustryStyle,
  industryFromSlug,
  industrySlug,
  listIndustriesBySector,
  lookupSubIndustry,
  rollupFromSubIndustry,
} from "./gicsIndustryCatalog";

describe("gicsIndustryCatalog", () => {
  it("has 74 industries and 163 sub-industries", () => {
    assert.doesNotThrow(() => assertGicsIndustryCatalog());
    assert.equal(GICS_INDUSTRIES.length, 74);
    assert.equal(GICS_SUB_INDUSTRIES.length, 163);
  });

  it("rolls up Wikipedia sub-industry names", () => {
    const row = rollupFromSubIndustry("Semiconductors");
    assert.ok(row);
    assert.equal(row.industryCode, "453010");
    assert.equal(row.sector, "Information Technology");
  });

  it("maps renamed 2023 sub-industries", () => {
    assert.equal(lookupSubIndustry("Passenger Airlines"), "20302010");
    assert.equal(lookupSubIndustry("Broadline Retail"), "25503030");
    assert.equal(lookupSubIndustry("Multi-Family Residential REITs"), "60106010");
  });

  it("resolves industry slugs within sector", () => {
    const slug = industrySlug("Software");
    const row = industryFromSlug(slug, "Information Technology");
    assert.ok(row);
    assert.equal(row.code, "451030");
    assert.equal(getIndustryStyle(row.code), "cyclical");
  });

  it("lists industries per sector", () => {
    const energy = listIndustriesBySector("Energy");
    assert.equal(energy.length, 2);
    assert.equal(energy[0]?.code, "101010");
  });

  it("applies excel style overrides for renamed industries", () => {
    assert.equal(getIndustryStyle("203040"), "defensive");
    assert.equal(getIndustryStyle("255030"), "cyclical");
    assert.equal(getIndustryStyle("601010"), "cyclical");
    assert.equal(getIndustryStyle("201010"), "defensive");
  });
});
