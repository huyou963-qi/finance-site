/** 中国人民银行：金融统计、社会融资规模及贷款市场报价利率（月频官方口径）。 */
export const PBC_MONETARY_INDEX_URL = "https://www.pbc.gov.cn/diaochatongjisi/116219/116225/index.html";
export const PBC_LPR_INDEX_URL = "https://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125440/3876551/index.html";
export const PBC_MONETARY_SYNC_SCRIPT = "scripts/data-worker/sync-pbc-monetary.ts";

export type PbcMeasure = "amount" | "yoy" | "cumulative" | "rate";
export type PbcComponent = { key: string; name: string; measure: PbcMeasure; unit: "亿元" | "%"; group: "money" | "credit" | "deposit" | "tsf" | "rate" };

const c = (key: string, name: string, measure: PbcMeasure, unit: "亿元" | "%", group: PbcComponent["group"]): PbcComponent => ({ key, name, measure, unit, group });

export const PBC_MONETARY_COMPONENTS: readonly PbcComponent[] = [
  c("m0_amount", "流通中货币（M0）余额", "amount", "亿元", "money"), c("m0_yoy", "流通中货币（M0）同比", "yoy", "%", "money"),
  c("m1_amount", "狭义货币（M1）余额", "amount", "亿元", "money"), c("m1_yoy", "狭义货币（M1）同比", "yoy", "%", "money"),
  c("m2_amount", "广义货币（M2）余额", "amount", "亿元", "money"), c("m2_yoy", "广义货币（M2）同比", "yoy", "%", "money"),
  c("rmb_loan_amount", "人民币贷款余额", "amount", "亿元", "credit"), c("rmb_loan_yoy", "人民币贷款余额同比", "yoy", "%", "credit"),
  c("rmb_deposit_amount", "人民币存款余额", "amount", "亿元", "deposit"), c("rmb_deposit_yoy", "人民币存款余额同比", "yoy", "%", "deposit"),
  c("rmb_loan_cumulative", "人民币贷款累计增加", "cumulative", "亿元", "credit"), c("household_loan_cumulative", "住户贷款累计增加", "cumulative", "亿元", "credit"),
  c("household_short_loan_cumulative", "住户短期贷款累计增加", "cumulative", "亿元", "credit"), c("household_medium_long_loan_cumulative", "住户中长期贷款累计增加", "cumulative", "亿元", "credit"),
  c("corporate_loan_cumulative", "企（事）业单位贷款累计增加", "cumulative", "亿元", "credit"), c("corporate_short_loan_cumulative", "企（事）业单位短期贷款累计增加", "cumulative", "亿元", "credit"),
  c("corporate_medium_long_loan_cumulative", "企（事）业单位中长期贷款累计增加", "cumulative", "亿元", "credit"), c("bill_financing_cumulative", "票据融资累计增加", "cumulative", "亿元", "credit"), c("nonbank_loan_cumulative", "非银行业金融机构贷款累计增加", "cumulative", "亿元", "credit"),
  c("rmb_deposit_cumulative", "人民币存款累计增加", "cumulative", "亿元", "deposit"), c("household_deposit_cumulative", "住户存款累计增加", "cumulative", "亿元", "deposit"), c("corporate_deposit_cumulative", "非金融企业存款累计增加", "cumulative", "亿元", "deposit"),
  c("fiscal_deposit_cumulative", "财政性存款累计增加", "cumulative", "亿元", "deposit"), c("nonbank_deposit_cumulative", "非银行业金融机构存款累计增加", "cumulative", "亿元", "deposit"),
  c("social_financing_stock_amount", "社会融资规模存量", "amount", "亿元", "tsf"), c("social_financing_stock_yoy", "社会融资规模存量同比", "yoy", "%", "tsf"), c("social_financing_cumulative", "社会融资规模增量累计", "cumulative", "亿元", "tsf"),
  c("social_financing_rmb_loan_cumulative", "社融：人民币贷款累计", "cumulative", "亿元", "tsf"), c("social_financing_foreign_loan_cumulative", "社融：外币贷款累计", "cumulative", "亿元", "tsf"), c("entrusted_loan_cumulative", "社融：委托贷款累计", "cumulative", "亿元", "tsf"),
  c("trust_loan_cumulative", "社融：信托贷款累计", "cumulative", "亿元", "tsf"), c("bank_acceptance_cumulative", "社融：未贴现银行承兑汇票累计", "cumulative", "亿元", "tsf"), c("corporate_bond_financing_cumulative", "社融：企业债券融资累计", "cumulative", "亿元", "tsf"),
  c("government_bond_financing_cumulative", "社融：政府债券融资累计", "cumulative", "亿元", "tsf"), c("domestic_equity_financing_cumulative", "社融：非金融企业境内股票融资累计", "cumulative", "亿元", "tsf"),
  c("interbank_lending_rate", "银行间同业拆借加权平均利率", "rate", "%", "rate"), c("repo_rate", "质押式债券回购加权平均利率", "rate", "%", "rate"),
  c("lpr_1y", "贷款市场报价利率（1年期）", "rate", "%", "rate"), c("lpr_5y", "贷款市场报价利率（5年以上）", "rate", "%", "rate"),
];

export const PBC_MONETARY_SOURCE = { id: "pbc-monetary", agencyId: "cn-pbc", name: "中国人民银行货币信贷与社会融资统计", baseUrl: PBC_MONETARY_INDEX_URL, termsUrl: "https://www.pbc.gov.cn/" } as const;
export function pbcMonetaryCode(key: string) { return `pbc_cn_${key}`; }
export const PBC_MONETARY_CODES = PBC_MONETARY_COMPONENTS.map((item) => pbcMonetaryCode(item.key));
