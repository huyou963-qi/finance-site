import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventHitsExplicitFilters } from "./assetEventResolver";

describe("eventHitsExplicitFilters", () => {
  const tslaEv = {
    assets: ["TSLA"],
    industries: ["2510"],
    countries: ["US"],
  };
  const gcEv = {
    assets: ["GC"],
    industries: [],
    countries: ["US"],
  };
  const autoOnlyEv = {
    assets: [],
    industries: ["2510"],
    countries: ["US"],
  };

  it("TSLA+US 国家不得放出仅 GC 事件", () => {
    assert.equal(
      eventHitsExplicitFilters(gcEv, {
        assets: ["TSLA"],
        industries: ["2510"],
        countries: ["US"],
      }),
      false,
    );
  });

  it("TSLA 资产+GC 资产应同时放出", () => {
    const filters = { assets: ["TSLA", "GC"], industries: [], countries: [] };
    assert.equal(eventHitsExplicitFilters(tslaEv, filters), true);
    assert.equal(eventHitsExplicitFilters(gcEv, filters), true);
  });

  it("仅行业命中也可相关", () => {
    assert.equal(
      eventHitsExplicitFilters(autoOnlyEv, {
        assets: ["TSLA"],
        industries: ["2510"],
        countries: [],
      }),
      true,
    );
  });

  it("国家只收窄，不能单独打开集合（有 fallback）", () => {
    assert.equal(
      eventHitsExplicitFilters(
        gcEv,
        { assets: [], industries: [], countries: ["US"] },
        { fallbackAsset: "TSLA" },
      ),
      false,
    );
    assert.equal(
      eventHitsExplicitFilters(
        tslaEv,
        { assets: [], industries: [], countries: ["US"] },
        { fallbackAsset: "TSLA" },
      ),
      true,
    );
  });

  it("国家 AND：相关但国家不匹配则拒绝", () => {
    assert.equal(
      eventHitsExplicitFilters(
        { assets: ["TSLA"], industries: [], countries: ["CN"] },
        { assets: ["TSLA"], industries: [], countries: ["US"] },
      ),
      false,
    );
  });

  it("相关维皆空且无 fallback 时不过滤", () => {
    assert.equal(
      eventHitsExplicitFilters(gcEv, {
        assets: [],
        industries: [],
        countries: [],
      }),
      true,
    );
  });
});
