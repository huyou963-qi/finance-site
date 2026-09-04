import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseShillerCapePage } from "./parseCapePage";

function fixtureHtml(rows: string): string {
  return `<html><body><table id="datatable">
<tr>
<th>Date</th>
<th>Value</th>
</tr>
${rows}
</table></body></html>`;
}

describe("parseShillerCapePage", () => {
  it("parses rows newest-first and normalizes to month start", () => {
    const html = fixtureHtml(`
<tr class="odd">
<td>Sep 3, 2026</td>
<td>
&#x2002;
42.38
</td>
</tr>
<tr class="even">
<td>Jul 1, 2026</td>
<td>
&#x2002;
40.73
</td>
</tr>
<tr class="odd">
<td>Feb 1, 1871</td>
<td>
&#x2002;
10.92
</td>
</tr>
`);
    const parsed = parseShillerCapePage(html);
    assert.equal(parsed.points.length, 3);
    assert.deepEqual(
      parsed.points.map((p) => [p.obsDate.toISOString().slice(0, 10), p.value]),
      [
        ["1871-02-01", 10.92],
        ["2026-07-01", 40.73],
        ["2026-09-01", 42.38],
      ],
    );
    assert.equal(parsed.latestObsDate?.toISOString().slice(0, 10), "2026-09-01");
    assert.equal(parsed.skippedInvalid, 0);
  });

  it("skips rows with unparseable date/value and out-of-range CAPE", () => {
    const html = fixtureHtml(`
<tr class="odd">
<td>not a date</td>
<td>&#x2002;12.00</td>
</tr>
<tr class="even">
<td>Jan 1, 2000</td>
<td>&#x2002;n/a</td>
</tr>
<tr class="odd">
<td>Jan 1, 1999</td>
<td>&#x2002;999.00</td>
</tr>
<tr class="even">
<td>Jan 1, 2020</td>
<td>&#x2002;30.00</td>
</tr>
`);
    const parsed = parseShillerCapePage(html);
    assert.equal(parsed.points.length, 1);
    assert.equal(parsed.skippedInvalid, 3);
  });

  it("throws when the datatable anchor is missing (source structure changed)", () => {
    assert.throws(() => parseShillerCapePage("<html><body>no table here</body></html>"));
  });

  it("throws when 0 valid points parsed", () => {
    const html = fixtureHtml(`
<tr class="odd">
<td>garbage</td>
<td>garbage</td>
</tr>
`);
    assert.throws(() => parseShillerCapePage(html));
  });

  it("dedupes same-month rows, keeping the first occurrence", () => {
    const html = fixtureHtml(`
<tr class="odd">
<td>Sep 3, 2026</td>
<td>&#x2002;42.38</td>
</tr>
<tr class="even">
<td>Sep 1, 2026</td>
<td>&#x2002;99.00</td>
</tr>
`);
    const parsed = parseShillerCapePage(html);
    assert.equal(parsed.points.length, 1);
    assert.equal(parsed.points[0]!.value, 42.38);
  });
});
