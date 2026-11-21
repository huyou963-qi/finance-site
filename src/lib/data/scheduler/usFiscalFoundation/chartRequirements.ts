const mds = (suffix: string) => `treasury_${suffix}`;
const receipts = ["individual", "corporate", "payroll", "unemployment", "other_retirement", "excise", "estate_gift", "customs", "misc"].map(k => mds(`mts_m09_rcpt_${k}`));
const outlays = ["social_security", "medicare", "health", "defense", "interest"].map(k => mds(`mts_m09_outlay_${k}`));
const holders = ["fred:FDHBFRBN", "fred:FDHBFIN", "fred:FDHBPIN"];
const debt = [mds("debt_penny_total_daily"),mds("debt_penny_held_public_daily")];
const monthly = [mds("mts_m01_receipts"),mds("mts_m01_outlays"),mds("mts_m01_deficit")];
const transactions = ["issue_bills_regular", "issue_bills_cash", "issue_notes", "issue_bonds", "redeem_bills", "redeem_notes", "redeem_bonds"].map(k => mds(`dts_${k}`));

/** 18张图的数据合同；派生仅在读取/模板层计算，不能为这些公式seed二次宏观序列。 */
export const FISCAL_CHART_REQUIREMENTS = [
  {id:"A1",title:"公共债务存量",inputs:debt,calculation:"展示每日面值；总额与公众持有。"},
  {id:"A2",title:"债务增量",inputs:debt,calculation:"日度存量先取月末，再计算相邻月差与同月上年差；不是发行额。"},
  {id:"A3",title:"债务率",inputs:["fred:GFDEGDQ188S","fred:FYGFGDQ188S"],calculation:"使用官方季度债务/GDP；不将最新日债务除以滞后GDP。"},
  {id:"A4",title:"公众与政府内部持有",inputs:debt,calculation:"政府内部持有=总债务−公众持有；分别除总债务得到占比。"},
  {id:"A5",title:"公众持有人构成",inputs:holders,calculation:"取共同可用季度：美联储、外国及国际投资者、国内其他投资者=FDHBPIN−FDHBFIN；FDHBPIN包含境外。发布不同步时不前向填充，也不强行归一到更高频债务总额。"},
  {id:"A6",title:"谁在增减持",inputs:holders,calculation:"对三个互斥持有部门计算4季度金额差；不是债券交易资金净流入。"},
  {id:"B1",title:"财政收入与支出",inputs:monthly.slice(0,2),calculation:"月度原始现金流按连续12个自然月求和；缺月不补零。"},
  {id:"B2",title:"收支变化",inputs:monthly.slice(0,2),calculation:"过去12月收入/支出相对前12月同比，辅助看单月同比；不做财年累计环比。"},
  {id:"B3",title:"赤字与利息",inputs:[monthly[2]!,mds("mts_m09_outlay_interest")],calculation:"过去12个月总赤字；初级赤字=总赤字−净利息，正数为赤字。"},
  {id:"B4",title:"本财年进展",inputs:["receipts","outlays","deficit"].map(k=>mds(`mts_m01_${k}_fytd`)),calculation:"使用官方财年累计值，与上财年相同财年月份比较；每年10月重置。"},
  {id:"B5",title:"财政收入结构",inputs:[monthly[0]!,...receipts],calculation:"社保及退休收入=就业退休+失业保险+其他退休；保留关税/消费税/遗赠税/其他，过去12月合计后计算份额。"},
  {id:"B6",title:"财政支出结构",inputs:[monthly[1]!,...outlays],calculation:"社保、Medicare、其他医疗、国防、净利息；其他=总支出−已列项，保留负的抵销收入，不伪称法定mandatory/discretionary。"},
  {id:"C1",title:"发行、偿还与净发行",inputs:transactions,calculation:"DTS逐日发行/偿还分别按月合计；净发行=发行−偿还。是三大类面值交易，排除FFB和单列通胀调整，不等同现金融资。"},
  {id:"C2",title:"短债与中长债净发行",inputs:transactions,calculation:"Bills与DTS Notes/Bonds分类的发行−偿还；后两类含TIPS/浮息债，不能声称五类净现金融资。"},
  {id:"C3",title:"五券种发行结构",inputs:["raw:auctions"],calculation:"按issue_date及inflation_protected/floating_rate归类Bills/Notes/Bonds/TIPS/FRN，汇总实际拍卖获配面值；未发行不计入，结果缺失不拿offering_amt替代；与DTS口径分开。"},
  {id:"C4",title:"未来12月到期分布",inputs:["raw:mspd",mds("mspd_marketable_outstanding")],calculation:"同一月末按CUSIP合并源表非空outstanding_amt，不重复加issued_amt，按maturity_date分桶；分母为同范围未到期五类余额，排除FFB与已到期待兑付；TIPS不预测未来通胀。"},
  {id:"C5",title:"赤字与融资衔接",inputs:[monthly[2]!,mds("dts_tga_balance"),mds("dts_tga_deposits"),mds("dts_tga_withdrawals"),...['borrowing_public','treasury_public','cash_change','total_liabilities','total_assets','other_budget','financing_total'].map(k=>mds(`mts_m06_${k}`))],calculation:"用MTS同月融资总额=负债净变化−资产净变化+未计预算交易；公众借款/TGA以外调整单列。TGA原始存入−支取仅作日净现金流参考，不写回库，不强凑DTS面值与月度现金赤字。"},
  {id:"C6",title:"利息负担",inputs:[monthly[0]!,mds("mts_m09_outlay_interest"),...['marketable','total','bills','notes','bonds','tips','frn'].map(k=>mds(`avg_rate_${k}`))],calculation:"净利息TTM/收入TTM；官方存量平均利率。总平均排除TIPS/FRN；TIPS单项为实际票息。"},
] as const;
