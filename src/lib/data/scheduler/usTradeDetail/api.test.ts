import assert from "node:assert/strict";
import test from "node:test";
import { fetchCensusPartnerApi, parseCensusPartnerApi } from "./api";
import { fetchUsTradeDetailIncremental } from "../adapters/usTradeDetailAdapter";
import { US_TRADE_PROVIDER } from "./catalog";

test("retired partner codes cannot be accidentally routed into the active API", async () => {
  for (const country of ["2771", "4350", "4610", "5080", "5160", "7370", "7740"]) {
    await assert.rejects(fetchCensusPartnerApi(`census_us_trade_exports_country_nsa_${country}`), /active unadjusted/);
  }
});

test("partner API preserves monthly NSA dollar totals, zeros and distinct import definition", () => {
  const rows = [["CTY_CODE", "GEN_VAL_MO", "time"], ["1220", "35980039950", "2026-08"], ["1220", "0", "2026-07"]];
  const points = parseCensusPartnerApi(rows, "1220", "imports", "2026-10");
  assert.equal(points[0]?.value, 0);
  assert.equal(points[1]?.value, 35980.03995);
  assert.throws(() => parseCensusPartnerApi(rows, "1220", "exports", "2026-10"), /schema/);
  assert.throws(() => parseCensusPartnerApi(rows, "5700", "imports", "2026-10"), /partner/);
  assert.throws(() => parseCensusPartnerApi(rows, "1220", "imports", "2026-07"), /invalid/);
  for (const raw of ["", "null", "-999", "1e10", "9007199254740992"]) {
    assert.throws(() => parseCensusPartnerApi([rows[0], ["1220", raw, "2026-08"]], "1220", "imports", "2026-10"), /invalid/);
  }
  assert.throws(() => parseCensusPartnerApi([...rows, rows[1]], "1220", "imports", "2026-10"), /duplicate/);
});

test("authenticated adapter is isolated from XLSX failures, retries boundedly and redacts secrets", async () => {
  const originalFetch = globalThis.fetch, oldKey = process.env.CENSUS_API_KEY;
  process.env.CENSUS_API_KEY = "private-test-key";
  const metadata = { scrape: { provider: US_TRADE_PROVIDER } };
  try {
    let calls = 0;
    globalThis.fetch = async input => {
      calls++;
      const url = new URL(String(input));
      assert.equal(url.hostname, "api.census.gov");
      assert.equal(url.searchParams.get("key"), "private-test-key");
      assert.equal(url.searchParams.get("I_COMMODITY"), "-");
      assert.equal(url.searchParams.get("DISTRICT"), "-");
      assert.equal(url.searchParams.has("CTY_CODE"), false);
      if (calls === 1) return new Response("busy", { status: 503 });
      const through = url.searchParams.get("time")!.split(" to ")[1]!;
      return Response.json([["CTY_CODE", "GEN_VAL_MO", "time"], ["1220", "35980039950", through],
        ["5700", "777000000", through], ["-", "999999999", through]]);
    };
    const result = await fetchUsTradeDetailIncremental(metadata, "census_us_trade_imports_country_nsa_1220");
    assert.equal(result.points[0]?.value, 35980.03995);
    assert.equal(result.sourceMetadata?.seasonalAdjustment, "NSA");
    assert.ok(!JSON.stringify(result.sourceMetadata).includes("private-test-key"));
    assert.equal(calls, 2);
    await fetchUsTradeDetailIncremental(metadata, "census_us_trade_imports_country_nsa_1220");
    assert.equal(calls, 2);
    const china = await fetchUsTradeDetailIncremental(metadata, "census_us_trade_imports_country_nsa_5700");
    assert.equal(china.points[0]?.value, 777);
    await assert.rejects(fetchCensusPartnerApi("census_us_trade_imports_country_nsa_2010"), /no partner observations/);
    assert.equal(calls, 2, "different partners share one validated release table without replacing missing members with totals");
    await assert.rejects(fetchCensusPartnerApi("census_us_trade_imports_country_1220"), /unadjusted/);
    await assert.rejects(fetchCensusPartnerApi("census_us_trade_imports_country_nsa_2771"), /active/);
    calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("https://api.census.gov/?key=private-test-key"); };
    await assert.rejects(fetchCensusPartnerApi("census_us_trade_exports_country_nsa_5700"), error => {
      assert.ok(error instanceof Error);
      assert.ok(!String(error).includes("private-test-key"));
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls, 2);
    globalThis.fetch = async () => new Response("credential echoed private-test-key", { status: 403 });
    await assert.rejects(fetchCensusPartnerApi("census_us_trade_exports_country_nsa_5700"), /HTTP 403/);
    await assert.rejects(fetchUsTradeDetailIncremental(metadata, "census_us_trade_exports_country_1220"), /snapshot fallback disabled/);
    globalThis.fetch = async () => new Response(null, { status: 204 });
    await assert.rejects(fetchCensusPartnerApi("census_us_trade_exports_country_nsa_5700"), /HTTP 204/);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.CENSUS_API_KEY; else process.env.CENSUS_API_KEY = oldKey;
  }
});
