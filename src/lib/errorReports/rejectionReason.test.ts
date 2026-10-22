import assert from "node:assert/strict";
import test from "node:test";
import { describeRejection } from "./rejectionReason";

test("undefined 拒绝原因不再退化为未知错误，且不暴露函数或Symbol内容", () => {
  for (const reason of [undefined, () => "private function body", Symbol("private description")]) {
    const result = describeRejection(reason);
    assert.equal(result.reasonType, typeof reason);
    assert.equal(result.message, `unhandledrejection (${typeof reason})`);
    assert.equal(result.stack, undefined);
  }
});

test("保留真实Error的消息/堆栈，以及可序列化拒绝原因", () => {
  const error = new Error("application failure");
  assert.deepEqual(describeRejection(error), { message: error.message, stack: error.stack, reasonType: "object" });
  for (const reason of [null, 0, false, { code: "FETCH_FAILED" }]) {
    assert.equal(describeRejection(reason).message, JSON.stringify(reason));
  }
  assert.equal(describeRejection("API failed").message, "API failed");
  assert.equal(describeRejection("").message, "unhandledrejection (empty string)");
});

test("循环引用或不可序列化原因仍能生成安全的可定位报告", () => {
  const circular: { self?: unknown } = {};
  circular.self = circular;
  for (const reason of [circular, BigInt(1), { toJSON() { throw new Error("private"); } }]) {
    const result = describeRejection(reason);
    assert.match(result.message, /not JSON serializable/);
    assert.equal(result.message.includes("private"), false);
  }
});
