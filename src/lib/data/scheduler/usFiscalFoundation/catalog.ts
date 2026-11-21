import type { DataGranularity } from "@prisma/client";
import { TREASURY_FISCAL_SERIES } from "../treasuryFiscalSeedCatalog";
import type { TreasurySourceSpec } from "../treasuryFiscalData/types";

export type FiscalNativeSeries = {
  code: string; name: string; unit: string; granularity: DataGranularity;
  group: string; packageId: string; spec: TreasurySourceSpec; note: string;
};
const mts = "v1/accounting/mts/";
const extra: FiscalNativeSeries[] = [];
function add(code: string, name: string, unit: string, granularity: DataGranularity,
  group: string, packageId: string, endpoint: string, valueField: string,
  match: Record<string, string>, note: string, floor = "2001-01-01") {
  extra.push({ code, name, unit, granularity, group, packageId, note,
    spec: { endpoint, valueField, rowSelector: "fields", match, fetchStartFloor: floor } });
}
for (const [key, name, classification] of [
  ["unemployment", "失业保险收入", "Unemployment Insurance"],
  ["other_retirement", "其他退休收入", "Other Retirement"],
  ["estate_gift", "遗产与赠与税", "Estate and Gift Taxes"],
  ["customs", "关税收入", "Customs Duties"],
  ["misc", "其他财政收入", "Miscellaneous Receipts"],
] as const) add(`treasury_mts_m09_rcpt_${key}`, name, "美元", "MONTHLY", "财政收入结构", "us.treasury.mts",
  `${mts}mts_table_9`, "current_month_rcpt_outly_amt", { classification_desc: classification, record_type_cd: "RSG" }, "现金制月度原始收入；社保税须合并就业退休、失业保险、其他退休三项。");
add("treasury_mts_m09_outlay_health", "医疗卫生支出（不含Medicare）", "美元", "MONTHLY", "财政支出结构", "us.treasury.mts",
  `${mts}mts_table_9`, "current_month_rcpt_outly_amt", { classification_desc: "Health", record_type_cd: "F" }, "现金制功能分类Health，与Medicare分列，不等同于Medicaid单项。");
for(const [key,name,account] of [
  ["deposits","TGA每日总存入","Total TGA Deposits (Table II)"],
  ["withdrawals","TGA每日总支取","Total TGA Withdrawals (Table II) (-)"],
] as const) add(`treasury_dts_tga_${key}`,name,"百万美元","DAILY","融资与现金","us.treasury.dts",
  "v1/accounting/dts/operating_cash_balance","open_today_bal",{account_type:account},
  "官方日度原始存入/支取，含融资等现金交易；净流量仅在读取层相减，不能当作财政赤字。","2018-01-01");
for (const [key, name, line] of [
  ["borrowing_public", "向公众净借款（含联邦机构及折溢价调整）", "9310"],
  ["treasury_public", "公众持有国债净变动（面值）", "9034"],
  ["cash_change", "联储财政账户现金净变化（月）", "9500"],
  ["total_liabilities", "融资负债账户净变化", "9361"],
  ["total_assets", "融资资产账户净变化", "9562"],
  ["other_budget", "未计入当年预算盈亏的交易", "9624"],
  ["financing_total", "预算及表外联邦实体融资总额", "9661"],
] as const) add(`treasury_mts_m06_${key}`, name, "美元", "MONTHLY", "赤字融资衔接", "us.treasury.mts",
  `${mts}mts_table_6`, "current_month_net_txn_amt", { line_code_nbr: line, record_type_cd: "GL" }, "MTS Table 6 官方月度融资原值；负债增加为正，资产增加为正，融资总额=负债变化−资产变化+未计入预算交易。");
for (const transaction of ["Issues", "Redemptions"] as const) {
  for (const [key, name, type, desc] of [
    ["bills_regular", "常规短期国库券", "Bills", "Regular Series"],
    ["bills_cash", "现金管理国库券", "Bills", "Cash Management Series"],
    ["notes", "中期国债（含TIPS/浮息债的DTS分类）", "Notes", null],
    ["bonds", "长期国债（含TIPS的DTS分类）", "Bonds", null],
  ] as const) {
    if (transaction === "Redemptions" && key === "bills_cash") continue;
    const actualKey = transaction === "Redemptions" && type === "Bills" ? "bills" : key;
    const match: Record<string,string> = { transaction_type: transaction, security_market: "Marketable", security_type: type };
    if (type === "Bills" && transaction === "Issues" && desc) match.security_type_desc = desc;
    add(`treasury_dts_${transaction === "Issues" ? "issue" : "redeem"}_${actualKey}`,
      `${name}${transaction === "Issues" ? "发行" : "偿还"}（DTS）`, "百万美元", "DAILY", "国债发行与偿还", "us.treasury.dts",
      "v1/accounting/dts/public_debt_transactions", "transaction_today_amt", match,
      "DTS Table III-A 原始面值交易；不含单列的通胀本金调整与FFB；不将Notes/Bonds误称为剔除TIPS和浮息债的名义债。", "2005-10-03");
  }
}
for (const [key, name, classification] of [
  ["bills", "短期国库券", "Bills"], ["notes", "中期国债", "Notes"], ["bonds", "长期国债", "Bonds"],
  ["tips", "通胀保值国债", "Treasury Inflation-Protected Securities"], ["frn", "浮息国债", "Floating Rate Notes"],
  ["ffb", "联邦融资银行债券", "Federal Financing Bank"],
] as const) add(`treasury_mspd_${key}_outstanding`, `${name}月末余额`, "百万美元", "MONTHLY", "债务券种结构", "us.treasury.mspd",
  "v1/debt/mspd/mspd_table_1", "total_mil_amt", { security_type_desc: "Marketable", security_class_desc: classification }, "官方月末面值；TIPS余额包含已累积通胀本金调整。");
add("treasury_mspd_marketable_outstanding", "可交易国债月末总余额", "百万美元", "MONTHLY", "债务券种结构", "us.treasury.mspd",
  "v1/debt/mspd/mspd_table_1", "total_mil_amt", { security_type_desc: "Total Marketable" }, "包括FFB；未来到期分布只统计未到期Bills/Notes/Bonds/TIPS/FRN，须单列核对FFB及已到期待兑付余额。");
for (const [key, name, classification] of [
  ["bills", "短期国库券平均利率", "Treasury Bills"], ["notes", "中期国债平均利率", "Treasury Notes"],
  ["bonds", "长期国债平均利率", "Treasury Bonds"], ["tips", "TIPS平均实际票息", "Treasury Inflation-Protected Securities (TIPS)"],
  ["frn", "浮息国债平均利率", "Treasury Floating Rate Notes (FRN)"],
  ["marketable", "可交易债务平均利率（不含TIPS/浮息债）", "Total Marketable"],
  ["total", "付息债务平均利率（不含TIPS/浮息债）", "Total Interest-bearing Debt"],
] as const) add(`treasury_avg_rate_${key}`, name, "%", "MONTHLY", "债务利息成本", "us.treasury.interest_rates",
  "v2/accounting/od/avg_interest_rates", "avg_interest_rate_amt", { security_desc: classification },
  "官方存量平均利率；总可交易/总付息债务平均利率排除TIPS与FRN；TIPS分项为实际票息，不能与名义融资成本直接等同。");

/** 不继续seed旧的周差分或mandatory/discretionary功能分类代理。 */
export const FISCAL_NATIVE_TREASURY: readonly FiscalNativeSeries[] = [
  ...TREASURY_FISCAL_SERIES.filter(r => !r.sourceKey.includes("proxy") && r.sourceKey !== "debt:penny_net_weekly" && r.sourceKey !== "dts:daily_net_cash").map(r => ({
    code: r.code, name: r.displayName, unit: r.unit, granularity: r.granularity,
    group: r.code.includes("rcpt_") ? "财政收入结构" : r.code.includes("outlay_") ? "财政支出结构" : r.code.includes("mts_") ? "MTS现金流量" : r.code.includes("debt_") ? "债务存量" : "融资与现金",
    packageId: r.code.includes("mts_") ? "us.treasury.mts" : r.code.includes("debt_") ? "us.treasury.debt_daily" : "us.treasury.dts",
    spec: r.sourceSpec, note: r.sourceUpdateNote,
  })), ...extra,
];
export const FISCAL_HOLDER_FRED = [
  { fredId: "FDHBFRBN", name: "美联储银行持有联邦债务", note: "季度末；Treasury Bulletin；十亿美元。" },
  { fredId: "FDHBFIN", name: "外国及国际投资者持有联邦债务", note: "季度末；含官方与私人境外持有者；十亿美元。" },
  { fredId: "FDHBPIN", name: "私人投资者持有联邦债务（含外国投资者）", note: "不能直接标为美国国内私人持有；国内其他投资者需减去FDHBFIN；十亿美元。" },
] as const;
export const FISCAL_RAW_SUBSCRIPTIONS = [
  { code: "treasury_raw_mspd", key: "raw:mspd", name: "国债逐券月末原始快照", packageId: "us.treasury.mspd", group: "国债逐券明细", granularity: "MONTHLY" as const },
  { code: "treasury_raw_auctions", key: "raw:auctions", name: "国债逐次拍卖原始记录", packageId: "us.treasury.auctions", group: "国债拍卖明细", granularity: "DAILY" as const },
] as const;
