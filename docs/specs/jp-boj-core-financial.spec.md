# 日本 BOJ 核心资金循环、短端利率与汇率

状态：data-ready（2026-09-14，本地官方实时源与数据库待共享接线后完成最终验证）。范围为 10 条；其中 8 条资金循环、1 条政策操作目标代理、1 条美元兑日元月均。

## 1. 范围与复用门

全仓搜索 BOJ、FRED、e-Stat、既有 `jpov` 和目录布局后，没有找到下列 10 条同代码、同单位、同频率和同口径序列。现有 `boj_jp_bank_loans` 是银行放贷余额，不能替代资金循环的非金融企业负债；既有日本国债曲线也不能替代短端政策操作目标。

复用现有 `boj-time-series` DataSource、BOJ API client/parser、统一 Instrument / DataSubscription / MacroObservation / MacroObservationVintage / FetchRun。新增独立 catalog 和 adapter 入口，不建新表，不保存本站计算出的合成序列。

## 2. 官方来源与逐条核实

- BOJ Time-Series API：[API 服务公告](https://www.boj.or.jp/en/statistics/outline/notice_2026/not260218a.htm)、[API 手册](https://www.stat-search.boj.or.jp/info/api_manual_en.pdf)
- 资金循环：[BOJ 官方发布页](https://www.boj.or.jp/en/statistics/sj/)；数据库 `FF`
- 短端利率与外汇：[BOJ 主要时序清单](https://www.stat-search.boj.or.jp/info/nme_Mdframe_en.html)；数据库 `FM02`、`FM08`
- 获取端点：`/api/v1/getMetadata` 与 `/api/v1/getDataCode`

逐条保存 2026-09-14 官方元数据及实时响应 fixture。下表起止期和条数来自同日 live 响应。

| 本站 code | BOJ数据库/series | 官方英文名称 | 单位/频率 | 首末观测 | 条数 |
|---|---|---|---|---:|---:|
| `boj_jp_fof_household_financial_assets` | `FF / FOF_FFAS430A900` | Assets/Total/Households/Stock | 亿日元/季度 | 1997Q4–2026Q1 | 114 |
| `boj_jp_fof_household_currency_deposits` | `FF / FOF_FFAS430A100` | Assets/Currency and deposits/Households/Stock | 亿日元/季度 | 1997Q4–2026Q1 | 114 |
| `boj_jp_fof_household_equity_investment_fund_shares` | `FF / FOF_FFAS430A334` | Assets/Equity and investment fund shares/Households/Stock | 亿日元/季度 | 1997Q4–2026Q1 | 114 |
| `boj_jp_fof_nonfinancial_corporations_financial_liabilities` | `FF / FOF_FFAS410L900` | Liabilities/Total/Nonfinancial corporations/Stock | 亿日元/季度 | 1997Q4–2026Q1 | 114 |
| `boj_jp_fof_nonfinancial_corporations_loan_liabilities` | `FF / FOF_FFAS410L200` | Liabilities/Loans/Nonfinancial corporations/Stock | 亿日元/季度 | 1997Q4–2026Q1 | 114 |
| `boj_jp_fof_general_government_debt_securities` | `FF / FOF_FFAS420L300` | Liabilities/Debt securities/General government/Stock | 亿日元/季度 | 1997Q4–2026Q1 | 114 |
| `boj_jp_fof_general_government_net_financial_position` | `FF / FOF_FFAS420L700` | Liabilities/Difference between financial assets and liabilities/General government/Stock | 亿日元/季度 | 1997Q4–2026Q1 | 114 |
| `boj_jp_fof_overseas_net_financial_position` | `FF / FOF_FFAS500L700` | Liabilities/Difference between financial assets and liabilities/Overseas/Stock | 亿日元/季度 | 1997Q4–2026Q1 | 114 |
| `boj_jp_uncollateralized_overnight_call_rate_monthly_average` | `FM02 / STRACLUCON` | Call Rate, Uncollateralized Overnight/Average | %/月 | 1985-07–2026-08 | 494 |
| `boj_jp_usd_jpy_monthly_average` | `FM08 / FXERM07` | US.Dollar/Yen Spot Rate at 17:00 in JST, Average in the Month, Tokyo Market | 日元/美元/月 | 1973-01–2026-08 | 644 |

## 3. “BOJ政策利率”的严谨替代

BOJ 的政策框架经历官方贴现率、无担保隔夜拆借利率目标、量化宽松、负利率、收益率曲线控制和当前短端利率引导。BOJ API 没有一条可以无断点表示所有时期“会议目标值”的连续基础序列。

因此本批不伪造 `policy_rate`，采用 BOJ 直接公布的 `STRACLUCON`，名称明确写为“无担保隔夜拆借利率（月均，政策操作目标代理）”。它是实际市场成交利率，不是会议声明目标；当前政策通过引导该短端利率实施，因此是可持续且可跨期比较的最接近官方基础事实。基本贷款利率 `IR01/MADR1M` 是常备贷款工具利率，不能标成当前政策利率，故未选。

## 4. 口径、断点与符号

- 资金循环 8 条均为 BOJ 直接发布的季度期末存量。股票及投资基金份额 `A334` 是官方直接合计，不由本站相加。
- 资金循环在 2004Q4/2005Q1 从 1993SNA 转为 2008SNA。所有选中序列的官方元数据均标示断点；居民总资产、股票及基金、非金融企业总负债、政府和海外差额还受具体编制方法变化影响。数据库保留原值和断点，不平滑、不拼接。
- `L700` 是 BOJ 名为 “Difference between financial assets and liabilities” 的带符号官方序列。一般政府 2026Q1 为 `-4,202,984` 亿日元，海外部门为 `-5,464,064` 亿日元；本站不自行反转符号。
- 海外部门资金循环差额是海外部门视角的金融头寸，不能与年度净国际投资头寸统计直接混同。
- 美元兑日元为东京银行间市场 17 时即期汇率的月平均，每美元日元数。

## 5. 订阅、修订与下次更新

| 发布包 | 成员 | 机制 | 下次更新证据 |
|---|---:|---|---|
| `jp.boj.flow_of_funds_core` | 8 | `probe_interval` 168小时；每次完整回读全历史；本次已知官方时刻由域同步脚本提前对齐 | BOJ 公告：2026Q2 速報于 **2026-09-17 08:50 JST / 07:50 HKT** 发布，即 `2026-09-16T23:50:00Z` |
| `jp.boj.call_rate_monthly` | 1 | `probe_interval` 24小时；完整回读 | 官方没有为 API 月汇总单列稳定的未来精确时刻；最新 2026-08、API 元数据更新 2026-09-03，按日探测 |
| `jp.boj.foreign_exchange_monthly` | 1 | `probe_interval` 24小时；完整回读 | 官方没有为 API 月汇总单列稳定的未来精确时刻；最新 2026-08、API 元数据更新 2026-09-03，按日探测 |

资金循环通常会在季度速報和年度追溯修订时改写历史。所有请求抓完整官方历史，由统一写入器只更新变化值并追加 retrieval-time vintage。该账本证明本站抓取时点所见版本，不是历史首发 PIT。

## 6. 目录位置

- 居民与非金融企业：`金融条件与银行 / 资金循环：居民资产负债表`、`资金循环：非金融企业`
- 一般政府：`财政与公共债务 / 资金循环：一般政府`
- 海外部门和汇率：`对外与汇率 / 资金循环：海外部门`、`汇率`
- 无担保隔夜利率：`利率与信用市场 / 政策利率与短端利率`

目录 key 均为 `mds:<instrumentCode>`。共享 taxonomy 需按 `JP_BOJ_CORE_SERIES` 的 category/subgroup 接线；末端均远低于 48 条。

## 7. 完成清单

- [x] 全仓查重并核实没有同口径可复用序列
- [x] 逐条用 BOJ `getMetadata` 核实 series code、官方名称、单位、频率、起止期、更新时间和备注
- [x] 保存官方 metadata 与 10 条实时响应 fixture，并验证全历史连续性、负值与零值不丢失
- [x] 建独立 catalog、adapter、seed、sync、verify 和解析回归测试
- [x] 明确政策利率代理的限制，不把基本贷款利率或市场成交利率伪装成会议目标
- [ ] 共享 registry、package scripts、dispatcher、发布包和 taxonomy 接线（由汇总 agent 完成）
- [ ] 本地 seed/live sync、首次 vintage、幂等重跑、DB verify（待共享接线后执行）
- [ ] 香港部署、回填与生产订阅/nextRunAt 抽查

本域不发送 BOJ API 服务上线通知邮件；现有 BOJ source metadata 已保留 `apiServiceReleaseNotificationRequired` 标记。
