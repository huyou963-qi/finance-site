# 美国财政三模板：18图指标、目录与自动更新

本文件记录2026-11-21对三个拟重构模板的数据接入。范围为当前工作区配置的**开发库**，不代表生产库状态；本次不发布新模板或入口。逐图合同以 `src/lib/data/scheduler/usFiscalFoundation/chartRequirements.ts` 为准。

业务范围为美国联邦财政及财政部国债。

## 核查基线与存储原则

接入前实查：开发库有1,647个其他领域指标、951,972条宏观观测，但本次所需Treasury财政序列与7条FRED财政/持有人序列均未登记。原代码的seed定义不能视为数据库已有。

本次建立**60条官方原始数值序列 + 2类原始明细订阅**。同比、TTM、月末差分、占比、初级赤字、净发行、日净现金流、到期桶均只在读取/模板层计算，不新增二次宏观观测。

- 数值序列：`mds.Instrument` + `MacroObservation` + `DataSubscription` + `ReleasePackageMember`，同时进入统一版本账本。
- 原始明细：`mds.treasury_source_snapshot`保存原始字段，按`dataset + record_key + content_hash`去重追加。MSPD每个月末一个完整报告，拍卖每个CUSIP+发行日一条记录；修订不覆盖先前捕获版本。
- 明细订阅使用`InstrumentKind.OTHER`，保留管理员可审计的来源、发布包与更新日志，**不伪装成可选的单值宏观时间序列**。到期图与拍卖结构读取原始明细计算；目录中的原始数值仍可供常规图表选择。
- 原始历史来自官方当前可回读历史。`captured_at`只证明系统捕获时点，不能冒充历史首发PIT；原表的`record_date`也不普遍等于发布时间。

## 逐图指标清单

下表中`treasury_`均为Instrument code，`fred:`为原始FRED序列。所有输入在接入前的本开发库均缺失；最终是否有观测及其日期以核验报告为准。

| 图 | 图表/表格所需原始指标 | 运算及口径 |
|---|---|---|
| A1 债务存量 | `treasury_debt_penny_total_daily`、`treasury_debt_penny_held_public_daily` | 每日总债务、公众持有；单位美元 |
| A2 债务增量 | 同A1 | 先取月末，再做相邻月差及与上年同月差；称“余额变化”，不称发行融资 |
| A3 债务率 | `fred:GFDEGDQ188S`、`fred:FYGFGDQ188S` | 官方季度总债务/GDP及公众持有债务/GDP；不混日/季数据 |
| A4 政府内/公众持有 | 同A1 | 政府内部=总债务−公众持有；两部分金额与占比 |
| A5 公众持有人构成 | `fred:FDHBFRBN`、`fred:FDHBFIN`、`fred:FDHBPIN` | 美联储、境外、国内其他=私人投资者−境外；三条均十亿美元、季度末，不能把FDHBPIN直接叫国内持有 |
| A6 谁在增减持 | 同A5 | 同季度口径4季金额差；是持有余额变动，不是资金流 |
| B1 收支规模 | `treasury_mts_m01_receipts`、`treasury_mts_m01_outlays` | 月度现金制，连续12个月合计；缺月不补零 |
| B2 收支变化 | 同B1 | TTM同比及辅助单月同比；不用FYTD环比 |
| B3 初级赤字/利息 | `treasury_mts_m01_deficit`、`treasury_mts_m09_outlay_interest` | 初级赤字=总赤字−净利息，分别TTM；正数表示赤字 |
| B4 财年进展 | `treasury_mts_m01_receipts_fytd`、`...outlays_fytd`、`...deficit_fytd` | 直接取官方财年累计；与上年相同财年月份对齐，10月重置 |
| B5 收入结构 | `treasury_mts_m01_receipts`及下列9条收入分项 | 按TTM展示金额与占比；社保税含就业退休、失业保险、其他退休三条 |
| B6 支出结构 | `treasury_mts_m01_outlays`及下列5条支出分项 | 社保、Medicare、其他医疗、国防、净利息；其他=总支出−以上分项，保留负的抵销项目 |
| C1 发行/偿还 | 下列7条DTS逐日面值交易 | 按月分别合计发行和偿还，再相减；排除FFB与单列通胀本金调整，不等同现金借款 |
| C2 短债/中长债净发行 | 同C1 | Bills与DTS Notes/Bonds分类；DTS分类不能完整拆开TIPS/FRN，故修正原方案，不虚构五类实际净融资 |
| C3 五券种发行结构 | `raw:auctions`：CUSIP、发行/拍卖日期、券种、通胀/浮息标记、实际获配面值 | Bills/Notes/Bonds/TIPS/FRN按issue_date归月；结果缺失不能用计划offering_amt补；尚未发行不计入已实现发行 |
| C4 未来12月到期 | `raw:mspd`：CUSIP、月末、到期日、余额、券种；另用`treasury_mspd_marketable_outstanding`核对范围 | 同CUSIP合并原表非空outstanding_amt，不能再加issued_amt；按未来12个自然月分桶。分母同范围未到期五类余额，剔除FFB与已到期待兑付；不预测TIPS未来通胀 |
| C5 赤字/融资衔接 | 月赤字、日TGA余额、`treasury_dts_tga_deposits`、`treasury_dts_tga_withdrawals`及下列7条MTS融资表原值 | 融资总额=负债净变化−资产净变化+未计预算交易；日净现金流在读取层用原始存入减支取，不落库；公众借款、TGA与其他调整分开解释，不强凑DTS面值发行与现金赤字 |
| C6 利息负担 | 月度净利息、月度财政收入、下列7条官方平均利率 | 净利息TTM/收入TTM；官方总平均排除TIPS/FRN，TIPS分项为实际票息，不能当作名义总成本 |

### 收入9条与支出5条

收入code前缀`treasury_mts_m09_rcpt_`：

| 后缀 | 原始项目 |
|---|---|
| individual | 个人所得税 |
| corporate | 企业所得税 |
| payroll | 就业与一般退休税 |
| unemployment | 失业保险 |
| other_retirement | 其他退休 |
| excise | 消费税 |
| estate_gift | 遗产与赠与税 |
| customs | 关税 |
| misc | 其他收入 |

支出code前缀`treasury_mts_m09_outlay_`：`social_security`社保、`medicare`医保、`health`其他医疗卫生（不等于Medicaid单项）、`defense`国防、`interest`净利息。所有金额均为美元、现金制原始月值。

### DTS面值交易7条

code前缀`treasury_dts_`：`issue_bills_regular`、`issue_bills_cash`、`issue_notes`、`issue_bonds`、`redeem_bills`、`redeem_notes`、`redeem_bonds`。单位百万美元、日频。常规Bills与现金管理Bills单列，图表层再相加；Notes/Bonds保留DTS的分类边界。

### 月度融资原值7条

code前缀`treasury_mts_m06_`：

| 后缀 | Table6行码 | 含义 |
|---|---|---|
| borrowing_public | 9310 | 向公众净借款，含机构证券及折溢价等调整 |
| treasury_public | 9034 | 公众持有Treasury证券面值净变动 |
| cash_change | 9500 | 联储财政账户现金变化；资产增加为正 |
| total_liabilities | 9361 | 融资负债账户总净变化 |
| total_assets | 9562 | 融资资产账户总净变化 |
| other_budget | 9624 | 未计入当年预算盈亏的交易 |
| financing_total | 9661 | 预算及表外联邦实体融资总额 |

Table6金额单位为**美元**，不能因报告PDF以百万展示便将API值再乘百万。以上为官方披露原值，不把差额包装成新原始指标。

### 存量券种及平均利率

`treasury_mspd_{bills,notes,bonds,tips,frn,ffb}_outstanding`与`treasury_mspd_marketable_outstanding`：MSPD Table1，月频、百万美元。逐券图的未到期范围与MSPD包括已到期待兑付及FFB的总数不同，须单独核对。

`treasury_avg_rate_{bills,notes,bonds,tips,frn,marketable,total}`：月频、百分比。`marketable`和`total`官方口径不含TIPS/FRN；不通过自行加权修改官方原值。

## 目录树

所有原始数值位于统一九大主题中的`美国 → 财政与公共债务`，再按业务分组及频率分叶，单叶不超过48条。

| 子组 | 指标 |
|---|---|
| 债务存量 | 日总债务/公众持有；季度债务金额 |
| 可持续性比率 | 官方季度债务/GDP |
| 债务持有人 | 美联储、境外、私人持有三条季度原值 |
| MTS现金流量 | 月收支/赤字及财年累计 |
| 财政收入结构 | 9条税收/其他收入原值 |
| 财政支出结构 | 5条功能支出原值 |
| 赤字融资衔接 | Table6融资原值 |
| 融资与现金 | TGA日余额、官方每日总存入与总支取 |
| 国债发行与偿还 | DTS7条逐日交易原值 |
| 债务券种结构 | MSPD各券种及总余额 |
| 债务利息成本 | 7条官方平均利率 |

原始逐券/拍卖记录是**明细数据集**，不适用单值宏观目录的观测展示，管理员订阅元数据分别标为`国债逐券明细`/`国债拍卖明细`；前台不添加占位指标。权威定位由`usCatalogTaxonomy.ts`决定，`globalCatalogTaxonomy.ts`调用该规则；保存布局须运行全局目录重建，不能只手工拖动。

## 发布包与自动更新

| 发布包 | 成员及来源 | 更新方式 | 修订窗口 |
|---|---|---|---|
| us.treasury.debt_daily | Debt to the Penny每日债务 | 官方API，24h探测 | 重读24个月 |
| us.treasury.debt_levels | 季度债务金额及两条官方债务/GDP | FRED_API，168h探测；Treasury Bulletin及Debt/GDP发布身份 | 重读24个月 |
| us.treasury.holders | 3条持有人原值 | FRED_API，168h探测；Treasury Bulletin release80 | 重读24个月 |
| us.treasury.mts | Table1、Table9及Table6 | 官方API，24h探测同一MTS月报 | 重读24个月 |
| us.treasury.dts | TGA余额、原始存入/支取、DTS面值交易 | 官方API，24h探测同一DTS日报 | 重读24个月 |
| us.treasury.mspd | Table1原值及Table3市场化逐券快照 | 官方API，24h探测；官网说明次月第4个工作日发布前月末报告 | 数值24个月，逐券36个月 |
| us.treasury.interest_rates | 7条存量平均利率 | 官方API，24h探测月表 | 重读24个月 |
| us.treasury.auctions | 最新版官方逐次拍卖记录 | 官方API，6h探测；按公告/结果更新 | 重读36个月，修订追加 |

发布包规则唯一来源为`releasePackageCatalog.ts`。本批使用低频`probe_interval`，不伪造固定日历或下一发布日期；不向`teEventMap.ts`写新增映射。worker按包级排期更新，原始明细也走同一个订阅执行器、错误退避与FetchRun日志。

拍卖使用新版`v1/accounting/od/treasury_securities_auctions_v2`更新近期数据，旧`auctions_query`补长期官方历史；重叠业务键以新版为准，并保存各自原始字段及来源地址，不依赖旧版持续更新。`offering_amt`是计划量，新版`grand_total_par_awarded`、旧版`total_accepted`是实际获配面值；SOMA等外部配售可能纳入总额，与公众现金借款不是相同口径。重发行按CUSIP+issue_date区分，不能按CUSIP去掉合法续发行。

## 部署与核验

```powershell
npm run db:migrate
npm run data:seed-fiscal -- --definitions-only
npm run data:seed-release-packages -- --packages=us.treasury.mts,us.treasury.dts,us.treasury.debt_daily,us.treasury.debt_levels,us.treasury.holders,us.treasury.mspd,us.treasury.interest_rates,us.treasury.auctions
npm run data:sync-fiscal
npm run data:rebuild-global-catalog-layout
npm run data:verify-fiscal -- --db --report=.data/fiscal-onboard/final-audit.json
```

统一registry的`fiscal`沿用既有入口，`data:apply`自动包含新seed和核验。种子会先建发布包并绑定成员；重复运行按业务键幂等，不重置已有订阅下一次排期。`--codes=<code,...>`可只重试指定失败指标。

生产部署的`data:apply --skip-backfill`对财政只传`--definitions-only`，完整采集在部署后的后台维护任务执行。生产核验用`data:verify-fiscal -- --db --environment=production --report=<文件>`明确标记环境；需要重读既有序列的早期历史和更正旧月值时，运行`data:sync-fiscal -- --full-history`。本变更不导入、修改或发布生产系统模板覆盖配置。

原始明细完整性检查包括分页上限拒绝静默截断、逐券发行批次余额不重复、混月拒绝、拍卖业务键唯一。旧版MSPD会给每个续发行批次分别列余额，新版常在一条记录列合计、其余为空；读取层兼容两种格式，绝不将issued_amt叠加到outstanding_amt上。数据库检查包括原始观测覆盖、目录位置、启用订阅、发布包唯一性、月收入分项合计、融资表勾稽、赤字/融资衔接与MSPD券种总额。

### 本次开发库实查结果

- 60条原始数值序列，62,550条观测；62条启用订阅归入8个发布包。旧版`treasury_dts_daily_net_cash`二次序列不再seed，改为官方存入/支取两条原始输入。
- MSPD：310份原始逐券报告，2001-01至2026-10；拍卖：11,201条原始业务记录，1979-11起，已实现发行核对至2026-11-19。原始库另可保留已公告但尚未发行的记录，图表按截止日排除。
- MTS收入/支出/赤字及分项：2015-03至2026-10，共140个月。9项收入与总收入全部勾稽，最大数值差小于0.001美元。
- 日债务存量：2010年起；TGA和DTS发行偿还：2005-10-03起，最新2026-11-19。DTS原始每日总存入/总支取当前来源自2022-04-18起，不倒推改版前现金流。
- MSPD总额/主要券种与平均利率：2001年起；TIPS合并余额从2004-06起，TIPS合并平均利率从2004-10起；旧表分别列通胀挂钩Notes/Bonds，不把两条旧平均利率硬拼成新的平均利率。浮息债从2014年发行后开始。
- 持有人历史自1970年起；美联储/私人持有最新2026Q2，境外持有最新2026Q1，与官方当前FRED观测一致。A5/A6须取共同可用季度2026Q1，不能把不同季度拼成同一结构。
- MTS Table6与Table1在部分2015–2023年月度记录存在源表间小额差异；Table6内部10个月的差异最大约289万美元。原值全部保留，报告列出每个日期及差额；最近12个月勾稽通过。历史图应显式保留“未解释/源表差额”，不能调整原始值强行归零。7个月的`other_budget`原值为空，保持缺口。
- MSPD汇总与分项独立取整，历史最大差约1百万美元；7个金额参与核验时按各项0.5百万美元的独立取整边界，使用3.5百万美元容差并记录实际差额。
- “18图输入就绪”表示所需原始数据及读取方式已具备，不表示每段历史都无缺口，也不表示新版模板已经发布。

本开发库原业务表已存在，但历史迁移账本未登记。此次仅执行新增表的独立迁移SQL并登记该条迁移，没有将旧迁移整体重放，也没有重置数据库。正常已建立迁移基线的部署库仍走标准`db:migrate`。

## 一手来源

- [Debt to the Penny](https://fiscaldata.treasury.gov/datasets/debt-to-the-penny/)
- [Monthly Treasury Statement](https://fiscaldata.treasury.gov/datasets/monthly-treasury-statement/)
- [Daily Treasury Statement](https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/)
- [MSPD及原始逐券字段](https://fiscaldata.treasury.gov/datasets/monthly-statement-public-debt/)
- [官方存量平均利率及排除项](https://fiscaldata.treasury.gov/datasets/average-interest-rates-treasury-securities/)
- [新版国债拍卖数据](https://fiscaldata.treasury.gov/datasets/treasury-securities-auctions-data/treasury-securities-auctions-data-updated/)
- [FRED FDHBPIN](https://fred.stlouisfed.org/series/FDHBPIN)、[FDHBFIN](https://fred.stlouisfed.org/series/FDHBFIN)、[FDHBFRBN](https://fred.stlouisfed.org/series/FDHBFRBN)
