import assert from "node:assert/strict";
import test from "node:test";
import { parseSectorNport } from "./sectorNportHoldings";

const date = "2025-09-30";
function filing(positions: string, series = "S000006410") {
  return `<edgarSubmission><formData><genInfo><regCik>0001064641</regCik><seriesId>${series}</seriesId>
    <repPdDate>${date}</repPdDate></genInfo><invstOrSecs>${positions}</invstOrSecs></formData></edgarSubmission>`;
}
function holding(cusip: string, weight: number, isin = "", category = "EC") {
  return `<invstOrSec><name>Issuer</name><cusip>${cusip}</cusip>
    <assetCat>${category}</assetCat><payoffProfile>Long</payoffProfile><units>NS</units>
    <balance>100</balance><pctVal>${weight}</pctVal><identifiers><isin value="${isin}"/></identifiers></invstOrSec>`;
}

test("SEC N-PORT uses the report date and preserves unidentified ordinary shares with their original weights", () => {
  const xml = filing(holding("037833100", 70) + holding("000000000", 20, "IE00B8KQN827")
    + holding("000000000", 9, "IE00BFRT3W74") + holding("000000000", 1, "", "STIV"));
  const result = parseSectorNport(xml, date)!;
  assert.equal(result.etf, "XLE");
  assert.equal(result.asOfDate, date);
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows.map(row => [row.holdingKey, row.cusip, row.symbol, row.weight]), [
    ["037833100", "037833100", null, 0.7],
    ["ISIN:IE00B8KQN827", null, null, 0.2],
    ["ISIN:IE00BFRT3W74", null, null, 0.09],
  ]);
  assert.throws(() => parseSectorNport(xml, "2025-06-30"), /日期不符/);
});

test("SEC N-PORT excludes unrelated funds and refuses partial equity snapshots", () => {
  assert.equal(parseSectorNport(filing("", "S000093832"), date), null);
  assert.throws(() => parseSectorNport(filing(holding("037833100", 60)), date), /验收区间/);
  assert.throws(() => parseSectorNport(filing(holding("000000000", 99)), date), /持仓异常/);
});
