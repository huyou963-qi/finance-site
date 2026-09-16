import assert from "node:assert/strict";
import { resolveNbsRealEstateSeries } from "./nbsRealEstateAdapter";

const history = new Map([
  ["new-code", {
    code: "new-code",
    key: "price|新建商品住宅|唐山|base_index",
    label: "70城房价：新建商品住宅：唐山：定基指数（2020年=100）",
    category: "70城住房价格",
    unit: "指数",
    points: [],
  }],
]);

assert.equal(
  resolveNbsRealEstateSeries(history, "legacy-code", {
    scrape: { key: "price|新建商品住宅|唐 山|base_index" },
  })?.code,
  "new-code",
);
assert.equal(resolveNbsRealEstateSeries(history, "missing", { scrape: { key: "other" } }), undefined);
console.log("[nbsRealEstateAdapter] tests passed");
