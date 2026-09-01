import assert from "node:assert/strict";
import test from "node:test";
import { parseNbsPpiResponse } from "./parseResponse";

test("PPI 国家数据保留指数并换算同比、环比", () => {
  const payload = {
    data: [
      {
        code: "202606MM",
        values: [
          { _id: "150633e52b9a470a9a9fd1b296dd6c5b", value: "104.1" },
          { _id: "47f8464961184392bc4f6a4b8e5b1cb5", value: "105.5" },
        ],
      },
      {
        code: "202607MM",
        values: [{ _id: "150633e52b9a470a9a9fd1b296dd6c5b", value: "" }],
      },
    ],
    success: true,
  };
  const id = "150633e52b9a470a9a9fd1b296dd6c5b";
  assert.equal(parseNbsPpiResponse(payload, [id], "index").get(id)![0].value, 104.1);
  assert.equal(parseNbsPpiResponse(payload, [id], "yoy").get(id)![0].value, 4.1);
  assert.equal(parseNbsPpiResponse(payload, [id], "mom").get(id)![0].value, 4.1);
  assert.throws(() => parseNbsPpiResponse({ data: [{ code: "202606MM", values: [{ _id: "ppi", value: "999" }] }] }, ["ppi"], "index"));
});
