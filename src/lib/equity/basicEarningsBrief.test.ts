import test from "node:test";
import assert from "node:assert/strict";
import { buildBasicEarningsBrief } from "./basicEarningsBrief";

const source = (text: string) => [{ text, filename: "release.htm", url: "https://www.sec.gov/Archives/release.htm" }];
const version = { accession: "a", fiscalDate: "2026-09-30", filedAt: "2026-10-22", sourceUrl: "https://www.sec.gov/Archives/10q.htm",
  revenue: 1e9, revenueYoY: 0.1, eps: 1.2, epsYoY: null, netIncome: 1e8, opMargin: 0.12 };
test("financial summaries bind to the exact period/version with evidence and no consensus claims", () => {
  const brief = buildBasicEarningsBrief("2026-09-30", [], version);
  assert.equal(brief.financial.length, 3);
  assert.match(brief.financial[1].text, /GAAP/);
  assert.equal(brief.financialFiledAt, "2026-10-22");
  assert.ok(brief.financial.every(item => item.url === version.sourceUrl && item.evidence.includes("accession=a")));
  assert.doesNotMatch(brief.financial.map(item => item.text).join(""), /超预期|一致预期/);
  assert.equal(buildBasicEarningsBrief("2026-06-30", [], version).financial.length, 0);
});
test("business changes and management guidance retain a verbatim source and measurement basis", () => {
  const brief = buildBasicEarningsBrief("2026-09-30", source("Vehicle deliveries increased 12% year-over-year.\nWe expect capital expenditures to exceed $20 billion in 2026.\nNon-GAAP diluted EPS was $1.44."));
  assert.match(brief.business[0].text, /交付量同比增长 12%/);
  assert.match(brief.business[1].text, /调整后每股收益/);
  assert.match(brief.guidance[0].text, /2026 年资本开支超过 \$20 billion/);
  assert.match(brief.guidance[0].evidence, /We expect/);
});
test("adjacent metrics, comparison years, untranslatable text and boilerplate never become invented facts", () => {
  const mixed = buildBasicEarningsBrief(null, source("Vehicle deliveries were stable; revenue increased 30% year-over-year."));
  assert.equal(mixed.business.length, 0);
  const noBasis = buildBasicEarningsBrief(null, source("Vehicle deliveries increased 5%, while revenue increased 30% year-over-year."));
  assert.doesNotMatch(noBasis.business[0].text, /同比/);
  assert.equal(buildBasicEarningsBrief(null, source("Last year non-GAAP EPS was $1.44 compared with this quarter.")).business.length, 0);
  const unknown = buildBasicEarningsBrief(null, source("We expect progress on numerous projects in the future."));
  assert.equal(unknown.guidance.length, 0); assert.ok(unknown.guidanceExcerpt);
});
