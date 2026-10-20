import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseRecProbWorkbook } from "./parseRecProb";

function book(rows: unknown[][]) {
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([["Date", "Rec_prob"], ...rows]), "rec_prob");
  return w;
}

test("NYFed English month dates preserve 12-month-ahead targets and fractional probability units", () => {
  const r = parseRecProbWorkbook(book([["01-Aug-2027", 0.1388253971623403], ["01-Sep-2027", 0.12758666440605101]]));
  assert.deepEqual(r.points.map(p => [p.obsDate.toISOString().slice(0, 10), p.value]), [["2027-08-01", 13.88], ["2027-09-01", 12.76]]);
});

test("NYFed retains numeric Excel dates, numeric text, zero and genuine missing observations", () => {
  const r = parseRecProbWorkbook(book([[45292, 0], ["45323", 0.2], ["01-Mar-2024", null]]));
  assert.deepEqual(r.points.map(p => [p.obsDate.toISOString().slice(0, 10), p.value]), [["2024-01-01", 0], ["2024-02-01", 20]]);
});

test("NYFed rejects impossible or locale-ambiguous dates and out-of-range probabilities", () => {
  for (const row of [["31-Feb-2026", 0.1], ["01-Xxx-2026", 0.1], ["09/01/2027", 0.1], ["01-Sep-2027", 12.76], [Infinity, 0.1]]) {
    assert.throws(() => parseRecProbWorkbook(book([row])), /0 个有效点/);
  }
});
