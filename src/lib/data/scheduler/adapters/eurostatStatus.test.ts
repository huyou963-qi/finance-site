import assert from "node:assert/strict";
import test from "node:test";
import { parseEurostatJsonStat } from "./eurostatAdapter";
test("preserves Eurostat estimate flags even when value does not change", () => {
  const result = parseEurostatJsonStat({ id:["time"],size:[2], value:{0:103.69,1:104.31},
    dimension:{time:{category:{index:{"2026-08":0,"2026-09":1}}}},status:{1:"e"},updated:"2026-10-02" });
  assert.equal(result.sourceMetadata?.latestObsStatus,"e");
  assert.deepEqual(result.sourceMetadata?.observationStatusByPeriod,{"2026-09":"e"});
});
