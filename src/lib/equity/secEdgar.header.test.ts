import test from "node:test";
import assert from "node:assert/strict";
import { parseSecFilingHeader } from "./secEdgar";

// Trimmed from SEC's own -index-headers.html for Regency Centers' 2026-11-05 earnings 8-K
// (two co-registrants). The machine-readable block lives inside an HTML comment.
const ACCESSION = "0001193125-26-450159";
const REGENCY_8K = `<HTML><HEAD><TITLE>SEC EDGAR Submission ${ACCESSION}</TITLE>
<!--
&lt;SEC-HEADER&gt;${ACCESSION}.hdr.sgml : 20261105
&lt;ACCEPTANCE-DATETIME&gt;20261105171506
&lt;ACCESSION-NUMBER&gt;${ACCESSION}
&lt;TYPE&gt;8-K
&lt;PUBLIC-DOCUMENT-COUNT&gt;24
&lt;PERIOD&gt;20261105
&lt;ITEMS&gt;2.02
&lt;ITEMS&gt;7.01
&lt;ITEMS&gt;9.01
&lt;FILING-DATE&gt;20261105
&lt;FILER&gt;
&lt;COMPANY-DATA&gt;
&lt;CONFORMED-NAME&gt;REGENCY CENTERS CORP
&lt;CIK&gt;0000910606
&lt;/COMPANY-DATA&gt;
&lt;/FILER&gt;
&lt;FILER&gt;
&lt;COMPANY-DATA&gt;
&lt;CONFORMED-NAME&gt;REGENCY CENTERS LP
&lt;CIK&gt;0001066247
&lt;/COMPANY-DATA&gt;
&lt;/FILER&gt;
&lt;/SEC-HEADER&gt;
-->
</HEAD><BODY><PRE>
&lt;DOCUMENT&gt;
&lt;TYPE&gt;8-K
&lt;SEQUENCE&gt;1
&lt;FILENAME&gt;reg-20261105.htm
&lt;DESCRIPTION&gt;8-K
&lt;/DOCUMENT&gt;
&lt;DOCUMENT&gt;
&lt;TYPE&gt;EX-99.1
&lt;SEQUENCE&gt;2
&lt;FILENAME&gt;reg-ex99_1.htm
&lt;DESCRIPTION&gt;EX-99.1
&lt;/DOCUMENT&gt;
</PRE></BODY></HTML>`;

test("filing header yields the same index fields as submissions, plus filers and acceptance time", () => {
  const header = parseSecFilingHeader(REGENCY_8K, ACCESSION, "https://www.sec.gov/x");
  assert.ok(header);
  assert.equal(header.form, "8-K");
  assert.equal(header.filedAt, "2026-11-05");
  assert.equal(header.reportDate, "2026-11-05");
  assert.equal(header.items, "2.02,7.01,9.01");
  assert.equal(header.primaryDocument, "reg-20261105.htm");
  assert.equal(header.description, "8-K");
  assert.deepEqual(header.filerCiks, ["0000910606", "0001066247"]);
  // 17:15:06 Eastern (EST on 2026-11-05) = 22:15:06 UTC.
  assert.equal(header.acceptedAt?.toISOString(), "2026-11-05T22:15:06.000Z");
  assert.equal(header.sourceUrl, "https://www.sec.gov/x");
});

test("a header for another filing or with unrecognised items is rejected, never guessed", () => {
  assert.equal(parseSecFilingHeader(REGENCY_8K, "0001193125-26-000001"), null);
  assert.equal(parseSecFilingHeader(REGENCY_8K.replace("&lt;ITEMS&gt;7.01", "&lt;ITEMS&gt;Regulation FD"), ACCESSION), null);
  assert.equal(parseSecFilingHeader("<html>Your Request Originates from an Undeclared Automated Tool</html>", ACCESSION), null);
});

test("periodic reports without items keep items null and use the period of report", () => {
  const tenQ = REGENCY_8K.replace(/&lt;ITEMS&gt;[\d.]+\n/g, "").replace("&lt;TYPE&gt;8-K\n&lt;PUBLIC", "&lt;TYPE&gt;10-Q\n&lt;PUBLIC")
    .replace("&lt;PERIOD&gt;20261105", "&lt;PERIOD&gt;20260930");
  const header = parseSecFilingHeader(tenQ, ACCESSION);
  assert.equal(header?.form, "10-Q");
  assert.equal(header?.items, null);
  assert.equal(header?.reportDate, "2026-09-30");
});
