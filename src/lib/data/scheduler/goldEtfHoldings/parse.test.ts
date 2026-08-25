import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { parseGlobalXGoldHoldings, parseIauCurrentTonnes, parseSpdrGldArchive, parseWgcPhauMonthlyHoldings, parseWisdomTreeBarListText } from "./parse";

function wgcFixture(duplicate = false): Buffer {
  const workbook = XLSX.utils.book_new();
  const rows: unknown[][] = [
    ["ticker", "phau ln equity", ...(duplicate ? ["phau ln equity"] : [])],
    [], [], [], [],
    ["Date", "WisdomTree Physical Gold", ...(duplicate ? ["WisdomTree Physical Gold"] : [])],
    [new Date(Date.UTC(2026, 5, 30)), 51.15244778, ...(duplicate ? [51.15244778] : [])],
    [new Date(Date.UTC(2026, 6, 31)), 51.82077299, ...(duplicate ? [51.82077299] : [])],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Holdings by month");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("gold ETF official parsers", () => {
  it("parses GLD tonnes and skips holiday rows", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Date", "Tonnes of Gold"],
      ["18-Nov-2004", "8.09"],
      ["25-Nov-2004", "US Holiday"],
      ["19-Nov-2004", "57.85"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "US GLD Historical Archive");
    const parsed = parseSpdrGldArchive(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    assert.deepEqual(parsed.points.map((point) => [point.obsDate.toISOString().slice(0, 10), point.value]), [
      ["2004-11-18", 8.09],
      ["2004-11-19", 57.85],
    ]);
    assert.equal(parsed.skippedInvalid, 1);
  });

  it("parses IAU authoritative current tonnes", () => {
    const point = parseIauCurrentTonnes(
      '<x>{"tonnes":{"visible":true,"label":"Tonnes in Trust","formattedValue":"458.65","sortOrder":46,"prefix":null,"infoBubble":"","formattedAsOfDate":"Aug 21, 2026","name":"tonnes"}}</x>',
    );
    assert.equal(point.obsDate.toISOString().slice(0, 10), "2026-08-21");
    assert.equal(point.value, 458.65);
  });

  it("joins Global X GOLD UOI to same-day metal entitlement", () => {
    const nav = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(nav, XLSX.utils.aoa_to_sheet([
      ["Valuation Date", "Ticker", "NAV per Unit", "Fund AUM", "UOI"],
      ["6/1/26", "GOLD", 57, 5_848_531_825, 102_597_782],
    ]), "NAV");
    const ent = XLSX.utils.book_new();
    const row = new Array(11).fill("");
    row[1] = "01-Jun-2026";
    row[10] = 0.009150336;
    XLSX.utils.book_append_sheet(ent, XLSX.utils.aoa_to_sheet([row]), "Sheet1");
    const parsed = parseGlobalXGoldHoldings(
      XLSX.write(nav, { type: "buffer", bookType: "xlsx" }),
      XLSX.write(ent, { type: "buffer", bookType: "xlsx" }),
    );
    assert.equal(parsed.points[0].obsDate.toISOString().slice(0, 10), "2026-06-01");
    assert.ok(Math.abs(parsed.points[0].value - 29.2) < 0.1);
  });

  it("parses GBS independent issuer allocated fine ounces", () => {
    const point = parseWisdomTreeBarListText(
      "Total Allocated Fine Weight: | LAW DEBENTURE TRUST RE GBS | 21 August 2026 | 2387 | 934,472.975 | 934,340.660 | BAR NUMBER",
      "gbs",
    );
    assert.equal(point.obsDate.toISOString().slice(0, 10), "2026-08-21");
    assert.equal(point.value, 29.061243041607);
  });

  it("parses SGBS product account total fine ounces and rejects missing identity", () => {
    const text = "Client Copy as at: 20-August-2026 15:55:07 | Account | Title | Total Bars | Total Gross Ounces | Total Fine Ounces | 5040738-GLD /9950/VLZ | WisdomTree Physical Swiss Gold | 3064 | 1,231,781.267 | 1,229,783.898";
    const point = parseWisdomTreeBarListText(text, "sgbs");
    assert.equal(point.obsDate.toISOString().slice(0, 10), "2026-08-20");
    assert.equal(point.value, 38.250554940457);
    assert.throws(() => parseWisdomTreeBarListText(text.replace("WisdomTree Physical Swiss Gold", "Other Fund"), "sgbs"));
  });

  it("parses WGC PHAU monthly direct tonnes and fails on ambiguous products", () => {
    const parsed = parseWgcPhauMonthlyHoldings(wgcFixture());
    assert.deepEqual(parsed.points.map((point) => [point.obsDate.toISOString().slice(0, 10), point.value]), [
      ["2026-06-30", 51.15244778],
      ["2026-07-31", 51.82077299],
    ]);
    assert.throws(() => parseWgcPhauMonthlyHoldings(wgcFixture(true)), /必须唯一匹配/);
  });
});
