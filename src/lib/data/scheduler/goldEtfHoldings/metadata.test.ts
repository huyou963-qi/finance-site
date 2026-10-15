import assert from "node:assert/strict";
import test from "node:test";
import { correctGoldEtfCountryMetadata } from "./metadata";

test("ASX GOLD corrects legacy GB to AU without losing acquisition or source history", () => {
  const prior = { countryCode: "GB", sourceTag: "gold-analysis-xlsx", fetchAcquisition: { status: "known" }, custom: 123 };
  const result = correctGoldEtfCountryMetadata(prior, "globalx-gold");
  assert.equal(result.countryCode, "AU");
  assert.equal(result.fetchAcquisition, prior.fetchAcquisition);
  assert.equal(result.custom, 123);
  assert.equal(prior.countryCode, "GB");
  assert.deepEqual(correctGoldEtfCountryMetadata(result, "globalx-gold"), result);
});

test("other gold products keep their established geography", () => {
  const prior = { countryCode: "CH" };
  assert.deepEqual(correctGoldEtfCountryMetadata(prior, "wisdomtree-sgbs"), prior);
});
