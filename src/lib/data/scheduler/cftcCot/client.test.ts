import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { extractFirstZipText, parseCftcDisaggregatedCombinedText } from "./client";

test("parses managed-money fields from CFTC Disaggregated Combined text", () => {
  const text = [
    '"GOLD - COMMODITY EXCHANGE INC.",260818,2026-08-18,088691,CMX,00,002,450000,1000,2000,3000,4000,5000,190321,75234,9000',
    '"SILVER - COMMODITY EXCHANGE INC.",260818,2026-08-18,084691,CMX,00,002,150000,100,200,300,400,500,40321,25234,900',
  ].join("\n");

  const rows = parseCftcDisaggregatedCombinedText(text);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    {
      date: rows[0]?.reportDateIso,
      commodity: rows[0]?.commodity,
      market: rows[0]?.market,
      openInterest: rows[0]?.openInterest,
      long: rows[0]?.mmLong,
      short: rows[0]?.mmShort,
    },
    {
      date: "2026-08-18",
      commodity: "GOLD",
      market: "GOLD - COMMODITY EXCHANGE INC.",
      openInterest: 450000,
      long: 190321,
      short: 75234,
    },
  );
});

test("extracts the first deflated file from a CFTC-style ZIP", () => {
  const content = Buffer.from("gold row\n", "utf8");
  const compressed = deflateRawSync(content);
  const name = Buffer.from("annual.txt", "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const zip = Buffer.concat([local, name, compressed, central, name]);

  assert.equal(extractFirstZipText(zip), "gold row\n");
});
