/** 财政部全国财政决算：年度决算数（亿元），非预算数、非月度累计。 */
export const MOF_BUDGET_ACCOUNTS_INDEX_URL = "https://yss.mof.gov.cn/";
export const MOF_BUDGET_ACCOUNTS_SYNC_SCRIPT = "scripts/data-worker/sync-mof-budget-accounts.ts";
export const MOF_BUDGET_ACCOUNTS_SOURCE = { id: "mof-budget-accounts", agencyId: "cn-mof", name: "财政部第三第四本账年度决算", baseUrl: MOF_BUDGET_ACCOUNTS_INDEX_URL, termsUrl: "https://www.mof.gov.cn/" } as const;
export type BudgetScope = "national" | "central" | "local";
export type BudgetTable = "capital_revenue" | "capital_expenditure" | "social_revenue" | "social_expenditure" | "social_balance";
export type BudgetAccountSeries = { key: string; code: string; name: string; scope: BudgetScope; account: "capital" | "social"; table: BudgetTable; labels: readonly string[]; parent?: readonly string[]; section?: "base" | "pooling" };
export const BUDGET_SCOPES = { national: "全国", central: "中央", local: "地方" } as const;
export const BUDGET_TABLE_NAMES: Record<BudgetTable, string> = { capital_revenue: "国有资本经营收入决算表", capital_expenditure: "国有资本经营支出决算表", social_revenue: "社会保险基金收入决算表", social_expenditure: "社会保险基金支出决算表", social_balance: "社会保险基金结余决算表" };
const rows: BudgetAccountSeries[] = [];
function add(scope: BudgetScope, table: BudgetTable, key: string, name: string, labels: string[], parent?: string[]) {
 const fullKey = `${scope}_${key}`;
 rows.push({ key: fullKey, code: `mof_cn_budget_${fullKey.replace("accumulated_balance", "acc_balance")}`, name: `${BUDGET_SCOPES[scope]}${name}${scope === "central" && (key === "social_revenue" || key === "social_expenditure") ? "（小计，不含全国统筹调剂）" : ""}`, scope, account: table.startsWith("capital") ? "capital" : "social", table, labels: key === "capital_dividend" ? [...labels,"股利、股息收入"] : labels, parent });
}
const insurance = [ ["enterprise_pension", "企业职工基本养老保险基金"], ["resident_pension", "城乡居民基本养老保险基金"], ["public_pension", "机关事业单位基本养老保险基金"], ["employee_medical", "职工基本医疗保险基金"], ["resident_medical", "城乡居民基本医疗保险基金"], ["injury", "工伤保险基金"], ["unemployment", "失业保险基金"], ["maternity", "生育保险基金"] ];
for (const scope of Object.keys(BUDGET_SCOPES) as BudgetScope[]) {
 const s = BUDGET_SCOPES[scope];
 add(scope,"capital_revenue","capital_revenue","国有资本经营收入",[`${s}国有资本经营收入`,`${s}国有资本经营预算收入`]);
 for(const [key,label] of [["profit","利润收入"],["dividend","股息红利收入"],["transfer","产权转让收入"],["liquidation","清算收入"],["other","其他国有资本经营预算收入"],["carry_in","上年结转收入"]]) add(scope,"capital_revenue",`capital_${key}`,`国资预算${label}`,[label]);
 add(scope,"capital_expenditure","capital_expenditure","国有资本经营支出",[`${s}国有资本经营支出`,`${s}国有资本经营预算支出`]);
 for(const [key,label] of [["social_supplement","国有资本经营预算补充社保基金支出"],["reform","解决历史遗留问题及改革成本支出"],["capital_injection","国有企业资本金注入"],["public_subsidy","国有企业公益性补贴"],["other_expenditure","其他国有资本经营预算支出"],["transfer_out","国有资本经营预算调出资金"],["carry_out","结转下年支出"]]) add(scope,"capital_expenditure",`capital_${key}`,`国资预算${label}`,[label]);
 for(const [suffix,table,label] of [["revenue","social_revenue","收入"],["expenditure","social_expenditure","支出"],["balance","social_balance","本年收支结余"],["accumulated_balance","social_balance","年末滚存结余"]] as const) {
  add(scope,table,`social_${suffix}`,`社会保险基金${label}`,[`${s}社会保险基金${label}${suffix==="revenue"||suffix==="expenditure"?(scope==="national"?"合计":"小计"):""}`,`${s}社会保险基金${label}`,`${s}社会保险基金${label}小计`]);
  for(const [key,fund] of insurance) add(scope,table,`social_${key}_${suffix}`,`${fund}${label}`,[`${fund}${label}`]);
 }
 for(const [key,label,aliases] of [["premium","保险费（缴费）收入",["保险费（缴费）收入","保险费收入","缴费收入"]],["subsidy","财政补贴收入",["财政补贴收入"]],["interest","利息收入",["利息收入"]],["investment","委托投资收益",["委托投资收益"]]] as const) {
  add(scope,"social_revenue",`social_${key}`,`社会保险基金${label}`,[...aliases],[`${s}社会保险基金收入合计`,`${s}社会保险基金收入小计`,`${s}社会保险基金收入`]);
  for(const [fundKey,fund] of insurance) add(scope,"social_revenue",`social_${fundKey}_${key}`,`${fund}${label}`,[...aliases],[`${fund}收入`]);
 }
}
// Keep financing/redistribution original rows separate from base insurance revenue.
for (const scope of Object.keys(BUDGET_SCOPES) as BudgetScope[]) {
 const s = BUDGET_SCOPES[scope];
 add(scope,"social_revenue","social_revenue_total","社会保险基金收入总计（含调剂及补助）",[`${s}社会保险基金收入${scope === "national" ? "总计" : "合计"}`]);
 if(scope !== "national") add(scope,"social_expenditure","social_expenditure_total","社会保险基金支出合计（含调剂及补助）",[`${s}社会保险基金支出合计`]);
 add(scope,"social_revenue","social_transfer_in","社会保险基金调入资金",["调入资金"]);
 add(scope,"social_revenue","social_upper_subsidy","社会保险基金上级补助收入",["上级补助收入"]);
 add(scope,"social_expenditure","social_lower_subsidy","社会保险基金补助下级支出",["补助下级支出"]);
 if(scope === "central") {
  add(scope,"social_revenue","social_pooling_received","社保地方上缴/上解统筹调剂资金",["地方上缴的中央调剂基金收入","地方上解全国统筹调剂资金"]);
  add(scope,"social_expenditure","social_pooling_paid","社保下拨地方统筹调剂资金",["安排给地方的中央调剂基金支出","中央下拨全国统筹调剂资金"]);
  add(scope,"social_revenue","social_pooling_interest","全国统筹调剂资金利息收入",["全国统筹调剂资金利息收入"]);
  add(scope,"social_balance","social_pooling_balance","全国统筹调剂资金本年收支结余",["全国统筹调剂资金本年收支结余"]);
 }
 if(scope === "local") {
  add(scope,"social_revenue","social_pooling_received","社保中央下拨统筹调剂资金",["中央调剂资金收入","中央下拨全国统筹调剂资金"]);
  add(scope,"social_expenditure","social_pooling_paid","社保上缴/上解统筹调剂资金",["中央调剂资金支出","地方上解全国统筹调剂资金"]);
 }
}
// 2021 central expenditure source repeats 合计 for both the base subtotal and
// final total; the nationwide-pooling section boundary makes them unambiguous.
for (const series of rows) {
 if(series.key === "central_social_expenditure") { series.labels=["中央社会保险基金支出小计","中央社会保险基金支出合计"]; series.section="base"; }
 if(series.key === "central_social_expenditure_total") series.section="pooling";
}
export const MOF_BUDGET_ACCOUNTS_SERIES: readonly BudgetAccountSeries[] = rows;
export const MOF_BUDGET_ACCOUNTS_CODES = rows.map(x=>x.code);
