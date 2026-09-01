import assert from "node:assert/strict";
import test from "node:test";
import { parseNbsGdpResponse } from "./parseResponse";

test("GDP esData 解析季度值及实际同比", () => {
  const payload = {
    data: [{
      code: "202602SS",
      values: [
        { _id: "nominal", value: "361511.1" },
        { _id: "index", value: "104.3" },
      ],
    }],
  };
  const result = parseNbsGdpResponse(payload, ["nominal", "index"], "quarterly", new Map([["index", "index_minus_100"]]));
  assert.deepEqual(result.get("nominal")?.[0], { obsDate: new Date(Date.UTC(2026, 3, 1)), value: 361511.1 });
  assert.deepEqual(result.get("index")?.[0], { obsDate: new Date(Date.UTC(2026, 3, 1)), value: 4.3 });
  assert.throws(() => parseNbsGdpResponse({ data: [{ code: "202602SS", values: [{ _id: "nominal", value: "NaN" }] }] }, ["nominal"], "quarterly", new Map()));
});
