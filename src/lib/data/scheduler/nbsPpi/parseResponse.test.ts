import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseNbsPpiResponse } from "./parseResponse";

test("PPI 国家数据保留指数并换算同比、环比", () => {
  const payload = JSON.parse(readFileSync(".data/nbs-ppi-sample.json", "utf8"));
  const id = "150633e52b9a470a9a9fd1b296dd6c5b";
  assert.equal(parseNbsPpiResponse(payload, [id], "index").get(id)![0].value, 104.1);
  assert.equal(parseNbsPpiResponse(payload, [id], "yoy").get(id)![0].value, 4.1);
  assert.equal(parseNbsPpiResponse(payload, [id], "mom").get(id)![0].value, 4.1);
  assert.throws(() => parseNbsPpiResponse({ data: [{ code: "202606MM", values: [{ _id: "ppi", value: "999" }] }] }, ["ppi"], "index"));
});
