import assert from "node:assert/strict";
import test from "node:test";
import { COT_PRODUCT_BY_SLUG } from "../../cot/cotProductCatalog";
import { readCotMeta } from "../cotSeedCatalog";
import { extractMmSeries, rowMatchesSpec } from "./match";
import { parseCftcDisaggregatedCombinedText } from "./client";
import type { CftcCotRow } from "./types";

function row(code: string, market: string, long: number): CftcCotRow {
  return { reportDate: new Date("2006-06-13T00:00:00Z"), reportDateIso: "2006-06-13", commodity: "WHEAT", contractMarketCode: code, market, mmLong: long, mmShort: 5, openInterest: long * 100 };
}

test("wheat codes distinguish CBOT and KCBT across the 2013 market renaming", () => {
  const cbot = COT_PRODUCT_BY_SLUG.get("wheat_cbot")!.match;
  const kcbt = COT_PRODUCT_BY_SLUG.get("wheat_kcbt")!.match;
  for (const name of ["WHEAT - CHICAGO BOARD OF TRADE", "WHEAT-SRW - CHICAGO BOARD OF TRADE"]) {
    assert.ok(rowMatchesSpec(row("001602", name, 1000), cbot));
    assert.ok(!rowMatchesSpec(row("001602", name, 1000), kcbt));
  }
  for (const name of ["WHEAT - KANSAS CITY BOARD OF TRADE", "WHEAT-HRW - CHICAGO BOARD OF TRADE"]) {
    assert.ok(rowMatchesSpec(row("001612", name, 20), kcbt));
    assert.ok(!rowMatchesSpec(row("001612", name, 20), cbot));
  }
  assert.equal(extractMmSeries([row("001602", "WHEAT-SRW - CHICAGO BOARD OF TRADE", 1000), row("001612", "WHEAT-HRW - CHICAGO BOARD OF TRADE", 20)], kcbt)[0]!.long, 20);
});

test("legacy subscription metadata uses the current catalog matching rule", () => {
  const meta = readCotMeta({ cot: { productSlug: "wheat_kcbt", metric: "long", match: { mode: "single_max_oi", commodityPatterns: ["WHEAT"], marketPatterns: ["CHICAGO BOARD OF TRADE"] } } });
  assert.deepEqual(meta?.match.contractMarketCodes, ["001612"]);
  assert.ok(!rowMatchesSpec(row("001602", "WHEAT-SRW - CHICAGO BOARD OF TRADE", 1000), meta!.match));
});

test("cocoa and natural gas keep identical contracts through historical name changes", () => {
  assert.ok(rowMatchesSpec(row("073732", "COCOA - NEW YORK BOARD OF TRADE", 20), COT_PRODUCT_BY_SLUG.get("cocoa")!.match));
  const spec = COT_PRODUCT_BY_SLUG.get("natgas4")!.match;
  const series = extractMmSeries([
    row("03565C", "HENRY HUB PENULTIMATE GAS SWAP - NEW YORK MERCANTILE EXCHANGE", 10),
    row("023A55", "HENRY HUB LAST DAY FIN - NEW YORK MERCANTILE EXCHANGE", 20),
    row("023A56", "HENRY HUB PENULTIMATE FIN - NEW YORK MERCANTILE EXCHANGE", 30),
    row("0233AH", "HENRY HUB - TAILGATE, LOUISIANA (INDEX) - ICE FUTURES ENERGY DIV", 40),
    row("023651", "NATURAL GAS - NEW YORK MERCANTILE EXCHANGE", 1000),
  ], spec);
  assert.equal(series[0]!.long, 100);
  assert.equal(series[0]!.short, 20);
});

test("official archive parsing retains leading zero contract codes", () => {
  const rows = parseCftcDisaggregatedCombinedText('"WHEAT - KANSAS CITY BOARD OF TRADE",060613,2006-06-13,001612,KCBT,00,001,1000,1,2,3,4,5,20,5');
  assert.equal(rows[0]!.contractMarketCode, "001612");
  assert.ok(rowMatchesSpec(rows[0]!, COT_PRODUCT_BY_SLUG.get("wheat_kcbt")!.match));
});
