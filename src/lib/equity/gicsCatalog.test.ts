import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GICS_SECTORS,
  GICS_SECTOR_DEFS,
  normalizeGicsSector,
  sectorFromSlug,
  sectorSlug,
} from "./gicsCatalog";
import {
  STYLE_BUCKETS,
  assertStyleCoverageComplete,
  styleForSector,
} from "./styleBuckets";
import { SECTOR_MACRO_MAP } from "./sectorMacroMap";

describe("gicsCatalog", () => {
  it("has exactly 11 sectors with unique ETFs", () => {
    assert.equal(GICS_SECTORS.length, 11);
    assert.equal(GICS_SECTOR_DEFS.length, 11);
    const etfs = new Set(GICS_SECTOR_DEFS.map((d) => d.etf));
    assert.equal(etfs.size, 11);
  });

  it("normalizes FMP Technology to Information Technology", () => {
    assert.equal(normalizeGicsSector("Technology"), "Information Technology");
    assert.equal(normalizeGicsSector("technology"), "Information Technology");
    assert.equal(normalizeGicsSector("Information Technology"), "Information Technology");
  });

  it("normalizes common FMP aliases", () => {
    assert.equal(normalizeGicsSector("Healthcare"), "Health Care");
    assert.equal(normalizeGicsSector("Basic Materials"), "Materials");
    assert.equal(normalizeGicsSector("Consumer Cyclical"), "Consumer Discretionary");
    assert.equal(normalizeGicsSector("Consumer Defensive"), "Consumer Staples");
    assert.equal(normalizeGicsSector("Financial Services"), "Financials");
  });

  it("returns null for unknown sector", () => {
    assert.equal(normalizeGicsSector("Aerospace"), null);
    assert.equal(normalizeGicsSector(""), null);
    assert.equal(normalizeGicsSector(null), null);
  });

  it("round-trips sector slugs", () => {
    for (const s of GICS_SECTORS) {
      assert.equal(sectorFromSlug(sectorSlug(s)), s);
    }
  });
});

describe("styleBuckets", () => {
  it("covers all 11 sectors exactly once", () => {
    assert.doesNotThrow(() => assertStyleCoverageComplete());
    const assigned = STYLE_BUCKETS.flatMap((b) => [...b.sectors]);
    assert.equal(assigned.length, 11);
  });

  it("maps growth / cyclical / defensive as planned", () => {
    assert.equal(styleForSector("Information Technology"), "growth");
    assert.equal(styleForSector("Communication Services"), "growth");
    assert.equal(styleForSector("Energy"), "cyclical");
    assert.equal(styleForSector("Utilities"), "defensive");
    assert.equal(styleForSector("Health Care"), "defensive");
  });
});

describe("sectorMacroMap", () => {
  it("defines mapping for every GICS sector", () => {
    for (const s of GICS_SECTORS) {
      const m = SECTOR_MACRO_MAP[s];
      assert.ok(m, s);
      assert.ok(m.keys.length >= 1, s);
    }
  });
});
