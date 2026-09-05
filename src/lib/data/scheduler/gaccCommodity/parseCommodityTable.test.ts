import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { parseGaccCommodityTable } from "./parseCommodityTable";
import { buildGaccSeriesPoints } from "./toSeriesPoints";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "fixtures", name), "utf-8");

const EXPORT_2026_07 = "gacc-export-2026-07-sample.html";
const IMPORT_2026_07 = "gacc-import-2026-07-sample.html";
const IMPORT_2026_01 = "gacc-import-2026-01-sample.html";
const EXPORT_2025_06 = "gacc-export-2025-06-sample.html";
const EXPORT_2022_01 = "gacc-export-2022-01-sample.html";

describe("parseGaccCommodityTable", () => {
  it("解析进口表并算出与现货市场吻合的单价（fixture 核实：2026-07）", () => {
    const parsed = parseGaccCommodityTable(fixture(IMPORT_2026_07));
    assert.equal(parsed.obsDate.toISOString().slice(0, 10), "2026-07-01");
    assert.equal(parsed.monthSpan, 1);
    assert.deepEqual(parsed.valueUnit, { currency: "USD", factor: 1000, raw: "Unit:US$1,000" });
    // 表内 173 个商品行，其中 2 行当月量、额皆空（分节/占位行）被丢弃
    assert.equal(parsed.rows.size, 171);
    assert.equal(parsed.skippedInvalid, 0);

    const ironOre = parsed.rows.get("iron ores and concentrates")!;
    assert.equal(ironOre.qtyUnit, "10000T");
    assert.equal(ironOre.qty, 10_809);
    assert.equal(ironOre.value, 10_876_327);

    const built = buildGaccSeriesPoints("import", parsed);
    assert.equal(built.missing.length, 0);
    assert.equal(built.valueSkippedByCurrency, false);
    const byCode = new Map(built.points.map((p) => [p.code, p.point.value]));
    // 10,876,327 千美元 ÷ 10,809 万吨 = 100.62 美元/吨
    assert.equal(byCode.get("gacc_cn_imp_iron_ore_price"), 100.6229);
    assert.equal(byCode.get("gacc_cn_imp_iron_ore_qty"), 10_809);
    assert.equal(byCode.get("gacc_cn_imp_iron_ore_val"), 108.76327);
    // 集成电路按「亿个」计量，单价落到美元/个
    assert.equal(byCode.get("gacc_cn_imp_integrated_circuits_qty"), 600);
    // 63,831,701 千美元 ÷ 600 亿个 = 1.06 美元/个
    assert.equal(byCode.get("gacc_cn_imp_integrated_circuits_price"), 1.0639);
  });

  it("解析出口表，*REF! 单元格按空值处理（fixture 核实：2026-07 新三样整行为 *REF!）", () => {
    const parsed = parseGaccCommodityTable(fixture(EXPORT_2026_07));
    assert.equal(parsed.obsDate.toISOString().slice(0, 10), "2026-07-01");
    const newTrio = parsed.rows.get(
      "new trio (electric vehicles,lithium-ion batteries,and photovoltaic products) *",
    );
    assert.equal(newTrio, undefined, "整行 *REF! 的汇总行应被丢弃而不是写入 NaN");

    const built = buildGaccSeriesPoints("export", parsed);
    assert.equal(built.missing.length, 0);
    assert.equal(built.points.length, 75); // 25 个商品 × 量/额/价
  });

  it("1 月表只有两组列，当月列仍是第 3、4 列（fixture 核实：2026-01）", () => {
    const parsed = parseGaccCommodityTable(fixture(IMPORT_2026_01));
    assert.equal(parsed.obsDate.toISOString().slice(0, 10), "2026-01-01");
    assert.equal(parsed.monthSpan, 1);
    const crude = parsed.rows.get("crude petroleum oils")!;
    assert.ok(crude.qty && crude.qty > 0);
    const built = buildGaccSeriesPoints("import", parsed);
    const byCode = new Map(built.points.map((p) => [p.code, p.point.value]));
    assert.equal(byCode.get("gacc_cn_imp_crude_oil_price"), 452.3874);
  });

  it("人民币计价的期次只落数量，不落金额与单价（fixture 核实：2025-06 出口表为 RMB￥10,000）", () => {
    const parsed = parseGaccCommodityTable(fixture(EXPORT_2025_06));
    assert.equal(parsed.valueUnit.currency, "CNY");
    assert.equal(parsed.valueUnit.factor, 10_000);
    const built = buildGaccSeriesPoints("export", parsed);
    assert.equal(built.valueSkippedByCurrency, true);
    assert.ok(built.points.every((p) => p.code.endsWith("_qty")), "非美元期不得产生金额或单价点");
    assert.ok(built.points.length > 20);
  });

  it("整表多一个前导空列时按 Commodity 的实际位置取列（fixture 核实：2022-01 出口表）", () => {
    const parsed = parseGaccCommodityTable(fixture(EXPORT_2022_01));
    assert.equal(parsed.obsDate.toISOString().slice(0, 10), "2022-01-01");
    assert.equal(parsed.valueUnit.currency, "USD");
    const meat = parsed.rows.get("meat(including meat offal)")!;
    assert.equal(meat.qtyUnit, "10000T");
    assert.equal(meat.qty, 3);
    assert.equal(meat.value, 156_964);
  });

  it("锚点缺失（去掉 Commodity 表头）时 throw", () => {
    const html = fixture(IMPORT_2026_07).replace(/Commodity/g, "Item");
    assert.throws(() => parseGaccCommodityTable(html), /未找到含 Commodity 的表头行/);
  });

  it("认不出金额单位时 throw，而不是按旧口径入库", () => {
    const html = fixture(IMPORT_2026_07).replace(/Unit:US\$1,000/g, "Unit:Galactic Credits");
    assert.throws(() => parseGaccCommodityTable(html), /认不出金额单位/);
  });

  it("当月列与累计列调换时被累计≥当月不变式挡住", () => {
    // 把「当月」两列与「累计」两列对调，模拟源站列序变更
    const html = fixture(IMPORT_2026_07).replace(
      /<tr>([\s\S]*?)<\/tr>/g,
      (row) => {
        const cells = [...row.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/gi)].map((m) => m[0]);
        if (cells.length < 8) return row;
        const swapped = [cells[0], cells[1], cells[4], cells[5], cells[2], cells[3], ...cells.slice(6)];
        return `<tr>${swapped.join("")}</tr>`;
      },
    );
    assert.throws(() => parseGaccCommodityTable(html), /当月列与累计列可能已调换/);
  });
});
