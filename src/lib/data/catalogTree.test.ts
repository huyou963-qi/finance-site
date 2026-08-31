import assert from "node:assert/strict";
import { test } from "node:test";
import { presentUsCpiAsYoy } from "./catalogTree";
import type { UnifiedCatalogItem } from "./fredCatalog";

const item = (key: string, label: string): UnifiedCatalogItem => ({
  key,
  label,
  frequency: "月",
  provider: "fred",
  countryCode: "US",
  categoryName: "CPI",
});

test("US CPI and CPI details merge into one subgroup with headline first", () => {
  const [country] = presentUsCpiAsYoy([{
    code: "US",
    name: "美国",
    categories: [{
      name: "通胀与价格",
      items: [],
      subgroups: [
        {
          name: "CPI",
          items: [
            item("fred:CPILFESL", "核心 CPI（剔除食物与能源）"),
            item("fred:CPIAUCSL", "CPI（全部城市消费者）"),
          ],
        },
        {
          name: "CPI 分项",
          items: [item("fred:CUSR0000SEHF01", "CPI 电力")],
        },
      ],
    }],
  }]);

  const inflation = country?.categories.find((category) => category.name === "通胀与价格");
  const cpiGroups = inflation?.subgroups?.filter((subgroup) =>
    subgroup.name === "CPI" || subgroup.name === "CPI 分项"
  );
  assert.equal(cpiGroups?.length, 1);
  assert.equal(cpiGroups?.[0]?.name, "CPI");
  assert.deepEqual(
    cpiGroups?.[0]?.items.map((item) => item.key),
    ["fred:CPIAUCSL::yoy", "fred:CPILFESL::yoy", "fred:CUSR0000SEHF01::yoy"],
  );
  assert.equal(cpiGroups?.[0]?.items[0]?.label, "CPI（全部城市消费者） 同比");
});
