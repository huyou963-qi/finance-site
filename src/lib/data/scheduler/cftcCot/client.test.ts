import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { clearCftcCotCache, fetchCftcDisaggregatedRows, extractFirstZipText, parseCftcDisaggregatedCombinedText } from "./client";

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

const goldRow = (date: string) => ({
  id: `${date}-gold`, report_date_as_yyyy_mm_dd: date,
  commodity: "GOLD", market_and_exchange_names: "GOLD - COMMODITY EXCHANGE INC.",
  m_money_positions_long_all: "100", m_money_positions_short_all: "40", open_interest_all: "1000",
});

test("history paginates beyond 50,000 rows and retains the newest report", async (t) => {
  clearCftcCotCache();
  const offsets: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(String(input));
    assert.ok(url.searchParams.get("$select")?.includes("m_money_positions_long_all"));
    offsets.push(url.searchParams.get("$offset")!);
    const rows = offsets.length === 1
      ? Array.from({ length: 50_000 }, () => goldRow("2006-06-13"))
      : [goldRow("2026-10-13")];
    return Response.json(rows);
  });
  t.after(clearCftcCotCache);
  const rows = await fetchCftcDisaggregatedRows("2006-01-01", { requireCompleteHistory: true });
  assert.deepEqual(offsets, ["0", "50000"]);
  assert.equal(rows.length, 50_001);
  assert.equal(rows.at(-1)?.reportDateIso, "2026-10-13");
});

test("network errors fall back for incremental updates, but current-only cache cannot satisfy history", async (t) => {
  clearCftcCotCache();
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("c_disagg.txt")) {
      return new Response('"GOLD - COMMODITY EXCHANGE INC.",261013,2026-10-13,088691,CMX,00,002,1000,1,2,3,4,5,100,40');
    }
    throw new Error("network unavailable");
  });
  t.after(clearCftcCotCache);
  const rows = await fetchCftcDisaggregatedRows("2006-01-01");
  assert.equal(rows.length, 1);
  const before = urls.length;
  await assert.rejects(fetchCftcDisaggregatedRows("2006-01-01", { requireCompleteHistory: true }), /network unavailable/);
  assert.ok(urls.length > before);
  assert.equal(urls.filter((url) => url.endsWith("c_disagg.txt")).length, 1);
});
