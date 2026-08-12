# 已占用指标负面清单（内置模板）

> Agent A 规划新维度时**必查**：下表指标已被同一国家的现有新内置模板占用，新模板不得复制（分析上需要时在 Spec §1.3 写「引用现有模板」）。跨国家序列不互相冲突；legacy 模板的例外见文末。
> 新维度 `verified` 后由 Agent E 把该维度指标**追加到本文件**。
>
> 再生成基线（FRED 部分）：
> `grep -o 'fredId: "[A-Z0-9_]*"' src/lib/data/*AnalysisLayout.ts | sort -u`

生成日期：2026-07-04（基于当前 main 分支）；2026-07-04 追加「美国货币政策与金融条件」域 15 条；2026-08-10 追加「中国财政」「中国金融条件与流动性」和「中国宏观经济 Overview」域；2026-08-11 追加「中国国际收支」域（Agent E 验收）

## 美国

### FRED 序列

| FRED id | 显示名 | 占用模板 |
|---------|--------|----------|
| CPIAUCSL | CPI（全部城市消费者） | 美国通胀 ①、美国经济 Overview ① |
| CPILFESL | 核心 CPI | 美国通胀 ① |
| CPIENGSL | CPI 能源 | 美国通胀 ① |
| CPIFABSL | CPI 食品与饮料 | 美国通胀 ① |
| CUSR0000SEHC | OER 业主等价租金 | 美国通胀 ① |
| CUSR0000SACL1E | CPI 核心商品 | 美国通胀 ① |
| CUSR0000SASLE | CPI 核心服务 | 美国通胀 ① |
| DCOILWTICO | WTI 原油现货 | 美国通胀 ② |
| PPIFIS | PPI 最终需求 | 美国通胀 ② |
| T5YIE | 5Y 盈亏平衡通胀 | 美国通胀 ② |
| PCEPILFE | 核心 PCE | 美国通胀 ②、美国经济 Overview ① |
| CES0500000003 | 平均时薪 | 美国通胀 ②、美国就业 |
| UNRATE | 失业率 | 美国通胀 ②、美国就业、美国经济 Overview ① |
| PAYEMS | 非农就业 | 美国就业、美国经济 Overview ① |
| ICSA | 初请失业金 | 美国就业 ② |
| JTSJOR / JTSHIR / JTSQUR | JOLTS 职位空缺/雇佣/离职率 | 美国就业 ② |
| U6RATE | U-6 失业率 | 美国就业 |
| CIVPART / LNS11300060 | 劳动参与率（总体/25-54） | 美国就业 |
| UEMPMEAN | 平均失业周期 | 美国就业 |
| AWHNONAG | 周工时 | 美国就业 |
| A191RL1Q225SBEA | 实际 GDP 环比折年率 | 美国经济 Overview ① |
| INDPRO | 工业生产 | 美国经济 Overview ① |
| DFEDTARU | 联邦基金目标利率（上限） | 美国经济 Overview ① |
| T10Y2Y | 10Y-2Y 利差 | 美国经济 Overview ① |
| PCEC96 | 实际 PCE | 美国经济 Overview ② |
| RSAFS | 零售销售 | 美国经济 Overview ② |
| PNFIC1 | 实际私人固定投资 | 美国经济 Overview ② |
| HOUST | 新屋开工 | 美国经济 Overview ② |
| EXPGSC1 / IMPGSC1 | 实际出口/进口 | 美国经济 Overview ② |
| GCEC1 | 实际政府消费 | 美国经济 Overview ②、美国财政 |
| FYFSGDA188S | 联邦赤字/GDP | 美国经济 Overview ②、美国财政 |
| FYOIGDA188S | 利息支出/GDP | 美国财政 |
| GFDEBTN / GFDEGDQ188S | 联邦债务（总额 / /GDP） | 美国财政 |
| EFFR | 有效联邦基金利率 | 美国货币政策与金融条件 ① |
| DGS2 / DGS10 / DFII10 | 2Y/10Y 国债收益率、10Y TIPS 实际收益率 | 美国货币政策与金融条件 ① |
| T10YIE | 10Y 盈亏平衡通胀 | 美国货币政策与金融条件 ①（原 CPI seed 入库未占槽，2026-07 首次占用） |
| WALCL | 联储总资产 | 美国货币政策与金融条件 ①（原 phase2 入库未占槽，2026-07 首次占用） |
| RRPONTSYD | ON RRP 隔夜逆回购余额 | 美国货币政策与金融条件 ① |
| T10Y3M | 10Y-3M 国债利差 | 美国货币政策与金融条件 ① |
| NFCI | Chicago Fed 金融条件指数 | 美国货币政策与金融条件 ② |
| BAMLH0A0HYM2 | 高收益债 OAS | 美国货币政策与金融条件 ②（原 phase2 入库未占槽，2026-07 首次占用） |
| BAMLC0A0CM | 投资级公司债 OAS | 美国货币政策与金融条件 ② |
| DRTSCILM | SLOOS 工商贷款收紧净比例 | 美国货币政策与金融条件 ② |
| BUSLOANS | 工商业贷款存量 | 美国货币政策与金融条件 ② |
| DRCCLACBS / DRBLACBS | 信用卡/工商贷款拖欠率 | 美国货币政策与金融条件 ② |
| PERMIT / HOUST1F | 建筑许可 / 单户新屋开工 | 美国住房与地产 ①（HOUST1F≠总开工 HOUST） |
| HSN1F / MSACSR | 新屋销售 / 新屋可售月数 | 美国住房与地产 ① |
| COMPUTSA | 住房完工 | 美国住房与地产 ① |
| CSUSHPINSA | Case-Shiller 全国房价 | 美国住房与地产 ②（原 phase2 入库未占槽，2026-07 首次占用） |
| MORTGAGE30US / MORTGAGE15US | 30Y / 15Y 抵押利率 | 美国住房与地产 ② |
| RHORUSQ156N | 自有住房率 | 美国住房与地产 ② |
| DRSFRMACBS | 单户住宅抵押贷款拖欠率 | 美国住房与地产 ② |
| EXHOSLUSM495S | 成屋销售 | 美国住房与地产（已入库，NAR 许可仅约 1 年，暂不进模板、持续累积） |
| RECPROUSM156N | 平滑衰退概率（Chauvet-Piger） | 美国增长动能与衰退风险 ① |
| SAHMREALTIME | Sahm 规则实时值 | 美国增长动能与衰退风险 ① |
| CFNAI | 芝加哥联储全国活动指数 | 美国增长动能与衰退风险 ①（原 phase2 入库未占槽，2026-07 首次占用） |
| USREC | NBER 衰退标记 | 美国增长动能与衰退风险 ①（原 phase2 入库未占槽，2026-07 首次占用） |
| W875RX1 / DSPIC96 | 实际个人收入(除转移) / 实际可支配收入 | 美国增长动能与衰退风险 ② |
| CMRMTSPL | 实际制造与贸易销售 | 美国增长动能与衰退风险 ② |
| FINSLC1 | 实际最终销售 | 美国增长动能与衰退风险 ② |
| RSXFS | 零售销售（零售贸易） | 美国消费与居民资产负债 ①（≠RSAFS 含餐饮总额） |
| PCEDGC96 / PCESC96 | 实际 PCE 耐用品 / 服务 | 美国消费与居民资产负债 ① |
| UMCSENT | 密歇根消费者信心 | 美国消费与居民资产负债 ①（原 phase2 入库未占槽，2026-07 首次占用） |
| PSAVERT | 个人储蓄率 | 美国消费与居民资产负债 ① |
| TNWBSHNO | 家庭净财富 | 美国消费与居民资产负债 ② |
| TDSP | 家庭偿债比率 | 美国消费与居民资产负债 ② |
| TOTALSL / REVOLSL | 总消费信贷 / 循环消费信贷 | 美国消费与居民资产负债 ② |
| CORCCACBS | 信用卡贷款核销率 | 美国消费与居民资产负债 ②（≠DRCCLACBS 拖欠率） |
| DTWEXBGS | 美元名义广义指数 | 美国对外部门与美元 ①（原 phase2 入库未占槽，2026-07 首次占用） |
| DTWEXAFEGS / DTWEXEMEGS | AFE / EME 美元指数 | 美国对外部门与美元 ① |
| BOPGSTB | 商品与服务贸易差额 | 美国对外部门与美元 ① |
| BOPTEXP / BOPTIMP | 出口/进口（BOP） | 美国对外部门与美元 ①（≠ Overview 的 EXPGSC1/IMPGSC1） |
| IEABC | 经常账户余额（BOP） | 美国对外部门与美元 ②（≠ NETFI NIPA） |
| IIPUSNETIQ | 净国际投资头寸 | 美国对外部门与美元 ② |
| IQ / IR | 出口/进口价格指数 | 美国对外部门与美元 ② |
| W369RG3Q066SBEA | 贸易条件指数 | 美国对外部门与美元 ② |
| DGORDER / ADXTNO | 耐用品新订单 / 耐用品(除运输) | 美国制造业与库存周期 ① |
| NEWORDER / AMDMUO | 核心资本品新订单 / 耐用品未完成订单 | 美国制造业与库存周期 ① |
| IPMAN | 工业生产·制造业(NAICS) | 美国制造业与库存周期 ②（≠INDPRO） |
| BUSINV / AMTMTI | 总商业库存 / 制造业库存 | 美国制造业与库存周期 ② |
| ISRATIO / MNFCTRIRSA | 总业务库销比 / 制造业库销比 | 美国制造业与库存周期 ② |
| MCUMFN | 制造业产能利用率(NAICS) | 美国制造业与库存周期 ②（≠TCU） |

### 非 FRED 序列

| instrument code / key | 显示名 | 来源 | 占用模板 |
|-----------------------|--------|------|----------|
| `treasury_mts_m01_*`（deficit/outlays/receipts） | MTS 月度赤字/支出/收入 | Treasury FiscalData | 美国财政 |
| `treasury_mts_m09_*`（rcpt_individual/payroll/corporate、outlay_interest、mandatory/discretionary_proxy） | MTS 收支结构 | Treasury FiscalData | 美国财政 ·结构 |
| `treasury_dts_*`（tga_balance、daily_net_cash）、`treasury_debt_penny_net_weekly` | DTS 高频财政 | Treasury FiscalData | 美国财政 ·高频 |
| `fiscal_primary_deficit_gdp`、`fiscal_fgcec1_yoy` | 财政合成序列 | FRED composite | 美国财政 |
| `ism_us_ism_*`（8 条） | ISM 制造业 PMI 及分项 | TE 抓取 | headline/new_orders/inventories：**美国制造业与库存周期 ①**（首次占槽）；其余分项仍目录自选 |
| `ism_svc_us_svc_*` | ISM 非制造业 PMI 及分项 | TE 抓取 | 未进默认模板（目录自选，Overview L2S） |
| `nyfed_us_recession_prob` | NY Fed 衰退概率（12月前瞻） | NY Fed Excel 抓取（Agent C） | 美国增长动能与衰退风险 ① |
| `debtcap_*` | 四国杠杆/偿债比 | BIS | 四国偿债能力（legacy） |
| `goldov_*` | 黄金分析序列 | xlsx | 黄金分析（legacy） |
| `usov_* / chov_* / jpov_*` | 三国 Overview xlsx 序列 | xlsx/FRED composite | US/China/Japan_Overview（legacy） |

## 特别说明

- **ISM 服务业仍未占默认图槽**；制造业 PMI 的 headline / new_orders / inventories 已于 2026-07 由「美国制造业与库存周期」首次占用默认图槽。
- legacy xlsx 模板（US/China/Japan_Overview、黄金、偿债）的序列不受零重复原则约束，但新模板应优先用 FRED 标准序列而非 `usov_*` 合成序列。

## 中国

当前 `China_Overview` 是 legacy Excel 模板，所用 `chov_*` 序列不构成新模板的可复用数据基线；新模板必须优先使用已登记的 NBS/PBC/MOF/SAFE/MOFCOM 官方 `mds:` 序列。

### 中国财政（2026-08-10，Agent E 验收）

| instrument code / key | 显示名 | 来源 | 占用模板 |
|-----------------------|--------|------|----------|
| `mof_cn_fiscal_general_revenue_yoy` / `mof_cn_fiscal_general_expenditure_yoy` | 一般公共预算收入/支出累计同比 | 财政部 | 中国财政 ① |
| `mof_cn_fiscal_fund_revenue_yoy` / `mof_cn_fiscal_fund_expenditure_yoy` | 政府性基金预算收入/支出累计同比 | 财政部 | 中国财政 ① |
| `mof_cn_fiscal_general_revenue_amount` / `mof_cn_fiscal_general_expenditure_amount` | 一般公共预算收入/支出累计额 | 财政部 | 中国财政 ① 派生输入；支出亦用于 ③ |
| `mof_cn_fiscal_fund_revenue_amount` / `mof_cn_fiscal_fund_expenditure_amount` | 政府性基金预算收入/支出累计额 | 财政部 | 中国财政 ① 派生输入 |
| `nbs_cn_gdp_a_headline_nominal` | 年度名义 GDP | 国家统计局 | 中国财政 ①-4 派生分母 |
| `mof_cn_fiscal_tax_revenue_yoy` / `mof_cn_fiscal_nontax_revenue_yoy` | 税收/非税收入累计同比 | 财政部 | 中国财政 ②-1 |
| `mof_cn_fiscal_general_revenue_central_yoy` / `mof_cn_fiscal_general_revenue_local_yoy` | 中央/地方本级一般公共预算收入累计同比 | 财政部 | 中国财政 ②-2 |
| `mof_cn_fiscal_vat_yoy` / `mof_cn_fiscal_corporate_income_tax_yoy` / `mof_cn_fiscal_personal_income_tax_yoy` | 增值税/企业所得税/个人所得税累计同比 | 财政部 | 中国财政 ②-3 |
| `mof_cn_fiscal_fund_revenue_local_yoy` / `mof_cn_fiscal_land_transfer_revenue_yoy` | 地方基金预算本级收入/土地出让收入累计同比 | 财政部 | 中国财政 ②-4 |
| `mof_cn_fiscal_general_expenditure_central_yoy` / `mof_cn_fiscal_general_expenditure_local_yoy` | 中央本级/地方一般公共预算支出累计同比 | 财政部 | 中国财政 ③-1 |
| `mof_cn_fiscal_social_security_yoy` / `mof_cn_fiscal_education_yoy` / `mof_cn_fiscal_health_yoy` | 社保就业/教育/卫生健康支出累计同比 | 财政部 | 中国财政 ③-2 |
| `mof_cn_fiscal_science_yoy` / `mof_cn_fiscal_agriculture_yoy` / `mof_cn_fiscal_transport_yoy` | 科技/农林水/交通运输支出累计同比 | 财政部 | 中国财政 ③-3 |
| `mof_cn_fiscal_debt_interest_yoy` / `mof_cn_fiscal_debt_interest_amount` | 债务付息支出累计同比/累计额 | 财政部 | 中国财政 ③-4 |

本地派生占用：`calc:cn-fiscal-general-deficit-proxy`、`calc:cn-fiscal-fund-deficit-proxy`、`calc:cn-fiscal-two-book-deficit-proxy`、`calc:cn-fiscal-two-book-deficit-gdp`、`calc:cn-fiscal-interest-share-expenditure-ytd`。它们不是新的官方原始指标，不得在其他维度改名冒充官方赤字或赤字率。

### 中国金融条件与流动性（2026-08-10，Agent E 验收）

| instrument code / key | 显示名 | 来源 | 占用模板 |
|-----------------------|--------|------|----------|
| `pbc_cn_lpr_1y` / `pbc_cn_lpr_5y` | 1 年期/5 年以上 LPR | 中国人民银行 | 金融条件 · 资金价格与货币活性 ①-1 |
| `pbc_cn_repo_rate` / `pbc_cn_interbank_lending_rate` | 质押式回购/同业拆借月加权平均利率 | 中国人民银行 | 金融条件 · 资金价格与货币活性 ①-2 |
| `pbc_cn_m1_yoy` / `pbc_cn_m2_yoy` | M1/M2 同比 | 中国人民银行 | 金融条件 · 资金价格与货币活性 ①-3、①-4 派生输入 |
| `pbc_cn_social_financing_stock_yoy` / `pbc_cn_rmb_loan_yoy` | 社融存量/人民币贷款余额同比 | 中国人民银行 | 金融条件 · 信用扩张与融资结构 ②-1；贷款亦用于 ②-2 派生输入 |
| `pbc_cn_rmb_deposit_yoy` | 人民币存款余额同比 | 中国人民银行 | 金融条件 · 信用扩张与融资结构 ②-2 |
| `pbc_cn_social_financing_cumulative` | 社会融资规模增量累计 | 中国人民银行 | 金融条件 · 信用扩张与融资结构 ②-3、②-4 派生分母 |
| `pbc_cn_social_financing_rmb_loan_cumulative` / `pbc_cn_government_bond_financing_cumulative` | 社融口径人民币贷款/政府债券融资累计 | 中国人民银行 | 金融条件 · 信用扩张与融资结构 ②-3 派生分子 |
| `pbc_cn_corporate_bond_financing_cumulative` / `pbc_cn_domestic_equity_financing_cumulative` | 企业债券/非金融企业境内股票融资累计 | 中国人民银行 | 金融条件 · 信用扩张与融资结构 ②-4 派生分子 |

本地派生占用：`calc:cn-financial-unsecured-secured-spread`、`calc:cn-financial-m1-m2-gap`、`calc:cn-financial-loan-deposit-growth-gap`、`calc:cn-financial-tsf-rmb-loan-share`、`calc:cn-financial-tsf-government-bond-share`、`calc:cn-financial-tsf-corporate-bond-share`、`calc:cn-financial-tsf-equity-share`。这些序列只在模板层按同月输入计算，不是人民银行官方指标；后续维度不得改名重复占用或把它们写成官方“金融条件指数”。

### 中国宏观经济 Overview（2026-08-10，Agent E 验收）

| instrument code / key | 显示名 | 来源 | 占用模板 |
|-----------------------|--------|------|----------|
| `nbs_cn_gdp_q_headline_real_yoy` | 季度 GDP 实际同比 | 国家统计局 | 中国经济 Overview ①-1 |
| `nbs_cn_gdp_q_headline_nominal` / `nbs_cn_gdp_q_headline_real` | 季度 GDP 名义值/不变价值 | 国家统计局 | 中国经济 Overview ①-1；名义同比与隐含平减指数输入 |
| `nbs_cn_gdp_q_final_consumption_contribution` / `nbs_cn_gdp_q_capital_formation_contribution` / `nbs_cn_gdp_q_net_exports_contribution` | 最终消费/资本形成/净出口增长贡献率 | 国家统计局 | 中国经济 Overview ①-2 |
| `nbs_cn_mfg_new_orders` / `nbs_cn_non_mfg_new_orders` | 制造业/非制造业 PMI 新订单 | 国家统计局 | 中国经济 Overview ①-3 |
| `nbs_cn_industrial_headline_yoy` / `nbs_cn_retail_h_yoy` | 规模以上工业增加值/社会消费品零售总额同比 | 国家统计局 | 中国经济 Overview ①-4 |
| `nbs_cn_fai_m_5129067b_7e570cf8` | 固定资产投资累计同比 | 国家统计局 | 中国经济 Overview ①-4、②-1（评审授权有意重复） |
| `nbs_cn_fai_m_90028595_d1771824` / `nbs_cn_fai_m_infrastructure_yoy` / `nbs_cn_realestate_4035448cce98117aa2` | 制造业/基础设施/房地产开发投资累计同比 | 国家统计局 | 中国经济 Overview ②-1 |
| `mof_cn_fiscal_general_expenditure_amount` / `mof_cn_fiscal_fund_expenditure_amount` | 一般公共预算/政府性基金预算支出累计额 | 财政部 | 中国经济 Overview ②-2 派生输入；经评审授权复用中国财政原始 Instrument |
| `nbs_cn_cpi_headline_yoy` / `nbs_cn_ppi_headline_yoy` | CPI/PPI 同比 | 国家统计局 | 中国经济 Overview ②-3 |
| `mofcom_cn_trade_cabe8908b163088537` / `mofcom_cn_trade_a02519f634eb068d5a` | 出口/进口总额当月美元同比 | 海关总署、商务部转载 | 中国经济 Overview ②-4 |

本地派生占用：`calc:cn-overview-gdp-deflator-yoy`、`calc:cn-overview-broad-fiscal-expenditure`、`calc:cn-overview-broad-fiscal-expenditure-yoy`。平减指数按同季度名义值/不变价值后做同季同比；广义财政先合计两本账累计支出，再按上年同月计算同比。这三条不是外部官方原始 Instrument。

### 中国国际收支（2026-08-11，Agent E 验收）

| instrument code / key | 显示名 | 来源 | 占用模板 |
|-----------------------|--------|------|----------|
| `safe_cn_bop_current_account` | 经常账户差额 | 国家外汇管理局 | 中国国际收支 ①-1 |
| `safe_cn_bop_goods_balance` / `safe_cn_bop_services_balance` | 货物差额/服务差额 | 国家外汇管理局 | 中国国际收支 ①-1 |
| `safe_cn_bop_direct_investment_net` | 直接投资净额 | 国家外汇管理局 | 中国国际收支 ①-2 |
| `safe_cn_bop_portfolio_investment_net` / `safe_cn_bop_other_investment_net` | 证券投资净额/其他投资净额 | 国家外汇管理局 | 中国国际收支 ①-2 |
| `safe_cn_settlement_6b1b40a90c3a` | 银行结售汇差额 | 国家外汇管理局 | 中国国际收支 ①-3 |
| `safe_cn_payments_36f49c28853c` | 银行代客涉外收付款差额 | 国家外汇管理局 | 中国国际收支 ①-3 |
| `safe_cn_iip_d2af2fbaf002` | 净国际投资头寸 | 国家外汇管理局 | 中国国际收支 ①-4 |
| `safe_cn_iip_8d7e57a2760c` / `safe_cn_debt_ce941250bdad` | 储备资产/外债总额 | 国家外汇管理局 | 中国国际收支 ①-4 派生隐藏输入 |

本地派生占用：`calc:cn-bop-reserve-assets-to-external-debt`。该比率按共同季度计算 `100 × 储备资产 ÷ 外债总额`，不是 SAFE 官方序列，也不是短期外债覆盖率；后续维度不得改名重复占用或把它写成 Guidotti–Greenspan 指标。
