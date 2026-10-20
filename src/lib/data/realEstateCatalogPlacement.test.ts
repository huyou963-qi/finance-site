import assert from "node:assert/strict";
import test from "node:test";
import { resolveGlobalCatalogPlacement } from "./globalCatalogTaxonomy";
import type { UnifiedCatalogItem } from "./fredCatalog";
test("property parent definitions have business leaves distinct from 70-city prices", () => {
  for (const [label, subgroup] of [
    ["房地产：商品房待售面积：商业营业用房原值", "房地产：待售库存"],
    ["房地产：房屋施工面积：办公楼原值", "房地产：施工与交付"],
    ["房地产：新建商品房销售额：商业营业用房累计值", "房地产：销售与交易"],
    ["房地产：房地产开发投资：办公楼累计值", "房地产：开发投资"],
    ["房地产：房地产开发企业本年到位资金：国内贷款累计值", "房地产：开发资金"],
    ["70城房价：二手住宅：北京：同比指数", "70 城住房价格"],
  ]) {
    const item = { key: "mds:nbs_cn_realestate_fixture", countryCode: "CN", label } as UnifiedCatalogItem;
    assert.deepEqual(resolveGlobalCatalogPlacement(item), { category: "地产与建筑", subgroup });
  }
});
