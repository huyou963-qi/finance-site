/** Consumer cash-flow pressure: native series only. Aggregates belong in chart calculations. */
export const CONSUMER_PRESSURE_FRED = [
  { fredId: "BOGZ1FL193020005Q", name: "家庭活期存款与现金（家庭部门）", unit: "百万美元", packageId: "us.frb.z1_household", subgroup: "居民流动性资产" },
  { fredId: "BOGZ1FL193030205Q", name: "家庭其他存款（含定期与储蓄存款，IMA）", unit: "百万美元", packageId: "us.frb.z1_household", subgroup: "居民流动性资产" },
  { fredId: "BOGZ1FL193034005Q", name: "家庭货币市场基金份额（家庭部门）", unit: "百万美元", packageId: "us.frb.z1_household", subgroup: "居民流动性资产" },
  ...([50, 75, 90] as const).map(percentile => ({
    fredId: `RCCCBACTIVEUTILPCT${percentile}`,
    name: `大型银行信用卡额度使用率（活跃账户，第${percentile}百分位）`,
    unit: "%", packageId: "us.philadelphiafed.consumer_credit", subgroup: "居民消费信贷",
  })),
] as const;

export const NYFED_HHDC_PAGE = "https://www.newyorkfed.org/householdcredit/hhdc-iframe";
export const NYFED_HHDC_PACKAGE = "us.nyfed.household_credit";
export const NYFED_HHDC_PROVIDER = "nyfed_hhdc";
// Titles/headers, rather than page numbers, identify data after report pagination changes.
export const NYFED_HHDC_SERIES = [
  { suffix: "credit_card_balance", name: "信用卡余额（纽约联储）", title: "Credit Limit and Balance for Credit Cards and HE Revolving", column: "Credit Card Balance", unit: "万亿美元", sourceUnit: "Trillions of $" },
  { suffix: "credit_card_limit", name: "信用卡总额度（纽约联储）", title: "Credit Limit and Balance for Credit Cards and HE Revolving", column: "Credit Card Limit", unit: "万亿美元", sourceUnit: "Trillions of $" },
  { suffix: "auto_balance", name: "汽车贷款余额（纽约联储）", title: "Total Debt Balance and Its Composition", column: "Auto Loan", unit: "万亿美元", sourceUnit: "Trillions of $" },
  ...(["auto", "credit_card"] as const).flatMap(type => {
    const label = type === "auto" ? "汽车贷款" : "信用卡";
    const column = type === "auto" ? "AUTO" : "CC";
    return [
      { suffix: `${type}_delinquent_90`, name: `${label}90天以上逾期余额占比（纽约联储）`, title: "Percent of Balance 90+ Days Delinquent by Loan Type", column, unit: "%", sourceUnit: "Percent" },
      { suffix: `${type}_new_delinquent_30`, name: `${label}新转入30天以上逾期比例（四季滚动合计，纽约联储）`, title: "New Delinquent* Balances by Loan Type", column, unit: "%", sourceUnit: "Percent" },
      { suffix: `${type}_new_delinquent_90`, name: `${label}新转入90天以上逾期比例（四季滚动合计，纽约联储）`, title: "New Seriously Delinquent* Balances by Loan Type", column, unit: "%", sourceUnit: "Percent" },
    ];
  }),
].map(row => ({ ...row, code: `nyfed_hhdc_${row.suffix}` }));

export const CONSUMER_CORE_REUSED = ["DSPIC96", "PCEC96", "PSAVERT", "DRCCLACBS", "TDSP", "REVOLSL"];
