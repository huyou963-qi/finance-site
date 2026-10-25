# 美股日频市场广度与风格（宏观数据库）

## 最新重建结果（2026-10-25，截至2026-10-23）

| 指标 | 有效日数 | 首个有效日 | 此后连续无缺口起点 |
| --- | --- | --- | --- |
| 50日均线上方占比 | 4490 | 2008-11-18 | 2009-01-13 |
| 200日均线上方占比 | 4376 | 2009-06-03 | 2009-06-03 |

相对2026-10-24分别新增715/702日，最新均为2026-10-23。50日早期仍缺2008-11-26、2008-12-11至2009-01-05、2009-01-08至2009-01-12，共20个交易日；各指标首个有效日以前仍未补齐。下文较早统计仅为阶段检查记录。

本次从Yahoo完整取回CVSA（8899条）、VIAV（8289条）、TNL（5099条）真实旧报价，修复历史成员ATGE/DV、JDSU/VIAV、WYN/WYND的价格选择。与2020年冻结归档逐日收益对照分别5093、5093、3449组，99%分位差不超过0.000000232；每个均线窗口仍在一个完整价格源内计算。DV在2021年后是另一个发行人，仅将2017-05-24以前的DeVry对应到CVSA。证券变更、核验与未补齐原因见[本轮调查记录](research/US_MARKET_BREADTH_HISTORY_RECOVERY_2026-10-25.md)。

随后追加Georgia Tech QSTK冻结Yahoo归档64组、134041条可用原始价格。旧CSV的Close未复权，不直接跨公司行动算均线；按Adj Close分币精度核验共同调整因子，排除可观测因子变化日与精度不足的低价日，严格连续窗口因缺口重新预热。现金分红变化也保守排除，不推断拆股/分红，不把Adj Close冒充拆股调整Close。仅在已核验无因子变化的片段内使用原始Close，均线比较对片段内统一价格刻度不变。

2010-01-04的200日覆盖已恢复至479/499（95.99%）；2008-09-15仍为458/498（91.97%），1995仍缺完整名单。没有降低95%门槛。复现命令：`npm run data:backfill-market-breadth-qstk`先核验，`-- --apply`写入隔离Q12价格键，再显式全历史重算。固定版本、逐文件git blob校验和排除日期保存在清单与回填报告；原项目许可见[QSTK许可](licenses/QSTK_LICENSE.txt)。

## 最新重建结果（2026-10-24，截至2026-10-23）

以下为本轮最终重算结果，后文较早检查记录仅作为过程留档。

| 指标 | 有效日数 | 首个有效日 | 此后无缺口的起点 |
| --- | --- | --- | --- |
| 标普500站上50日均线占比 | 3775 | 2011-09-26 | 2011-12-19 |
| 标普500站上200日均线占比 | 3674 | 2011-10-14 | 2012-04-02 |

2018—2022年的缺口已补齐。较早尚缺：50日指标2011-11-23至2011-12-16（17个交易日）；200日指标2011-11-01至2012-03-30（104个交易日），以及各自首个有效日之前的历史。1995年没有完整公开成分名单，早年退市股价格也不完整，继续留空；没有降低95%样本覆盖门槛。覆盖率序列各6044点，自2001-02-27开始。

四条日更代理最新为2026-10-23：小盘/价值各6641点（2000-05-30起）、质量3337点（2013-07-19起）、动量3400点（2013-04-19起）。官方French五条仍各7968点，1995-01-03至2026-08-31；官方文件按月发布与每日检查是两个不同频率。日更代理在既有宏观目录“美股日更风格代理”选取，不能从原官方因子列自动替换。

全部进入现有 Instrument / MacroObservation / DataSubscription / FetchRun / 版本账本；没有独立页面或专用页面API，不新增schema。
宏观目录：美国 → 利率与信用市场 → 美股风格因子（日频）/ 美股市场广度（日频）。
按用户明确要求，把计算型广度保存在宏观库，并用metadata标明衍生属性与方法，不冒充源方原始发布指标。

## 序列

| code | 含义 | 频率 |
| --- | --- | --- |
| ff_us_smb_daily | 小盘减大盘；五因子版本SMB | 日 |
| ff_us_hml_daily | 价值减成长；高减低账面市值比 | 日 |
| ff_us_rmw_daily | 强盈利减弱盈利；不等同完整质量因子 | 日 |
| ff_us_cma_daily | 保守资产投资减激进资产投资 | 日 |
| ff_us_mom_daily | 赢家减输家；动量 | 日 |
| breadth_us_sp500_above50_daily | 当日成员站上50交易日均线的有效样本占比 | 日 |
| breadth_us_sp500_above200_daily | 当日成员站上200交易日均线的有效样本占比 | 日 |
| breadth_us_sp500_coverage50_daily | 连续50交易日有效价格样本数/当日成员数 | 日 |
| breadth_us_sp500_coverage200_daily | 连续200交易日有效价格样本数/当日成员数 | 日 |

单位全部为%。官方风格是源方每日多空因子收益，不是月频值填充、ETF净值或累计收益。
周末、休市日、未完结交易日不制造观测。周频研究可以从日频观测另行聚合，但广度适合周末截面，风格是收益序列，不能把两者均值都当作周收益。

## 来源、覆盖与频率

风格：[Kenneth R. French Data Library](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html)，Copyright Eugene F. Fama and Kenneth R. French。
取官方 `F-F_Research_Data_5_Factors_2x3_daily_CSV.zip` 与 `F-F_Momentum_Factor_daily_CSV.zip`，自1995-01-03回填。
**观测为日频，但源方通常按月更新日频文件。每天检查不等于当天就有昨日因子数据。**
2026-10-15实测五项各7968点，最新2026-08-31。缺失哨兵不入库，历史不伪装成首发PIT。
风格每天完整回读1995年以来历史以捕获修订；进程内共享两份下载，避免五项重复下载。

广度使用Yahoo拆股调整、未含现金分红的收盘价，并以Quandl WIKI公开历史归档补充退市股价格。每个50/200日窗口单独在一个来源内计算，不拼接两个来源的价格刻度。
历史成分改用[fja05680/sp500](https://github.com/fja05680/sp500)的开放历史名单，固定commit `a2430f2af0c79ddf0748e91de11bdeb1616ab5a7`；原文件SHA256与压缩后的初始名单/695次变更保存在`sp500History.json`，MIT署名与许可随仓库保存。
其首份快照为1996-01-02，只有487个证券；作者明确早年名单可能有遗漏。因此1995年保持空缺，不能向前外推。名单规模不足495的日期不发布计算值。
当前名单：[List of S&P 500 companies](https://en.wikipedia.org/wiki/List_of_S%26P_500_companies)；历史已拆到[Historical components](https://en.wikipedia.org/wiki/Historical_components_of_the_S%26P_500)。兼容旧同页表和新历史表末尾Refs第7列。
2026-08-18以后的成分以历史名单为基准向前应用Wikipedia生效日事件，并按已核验的同一证券代码变更归一；桥接结果必须与当前名单一致，有无法解释的差异则拒绝计算。不能把在线失败直接回退为陈旧名单；只有显式`--packaged-membership`历史回填模式可用打包快照，绝不越过其锚点。

### 香港增量更新与本地历史迁移（2026-10-17）

本地在线核验成功时，自动保存含HTML哈希、抓取时间及锚点的`.data/market-breadth-sources/membership-baseline.json`，随本地已计算观测及归档价格显式迁入香港，运行缓存不进Git。香港已导入1,256,022条归档日线及四项广度历史；1995缺口不会因此自动消失。
2026-10-17再次迁移并逐序列核对内容哈希一致：50日占比2,424点、200日占比2,300点，两项样本覆盖率各6,039点；均最新至2026-10-16。服务端迁移日志为`/opt/finance-site/logs/history-transfer-20261017.log`。

香港Wikipedia仍可能返回403。此时使用现有State Street官方SPY每日持仓下载器进行**独立核对**：上市股票代码必须与已核验指数基线逐项一致，持仓日期不得来自未来或超过5个自然日；现金、期货及非上市CVR权益不作为指数股票。只确认持仓文件明确标注的日期，不将该日的相同集合倒填到基线之后其他未核验日期，也不将ETF调仓当作指数历史变更事件。若股票集合变化、文件过期或基线损坏，则停止本轮更新，等待刷新指数名单。

2026-10-24起，日常广度adapter在回看窗口内插入所有可核验的缺失日期，保留已有历史值，FetchRun记录`insertMissingOnly`与`existingDates`。原先只追加最新日期的逻辑会永久跳过延迟到齐的日期，已修复。历史值修订仍需显式重算。基线以外仅更新独立校验当天的新值；该模式禁止`--replace-history`清理历史，避免删除以前已核验日期。每次FetchRun记录原Wikipedia错误、基线日期、SPY持仓日期、来源和独立核验标记。行情仍由香港Yahoo链路更新，覆盖率不足95%仍不发布。

2026-10-17实测：香港Wikipedia GET为403；State Street持仓文件GET为200，文件截至2026-10-15，503只上市股票与本机当天在线核验名单一致。该文件不能用于宣称2026-10-16已经核验或生成更晚观测。
2026-10-17提交门禁通过：1025项测试通过、1项平台测试跳过，Prisma校验、ESLint、生产构建与98页生成完成。新增测试覆盖403独立校验、成分差异、过期/未来日期和未核验日期不得倒填。
随后补充只追加新日期的adapter回归测试，完整门禁1027项通过、1项平台测试跳过。香港网站`.data/market-breadth-sources`链接到调度检出的同一运行目录，管理端与cron共享名单基线。历史恢复核验见`/opt/finance-site/logs/history-restore-20261017.log`，四条内容哈希再次与本机一致。

成分在生效日切换；不把月末名单倒填到月初。公开重建名单可能遗漏或存在代码复用，不是官方无偏PIT股票池。95%覆盖率约束价格样本充分性，不能证明名单无偏。
原先仅从当前名单撤销Wikipedia Selected changes的算法已替换：缺少加入事件时，它会把后来上市的证券反推到1995年。不能把该算法的价格覆盖率当作真实历史成分覆盖率。

2026-10-15旧算法的有效起点为2022-10-12 / 2022-11-01。这是替换前的记录，修订后须以verify实际输出为准；全量重算会备份并撤回旧算法中不再满足新口径的观测，不能保留错误的旧值制造连续历史。

计算前复用 `ensureDailyBars`，同步SPY和当前成员最新日线；过去已移出证券的历史价格读既有库和归档。WIKI归档用`WIKI:<原代码>`独立存入`mds.equity_daily_bar`，source=`quandl_wiki`，拆股事件存`mds.equity_split`；不会覆盖或标记Yahoo代码已完整回填，避免ALTR等被复用代码混入新公司价格。
按SPY日历核对连续50/200交易日，缺一天重新预热，不前向补齐陈旧价格。当天价格必须存在，按纽约日期排除当日未完结bar。
成员规模需495—510且有效样本覆盖至少95%才发布相应占比；覆盖率另行入库，解释历史空白。
均线比较有浮点容差，广度/覆盖率保留6位小数，避免浮点噪声产生假修订。

## 每日自动更新与部署

### 1995年历史缺口专项核验（2026-10-15）

本节保留替换前的排查结果，仅解释旧算法为什么失败；以下表格不是2026-10-16回填后的覆盖率。新口径请运行专项audit。

**1995年回填尚未完成。已有计算起点是1995年，不能把计算起点当成占比可用起点。**
以下是当前公开变更表重建名单的价格窗口覆盖率，只用于排查缺口，不代表官方历史成分已核验完整：

| 核验日 | 50日价格窗口覆盖 | 200日价格窗口覆盖 |
| --- | --- | --- |
| 1995-01-03 | 50.70% | 50.50% |
| 2000-01-03 | 58.80% | 58.40% |
| 2008-09-15 | 68.46% | 67.47% |
| 2015-01-02 | 77.69% | 77.49% |
| 2020-03-23 | 90.91% | 90.91% |
| 2022-10-12 | 95.04% | 94.84% |

1995核验名单有248个证券缺少完整窗口，其中136个在现有行情库完全没有价格；107个现有代码历史始于核验日之后。这不只是价格漏抓：Selected changes并非完整历史账本，缺失加入事件会把后来上市的成员错误反推到1995年，复用代码还可能关联另一家公司。因而95%门槛只能约束行情覆盖，不能代替成分与证券身份核验。已修复`ALLE |`/`JCP |`这类末尾分隔符导致的事件解析遗漏，但不能据此宣称补齐历史名单。

已配置FMP历史接口小样本探测返回HTTP429 / Limit Reach，未取得额外退市股数据。不能假设已有授权足以覆盖退市历史，也不自动购买数据。完整延伸到1995年需要同时补齐可核验的逐日成分记录、退市股与证券身份映射，以及1995年以前至少200交易日预热价格；不以当下存续股、降低门槛或复制数据替代。

运行`npm run data:audit-market-breadth-history`生成`.data/market-breadth-history-audit.json`，逐证券列出缺失窗口、现有价格起止和Yahoo查无记录状态。输出为本地核验材料，不提交行情数据。

### 公开退市股归档回填（2026-10-16）

归档为[Quandl WIKI的Kaggle版本1镜像](https://www.kaggle.com/datasets/marketneutral/quandl-wiki-prices-us-equites)，只使用已停止更新的WIKI开放数据，不使用付费EOD数据。[Quandl创始人的开放数据条款](https://evan597.wordpress.com/author/evanquandl/)及[原API元数据中的public-domain声明](https://quandl4j.org/)说明WIKI开放数据可自由使用；Kaggle镜像本身的license字段为Unknown，不把该字段当作新增授权。
固定ZIP SHA256：`adfd226694c6f3ec2c56b585d973764180a39a3ec516601721e90096dc1de94f`。下载、转换和导入均留本地manifest；源版本变化时拒绝自动导入。
转换保留1993年以来可用价格以提供预热，按照官方`split_ratio`反向累计，只做拆股调整；缺失收盘价跳过并使均线窗口重新预热，未发布值不填充。源归档最新不超过2018-03-27，它不能单独解决2018年之后退市证券的缺价。

```powershell
# 首次部署历史数据：需要Python 3.11+标准库、约2GB临时空间，ZIP下载约463MB
npm run data:backfill-market-breadth-prices -- --prepare --dry-run
npm run data:backfill-market-breadth-prices
npm run data:seed-market-internals
npm run data:sync-market-internals -- --cached-prices --breadth-only --replace-history
npm run data:audit-market-breadth-history
npm run data:verify-market-internals -- --db
```

`--replace-history`仅用于显式完整重算，先保存旧无效观测的JSON备份，再从当前观测表撤回；清理上限为已核验名单锚点与行情日期的较早值，不得误清理更晚已有观测。已有版本账本仍保留抓取记录。日常worker继续按24小时计划更新，归档为冻结版本，不每天重新下载463MB。云端同样需要执行上述历史回填命令，单纯seed不会搬运本地归档行情。

### 中断恢复后的实测结果（2026-10-16）

归档回填252只证券、1,262,376条日线，重启后再次核对实际数据库数量一致，无需重下载或重导。
发现旧在线回退路径曾把计算截断在打包快照的2026-07-19锚点；现已取消隐式回退、限制历史替换范围，并重算恢复近期62个交易日。正式worker再次刷新4条订阅，全部成功，最新到2026-10-15收盘。

| 序列 | 有效观测数 | 首个有效观测 | 最新观测 |
| --- | --- | --- | --- |
| 50日均线上方占比 | 2423 | 2011-10-14 | 2026-10-15 |
| 200日均线上方占比 | 2299 | 2012-04-10 | 2026-10-15 |
| 50日窗口覆盖率 | 6038 | 2001-02-27 | 2026-10-15 |
| 200日窗口覆盖率 | 6038 | 2001-02-27 | 2026-10-15 |

**以上起止日期不代表中间连续。** 两条占比2013—2016各年均252个有效交易日；2011—2012、2017、2023仍有不足门槛的日期。200日占比2018—2021无有效观测，50日占比2018仅45点、2019—2021无有效观测，两者2022仅年末6点。必须保留这些空缺。
已入库归档在2017-11-08缺少当时交易证券的日线，直接查看原ZIP的AET/AGN/ALXN也均无该日，导致其后均线窗口重新预热；这不是本地转换漏行。源归档2018-03-27停止更新，又缺2018年后退市证券的剩余历史，因此无法补出连续的2018—2022占比。
1995缺可核验名单，1996名单仅487只且200日价格覆盖仅约47.64%；2000约60.29%、2008约86.14%、2010约91.38%、2015约99.00%。完整1995年至今的目标仍未实现，禁止把部分回填标为完成。专项audit输出保留逐证券缺口以便后续接入可信来源。

- 数据源：`market-internals-french` / `market-internals-breadth`。
- 发布包：`us.french.daily_style_factors` / `us.gekkotech.daily_market_breadth`。
- 订阅：`DAILY`、French `probe_interval: 24h`、广度/代理 `probe_interval: 6h`、`bootstrapOnly: false`、获取方式known。
- 复用正式调度器：现有 `finance-site-data-scheduler.cron` 每5分钟运行worker，处理到期订阅；不另建Codex提醒或独立采集系统。
- 已登记统一seed/verify registry，部署时`data:apply`自动纳入。
- 广度日常补缺且保留已有值（计算附400自然日预热），官方风格完整回读、ETF代理日常回读最近两个月；广度历史价格/名单修订时显式全量sync。
- 行情刷新失败记录FetchRun失败；缺失退市价格不靠存续股替代，不填零、不复制旧值。

```powershell
npm run data:seed-market-internals
npm run data:seed-release-packages
npm run data:sync-market-internals
npm run data:rebuild-global-catalog-layout
npm run data:verify-market-internals -- --db
```

历史回填可显式只读现有行情：

```powershell
npm run data:sync-market-internals -- --cached-prices
# 只用已打包历史名单，不延伸至其锚点以后
npm run data:sync-market-internals -- --cached-prices --packaged-membership
```

核验正式调度路径：

```powershell
npm run data:worker -- --source=market-internals-french --force --limit=5
npm run data:worker -- --source=market-internals-breadth --force --limit=4
```

本地执行仅修改本地连接的库；云端需部署代码并运行data:apply后生效。
阿里云需按上述独立日度核对路径处理Wikipedia不可用；两个来源均不可用时任务明确失败并重试，不延用陈旧名单冒充每日新数据。

## 本轮验证

2026-10-15初版生产构建通过。2026-10-16中断恢复后，改动文件ESLint、类型检查、数据库核验及16项相关测试通过；新增在线失败禁止旧快照回退、旧快照不得清理未来观测的回归测试。
2026-10-16正式worker刷新广度4项全部成功；日常订阅仍为DAILY/24小时探测。年度有效点数可用`npm run data:verify-market-internals -- --db --history`复核。
本机清理旧`.next`缓存被自动审批策略拒绝；受控构建先后触发内存上限与旧目录Webpack哈希错误。最终使用项目要求的Node 20.20.2、单worker、2GB堆和独立`.data/market-breadth-next-20261016`输出目录，完整生产构建成功（exit 0，98页静态生成及路由检查完成）。临时`next.config.ts`/`tsconfig.json`变动已撤回，不把运行时或构建目录配置写入正式代码。
构建结果记录于`.data/market-breadth-build-result.json`，数据库恢复核验记录于`.data/market-breadth-recovery-check.json`。上述记录为发布前本地结果；实际发布状态以GitHub Actions部署结果与香港服务器核验日志为准，本机没有新建Windows计划任务。
提交门禁排除`.data/**`运行缓存，避免扫描历史归档与本地独立构建产物；源码仍执行全量测试、Prisma校验、ESLint与生产构建。
2026-10-16合入远端main后，`npm run verify:commit`完整通过：1021项测试通过、1项平台测试跳过，Prisma、ESLint、生产构建与98页生成通过；使用上述本机独立输出目录，临时配置已恢复。


## 2026-10-24：每日风格代理与广度补缺

French 两份源 ZIP 实测仍最新至 2026-08-31，保持官方五条序列及按日检查。新增独立目录「美国 → 利率与信用市场 → 美股日更风格代理」，不新建页面、不拼接官方数据：

| code | 收益差 | 口径 |
| --- | --- | --- |
| style_proxy_us_size_daily | IWM − SPY | 小盘减大盘 |
| style_proxy_us_value_daily | IWD − IWF | Russell 1000 价值减成长 |
| style_proxy_us_quality_daily | QUAL − SPY | 质量减大盘；不是纯盈利 RMW |
| style_proxy_us_momentum_daily | MTUM − SPY | 动量减大盘；不是赢家减输家 Mom |

计算 `100 * (adjClose_long[t] / adjClose_long[t-1] - adjClose_short[t] / adjClose_short[t-1])`，单位 %（两个百分比收益之差）。使用既有 Yahoo 行情下载器与价格库，每轮完整回读六只 ETF，以保持历史复权尺度一致，避免跨增量批次边界产生假收益；两只 ETF 均须在相邻 SPY 交易日有有效价格，缺价不跨日、不填零。起点为 ETF 实际可用历史，不能伪称始于 1995。质量选择参照 [iShares QUAL 说明](https://www.ishares.com/us/literature/fact-sheet/qual-ishares-msci-usa-quality-factor-etf-fund-fact-sheet-en-us.pdf)：高 ROE、稳定盈利及低债务。CMA 是资产投资因子，未新增未经验证的 ETF 替代。

代理源 `market-internals-proxy`、发布包 `us.gekkotech.daily_style_proxies`；广度及代理每 6 小时探测，沿用现有五分钟 worker。纽约时间 18:00 后纳入当天已收盘行情，留出发布缓冲；此前仅使用更早日期，交易日取真实 SPY 日线，不生成节假日观测。行情提供方迟到时后续轮次重试。

香港独立核验会保存按基线日期和 HTML SHA256 隔离的日度凭证 `.data/market-breadth-sources/confirmations/`；只使用已逐项核对的具体日期。这样价格延迟到齐后仍可补算已确认日，不会推断两个相同名单端点之间必然无变更。名单变化仍要求刷新历史变更基线。

`--cached-prices` 全历史补缺将本次运行的回看窗口扩至 1000 月，解决通用 runner 的两月写入边界截断全历史结果的问题；默认只插缺，只有显式 `--replace-history` 才重写并清理旧值。补历史与日常 worker 均经正式入库路径，保留抓取和版本账本。

本轮原始数据复核：1995 无名单；1996-01-02 仅 487 只；2008-09-15 的 200 日覆盖 86.14%；2018-03-01 为 84.19%；2020-03-23 为 89.50%；2022-10-12 为 94.23%。仍低于 95% 的历史日期留空。FMP 合法单次探测仍返回 429 Limit Reach，Nasdaq WIKI API 返回 403，未循环重试。完整 1995 年至今的无缺口历史尚不能宣称完成。


本机本轮补缺后：50日占比 2,429 点（2011-10-14起）、200日占比 2,305 点（2012-04-10起）、两条覆盖率各 6,044 点（2001-02-27起），最新均为 2026-10-23。全历史重读未发现还能用现有原始行情补出的更早占比，不能把此次近期漏日修复称为1995年以来历史完整。


后续逐证券复核发现可修复的更名映射：MMC→MRSH（同一公司及CUSIP；[公司2025-12-29公告](https://www.marsh.com/en/corp/about/news/marsh-mclennan-to-change-nyse-symbol-to-mrsh.html)），HCP→PEAK→DOC（Healthpeak存续股票；[2019年更名8-K](https://www.sec.gov/Archives/edgar/data/765880/000076588019000006/form8-kxnamechangeandp.htm)、[2024年合并完成8-K](https://www.sec.gov/Archives/edgar/data/765880/000110465924029661/tm247564d1_8k.htm)）。Yahoo现DOC提供自1985年起Healthpeak历史，MRSH提供自1973年起Marsh历史。已补齐同一公司的别名映射，使用各自完整来源窗口重算；不把Physicians原DOC或被并购消亡公司价格移接到存续方。


更名修复后的最终本机回填：50日占比 2,502 点，200日占比 2,388 点，分别比修复前多 73/83 日；最新均为 2026-10-23，起点仍为 2011-10-14 / 2012-04-10。对应历史占比及覆盖率同时重算，避免覆盖率与占比分母不一致，旧快照已备份；2023年初断档已补回。1995年以来仍非完整历史，缺失名单及未恢复的退市证券价格继续留空。


香港实际代理 worker 已验证 4/4 成功。Yahoo 复权数值跨次下载存在极小舍入变化（本轮最大约0.000232个百分点，最新值一致）；代理日常仅修订最近两个月，避免无意义地反复改写数十年历史。首次导入和显式全历史任务仍覆盖ETF全部真实历史，French继续完整回读。行情下载仍完整获取六只ETF，保证每个收益窗口的复权尺度一致。


### 公开Yahoo冻结归档扩充与代码复用隔离

追加核验 [Jackson Crow / Oleh Onyshchak 的 Stock Market Dataset](https://www.kaggle.com/datasets/jacksoncrow/stock-market-dataset)，固定版本2（2020-04-02发布，截至2020-04-01），Kaggle官方metadata声明 CC0: Public Domain；逐文件保留原始CSV及SHA256。它是Yahoo拆股调整Close和分红复权Adj Close的历史冻结副本。只使用2016-01-01起的记录，限定2016—2020期间实际指数成员候选，并只向完全空的价格键写入，不与已有不同刻度价格拼接。NaN/空单元格不补值，逐股与WIKI重叠期收益核对后才回填。仍可在线获取的历史成员（CCEP、DXC、FBIN）优先完整获取真实Yahoo日线。

发行人代码复用必须隔离：旧Paramount/VIAC使用 `LEGACY:PARA`，旧L Brands使用 `LEGACY:LB`；现代PARA（Banzai/Parabolic）和LB（LandBridge）的价格不能回溯用于旧指数成员。证据：[Banzai 2026-10-16 8-K](https://www.sec.gov/Archives/edgar/data/1826011/000143774926033292/para20261016_8k.htm)、[LandBridge 2024年10-K](https://www.sec.gov/Archives/edgar/data/1995807/000095017025034049/lb-20241231.htm)、[L Brands 2021-08-03更名8-K](https://www.sec.gov/Archives/edgar/data/701985/000114036121026658/nt10026698x7_8k.htm)。隔离只作用于历史广度价格选择，当前股票K线继续使用现行代码。


第二份CC0公开归档固定为 [Larxel S&P500 Stocks](https://www.kaggle.com/datasets/andrewmvd/sp-500-stocks) 版本300，实际数据截止2022-12-15。原始文件SHA256、版本URL、逐股覆盖和跨源收益核对保存在运行缓存manifest；2020、2022两份归档分别落 `Y20:` / `Y22:` 独立价格键，每个50/200日窗口只选一个完整价格键。2020归档只用2016起的价格；2022归档自2010起，上市前NaN不入库。Arconic冻结文件存在拆分当日发行人切换，隔离到Q20，不用于旧母公司；旧母公司使用真实HWM历史。原Allergan在2015并购前不能使用Actavis的WIKI:AGN历史，未找到旧发行人报价的日期明确缺失。

CTL→LUMN见 [2020年三季报](https://www.sec.gov/Archives/edgar/data/18926/000001892620000028/ctl-20200930.htm)；MYL→VTRS见 [Nasdaq公司行动公告](https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2020-208)，旧股一比一换新股。历史价格选择只在旧股票实际成员期读取数据商保留的真实旧报价，并经WIKI重叠期收益核对；没有把合并后的新公司价格向前复制。专项audit同步使用全部价格键及发行人守卫，不能再只查Yahoo/WIKI而漏算两份冻结归档的覆盖。


补充的旧报价连续性：BBT→TFC、BHGE→BKR、TMK→GL、旧IR→TT、DISCA A类→WBD，均在历史成员有效期选择真实旧报价。每组已对560个左右重叠收益核对，median差异约2e-8；DISCK C类与WBD中位差约0.0022，明确不映射。旧TT（2008被收购的Trane）亦不得使用2020更名后的新TT历史。企业行动证据：[Baker Hughes 2019年报](https://investors.bakerhughes.com/files/doc_financials/2019/2019_Baker-Hughes-Annual-Report.pdf)、[Globe Life公告](https://investors.globelifeinsurance.com/news-releases/2019/august/torchmark-corporation-has-officially-been-renamed-globe-life-inc?accessibility=true)、[Nasdaq Discovery企业行动](https://www.nasdaqtrader.com/TraderNews.aspx?id=ECA2022-63)。Larxel早期版本1/2的宽表缺少日期列，未将其按顺序猜测为交易日，明确不入库。


CBS存续B类股2019-12-05改用VIAC，后改PARA；历史CBS使用已核对旧报价的LEGACY:PARA冻结价格，而不使用新Banzai报价。原VIAB未映射为CBS。BBT存续关系见 [Truist 2019年报](https://www.sec.gov/Archives/edgar/data/92230/000009223020000045/tfc-20191231.htm)；旧IR→TT见 [2020-03-02 8-K](https://www.sec.gov/Archives/edgar/data/1466258/000114036120004470/nc10009348x1_form8k.htm)。
