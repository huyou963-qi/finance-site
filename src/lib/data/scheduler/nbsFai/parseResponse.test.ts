import test from "node:test";
import assert from "node:assert/strict";
import { parseNbsFaiResponse } from "./parseResponse";
const fixture = { data: [{ code: "202606MM", values: [{ _id: "headline", value: "-5.7" }, { _id: "primary", value: "0.9" }] }, { code: "202605MM", values: [{ _id: "headline", value: "-3.2" }] }] };
test("固定资产投资 esData 解析月度累计同比", () => { const result = parseNbsFaiResponse(fixture, ["headline", "primary"], "monthly"); assert.deepEqual(result.get("headline")?.map((x) => [x.obsDate.toISOString().slice(0, 10), x.value]), [["2026-05-01", -3.2], ["2026-06-01", -5.7]]); assert.equal(result.get("primary")?.[0]?.value, 0.9); });
test("固定资产投资异常值中止", () => { assert.throws(() => parseNbsFaiResponse({ data: [{ code: "202606MM", values: [{ _id: "headline", value: "NaN" }] }] }, ["headline"], "monthly")); });
