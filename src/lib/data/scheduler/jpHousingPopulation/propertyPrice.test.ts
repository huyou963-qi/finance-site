import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseJpMlitNationalResidentialPriceIndex } from "./propertyPrice";

function fixture(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "全国Japan季節調整");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const header = Array.from({ length: 9 }, () => [""] as unknown[]);
header[4] = ["", "住宅総合"];
header[8] = ["", "Property Price Index"];
const months = Array.from({ length: 100 }, (_, index) => {
  const d = new Date(Date.UTC(2017, 0 + index, 1));
  return [`${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`, 100 + index / 10];
});

const points = parseJpMlitNationalResidentialPriceIndex(fixture([...header, ...months]));
assert.equal(points.length, 100);
assert.equal(points[0]!.obsDate.toISOString().slice(0, 10), "2017-01-01");
assert.equal(points.at(-1)!.value, 109.9);
assert.throws(() => parseJpMlitNationalResidentialPriceIndex(fixture([...header, ...months.slice(0, 20)])));
assert.throws(() => parseJpMlitNationalResidentialPriceIndex(fixture([...header.slice(0, 8), ["", "wrong"], ...months])));
