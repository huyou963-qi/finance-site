import assert from "node:assert/strict";
import test from "node:test";
import { localizeCatalogItems, localizeMacroPayload, makePickLabel } from "@/i18n/dataLabels";

const dict: Record<string, string> = { "CPI（全部城市消费者）": "CPI (all urban consumers)" };
const en = makePickLabel("en", (zh) => dict[zh] ?? zh);
const zh = makePickLabel("zh", (s) => `!${s}`);

test("英文站优先数据里的英文名，其次词典，最后中文；中文站原样", () => {
  assert.equal(en("美国 · 失业率", "Unemployment rate"), "Unemployment rate");
  assert.equal(en("CPI（全部城市消费者）", null), "CPI (all urban consumers)");
  assert.equal(en("未翻译", "  "), "未翻译");
  assert.equal(zh("美国 · 失业率", "Unemployment rate"), "美国 · 失业率");
});

test("目录只改指标显示名，分类名与 key 不变", () => {
  const out = localizeCatalogItems(
    [
      {
        code: "US",
        name: "美国",
        categories: [
          {
            name: "通胀与价格",
            items: [{ key: "fred:CPIAUCSL", label: "CPI（全部城市消费者）", frequency: "月", provider: "fred", countryCode: "US", categoryName: "通胀与价格" }],
            subgroups: [{ name: "CPI", items: [{ key: "mds:x", label: "中文名", labelEn: "English name", frequency: "月", provider: "mds", countryCode: "US", categoryName: "通胀与价格" }] }],
          },
        ],
      },
    ],
    en,
  );
  assert.equal(out[0].name, "美国");
  assert.equal(out[0].categories[0].name, "通胀与价格");
  assert.equal(out[0].categories[0].items[0].label, "CPI (all urban consumers)");
  assert.equal(out[0].categories[0].items[0].key, "fred:CPIAUCSL");
  assert.equal(out[0].categories[0].subgroups?.[0].items[0].label, "English name");
});

test("图表序列名按语言替换", () => {
  const p = localizeMacroPayload(
    { title: "t", source: "mds", categories: [], series: [{ name: "中文名", nameEn: "English", data: [], key: "mds:1" }] },
    en,
  );
  assert.equal(p.series[0].name, "English");
  assert.equal(p.series[0].key, "mds:1");
});

test("组合名按「 · 」分段翻译", () => {
  const pick = makePickLabel("en", (zh) => ({ 美国: "United States", "实际 GDP": "Real GDP" })[zh] ?? zh);
  assert.equal(pick("美国 · 实际 GDP"), "United States · Real GDP");
  assert.equal(pick("美国 · 未登记"), "United States · 未登记");
});
