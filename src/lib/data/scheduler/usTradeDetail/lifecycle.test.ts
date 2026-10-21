import assert from "node:assert/strict";
import test from "node:test";
import { isHistoricalCensusSeries } from "./lifecycle";
import { subscriptionEligibleForSchedule } from "../subscriptionEligibility";

test("confirmed historical country codes cannot be revived by known acquisition metadata", () => {
  for (const id of ["4790", "4799", "4802", "7320"]) for (const side of ["exports", "imports"]) {
    const code = `census_us_trade_${side}_country_nsa_${id}`;
    assert.equal(isHistoricalCensusSeries(code), true);
    assert.equal(subscriptionEligibleForSchedule({ subscriptionEnabled: true, adapterKind: "BULK_FILE",
      sourceSeriesKey: code, metadata: { fetchAcquisition: { status: "known" } } }), false);
  }
  for (const id of ["4801", "7321", "5080", "5160"]) {
    assert.equal(isHistoricalCensusSeries("census_us_trade_exports_country_nsa_" + id), false);
  }
});
