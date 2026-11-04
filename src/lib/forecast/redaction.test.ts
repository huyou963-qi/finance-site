import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { featureIdForPath } from "@/lib/access/featureCatalog";
import { toPublicUsCpiPayload, type UsCpiNowcastPayload } from "./usCpi/service";
import { toPublicUsGdpPayload, type UsGdpNowcastPayload } from "./usGdp/service";
import { toPublicUsNfpPayload, type UsNfpNowcastPayload } from "./usNfp/service";

function src(path: string) {
  return readFileSync(path, "utf8");
}

test("public forecast payloads drop the model block", () => {
  const cpi = toPublicUsCpiPayload({ nowcast: 1, model: { secret: "cpi-equation" } } as unknown as UsCpiNowcastPayload);
  const nfp = toPublicUsNfpPayload({ nowcast: 2, model: { secret: "nfp-feature" } } as unknown as UsNfpNowcastPayload);
  const gdp = toPublicUsGdpPayload({ nowcast: 3, model: { secret: "gdp-bridge" } } as unknown as UsGdpNowcastPayload);
  for (const body of [cpi, nfp, gdp]) {
    assert.equal("model" in body, false);
    assert.equal(JSON.stringify(body).includes("secret"), false);
  }
});

test("forecast client views do not contain the core algorithm", () => {
  const cpi = src("src/components/forecast/UsCpiNowcastView.tsx");
  const nfp = src("src/components/forecast/UsNfpNowcastView.tsx");
  const gdp = src("src/components/forecast/UsGdpNowcastView.tsx");
  for (const file of [cpi, nfp, gdp]) {
    assert.equal(/from ["']@\/lib\/forecast\/[^"']+\/model["']/.test(file), false);
    assert.equal(file.includes("seriesKey"), false);
  }
  for (const phrase of ["Zillow", "Manheim", "亨利港", "汽油", "自回归", "方法与局限", "relativeImportance"]) {
    assert.equal(cpi.includes(phrase), false, phrase);
  }
  for (const phrase of ["初请", "续请", "nfp12", "48 组", "方法与局限", "OLS"]) {
    assert.equal(nfp.includes(phrase), false, phrase);
  }
  for (const phrase of ["桥接", "系数", "OLS", "PAYEMS", "INDPRO", "fred:", "逆 MSE"]) {
    assert.equal(gdp.includes(phrase), false, phrase);
  }
});

test("algorithm details stay in server components and admin-gated routes", () => {
  for (const path of [
    "src/components/forecast/UsCpiModelDetails.tsx",
    "src/components/forecast/UsNfpModelDetails.tsx",
    "src/components/forecast/UsGdpModelDetails.tsx",
  ]) {
    const file = src(path);
    assert.equal(file.includes("use client"), false, path);
    assert.equal(file.includes("仅管理员"), true, path);
  }
  for (const path of [
    "src/app/forecast/us-cpi/page.tsx",
    "src/app/forecast/us-nfp/page.tsx",
    "src/app/forecast/us-gdp/page.tsx",
    "src/app/api/forecast/us-cpi/route.ts",
    "src/app/api/forecast/us-nfp/route.ts",
    "src/app/api/forecast/us-gdp/route.ts",
  ]) {
    const file = src(path);
    assert.equal(file.includes("toPublic"), true, path);
    assert.equal(file.includes('viewer.role === "admin"'), true, path);
  }
  assert.equal(featureIdForPath("/forecast/us-gdp"), "forecast-us-gdp");
});
