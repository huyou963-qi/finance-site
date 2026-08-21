import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import { defaultEconomicCalendarRule } from "./releaseRule";

/**
 * 美国国际收支 — BEA/FRED 种子目录
 *
 * Spec: docs/specs/us-balance-of-payments.spec.md
 *
 * BOP 只保存 BEA U.S. International Transactions 发布包中仍更新的
 * “季度、季调、百万美元”标准口径。年度、季度未季调、十亿美元缩放副本与
 * discontinued 历史系列不重复入库。IEABC 已由 external-dollar 域接入，本域复用。
 */

export type UsBopAccountGroup =
  | "国际收支总表"
  | "经常账户贷方"
  | "经常账户借方"
  | "金融账户资产"
  | "金融账户负债"
  | "国际投资头寸";

export type UsBalanceOfPaymentsFredSeedRow = {
  fredId: string;
  code: string;
  name: string;
  displayName: string;
  accountGroup: UsBopAccountGroup;
  freqLabel: string;
  granularity: DataGranularity;
  unit: string;
  category: string;
  countryCode: "US";
  source: string;
  sourceUpdateNote: string;
  releasePackageId: "us.bea.international_transactions" | "us.bea.iip";
  historyStartYear: number;
};

function bopFredRow(
  fredId: string,
  displayName: string,
  accountGroup: UsBopAccountGroup,
  releasePackageId: UsBalanceOfPaymentsFredSeedRow["releasePackageId"] =
    "us.bea.international_transactions",
  historyStartYear = 1999,
): UsBalanceOfPaymentsFredSeedRow {
  const isIip = releasePackageId === "us.bea.iip";
  return {
    fredId,
    code: `sched_fred_${fredId}`,
    name: displayName,
    displayName,
    accountGroup,
    freqLabel: "季",
    granularity: "QUARTERLY",
    unit: "百万美元",
    category: `国际收支·${accountGroup}`,
    countryCode: "US",
    source: "BEA/FRED",
    sourceUpdateNote: isIip
      ? "美国国际投资头寸（季度期末，未季调）"
      : `美国国际交易账户（季度、季调）·${accountGroup}`,
    releasePackageId,
    historyStartYear,
  };
}

/** 已在四图模板使用的 9 条国际交易账户序列。 */
export const US_BOP_TEMPLATE_FRED_SERIES = [
  bopFredRow("IEABCS", "服务差额", "国际收支总表"),
  bopFredRow("IEABCPI", "初次收入差额", "国际收支总表"),
  bopFredRow("IEABCSI", "二次收入差额", "国际收支总表"),
  bopFredRow("IEAA", "美国取得对外金融资产（不含衍生品）", "金融账户资产"),
  bopFredRow("IEAI", "美国发生对外金融负债（不含衍生品）", "金融账户负债"),
  bopFredRow("IEANLF", "金融账户净借贷", "国际收支总表"),
  bopFredRow("IEAIDI", "直接投资负债流量", "金融账户负债"),
  bopFredRow("IEAIPI", "证券投资负债流量", "金融账户负债"),
  bopFredRow("IEAIOI", "其他投资负债流量", "金融账户负债"),
] as const;

/**
 * 2026-08-21 补齐的 98 条现行 BOP 科目。
 * 源筛选：FRED release_id=49、非 DISCONTINUED、Quarterly、Seasonally Adjusted、
 * Millions of Dollars；逐条 FRED 页面核验通过。
 */
export const US_BOP_SUPPLEMENTAL_FRED_SERIES = [
  // 金融账户：美国取得对外资产
  bopFredRow("IEAACD", "其他储备资产取得：货币和存款", "金融账户资产", "us.bea.international_transactions", 2003),
  bopFredRow("IEAADI", "直接投资资产取得", "金融账户资产"),
  bopFredRow("IEAADIDI", "直接投资资产取得：债务工具", "金融账户资产"),
  bopFredRow("IEAADIE", "直接投资资产取得：股权", "金融账户资产"),
  bopFredRow("IEAADSL", "债务证券资产取得：长期", "金融账户资产"),
  bopFredRow("IEAADSS", "债务证券资产取得：短期", "金融账户资产"),
  bopFredRow("IEAAFD", "其他储备资产取得：金融衍生品", "金融账户资产", "us.bea.international_transactions", 2003),
  bopFredRow("IEAAOI", "其他投资资产取得", "金融账户资产"),
  bopFredRow("IEAAOICD", "其他投资资产取得：货币和存款", "金融账户资产", "us.bea.international_transactions", 2003),
  bopFredRow("IEAAOIL", "其他投资资产取得：贷款", "金融账户资产", "us.bea.international_transactions", 2003),
  bopFredRow("IEAAOIT", "其他投资资产取得：贸易信贷和预付款", "金融账户资产"),
  bopFredRow("IEAAORO", "其他储备资产取得：其他债权", "金融账户资产", "us.bea.international_transactions", 2003),
  bopFredRow("IEAAPI", "证券投资资产取得", "金融账户资产"),
  bopFredRow("IEAAPID", "证券投资资产取得：债务证券", "金融账户资产"),
  bopFredRow("IEAAPIE", "证券投资资产取得：股权和投资基金份额", "金融账户资产"),
  bopFredRow("IEAAR", "储备资产取得", "金融账户资产"),
  bopFredRow("IEAARIMF", "储备资产取得：国际货币基金组织储备头寸", "金融账户资产"),
  bopFredRow("IEAARM", "储备资产取得：货币黄金", "金融账户资产"),
  bopFredRow("IEAARO", "储备资产取得：其他储备资产", "金融账户资产"),
  bopFredRow("IEAARSD", "储备资产取得：特别提款权", "金融账户资产"),
  bopFredRow("IEAAS", "其他储备资产取得：证券", "金融账户资产", "us.bea.international_transactions", 2003),

  // 国际收支总表、资本账户与调节项
  bopFredRow("IEABCG", "货物差额", "国际收支总表"),
  bopFredRow("IEABCGS", "货物和服务差额", "国际收支总表"),
  bopFredRow("IEABCP", "资本账户差额", "国际收支总表"),
  bopFredRow("IEACTP", "资本转移支出及其他借方", "国际收支总表"),
  bopFredRow("IEACTR", "资本转移收入及其他贷方", "国际收支总表"),
  bopFredRow("IEAFD", "非储备金融衍生品净交易", "国际收支总表", "us.bea.international_transactions", 2006),
  bopFredRow("IEANLC", "经常及资本账户净借贷", "国际收支总表"),
  bopFredRow("IEASAD", "季节调整差额", "国际收支总表"),
  bopFredRow("IEASD", "统计误差", "国际收支总表"),

  // 金融账户：美国发生对外负债
  bopFredRow("IEAIDIDI", "直接投资负债发生：债务工具", "金融账户负债"),
  bopFredRow("IEAIDIE", "直接投资负债发生：股权", "金融账户负债"),
  bopFredRow("IEAIDSL", "债务证券负债发生：长期", "金融账户负债"),
  bopFredRow("IEAIDSS", "债务证券负债发生：短期", "金融账户负债"),
  bopFredRow("IEAIOICD", "其他投资负债发生：货币和存款", "金融账户负债", "us.bea.international_transactions", 2003),
  bopFredRow("IEAIOIL", "其他投资负债发生：贷款", "金融账户负债", "us.bea.international_transactions", 2003),
  bopFredRow("IEAIOISD", "其他投资负债发生：特别提款权分配", "金融账户负债"),
  bopFredRow("IEAIOIT", "其他投资负债发生：贸易信贷和预付款", "金融账户负债"),
  bopFredRow("IEAIPID", "证券投资负债发生：债务证券", "金融账户负债"),
  bopFredRow("IEAIPIE", "证券投资负债发生：股权和投资基金份额", "金融账户负债"),

  // 经常账户借方：进口、初次收入支付、二次收入支付
  bopFredRow("IEAM", "货物、服务和收入借方", "经常账户借方"),
  bopFredRow("IEAMG", "货物进口", "经常账户借方"),
  bopFredRow("IEAMGAV", "货物进口：汽车、零部件和发动机", "经常账户借方"),
  bopFredRow("IEAMGC", "货物进口：资本品（不含汽车）", "经常账户借方"),
  bopFredRow("IEAMGCG", "货物进口：消费品（不含食品和汽车）", "经常账户借方"),
  bopFredRow("IEAMGF", "货物进口：食品、饲料和饮料", "经常账户借方"),
  bopFredRow("IEAMGG", "货物进口：非货币黄金", "经常账户借方"),
  bopFredRow("IEAMGI", "货物进口：工业用品和材料", "经常账户借方"),
  bopFredRow("IEAMGM", "货物进口：一般商品", "经常账户借方"),
  bopFredRow("IEAMGO", "货物进口：其他一般商品", "经常账户借方"),
  bopFredRow("IEAMGS", "货物和服务进口", "经常账户借方"),
  bopFredRow("IEAMI", "初次收入支付", "经常账户借方"),
  bopFredRow("IEAMIC", "初次收入支付：雇员报酬", "经常账户借方"),
  bopFredRow("IEAMID", "初次收入支付：直接投资收益", "经常账户借方"),
  bopFredRow("IEAMII", "初次收入支付：投资收益", "经常账户借方"),
  bopFredRow("IEAMIO", "初次收入支付：其他投资收益", "经常账户借方"),
  bopFredRow("IEAMIP", "初次收入支付：证券投资收益", "经常账户借方"),
  bopFredRow("IEAMS", "服务进口", "经常账户借方"),
  bopFredRow("IEAMSB", "服务进口：其他商业服务", "经常账户借方"),
  bopFredRow("IEAMSF", "服务进口：金融服务", "经常账户借方"),
  bopFredRow("IEAMSG", "服务进口：政府货物和服务", "经常账户借方"),
  bopFredRow("IEAMSI", "服务进口：保险服务", "经常账户借方"),
  bopFredRow("IEAMSIP", "服务进口：知识产权使用费", "经常账户借方"),
  bopFredRow("IEAMSIR", "二次收入支付（经常转移）", "经常账户借方"),
  bopFredRow("IEAMSM", "服务进口：维护和维修服务", "经常账户借方"),
  bopFredRow("IEAMST", "服务进口：运输", "经常账户借方"),
  bopFredRow("IEAMSTC", "服务进口：电信、计算机和信息服务", "经常账户借方"),
  bopFredRow("IEAMSTV", "服务进口：旅行（含教育）", "经常账户借方"),

  // 经常账户贷方：出口、初次收入收入、二次收入收入
  bopFredRow("IEAX", "货物、服务和收入贷方", "经常账户贷方"),
  bopFredRow("IEAXG", "货物出口", "经常账户贷方"),
  bopFredRow("IEAXGAV", "货物出口：汽车、零部件和发动机", "经常账户贷方"),
  bopFredRow("IEAXGC", "货物出口：资本品（不含汽车）", "经常账户贷方"),
  bopFredRow("IEAXGCG", "货物出口：消费品（不含食品和汽车）", "经常账户贷方"),
  bopFredRow("IEAXGF", "货物出口：食品、饲料和饮料", "经常账户贷方"),
  bopFredRow("IEAXGG", "货物出口：非货币黄金", "经常账户贷方"),
  bopFredRow("IEAXGI", "货物出口：工业用品和材料", "经常账户贷方"),
  bopFredRow("IEAXGM", "货物出口：一般商品", "经常账户贷方"),
  bopFredRow("IEAXGNX", "货物出口：转口贸易净出口", "经常账户贷方"),
  bopFredRow("IEAXGO", "货物出口：其他一般商品", "经常账户贷方"),
  bopFredRow("IEAXGS", "货物和服务出口", "经常账户贷方"),
  bopFredRow("IEAXI", "初次收入收入", "经常账户贷方"),
  bopFredRow("IEAXIC", "初次收入收入：雇员报酬", "经常账户贷方"),
  bopFredRow("IEAXID", "初次收入收入：直接投资收益", "经常账户贷方"),
  bopFredRow("IEAXII", "初次收入收入：投资收益", "经常账户贷方"),
  bopFredRow("IEAXIO", "初次收入收入：其他投资收益", "经常账户贷方"),
  bopFredRow("IEAXIP", "初次收入收入：证券投资收益", "经常账户贷方"),
  bopFredRow("IEAXIR", "初次收入收入：储备资产收益", "经常账户贷方"),
  bopFredRow("IEAXS", "服务出口", "经常账户贷方"),
  bopFredRow("IEAXSB", "服务出口：其他商业服务", "经常账户贷方"),
  bopFredRow("IEAXSF", "服务出口：金融服务", "经常账户贷方"),
  bopFredRow("IEAXSG", "服务出口：政府货物和服务", "经常账户贷方"),
  bopFredRow("IEAXSI", "服务出口：保险服务", "经常账户贷方"),
  bopFredRow("IEAXSIP", "服务出口：知识产权使用费", "经常账户贷方"),
  bopFredRow("IEAXSIR", "二次收入收入（经常转移）", "经常账户贷方"),
  bopFredRow("IEAXSM", "服务出口：维护和维修服务", "经常账户贷方"),
  bopFredRow("IEAXST", "服务出口：运输", "经常账户贷方"),
  bopFredRow("IEAXSTC", "服务出口：电信、计算机和信息服务", "经常账户贷方"),
  bopFredRow("IEAXSTV", "服务出口：旅行（含教育）", "经常账户贷方"),
] as const;

/** 由 external-dollar 域持有；本域只验证和链接同一发布包，不重复 seed。 */
export const US_BOP_REUSED_FRED_SERIES = [
  { fredId: "IEABC", code: "sched_fred_IEABC", displayName: "经常账户余额" },
] as const;

export const US_BOP_INTERNATIONAL_TRANSACTIONS_FRED_SERIES = [
  ...US_BOP_TEMPLATE_FRED_SERIES,
  ...US_BOP_SUPPLEMENTAL_FRED_SERIES,
] as const;

export const US_BOP_IIP_FRED_SERIES = [
  bopFredRow("IIPDIRELMVQ", "直接投资负债存量（市场价值）", "国际投资头寸", "us.bea.iip", 2006),
  bopFredRow("IIPPORTLQ", "证券投资负债存量", "国际投资头寸", "us.bea.iip", 2006),
  bopFredRow("IIPOTHELQ", "其他投资负债存量", "国际投资头寸", "us.bea.iip", 2006),
] as const;

/** 本域负责 seed 的 110 条：107 条 BOP + 3 条 IIP；IEABC 复用，不在此数组。 */
export const US_BALANCE_OF_PAYMENTS_FRED_SERIES = [
  ...US_BOP_INTERNATIONAL_TRANSACTIONS_FRED_SERIES,
  ...US_BOP_IIP_FRED_SERIES,
] as const;

export const US_BOP_INTERNATIONAL_TRANSACTIONS_FRED_IDS = [
  ...US_BOP_REUSED_FRED_SERIES.map((row) => row.fredId),
  ...US_BOP_INTERNATIONAL_TRANSACTIONS_FRED_SERIES.map((row) => row.fredId),
] as const;

export const US_BALANCE_OF_PAYMENTS_FRED_IDS = US_BALANCE_OF_PAYMENTS_FRED_SERIES.map(
  (row) => row.fredId,
);

export function buildUsBalanceOfPaymentsInstrumentMetadata(
  row: UsBalanceOfPaymentsFredSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...(opts?.existing ?? {}),
    sourceTag: "us-balance-of-payments-fred-seed",
    source: row.source,
    sourceUpdateNote: row.sourceUpdateNote,
    countryCode: row.countryCode,
    countryNameZh: "美国",
    displayName: row.displayName,
    accountGroup: row.accountGroup,
    catalogCategory: usMetadataCatalogCategory({
      code: row.code,
      fredId: row.fredId,
      label: row.displayName,
      legacyCategory: row.category,
    }),
    freqLabel: row.freqLabel,
    unit: row.unit,
    catalogKey: `fred:${row.fredId}`,
    seasonalAdjustment:
      row.releasePackageId === "us.bea.iip" ? "未季调，季度期末" : "季调",
  };
  if (opts?.dataLastObsDateIso) next.dataLastObsDateIso = opts.dataLastObsDateIso;
  return next;
}

export function releaseRuleForUsBalanceOfPaymentsFred(
  row: UsBalanceOfPaymentsFredSeedRow,
) {
  if (row.releasePackageId === "us.bea.international_transactions") {
    return defaultEconomicCalendarRule(row.granularity);
  }
  return { type: "probe_interval" as const, intervalHours: 168 };
}
