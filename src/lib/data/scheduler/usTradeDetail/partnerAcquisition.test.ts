import assert from "node:assert/strict";
import test from "node:test";
import { createCensusPartnerAcquirer } from "./partnerAcquisition";
import type { UsTradeSeries } from "./catalog";

const points = [{ obsDate: new Date("2026-08-01"), value: 12.5 }];
const series = (code: string): UsTradeSeries => ({ code, label: "fixture", nameEn: "fixture",
  kind: "country_nsa", sourceCode: code.slice(-4), subgroup: "fixture", seasonalAdjustment: "NSA", points });

test("API network failure uses exact NSA official series once per side cooldown, then retries API", async () => {
  let clock = 1000, calls = 0, fileCalls = 0, failed = true;
  const read = createCensusPartnerAcquirer({ now: () => clock,
    api: async () => { calls++; if (failed) throw Error("Census partner API network request failed after 2 attempts"); return points; },
    workbook: async code => { fileCalls++; return series(code); } });
  const code = "census_us_trade_imports_country_nsa_5700";
  const first = await read(code);
  assert.equal(first.points[0]?.value, 12.5); // No second USD scaling.
  assert.equal(first.sourceMetadata?.seasonalAdjustment, "NSA");
  assert.match(String(first.sourceMetadata?.acquisition), /workbook_after_api_network_failure/);
  await read("census_us_trade_imports_country_nsa_1220");
  assert.equal(calls, 1);
  await read("census_us_trade_exports_country_nsa_1220");
  assert.equal(calls, 2); // Export and import access paths are independent.
  failed = false; clock += 120001;
  assert.equal((await read(code)).sourceMetadata?.acquisition, "census_authenticated_partner_api");
  assert.equal(calls, 3);
  assert.equal(fileCalls, 3);
});

test("missing rows, API 403/schema errors and wrong SA/identity cannot turn into successful zero fallback", async () => {
  for (const message of ["Census API returned no partner observations", "Census partner API HTTP 403", "Census API returned an invalid period or monthly dollar value"]) {
    let files = 0;
    const read = createCensusPartnerAcquirer({ now: Date.now, api: async () => { throw Error(message); },
      workbook: async code => { files++; return series(code); } });
    await assert.rejects(read("census_us_trade_imports_country_nsa_5700"), { message });
    assert.equal(files, 0);
  }
  for (const result of [undefined, { ...series("wrong"), seasonalAdjustment: "SA" as const }, series("wrong")]) {
    const read = createCensusPartnerAcquirer({ now: Date.now,
      api: async () => { throw Error("Census partner API network request failed after 2 attempts"); }, workbook: async () => result });
    await assert.rejects(read("census_us_trade_imports_country_nsa_5700"), /missing or mismatched/);
  }
  const read = createCensusPartnerAcquirer({ now: Date.now,
    api: async () => { throw Error("Census partner API network request failed after 2 attempts"); },
    workbook: async () => { throw Error("Census live source unavailable"); } });
  await assert.rejects(read("census_us_trade_imports_country_nsa_5700"), /live source unavailable/);
  await assert.rejects(read("census_us_trade_imports_country_5700"), /NSA partner/);
  await assert.rejects(read("census_us_trade_imports_country_nsa_2771"), /active NSA partner/);
});
