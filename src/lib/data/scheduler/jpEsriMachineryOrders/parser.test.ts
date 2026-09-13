import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { JP_ESRI_MACHINERY_ORDERS_SERIES } from "./catalog";
import {
  discoverJpEsriMachineryOrdersWorkbookUrl,
  parseJpEsriMachineryOrdersWorkbook,
} from "./parser";

const fixtureDir = path.join(__dirname, "fixtures");
const workbook = path.join(fixtureDir, "2606chouki-1.xlsx");
const index = path.join(fixtureDir, "juchu.html");

describe("ESRI machinery orders parser", () => {
  it("discovers the current official long-run workbook", async () => {
    const html = await import("node:fs/promises").then((fs) => fs.readFile(index, "utf8"));
    assert.equal(
      discoverJpEsriMachineryOrdersWorkbookUrl(html),
      "https://www.esri.cao.go.jp/jp/stat/juchu/2026/2606chouki-1.xlsx",
    );
    assert.throws(() => discoverJpEsriMachineryOrdersWorkbookUrl("<html></html>"));
  });

  it("parses all 13 SA order aggregates with continuous monthly history", async () => {
    const buffer = await import("node:fs/promises").then((fs) => fs.readFile(workbook));
    for (const series of JP_ESRI_MACHINERY_ORDERS_SERIES) {
      const points = parseJpEsriMachineryOrdersWorkbook(buffer, series);
      assert.equal(points.length, 255);
      assert.equal(points[0].obsDate.toISOString().slice(0, 10), "2005-04-01");
      assert.equal(points.at(-1)?.obsDate.toISOString().slice(0, 10), "2026-06-01");
    }
    const core = parseJpEsriMachineryOrdersWorkbook(
      buffer,
      JP_ESRI_MACHINERY_ORDERS_SERIES[6],
    );
    assert.equal(core.at(-1)?.value, 1_055_761.76106);
  });

  it("fails closed when the expected sheet disappears", async () => {
    const buffer = await import("node:fs/promises").then((fs) => fs.readFile(workbook));
    const parsed = XLSX.read(buffer, { type: "buffer" });
    delete parsed.Sheets["季調・月次"];
    parsed.SheetNames = parsed.SheetNames.filter((name) => name !== "季調・月次");
    const altered = XLSX.write(parsed, { type: "buffer", bookType: "xlsx" });
    assert.throws(() =>
      parseJpEsriMachineryOrdersWorkbook(altered, JP_ESRI_MACHINERY_ORDERS_SERIES[0]),
    );
  });
});
