# 2026-10-15：20 条审计发现的更新机制调查

## 范围与边界

覆盖当日 15 条 discrepancy 与 5 条 unverified。本变更只复用既有 adapter、writer、seed、发布包，不新增数据源或事实表，不把审计人工提取的数字写入观测表。无 schema migration。代码合并部署不等于历史修复已经完成，仍需经既有连接器回读及逐项官方复核。

## 15 条差异

| 指标 | 根因与修复 |
|---|---|
| eurostat_es_gdp_real_index_sa | 官方 Q2 修订未随汇总日历触发；现有连接器重跑已恢复，GDP 包改官方 API 24 小时探测 |
| eurostat_it_gdp_real_index_sa | 同上 |
| eurostat_nl_gdp_real_index_sa | 同上 |
| eurostat_de_industrial_production_sa | 成员国 8 月已发布，汇总包日历尚未触发；重跑已恢复，工业包改 24 小时探测 |
| eurostat_es_industrial_production_sa | 同上 |
| pbc_cn_rmb_loan_amount | 全页首匹配错取社融实体贷款余额；银行贷款匹配排除该前缀 |
| pbc_cn_rmb_loan_cumulative | 同上，银行累计 11.52 万亿元不同于社融实体贷款 11.5 万亿元 |
| pbc_cn_rmb_loan_yoy | 当前同比碰巧相同，但同一串项机制必须修正 |
| treasury_mts_m01_receipts_fytd | 不再累加不同报告版本的月值；改读原报告当前财年 FYTD 小计 |
| treasury_mts_m01_outlays_fytd | 同上 |
| treasury_mts_m01_deficit_fytd | 同上 |
| usov_c06_wti | FRED DCOILWTICO 是 EIA 库欣现货，不是连续期货结算价；仅在实际订阅确认为该 ID 时由 seed 修正名称，保留观测和 ID |
| nymex_wti_futures | 盘中 Yahoo 日线 close 会变；仅该仪器启用完成时段策略，按上游实际 UTC session end +15 分钟确认，不按中国日历或固定纽约时刻猜测 |
| safe_cn_bop_00f0898e6481 | 明确为年度 SDR“1.A.b.8 知识产权使用费/借方”，补父级显示和语义校验，保持原 code/key |
| safe_cn_bop_02629c243ead | 明确为年度 USD“2.2.1 非储备性质的金融账户/负债”，同上 |

### Eurostat

只改变 GDP、工业生产两个发布包及同源 seed 规则，其他包不变。成员国发布与修订未必等到欧盟汇总日历，24 小时原 API 探测比只重跑一次更能防复发。不修改官方季调、指数基期、地域或已发布 estimate/revision 标记。

本次在 worker/calendar 双锁下通过原连接器完成 5 条重跑，11 个观测点写入/修订，两个层级 nextRunAt 均保持；随后独立官方 API 与观测库一致。生产当前排期仍为旧规则，新的 24 小时策略待部署 seed 生效。

官方接口说明：https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-detailed-guidelines/api-statistics

### 人民银行

合并公告先列社融，原先对全页“人民币贷款”首匹配把社融实体贷款当作银行口径。另修正季度标题被正文历史 M1 脚注日期覆盖的问题。保留旧公告的“各项贷款”、空白和 PDF 文字兼容。

上线后先有界重跑 3 条并核对 2026-09；历史重扫需额外核验旧脚注日期对应月份，不可认定仅最新值修正就消除了历史污染。不得直接删除或覆盖人工录入来源不明的历史行。

官方公告：https://www.pbc.gov.cn/diaochatongjisi/116219/116225/2026101417073743604/index.html

### Treasury FYTD

必须取该 record_date 下 `FY 2026` 的 S/SL 父行，再按 parent_id 定位 `Year-to-Date` T/SL 子行。上一财年对照行的 record_fiscal_year 也写 2026，单按该字段筛选会串项。FYTD 查询取消旧 MTH/D 过滤，金额直接读官方列，未再累加或派生。父级/累计行缺失或重复则报错，不回退为旧算法。

官方接口：https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/mts/mts_table_1

### SAFE

直接读取官方原工作簿测试了 1,686 条序列，两个被审阅成员 ID/key 与数值均不变。通用借方/贷方/资产/负债行显示最近的编号父级；seed 持久化 sourceRowPath，常规单条与发布包两条入口均验证语义。审阅成员缺失或父级变化须失败，防止 seed 将缺失成员直接清理、或 ordinal key 串项。当前策略是报错等待确认新映射，**不是擅自推断行序变化后的新 ID**。

官方工作簿：https://www.safe.gov.cn/safe/file/file/20260929/6674650e17de4f20a45c64610118a96f.xlsx

### Yahoo WTI

共享行情 transport 仅额外透传可选时段边界，不改变行情页的实时 bar，也不改变其他 Yahoo 宏观指标的现有行为。WTI 启用 `completedSessionsOnly`，缺少合法时段则失败，不退回猜测日期。Yahoo 连续 close 不是交易所最终 settlement。已存在的盘中观测不在本变更中删除，收盘后按既有修订窗口回读正式值；部署验收不能把旧盘中行尚存误报为该过滤器新写入。

## 5 条未确认

| 指标 | 深查结论与处理 |
|---|---|
| zillow_us_zori_sa | 正常的发布批次差异，不换源；见下节 |
| goldov_c23_comex_stock_oz | 既有历史-only、无自动订阅的接受项；没有抓取故障可重试。恢复自动更新须先确认授权，不绕过源站访问限制 |
| treasury_dts_daily_net_cash | 值为 TGA deposits − withdrawals，自算项；不应当作官方单字段基础序列 |
| treasury_mts_m09_mandatory_proxy | 自定义功能项求和，不能等同法定 mandatory 支出 |
| treasury_mts_m09_discretionary_proxy | 同上，不能等同法定 discretionary 支出 |

最后三条需要业务口径/模板迁移，而不是增加重试。当前 PR **不删除历史、不停用生产订阅、不改 admin 系统模板**；应另行确认保留哪些分析口径，再按仓库标准迁到模板指标运算或接入确切官方同口径数据。不得声称这三项已“官方核验通过”。

### Zillow 为什么报告先于完整数据下载

Zillow 官方现行日历明确区分：2026-10-06 发布 September Full Month Market Report / Market Dashboards；2026-10-16 发布 September Full Month Data Downloads。月度下载固定每月 16 日。

本次分别直接获取 sm_sa_month 与 sm_month 两个官方 CSV，均 HTTP 200，Last-Modified 分别为 2026-09-16 02:11:31 / 02:11:30 GMT，最后一列均为 2026-08-31。这与当前日历一致，并非有 9 月报告就必然有同口径完整 CSV。保持已确认的平滑季调链接及 72 小时探测；现有下次计划为北京时间 10 月 18 日 03:35 左右。此策略在正式下载发布后可能再延迟最多约 72 小时，属于探测频率，不是解析失败。

新闻稿数字不能替代季调文件，也不能把 sm_month 文件静默当作 sm_sa_month。若 16 日后现行官方下载已更新而旧季调链接未更新，才基于同口径证据处理迁移。

- 日历：https://www.zillow.com/research/calendar/
- 官方下载页：https://www.zillow.com/research/data/
- 方法：https://www.zillow.com/research/methodology-zori-repeat-rent/

## 验证与发布验收

新增回归覆盖：银行/社融串项、M1 脚注定期、FYTD 财年父级及增量窗口、Eurostat 包与 seed 排期一致、WTI 跨日时段/收盘缓冲/缺失时段、SAFE 父级漂移及原 key 保持。完整 `npm run verify:commit` 已通过：989 个测试，988 pass、1 个既有 skip、0 fail；schema validate、全量 lint、Next.js 生产构建和类型检查通过。

WTI 名称修正覆盖 Instrument 与代码兜底；admin 在线保存过的系统模板别名不在本次静默覆盖范围，若仍显示旧“结算价”应由 admin 在线更正。

合并部署后：先检查 `data:apply` 的 seed/verify，再通过既有连接器在 worker 锁下有界重跑并比较原源与 MacroObservation；生产重跑不得直接写审计提取数值。PBC/Treasury 历史修订回填应单独记录范围、观测改动量与重核结果，不能仅凭部署成功宣布历史已修复。
