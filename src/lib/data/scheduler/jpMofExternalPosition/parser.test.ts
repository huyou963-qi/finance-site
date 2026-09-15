import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseJpMofExternalPositionFiles } from "./parser";

const fixtures = {
  iip: readFileSync(path.join(__dirname, "fixtures", "iip-sample.xls")),
  debt: readFileSync(path.join(__dirname, "fixtures", "debt-sample.xls")),
};

test("parses four current-BPM6 quarterly totals and checks IIP identity", () => {
  const parsed = parseJpMofExternalPositionFiles(fixtures, 2);
  assert.deepEqual(parsed.mof_jp_iip_total_assets_quarterly.map((point) => point.value), [1000, 1100]);
  assert.deepEqual(parsed.mof_jp_iip_total_liabilities_quarterly.map((point) => point.value), [600, 650]);
  assert.deepEqual(parsed.mof_jp_iip_net_quarterly.map((point) => point.value), [400, 450]);
  assert.deepEqual(parsed.mof_jp_external_debt_total_quarterly.map((point) => point.value), [300, 320]);
});

test("rejects a broken assets minus liabilities identity", () => {
  const changed = Buffer.from(fixtures.iip);
  // Rebuild a changed fixture through SheetJS to avoid relying on BIFF byte offsets.
  const workbook = XLSX.read(changed, { type: "buffer" });
  workbook.Sheets.Net.F14.v = "390";
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "biff8" }) as Buffer;
  assert.throws(() => parseJpMofExternalPositionFiles({ ...fixtures, iip: buffer }, 2), /identity failed/);
});
