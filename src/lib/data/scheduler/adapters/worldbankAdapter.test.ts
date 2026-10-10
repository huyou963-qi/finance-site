import assert from "node:assert/strict";
import test from "node:test";
import { fetchWorldBankIncremental, worldBankApiCountry } from "./worldbankAdapter";

test("World Bank regional aliases use official IDs, not local EA/EU labels", async () => {
  assert.equal(worldBankApiCountry("EA"), "EMU");
  assert.equal(worldBankApiCountry("EU"), "EUU");
  assert.equal(worldBankApiCountry("US"), "USA");
  const original = globalThis.fetch;
  let requested = "";
  globalThis.fetch = async (url) => {
    requested = String(url);
    return new Response(JSON.stringify([{}, [
      { countryiso3code: "EMU", date: "2025", value: 1.42633734504301 },
      { countryiso3code: "USA", date: "2025", value: 99 },
    ]]));
  };
  try {
    const result = await fetchWorldBankIncremental("EA:BX.KLT.DINV.WD.GD.ZS", "2024-01-01");
    assert.match(requested, /country\/EMU\/indicator/);
    assert.equal(result.points.length, 1);
    assert.equal(result.points[0]?.value, 1.42633734504301);
  } finally { globalThis.fetch = original; }
});
