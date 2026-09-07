import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  NFRA_BANKING_SERIES,
  nfraBankingSeriesByProvider,
  type NfraBankingDataset,
} from "./catalog";
import { parseNfraBankingWorkbook } from "./parseNfraBankingWorkbook";

function workbookFromRows(
  rows: unknown[][],
  sheetName: string,
  bookType: "xls" | "xlsx",
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  return XLSX.read(XLSX.write(workbook, { type: "buffer", bookType }), { type: "buffer" });
}

function quarterlyRows(
  year: number,
  options?: {
    missingTitle?: boolean;
    missingRow?: string;
    duplicateRow?: string;
    invalidFirstValue?: string;
  },
): unknown[][] {
  const oldLayout = year <= 2025;
  const rows: unknown[][] = oldLayout
    ? [
        [
          options?.missingTitle
            ? `（二）其他统计表（${year}年）`
            : `（二）商业银行主要监管指标情况表(法人)（${year}年）`,
        ],
        [null, null, null, null, "单位：亿元、%"],
        ["时间", "一季度", "二季度", "三季度", "四季度"],
        ["项目", null, null, null, null],
      ]
    : [
        [options?.missingTitle ? "其他统计表" : "商业银行主要监管指标情况表"],
        [null, null, null, "单位：亿元、%"],
        ["时间", `${year}年`, null, null, null],
        ["项目", "一季度", "二季度", "三季度", "四季度"],
      ];
  const configs = NFRA_BANKING_SERIES.filter(
    (series) => series.dataset === "commercial_bank_main_quarterly",
  );
  configs.forEach((series, index) => {
    if (series.availableFromYear && year < series.availableFromYear) return;
    if (series.sourceRowLabel === options?.missingRow) return;
    const base = series.valueKind === "percent_fraction" ? 0.01 + index / 10_000 : 10_000 + index;
    const row: unknown[] = [
      series.sourceRowLabel,
      base,
      base + 0.001,
      oldLayout ? base + 0.002 : null,
      oldLayout ? base + 0.003 : null,
    ];
    if (series.sourceRowLabel === options?.invalidFirstValue) row[1] = "not-a-number";
    rows.push(row);
    if (series.sourceRowLabel === options?.duplicateRow) rows.push([...row]);
  });
  rows.push(["注：自2019年起，邮政储蓄银行纳入商业银行合计汇总口径。"]);
  return rows;
}

function monthlyRows(): unknown[][] {
  return [
    ["2026年银行业金融机构总资产、总负债（月度）"],
    ["1. 银行业金融机构"],
    [null, null, null, null, "单位：亿元、%"],
    ["时间", "2026年"],
    ["项目", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
    [" 总资产", 4_806_061.69, 4_820_568.61, 4_862_009.72, 4_851_582.83, 4_862_757.02, 4_892_330.84, 4_891_502.66],
    ["    比上年同期增长率", 0.08927, 0.08555, 0.08029, 0.07601, 0.07252, 0.06631, 0.06558],
    [" 总负债", 4_421_694.12, 4_434_486.18, 4_474_962.09, 4_461_749.15, 4_469_511.7, 4_499_506.49, 4_496_088.27],
    ["    比上年同期增长率", 0.09213, 0.08781, 0.08207, 0.07744, 0.07349, 0.0685, 0.06727],
    [null],
    ["其中：商业银行合计"],
    ["项目", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
    [" 总资产", 1, 1, 1, 1, 1, 1, 1],
    ["    比上年同期增长率", 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99],
  ];
}

function parseQuarterly(rows: unknown[][], type: "xls" | "xlsx") {
  return parseNfraBankingWorkbook(
    workbookFromRows(rows, "商业银行季度", type),
    "commercial_bank_main_quarterly",
  );
}

test("catalog codes/providers are unique and provider lookup is exact", () => {
  assert.equal(NFRA_BANKING_SERIES.length, 42);
  for (const field of ["seriesKey", "provider", "instrumentCode"] as const) {
    const values = NFRA_BANKING_SERIES.map((series) => series[field]);
    assert.equal(new Set(values).size, values.length, `${field} must be unique`);
  }
  assert.ok(NFRA_BANKING_SERIES.every((series) => series.instrumentCode.startsWith("nfra_cn_")));
  const sample = NFRA_BANKING_SERIES[0]!;
  assert.equal(nfraBankingSeriesByProvider(sample.provider)?.seriesKey, sample.seriesKey);
  assert.equal(nfraBankingSeriesByProvider("not_a_provider"), null);
});

test("parses 2021 xlsx title-year layout and allows pre-2024 missing NSFR", () => {
  const parsed = parseQuarterly(quarterlyRows(2021), "xlsx");
  assert.equal(parsed.pointsBySeries.size, 38);
  assert.equal(parsed.pointsBySeries.get("commercial_bank_net_stable_funding_ratio")?.length, 0);
  assert.equal(
    [...parsed.pointsBySeries.values()].reduce((sum, points) => sum + points.length, 0),
    37 * 4,
  );
  assert.equal(
    parsed.latestObsDateBySeries
      .get("commercial_bank_npl_ratio")
      ?.toISOString()
      .slice(0, 10),
    "2021-10-01",
  );
  assert.equal(parsed.skippedInvalid, 0);
});

test("parses 2026 xls separate-year layout and converts fractions to percent", () => {
  const parsed = parseQuarterly(quarterlyRows(2026), "xls");
  assert.equal(
    [...parsed.pointsBySeries.values()].reduce((sum, points) => sum + points.length, 0),
    38 * 2,
  );
  const npl = NFRA_BANKING_SERIES.find(
    (series) => series.seriesKey === "commercial_bank_npl_ratio",
  )!;
  const sourceIndex = NFRA_BANKING_SERIES.filter(
    (series) => series.dataset === "commercial_bank_main_quarterly",
  ).indexOf(npl);
  assert.equal(
    parsed.pointsBySeries.get(npl.seriesKey)?.[0]?.value,
    Math.round((0.01 + sourceIndex / 10_000) * 100 * 1_000_000) / 1_000_000,
  );
  assert.equal(
    parsed.latestObsDateBySeries.get(npl.seriesKey)?.toISOString().slice(0, 10),
    "2026-04-01",
  );
});

test("parses only the national banking block in the monthly workbook", () => {
  const parsed = parseNfraBankingWorkbook(
    workbookFromRows(monthlyRows(), "资产负债月度", "xls"),
    "bank_assets_monthly",
  );
  assert.equal(parsed.pointsBySeries.size, 4);
  assert.equal(parsed.pointsBySeries.get("banking_total_assets")?.[0]?.value, 4_806_061.69);
  assert.equal(parsed.pointsBySeries.get("banking_total_assets_yoy")?.[0]?.value, 8.927);
  assert.equal(parsed.pointsBySeries.get("banking_total_liabilities_yoy")?.[6]?.value, 6.727);
  assert.equal(
    parsed.latestObsDateBySeries.get("banking_total_assets")?.toISOString().slice(0, 10),
    "2026-07-01",
  );
});

test("throws when title, year, sheet, or a required row anchor is missing", () => {
  assert.throws(() => parseQuarterly(quarterlyRows(2021, { missingTitle: true }), "xlsx"), /标题锚点/);
  assert.throws(
    () =>
      parseNfraBankingWorkbook(
        workbookFromRows(quarterlyRows(2021), "wrong", "xlsx"),
        "commercial_bank_main_quarterly",
      ),
    /缺 sheet/,
  );
  assert.throws(
    () =>
      parseQuarterly(
        quarterlyRows(2026, { missingRow: "不良贷款余额" }),
        "xls",
      ),
    /缺指标行“ 不良贷款余额|缺指标行“不良贷款余额/,
  );
  const noYear = quarterlyRows(2026);
  noYear[2] = ["时间", null, null, null, null];
  assert.throws(() => parseQuarterly(noYear, "xls"), /年份无法唯一确定/);
});

test("throws on duplicate recognized rows and rejects future workbook years", () => {
  assert.throws(
    () => parseQuarterly(quarterlyRows(2026, { duplicateRow: "正常类贷款" }), "xls"),
    /指标行重复/,
  );
  const futureYear = new Date().getUTCFullYear() + 1;
  assert.throws(() => parseQuarterly(quarterlyRows(futureYear), "xlsx"), /未来/);
});

test("counts an invalid value without losing the other valid quarters", () => {
  const parsed = parseQuarterly(
    quarterlyRows(2021, { invalidFirstValue: "不良贷款率" }),
    "xlsx",
  );
  assert.equal(parsed.skippedInvalid, 1);
  assert.equal(parsed.pointsBySeries.get("commercial_bank_npl_ratio")?.length, 3);
});

test("dataset type remains the two public provider datasets", () => {
  const datasets = new Set<NfraBankingDataset>(NFRA_BANKING_SERIES.map((series) => series.dataset));
  assert.deepEqual([...datasets].sort(), ["bank_assets_monthly", "commercial_bank_main_quarterly"]);
});
