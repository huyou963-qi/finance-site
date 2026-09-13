import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as XLSX from "xlsx";
import { JP_JNTO_VISITOR_ARRIVALS_SERIES } from "./catalog";
import {
  parseJpJntoVisitorArrivalsPage,
  parseJpJntoVisitorArrivalsWorkbook,
} from "./parser";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

test("discovers the rolling official JNTO time-series workbook", () => {
  const html = readFileSync(fixture("visitors-statistics.html"), "utf8");
  assert.equal(
    parseJpJntoVisitorArrivalsPage(html),
    "https://www.jnto.go.jp/statistics/data/_files/20260819_1615-5.xlsx",
  );
  assert.throws(
    () => parseJpJntoVisitorArrivalsPage(html.replace(/国籍\/月別/g, "nationality-month")),
    /found 0/,
  );
});

test("parses six monthly level series without the workbook YoY formulas", () => {
  const parsed = parseJpJntoVisitorArrivalsWorkbook(
    readFileSync(fixture("visitor-arrivals-2026-08-19.xlsx")),
    new Date("2026-09-13T00:00:00Z"),
  );
  assert.equal(Object.keys(parsed.series).length, 6);
  assert.equal(parsed.sourceLatestObsDate.toISOString().slice(0, 10), "2026-07-01");
  for (const definition of JP_JNTO_VISITOR_ARRIVALS_SERIES) {
    const points = parsed.series[definition.instrumentCode];
    assert.equal(points.length, 283);
    assert.equal(points[0].obsDate.toISOString().slice(0, 10), "2003-01-01");
    assert.equal(points.at(-1)!.obsDate.toISOString().slice(0, 10), "2026-07-01");
    assert(points.every((point) => Number.isInteger(point.value) && point.value >= 0));
  }
  assert.equal(parsed.series.jnto_jp_visitor_arrivals_total.at(-1)!.value, 3_442_100);
  assert.equal(parsed.series.jnto_jp_visitor_arrivals_china.at(-1)!.value, 428_200);
  assert.equal(parsed.series.jnto_jp_visitor_arrivals_united_states.at(-1)!.value, 286_200);
  const at = (code: string, iso: string) =>
    parsed.series[code].find((point) => point.obsDate.toISOString().slice(0, 10) === iso)?.value;
  // Pandemic border restrictions are real observations, not missing markers.
  assert.equal(at("jnto_jp_visitor_arrivals_total", "2020-05-01"), 1_663);
  assert.equal(at("jnto_jp_visitor_arrivals_hong_kong", "2020-05-01"), 1);
});

test("fails closed when a required nationality row disappears", () => {
  const workbook = XLSX.read(readFileSync(fixture("visitor-arrivals-2026-08-19.xlsx")), {
    type: "buffer",
  });
  const sheet = workbook.Sheets["2026"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const rowIndex = rows.findIndex((row) => row.some((cell) => String(cell ?? "").trim() === "米国"));
  const columnIndex = rows[rowIndex].findIndex((cell) => String(cell ?? "").trim() === "米国");
  delete sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
  const changed = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  assert.throws(
    () => parseJpJntoVisitorArrivalsWorkbook(changed, new Date("2026-09-13T00:00:00Z")),
    /expected one 米国 row/,
  );
});
