# 美国消费压力：十项核心指标数据审计与接入

核查日期：2026-11-17。直接查询香港生产库的 Instrument、MacroObservation、DataSubscription、ReleasePackageMember 与持久化目录；不是仅按代码目录推断已入库。本次不修改系统模板。

实跑结果：15条新增基础序列共1,638个历史观测已写入香港生产库；原有6条复用。已通过 `verify-consumer-pressure --allow-staged-nyfed` 的历史深度、近期数据、发布包及持久化目录检查。新增FRED六条订阅启用，NY Fed九条历史已落库、订阅在新代码部署前明确保持停用。

验证：消费者解析/目录/发布包/1950年前历史回归10项、发布包既有测试5项、FRED发布时间既有测试4项均通过；本次涉及文件ESLint通过。生产构建以4GB Node堆上限通过（默认2GB首次因内存不足失败）。独立全仓 `tsc --noEmit` 仍报告原有 `src/lib/equity/secFilingFacts.test.ts` 类型错误，本次未修改该模块。

## 核查结果与口径

| 核心项 | 原生产库 | 采用序列 / 本次处理 |
|---|---|---|
| Real DPI | 已有，1959-01 起 | `fred:DSPIC96`，复用 |
| Real PCE | 已有，2007-01 起 | `fred:PCEC96`，复用；补挂 `us.bea.personal_income` 发布包 |
| Personal Saving Rate | 已有，1959-01 起 | `fred:PSAVERT`，复用 |
| Household Liquid Assets | 缺基础分项 | 新增下述三条家庭部门资产；合计、增长率、支出覆盖月数只在图表运算 |
| Credit Card Balances | 缺 NY Fed 口径 | `mds:nyfed_hhdc_credit_card_balance`，季度，2003Q1 起 |
| Credit Card Utilization | 缺 | 费城联储活跃账户使用率第50/75/90百分位；另存 NY Fed 官方总额度，可在图表计算总余额/总额度 |
| Credit Card Delinquency | 已有 Fed 银行口径 | 复用 `fred:DRCCLACBS`；另补 NY Fed 90天以上逾期余额占比与新转入逾期数据，不混接 |
| Auto Loan Delinquency | 缺 | NY Fed 90天以上逾期余额占比、新转入30天以上、新转入90天以上 |
| Household DSR | 已有，2005Q1 起 | `fred:TDSP`，当前官方方法；不拼接旧方法历史 |
| Consumer Credit Revolving | 已有，1968-01 起 | `fred:REVOLSL`，复用；不是 NY Fed 信用卡余额的同义替代 |

既有月度序列最新为2026-09；既有 Fed 季度序列最新为2026Q2。季度观测以季首日期保存，例如2026-04-01代表2026Q2，不代表4月日度数据。

### 家庭流动性资产的三个基础分项

| FRED ID | 官方定义 | 单位 | 可得历史 |
|---|---|---|---|
| BOGZ1FL193020005Q | Households; Checkable Deposits and Currency; Asset, Level | 百万美元 | 1987Q4起 |
| BOGZ1FL193030205Q | Households; Other Deposits Including Time and Savings Deposits; Asset (IMA), Level | 百万美元 | 1987Q4起 |
| BOGZ1FL193034005Q | Households; Money Market Fund Shares; Asset, Level | 百万美元 | 1945Q4起，早期源端存在缺季，不填造 |

三项均为家庭部门口径，不与家庭及非营利组织合计混拼；未季调、期末存量。共同可比区间从1987Q4起。其他存款是含定期/储蓄的 IMA 广义口径，合计可用作流动性缓冲代理，但不表示所有资产均可立即、无成本支取。净财富、股票和债券不能代替这组指标，也不能据存量减少直接判定发生了资产变现或消费。

实际收入/消费不能直接作为名义资产支出覆盖月数的分母；后续模板如需覆盖月数，应另核对官方名义 Personal Outlays 及年率单位，不能用实际 PCE 代替。

### 信用卡使用率与逾期口径

- `RCCCBACTIVEUTILPCT50/75/90`：费城联储大型银行活跃信用卡账户样本，2012Q3起。是账户分布百分位，不是全国总量使用率，亦不是 NY Fed 样本。
- NY Fed 官方信用卡余额和总额度单位均为万亿美元，原值原精度保存。两者比值属于图表运算，不新增库内派生序列；额度缺失时采用最高历史余额等报告方法限制，见官方数据字典。
- NY Fed `*_delinquent_90` 是90天以上严重逾期余额占存量余额的比例，包含官方定义下的严重不良状态，不是借款人人数比例。
- `*_new_delinquent_30` 与 `*_new_delinquent_90` 是官方图13/14的**四季滚动合计**，不是单季比例或简单把单季乘4。原生官方发布的统计可入库，不另做四季汇总。
- Fed 银行信用卡拖欠率与 NY Fed 信用报告数据的覆盖范围、分母、逾期阈值不同，分别存储，不拼接或按值大小互相替代。

## 目录与更新

新登记15条基础序列：3条资产、3条使用率百分位、9条 NY Fed 余额/额度/逾期。既有6项复用，不重复建仪器。

| 目录位置 | 内容 | 发布包 | 更新 |
|---|---|---|---|
| 美国 > 金融条件与银行 > 居民流动性资产 | 三条资产分项 | us.frb.z1_household | FRED_API，168h探测 |
| 美国 > 金融条件与银行 > 居民消费信贷 | 三条账户使用率百分位 | us.philadelphiafed.consumer_credit | FRED_API，168h探测 |
| 同上 | 九条NY Fed数据 | us.nyfed.household_credit | 官方当前报告页面发现最新季度Excel，168h探测，完整重读历史修订 |

目录规则同时写入 `globalCatalogTaxonomy.ts` 与 `usCatalogTaxonomy.ts`；FRED项登记在 `fredCatalog.ts`。seed仅移动本篮子的15个key到两个子组，保留其他人工布局，并用updatedAt检查并发冲突。所有叶组低于48条。

NY Fed源地址不固定在2026Q3：每次读取当前报告下载链接，按季度选择最新文件。以标题、列名、源单位识别工作表，拒绝结构改动、重复季度或非法数值；同轮成员复用一次工作簿。存储复用 `runDataSubscription`、`upsertMacroObservations` 和统一版本账本；抓取时点证明不能冒充历史首发PIT。

货币基金序列显式登记1945-10-01历史起点；常规FRED空库回填会采用该起点，避免原默认1950年截断早期官方数据。日常修订窗口不受此空库起点设置影响。

## 运行与上线顺序

```powershell
npm run data:seed -- --catalog=consumer-pressure
npm run data:seed-release-packages -- --packages=us.bea.personal_income,us.frb.z1_household,us.philadelphiafed.consumer_credit,us.nyfed.household_credit
npm run data:sync-consumer-pressure
npm run data:verify -- --catalog=consumer-pressure --db
```

统一 registry 已登记 seed/verify，正常部署的 `data:apply` 会纳入。FRED复用现有生产运行时，不需要新适配器。

在新 NY Fed 适配器尚未部署的生产环境，先用 `data:seed-consumer-pressure -- --stage-nyfed` 暂停该源9条订阅，以本地新代码经SSH隧道运行 `data:sync-consumer-pressure -- --backfill-staged` 写入历史并记录抓取日志/版本。`data:verify-consumer-pressure -- --allow-staged-nyfed` 可明确检查这种准备状态，不能将其报告为生产自动更新已启用。代码部署后的默认seed会启用订阅，之后运行不带allow-staged的verify确认。

目录修改前备份位于香港 `/root/deploy-bak/consumer-pressure-layout-1794899315993.json`。本次未改schema，不需migration；未改系统模板、未发布新页面，也未部署代码。

## 官方依据

- [纽约联储当前家庭债务与信贷报告](https://www.newyorkfed.org/microeconomics/hhdc)
- [2026Q3官方报告](https://www.newyorkfed.org/medialibrary/interactives/householdcredit/data/pdf/hhdc_2026q3.pdf)，图13/14注明四季滚动合计。
- [NY Fed数据字典](https://www.newyorkfed.org/medialibrary/interactives/householdcredit/data/pdf/data_dictionary_HHDC.pdf)
- [活期存款与现金](https://fred.stlouisfed.org/series/BOGZ1FL193020005Q)、[其他存款](https://fred.stlouisfed.org/series/BOGZ1FL193030205Q)、[货币基金](https://fred.stlouisfed.org/series/BOGZ1FL193034005Q)
- [活跃账户使用率中位数](https://fred.stlouisfed.org/series/RCCCBACTIVEUTILPCT50)
