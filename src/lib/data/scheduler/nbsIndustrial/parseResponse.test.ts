import assert from "node:assert/strict";
import test from "node:test";
import { parseNbsIndustrialResponse } from "./parseResponse";
test("工业增加值 JSON 解析月初及增长率", () => {
  const payload = {
    data: [{
      code: "202606MM",
      values: [
        { _id: "ef1b1765960d45a29b4d7c4ca91be916", value: "5.3" },
        { _id: "21e7072e9f384209aedb56e69a18216e", value: "5.4" },
      ],
    }],
    success: true,
  };
  const points = parseNbsIndustrialResponse(payload, ["ef1b1765960d45a29b4d7c4ca91be916"]).get("ef1b1765960d45a29b4d7c4ca91be916")!;
  assert.equal(points[0]?.obsDate.toISOString(), "2026-06-01T00:00:00.000Z"); assert.equal(points[0]?.value, 5.3);
  assert.throws(() => parseNbsIndustrialResponse({ data: [{ code: "202606MM", values: [{ _id: "x", value: "999" }] }] }, ["x"]));
});
