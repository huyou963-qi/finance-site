import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { fetchUsTradeDetail } from "./client";
import { US_TRADE_FILES, US_TRADE_PROVIDER } from "./catalog";
import { fetchUsTradeDetailIncremental } from "../adapters/usTradeDetailAdapter";

test("live worker/verification cannot reuse an offline Census snapshot or its caches", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "finance-site-census-test-"));
  const oldDirectory = process.env.US_TRADE_DATA_DIR;
  const oldFetch = globalThis.fetch;
  const files = new Map<string, Buffer>();
  const workbook = (rows: unknown[][]) => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "data");
    return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  };
  const enduse = workbook([["DATE", "ENDUSE", "DESCRIPTION", "VALUE"],
    ...Array.from({ length: 100 }, (_, n) => ["Jan-26", String(10001 + n), `Fixture product ${n}`, 1_000_000])]);
  files.set(US_TRADE_FILES.exports, enduse);
  files.set(US_TRADE_FILES.imports, enduse);
  const saHeader = Array.from({ length: 47 }, () => "unused");
  saHeader.splice(0, 3, "year", "cty_code", "cty_desc");
  saHeader[19] = "EJAN"; saHeader[35] = "IJAN";
  files.set(US_TRADE_FILES.countries, workbook([saHeader,
    ...Array.from({ length: 16 }, (_, n) => {
      const row: unknown[] = Array(47).fill(null);
      row[0] = 2026; row[1] = String(1220 + n); row[2] = `Fixture partner ${n}`;
      row[19] = 2_000_000; row[35] = 3_000_000;
      return row;
    })]));
  const nsaHeader = Array.from({ length: 28 }, () => "unused");
  nsaHeader.splice(0, 3, "year", "CTY_CODE", "CTYNAME");
  nsaHeader[3] = "IJAN"; nsaHeader[16] = "EJAN";
  files.set(US_TRADE_FILES.countriesNsa, workbook([nsaHeader,
    ...Array.from({ length: 200 }, (_, n) => {
      const row: unknown[] = Array(28).fill(null);
      row[0] = 2026; row[1] = String(1220 + n); row[2] = `Fixture partner ${n}`;
      row[3] = 3; row[16] = 2;
      return row;
    })]));
  try {
    for (const [url, bytes] of files) await writeFile(join(directory, new URL(url).pathname.split("/").at(-1)!), bytes);
    process.env.US_TRADE_DATA_DIR = directory;
    globalThis.fetch = async () => new Response("Forbidden", { status: 403 });
    await t.test("403 plus existing snapshot is a live failure, not normal SKIPPED", async () => {
      await assert.rejects(fetchUsTradeDetail(), /snapshot fallback disabled:.*403/i);
    });
    await t.test("explicit offline seed retains the existing official-file import path", async () => {
      const series = await fetchUsTradeDetail({ allowLocalSnapshot: true });
      assert.equal(series.find(s => s.code === "census_us_trade_exports_country_1220")?.points[0]?.value, 2);
    });
    await t.test("worker cannot borrow warmed offline download/parsed caches", async () => {
      await assert.rejects(fetchUsTradeDetailIncremental({ scrape: { provider: US_TRADE_PROVIDER } },
        "census_us_trade_exports_country_1220"), /snapshot.*(?:refused|disabled)|(?:refused|disabled).*snapshot/i);
    });
    await t.test("a failed live request can recover through the same connector", async () => {
      globalThis.fetch = async (input) => {
        const bytes = files.get(String(input));
        assert.ok(bytes);
        return new Response(new Uint8Array(bytes));
      };
      const result = await fetchUsTradeDetailIncremental({ scrape: { provider: US_TRADE_PROVIDER } },
        "census_us_trade_exports_country_1220");
      assert.equal(result.sourceLatestObsDate?.toISOString(), "2026-01-01T00:00:00.000Z");
      assert.equal(result.points[0]?.value, 2);
    });
  } finally {
    globalThis.fetch = oldFetch;
    if (oldDirectory === undefined) delete process.env.US_TRADE_DATA_DIR;
    else process.env.US_TRADE_DATA_DIR = oldDirectory;
    await rm(directory, { recursive: true, force: true }); // Only the exact directory created by this test.
  }
});
