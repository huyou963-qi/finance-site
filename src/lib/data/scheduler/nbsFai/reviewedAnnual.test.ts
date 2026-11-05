import assert from "node:assert/strict";
import test from "node:test";
import { parseFaiReviewedAnnualRelease } from "./parseRelease";
import { fetchNbsFaiGroup } from "./client";
import { NBS_FAI_REVIEWED_ANNUAL_SUPPLEMENTS } from "./catalog";
// Synthetic structural fixtures. Audit originals remain only on the owner's machine.
const html = (name: string) => name === "annual"
  ? "<h1>2025年全国固定资产投资基本情况</h1><table><tr><td>国有控股</td><td>-12.3</td></tr><tr><td>其中：民间投资</td><td>-6.4</td></tr></table>"
  : "<h1>统计局信息公开</h1><p>2025 年，全国房地产开发投资 100 亿元，比上年下降 7.4% 。</p><h2>2025年全国房地产开发和销售情况</h2>";
test("annual original picks exact state-controlled and real estate values, rejects wrong year/scope", () => {
  assert.equal(parseFaiReviewedAnnualRelease(html("annual"), 2025, "state_controlled").value, -12.3);
  assert.equal(parseFaiReviewedAnnualRelease(html("realestate"), 2025, "real_estate").value, -7.4);
  assert.throws(() => parseFaiReviewedAnnualRelease(html("annual"), 2026, "state_controlled"), /年份/);
  assert.throws(() => parseFaiReviewedAnnualRelease(html("annual"), 2025, "real_estate"), /范围/);
  assert.throws(() => parseFaiReviewedAnnualRelease("2025年1—9月全国房地产市场基本情况 全国房地产开发投资100亿元，比上年下降17.2%", 2025, "real_estate"), /范围/);
  assert.throws(() => parseFaiReviewedAnnualRelease(html("annual") + "国有控股-9.1其中", 2025, "state_controlled"), /唯一/);
});
test("group sync and incremental worker share source supplement without filling future years", async () => {
  const saved = globalThis.fetch; const source = NBS_FAI_REVIEWED_ANNUAL_SUPPLEMENTS[0]; let files = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "POST") return Response.json({ data: [{ code: "2024YY", values: [{ _id: source.indicatorId, value: "5.7" }] }] });
    files++; return new Response(html("annual"));
  };
  try {
    const item = { ...source, frequency: "annual" as const, label: "国有控股", group: "控股", unit: "%" as const };
    const result = await fetchNbsFaiGroup([item], 2024);
    assert.deepEqual(result.get(item.indicatorId)?.map(p => [p.obsDate.toISOString().slice(0,10), p.value]), [["2024-01-01", 5.7], ["2025-01-01", -12.3]]);
    await fetchNbsFaiGroup([item], 2026); assert.equal(files, 1);
  } finally { globalThis.fetch = saved; }
});
