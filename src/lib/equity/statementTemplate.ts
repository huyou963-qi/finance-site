/**
 * 三张报表的标准化科目模板（客户端可用：只有科目代码、中文名、顺序和计量方式，不含取数规则）。
 *
 * 这是一份「并集」模板：一般工商业、银行、保险、券商、REIT 的常见报表科目都在里面，
 * 某家公司没有披露的科目整行隐藏，不按行业硬分模板。取数规则（SEC 标签候选）在
 * statementLineTags.ts，仅服务端使用。
 *
 * headline：该科目已经是快照表的独立列（营收、净利润等），取那一列，保留其逐公司口径修正；
 * 其余科目存在快照表的 lines JSON 里。
 */

export type StatementCode = "IS" | "BS" | "CF";
/** flow=期间发生额（季度由累计差分）；instant=期末余额；perShare=每股；shares=股数（加权平均为期间，期末流通为时点） */
export type StatementLineKind = "flow" | "instant" | "perShare" | "sharesFlow" | "sharesInstant" | "ratio";
export type HeadlineField =
  | "revenue" | "netIncome" | "eps" | "ocf" | "capex" | "dividendsPaid" | "buybackPaid"
  | "totalAssets" | "totalLiabilities" | "equity" | "longTermDebt" | "cash" | "sharesOutstanding"
  | "grossMargin" | "opMargin" | "netMargin" | "fcf";

/** 报表格式：按公司自己披露的科目判定（见 detectStatementProfile），不依赖 SIC 行业代码 */
export type StatementProfile = "bank" | "insurer" | "broker" | "reit" | "general";

export type StatementLine = {
  code: string;
  label: string;
  statement: StatementCode;
  /** 报表内分组小标题（如「资产」「经营活动」） */
  group: string;
  kind: StatementLineKind;
  headline?: HeadlineField;
  /** 合计/小计行，加粗显示 */
  total?: boolean;
  /** 现金流出：SEC 以正数申报，现金流量表按负数展示，便于与小计相加核对 */
  outflow?: boolean;
  /** 行业特有科目：利润表里对该格式的公司排在本组前面 */
  profiles?: StatementProfile[];
};

const IS = (group: string, lines: Omit<StatementLine, "statement" | "group">[]) => lines.map(l => ({ ...l, statement: "IS" as const, group }));
const BS = (group: string, lines: Omit<StatementLine, "statement" | "group">[]) => lines.map(l => ({ ...l, statement: "BS" as const, group }));
const CF = (group: string, lines: Omit<StatementLine, "statement" | "group">[]) => lines.map(l => ({ ...l, statement: "CF" as const, group }));

export const STATEMENT_LINES: StatementLine[] = [
  ...IS("收入", [
    { code: "revenue", label: "营业收入", kind: "flow", headline: "revenue", total: true },
    { code: "interestIncome", label: "利息收入", kind: "flow", profiles: ["bank", "broker"] },
    { code: "interestExpenseOperating", label: "利息支出（经营）", kind: "flow", profiles: ["bank", "broker"] },
    { code: "interestExpenseDeposits", label: "其中：存款利息支出", kind: "flow", profiles: ["bank"] },
    { code: "netInterestIncome", label: "净利息收入", kind: "flow", total: true, profiles: ["bank", "broker"] },
    { code: "provisionCreditLosses", label: "信用损失拨备", kind: "flow", profiles: ["bank"] },
    { code: "noninterestIncome", label: "非利息收入", kind: "flow", profiles: ["bank"] },
    { code: "commissionRevenue", label: "佣金及手续费收入", kind: "flow", profiles: ["broker", "bank"] },
    { code: "investmentBankingRevenue", label: "投资银行收入", kind: "flow", profiles: ["broker", "bank"] },
    { code: "principalTransactions", label: "自营交易收入", kind: "flow", profiles: ["broker", "bank"] },
    { code: "premiumsWritten", label: "净承保保费", kind: "flow", profiles: ["insurer"] },
    { code: "premiumsEarned", label: "已赚保费", kind: "flow", profiles: ["insurer"] },
    { code: "netInvestmentIncome", label: "净投资收益", kind: "flow", profiles: ["insurer"] },
    { code: "rentalRevenue", label: "租赁收入", kind: "flow", profiles: ["reit"] },
  ]),
  ...IS("成本与费用", [
    { code: "costOfRevenue", label: "营业成本", kind: "flow" },
    { code: "grossProfit", label: "毛利润", kind: "flow", total: true },
    { code: "researchAndDevelopment", label: "研发费用", kind: "flow" },
    { code: "sellingGeneralAdmin", label: "销售及管理费用", kind: "flow" },
    { code: "sellingMarketing", label: "销售及市场费用", kind: "flow" },
    { code: "generalAdmin", label: "管理费用", kind: "flow" },
    { code: "laborExpense", label: "员工薪酬", kind: "flow" },
    { code: "depreciationAmortizationIs", label: "折旧及摊销", kind: "flow" },
    { code: "restructuring", label: "重组费用", kind: "flow" },
    { code: "impairment", label: "资产减值", kind: "flow" },
    { code: "policyBenefits", label: "赔付及保单给付", kind: "flow", profiles: ["insurer"] },
    { code: "acquisitionCostAmortization", label: "保单获取成本摊销", kind: "flow", profiles: ["insurer"] },
    { code: "noninterestExpense", label: "非利息支出", kind: "flow", profiles: ["bank"] },
    { code: "operatingExpenses", label: "营业费用合计", kind: "flow", total: true },
    { code: "costsAndExpenses", label: "成本及费用合计", kind: "flow", total: true },
  ]),
  ...IS("利润", [
    { code: "operatingIncome", label: "营业利润", kind: "flow", total: true },
    { code: "interestExpense", label: "利息费用", kind: "flow" },
    { code: "interestIncomeNonoperating", label: "利息收入（营业外）", kind: "flow" },
    { code: "equityMethodIncome", label: "权益法投资收益", kind: "flow" },
    { code: "investmentGains", label: "投资损益", kind: "flow" },
    { code: "otherNonoperating", label: "其他营业外收支", kind: "flow" },
    { code: "pretaxIncome", label: "税前利润", kind: "flow", total: true },
    { code: "incomeTax", label: "所得税", kind: "flow" },
    { code: "discontinuedOperations", label: "终止经营损益", kind: "flow" },
    { code: "netIncomeIncludingNci", label: "净利润（含少数股东）", kind: "flow", total: true },
    { code: "netIncomeNci", label: "少数股东损益", kind: "flow" },
    { code: "netIncome", label: "归母净利润", kind: "flow", headline: "netIncome", total: true },
    { code: "preferredDividends", label: "优先股股息", kind: "flow" },
    { code: "netIncomeCommon", label: "归属普通股股东净利润", kind: "flow" },
  ]),
  ...IS("每股与股数", [
    { code: "epsBasic", label: "基本 EPS", kind: "perShare" },
    { code: "eps", label: "稀释 EPS", kind: "perShare", headline: "eps" },
    { code: "dividendsPerShare", label: "每股股息", kind: "perShare" },
    { code: "sharesBasic", label: "加权平均股数（基本）", kind: "sharesFlow" },
    { code: "sharesDiluted", label: "加权平均股数（稀释）", kind: "sharesFlow" },
  ]),
  ...IS("利润率", [
    { code: "grossMargin", label: "毛利率", kind: "ratio", headline: "grossMargin" },
    { code: "opMargin", label: "营业利润率", kind: "ratio", headline: "opMargin" },
    { code: "netMargin", label: "净利率", kind: "ratio", headline: "netMargin" },
  ]),

  ...BS("资产", [
    { code: "cash", label: "现金及等价物", kind: "instant", headline: "cash" },
    { code: "restrictedCash", label: "受限现金", kind: "instant" },
    { code: "interestBearingDepositsInBanks", label: "存放同业（计息）", kind: "instant" },
    { code: "segregatedCash", label: "隔离的客户资金及证券", kind: "instant" },
    { code: "resaleAgreements", label: "买入返售", kind: "instant" },
    { code: "securitiesBorrowed", label: "借入证券", kind: "instant" },
    { code: "shortTermInvestments", label: "短期投资", kind: "instant" },
    { code: "tradingAssets", label: "交易性金融资产", kind: "instant" },
    { code: "securitiesAvailableForSale", label: "可供出售证券", kind: "instant" },
    { code: "securitiesHeldToMaturity", label: "持有至到期证券", kind: "instant" },
    { code: "accountsReceivable", label: "应收账款", kind: "instant" },
    { code: "receivablesFromCustomers", label: "应收客户款", kind: "instant" },
    { code: "receivablesFromBrokers", label: "应收经纪商及清算机构", kind: "instant" },
    { code: "premiumsReceivable", label: "应收保费", kind: "instant" },
    { code: "reinsuranceRecoverables", label: "应收分保款", kind: "instant" },
    { code: "loansGross", label: "贷款总额", kind: "instant" },
    { code: "loanLossAllowance", label: "贷款损失准备", kind: "instant" },
    { code: "loansNet", label: "贷款净额", kind: "instant" },
    { code: "mortgageLoans", label: "抵押贷款投资", kind: "instant" },
    { code: "inventory", label: "存货", kind: "instant" },
    { code: "otherCurrentAssets", label: "其他流动资产", kind: "instant" },
    { code: "currentAssets", label: "流动资产合计", kind: "instant", total: true },
    { code: "investments", label: "投资合计", kind: "instant" },
    { code: "propertyPlantEquipment", label: "固定资产净额", kind: "instant" },
    { code: "realEstateAtCost", label: "投资性房地产原值", kind: "instant" },
    { code: "realEstateAccumulatedDepreciation", label: "房地产累计折旧", kind: "instant" },
    { code: "realEstateNet", label: "投资性房地产净额", kind: "instant" },
    { code: "operatingLeaseAssets", label: "使用权资产", kind: "instant" },
    { code: "goodwill", label: "商誉", kind: "instant" },
    { code: "intangibleAssets", label: "无形资产", kind: "instant" },
    { code: "deferredAcquisitionCosts", label: "递延保单获取成本", kind: "instant" },
    { code: "separateAccountAssets", label: "独立账户资产", kind: "instant" },
    { code: "deferredTaxAssets", label: "递延所得税资产", kind: "instant" },
    { code: "otherNoncurrentAssets", label: "其他非流动资产", kind: "instant" },
    { code: "totalAssets", label: "资产总计", kind: "instant", headline: "totalAssets", total: true },
  ]),
  ...BS("负债", [
    { code: "accountsPayable", label: "应付账款", kind: "instant" },
    { code: "accruedLiabilities", label: "应计负债", kind: "instant" },
    { code: "deferredRevenue", label: "合同负债 / 递延收入", kind: "instant" },
    { code: "interestBearingDeposits", label: "计息存款", kind: "instant" },
    { code: "noninterestBearingDeposits", label: "无息存款", kind: "instant" },
    { code: "deposits", label: "存款合计", kind: "instant" },
    { code: "repurchaseAgreements", label: "卖出回购", kind: "instant" },
    { code: "securitiesLoaned", label: "借出证券", kind: "instant" },
    { code: "securitiesSoldShort", label: "卖出未购入证券", kind: "instant" },
    { code: "shortTermBorrowings", label: "短期借款", kind: "instant" },
    { code: "currentDebt", label: "一年内到期债务", kind: "instant" },
    { code: "currentLiabilities", label: "流动负债合计", kind: "instant", total: true },
    { code: "longTermDebt", label: "长期债务", kind: "instant", headline: "longTermDebt" },
    { code: "securedDebt", label: "有担保债务", kind: "instant" },
    { code: "unsecuredDebt", label: "无担保债务", kind: "instant" },
    { code: "operatingLeaseLiabilities", label: "租赁负债（非流动）", kind: "instant" },
    { code: "policyLiabilities", label: "保单负债", kind: "instant" },
    { code: "claimReserves", label: "未决赔款准备", kind: "instant" },
    { code: "unearnedPremiums", label: "未到期保费", kind: "instant" },
    { code: "policyholderDeposits", label: "保户投资款", kind: "instant" },
    { code: "separateAccountLiabilities", label: "独立账户负债", kind: "instant" },
    { code: "deferredTaxLiabilities", label: "递延所得税负债", kind: "instant" },
    { code: "otherNoncurrentLiabilities", label: "其他非流动负债", kind: "instant" },
    { code: "totalLiabilities", label: "负债合计", kind: "instant", headline: "totalLiabilities", total: true },
    { code: "temporaryEquity", label: "夹层权益（可赎回）", kind: "instant" },
  ]),
  ...BS("股东权益", [
    { code: "preferredStock", label: "优先股", kind: "instant" },
    { code: "commonStock", label: "普通股面值", kind: "instant" },
    { code: "additionalPaidInCapital", label: "资本公积", kind: "instant" },
    { code: "retainedEarnings", label: "留存收益", kind: "instant" },
    { code: "treasuryStock", label: "库存股（减项）", kind: "instant" },
    { code: "accumulatedOci", label: "累计其他综合收益", kind: "instant" },
    { code: "equity", label: "归母股东权益", kind: "instant", headline: "equity", total: true },
    { code: "noncontrollingInterest", label: "少数股东权益", kind: "instant" },
    { code: "totalEquity", label: "股东权益合计", kind: "instant", total: true },
    { code: "liabilitiesAndEquity", label: "负债和股东权益总计", kind: "instant", total: true },
    { code: "sharesOutstanding", label: "期末流通股数", kind: "sharesInstant", headline: "sharesOutstanding" },
  ]),

  ...CF("经营活动", [
    { code: "depreciationAmortization", label: "折旧及摊销", kind: "flow" },
    { code: "shareBasedCompensation", label: "股权激励费用", kind: "flow" },
    { code: "deferredIncomeTaxes", label: "递延所得税", kind: "flow" },
    { code: "ocf", label: "经营活动现金流净额", kind: "flow", headline: "ocf", total: true },
  ]),
  ...CF("投资活动", [
    { code: "capex", label: "资本开支", kind: "flow", headline: "capex", outflow: true },
    { code: "acquisitions", label: "收购（扣除取得现金）", kind: "flow", outflow: true },
    { code: "realEstateAcquired", label: "购置房地产", kind: "flow", outflow: true },
    { code: "realEstateDevelopment", label: "房地产开发支出", kind: "flow", outflow: true },
    { code: "realEstateSold", label: "出售房地产收回", kind: "flow" },
    { code: "purchasesOfInvestments", label: "购买投资", kind: "flow", outflow: true },
    { code: "proceedsFromInvestments", label: "出售及到期投资收回", kind: "flow" },
    { code: "investingCashFlow", label: "投资活动现金流净额", kind: "flow", total: true },
  ]),
  ...CF("筹资活动", [
    { code: "debtIssued", label: "发行债务", kind: "flow" },
    { code: "debtRepaid", label: "偿还债务", kind: "flow", outflow: true },
    { code: "stockIssued", label: "发行股票", kind: "flow" },
    { code: "buybackPaid", label: "股票回购", kind: "flow", headline: "buybackPaid", outflow: true },
    { code: "dividendsPaid", label: "支付股息", kind: "flow", headline: "dividendsPaid", outflow: true },
    { code: "financingCashFlow", label: "筹资活动现金流净额", kind: "flow", total: true },
  ]),
  ...CF("现金变动", [
    { code: "fxEffect", label: "汇率变动影响", kind: "flow" },
    { code: "netChangeInCash", label: "现金净变动", kind: "flow", total: true },
    { code: "fcf", label: "自由现金流（经营现金流 − 资本开支）", kind: "flow", headline: "fcf", total: true },
  ]),
];

export const STATEMENT_NAMES: Record<StatementCode, string> = { IS: "利润表", BS: "资产负债表", CF: "现金流量表" };

/** 存入 lines JSON 的科目（headline 科目已有独立列） */
export const EXTRA_LINE_CODES = STATEMENT_LINES.filter(l => !l.headline).map(l => l.code);
const KIND_BY_CODE = new Map(STATEMENT_LINES.map(l => [l.code, l.kind]));
export function statementLineKind(code: string): StatementLineKind | undefined {
  return KIND_BY_CODE.get(code);
}

export type StatementLines = Record<string, number>;

export const STATEMENT_PROFILE_NAMES: Record<StatementProfile, string> = {
  bank: "银行", insurer: "保险", broker: "券商", reit: "房地产投资信托", general: "一般企业",
};

/**
 * 按公司最近 8 期自己披露的科目判定报表格式（不用 SIC：行业代码常年未更新，且库里没有）。
 * 顺序有意义：保险先于银行（寿险公司也有存款类负债），银行先于券商（大型银行同时有佣金与客户资金）。
 */
export function detectStatementProfile(rows: readonly { lines?: StatementLines }[]): StatementProfile {
  const recent = rows.slice(-8);
  const has = (...codes: string[]) => recent.some(r => codes.some(code => r.lines?.[code] != null));
  if (has("premiumsEarned", "premiumsWritten", "claimReserves", "deferredAcquisitionCosts", "policyholderDeposits")) return "insurer";
  if (has("deposits", "interestBearingDeposits") && has("loansNet", "loansGross", "netInterestIncome", "provisionCreditLosses")) return "bank";
  if (has("segregatedCash", "receivablesFromCustomers", "receivablesFromBrokers", "securitiesBorrowed")) return "broker";
  if (has("realEstateNet", "realEstateAtCost", "realEstateAccumulatedDepreciation")) return "reit";
  return "general";
}

/**
 * 利润表按格式排序：本格式特有科目排在本组最前，通用科目居中，其他行业科目最后。
 * 例如银行的「收入」组读作 利息收入 → 利息支出 → 净利息收入 → 拨备 → 非利息收入 → 营业收入（净）。
 * 资产负债表与现金流量表保持模板的固定顺序。
 */
export function orderStatementLines(lines: readonly StatementLine[], profile: StatementProfile): StatementLine[] {
  if (profile === "general") return [...lines];
  const rank = (line: StatementLine) => line.statement !== "IS" || !line.profiles ? 1 : line.profiles.includes(profile) ? 0 : 2;
  return lines.map((line, i) => ({ line, i })).sort((a, b) =>
    (a.line.group === b.line.group ? rank(a.line) - rank(b.line) : 0) || a.i - b.i).map(x => x.line);
}

/** 读库 JSON：只接受模板内科目的有限数值，其他一律丢弃 */
export function readStatementLines(value: unknown): StatementLines {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: StatementLines = {};
  for (const [code, v] of Object.entries(value as Record<string, unknown>)) {
    if (KIND_BY_CODE.has(code) && typeof v === "number" && Number.isFinite(v)) out[code] = v;
  }
  return out;
}

/**
 * 财年合计：期间发生额与每股数四季相加（任一季缺失则留空，不拿三季冒充全年）；
 * 加权平均股数取四季平均；期末余额取第四季末。
 */
export function aggregateStatementLines(quarters: readonly StatementLines[]): StatementLines {
  const out: StatementLines = {};
  if (quarters.length !== 4) return out;
  const last = quarters[3]!;
  for (const code of EXTRA_LINE_CODES) {
    const kind = KIND_BY_CODE.get(code);
    if (kind === "instant" || kind === "sharesInstant") {
      if (last[code] != null) out[code] = last[code]!;
      continue;
    }
    const values = quarters.map(q => q[code]);
    if (values.some(v => v == null)) continue;
    const sum = (values as number[]).reduce((a, b) => a + b, 0);
    out[code] = kind === "sharesFlow" ? sum / 4 : sum;
  }
  return out;
}
