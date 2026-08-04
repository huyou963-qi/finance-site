import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { NBS_PMI_INSTRUMENTS } from "./catalog";
import { parseNbsPmiWorkbook } from "./parseWorkbook";

function fixtureWorkbook(dropManufacturingColumn?: string): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  for (const sheetName of ["制造业", "非制造业"] as const) {
    const definitions = NBS_PMI_INSTRUMENTS.filter((row) => row.sheetName === sheetName);
    const labels = definitions
      .map((row) => row.sourceLabel)
      .filter((label) => label !== dropManufacturingColumn || sheetName !== "制造业");
    const rows: unknown[][] = [["测试"], ["单位（%）"], [null, ...labels]];
    for (let month = 0; month < 13; month++) {
      const date = new Date(Date.UTC(2025, month, 1));
      rows.push([date, ...labels.map((_, column) => 45 + column / 10 + month / 100)]);
    }
    const worksheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }
  return XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), {
    type: "buffer",
  });
}

test("parses all NBS PMI headline and component series", () => {
  const parsed = parseNbsPmiWorkbook(fixtureWorkbook());
  assert.equal(parsed.pointsByInstrument.size, NBS_PMI_INSTRUMENTS.length);
  assert.equal(parsed.pointsByInstrument.get("chov_c05_mfg_pmi")?.length, 13);
  assert.equal(parsed.pointsByInstrument.get("nbs_cn_non_mfg_new_orders")?.length, 13);
  assert.equal(parsed.sourceLatestObsDate.toISOString().slice(0, 10), "2026-01-01");
});

test("throws when a required source column disappears", () => {
  assert.throws(
    () => parseNbsPmiWorkbook(fixtureWorkbook("新订单")),
    /制造业 未找到包含全部分项的表头/,
  );
});
