import assert from "node:assert/strict";
import test from "node:test";
import { fetchMofcomTradeHistory } from "./client";

const total = [{ trade_date: "202605", total_value: 6481.3, total_per: 22.6, total_lj_value: 29750.8, total_lj_per: 19.2, export_value: 3767.8, export_per: 19.4, export_lj_value: 17134, export_lj_per: 15.5, import_value: 2713.5, import_per: 27.4, import_lj_value: 12616.9, import_lj_per: 24.5, imexgap_value: 1054.3 }];

test("parses official MOFCOM customs-trade JSON rows", async () => {
  const values = await fetchMofcomTradeHistory({ fetchJson: async (path) => {
    if (path === "totalmonth/query") return [total];
    if (path === "totaltrademethod/query") return [[{ trade_date: "202605", type: "一般贸易", export_value: 2592.5, export_per: 20.7, export_lj_value: 13508.16, export_lj_per: 13.1, import_value: 1573.62, import_per: 25.3, import_lj_value: 8593.52, import_lj_per: 14.8 }]];
    if (path === "totalbycountry/query") return { rows: [{ trade_date: "202605", type: "美国", total_lj_value: 2891.46, total_lj_per: 0.1, export_lj_value: 2159.2, export_lj_per: 0.2, import_lj_value: 732.26, import_lj_per: -0.8 }] };
    if (path === "composition/query") return { rows: [{ data_time: "202605", name: "机电产品", export_value: 200000000, export_lj_value: 900000000, export_lj_per: 10, import_value: 100000000, import_lj_value: 400000000, import_lj_per: 5 }] };
    throw new Error(`unexpected endpoint ${path}`);
  } });
  const totalSeries = [...values.values()].find((item) => item.label === "外贸：进出口总额：当月值");
  assert.equal(totalSeries?.points[0]?.value, 6481.3);
  const tradeMethod = [...values.values()].find((item) => item.label === "外贸：贸易方式：一般贸易：出口当月值");
  assert.equal(tradeMethod?.points[0]?.value, 2592.5);
  const country = [...values.values()].find((item) => item.label === "外贸：国别地区：美国：进口累计同比");
  assert.equal(country?.points[0]?.value, -0.8);
  const commodity = [...values.values()].find((item) => item.label === "外贸：商品构成：机电产品：出口当月值");
  assert.equal(commodity?.points[0]?.value, 2000);
  assert.equal(commodity?.points[0]?.obsDate.toISOString().slice(0, 10), "2026-05-01");
});

test("fails rather than silently accepting a changed official response", async () => {
  await assert.rejects(() => fetchMofcomTradeHistory({ fetchJson: async () => ({ rows: [] }) }));
});
