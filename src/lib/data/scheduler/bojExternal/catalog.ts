import type { BojApiSeriesDefinition } from "../boj/seriesDefinition";

export const JP_BOJ_BOP_PACKAGE_ID = "jp.boj.balance_of_payments";
export const JP_BOJ_BOP_OFFICIAL_URL = "https://www.boj.or.jp/en/statistics/br/bop_06/index.htm";
export const JP_BOJ_BOP_CODES_URL =
  "https://www.boj.or.jp/en/statistics/br/bop_06/data/exbpsm6a.xlsx";

type JpBojBopSeries = BojApiSeriesDefinition & {
  displayName: string;
  sourceName: string;
  category: "对外与汇率";
  subgroup: "国际收支";
  freqLabel: "月";
  unit: "亿日元";
  startPeriod: "199601";
  releasePackageId: typeof JP_BOJ_BOP_PACKAGE_ID;
};

/**
 * BOJ BPM6 linked series. These are official published net balances, not values
 * calculated by finance-site. BOJ links rearranged 1996-2013 history to the
 * current BPM6 series from 2014 onward.
 *
 * Metadata rechecked against /getMetadata?lang=en&db=BP01 on 2026-09-13.
 */
function bopSeries(
  key: string,
  seriesCode: string,
  instrumentCode: string,
  displayName: string,
  sourceName: string,
): JpBojBopSeries {
  return {
    db: "BP01",
    key,
    seriesCode,
    instrumentCode,
    displayName,
    sourceName,
    category: "对外与汇率",
    subgroup: "国际收支",
    frequency: "MONTHLY",
    freqLabel: "月",
    unit: "亿日元",
    sourceUnit: "100 million Yen",
    startPeriod: "199601",
    releasePackageId: JP_BOJ_BOP_PACKAGE_ID,
  };
}

export const JP_BOJ_BOP_SERIES = [
  bopSeries("current_account", "BPBP6JYNCB", "boj_jp_bop_current_account", "国际收支：经常账户余额", "Current account/Net balance"),
  bopSeries("goods", "BPBP6JYNTB", "boj_jp_bop_goods", "国际收支：货物余额", "Goods/Net balance"),
  bopSeries("services", "BPBP6JYNSN", "boj_jp_bop_services", "国际收支：服务余额", "Services/Net balance"),
  bopSeries("primary_income", "BPBP6JYNPIN", "boj_jp_bop_primary_income", "国际收支：初次收入余额", "Primary income/Net balance"),
  bopSeries("secondary_income", "BPBP6JYNSIN", "boj_jp_bop_secondary_income", "国际收支：二次收入余额", "Secondary income /Net balance"),
  bopSeries("financial_account", "BPBP6JYNFB", "boj_jp_bop_financial_account", "国际收支：金融账户余额", "Financial account/Net balance"),
  bopSeries("direct_investment", "BPBP6JYNFB1", "boj_jp_bop_direct_investment", "国际收支：直接投资余额", "Direct investment/Net balance"),
  bopSeries("portfolio_investment", "BPBP6JYNFB2", "boj_jp_bop_portfolio_investment", "国际收支：证券投资余额", "Portfolio investment/Net balance"),
] as const;

export function jpBojBopSeriesByInstrumentCode(code: string) {
  return JP_BOJ_BOP_SERIES.find((row) => row.instrumentCode === code);
}
