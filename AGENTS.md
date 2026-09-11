# AGENTS.md — AI 与开发者上下文

本文件供 **Cursor / Copilot 等 AI** 与新人快速理解仓库。协作流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 项目是什么

本地/内网部署的金融数据站：**宏观仪表盘**（ECharts + PostgreSQL/FMP/FRED）+ **美股 K 线行情**（Lightweight Charts + Yahoo Finance，全美股日线落库 + 精确复权）+ **美股行业**（GICS Sector ETF / 财报 / 经营叙事）+ 用户认证与部分工具页。

## 仓库结构

```
finance-site/
├── src/app/              # 页面 + API Route Handlers
│   ├── macro/            # 宏观主功能（最大模块）
│   ├── markets/          # K 线
│   ├── equity/           # 美股行业（GICS）
│   ├── api/data/         # 宏观、K 线、目录 BFF
│   ├── api/equity/       # 行业、财报、经营简报 ingest
│   ├── api/auth/         # 登录注册
│   └── api/tools/        # 模板偏好等
├── src/components/       # Macro*、Candlestick*、图表叠加
├── src/lib/data/         # 数据层（K 线 providers、macro、目录）
├── src/lib/equity/       # GICS / 风格篮子 / 行业收益与财报
├── prisma/               # schema + migrations
├── scripts/              # 导入/ETL（tsx）；scripts/equity/*
├── .cursor/rules/        # 团队共享 Cursor 规则（必跟）
└── .github/              # PR 模板、CI
```

## 关键数据流

### 宏观

1. 浏览器 → `GET /api/data/macro?source=unified`（或 observations）
2. 服务端读 `FMP_API_KEY` / DB `mds` 观测表
3. `MacroSection` + `macroChartOption.ts` 渲染 ECharts

### K 线（美股，全部落库）

1. 浏览器 → `GET /api/data/klines?symbol=AAPL&interval=1d&adjust=forward|backward|none`
2. `yahooKlineProvider` → `equityPriceStore`：db-first 读 `mds.equity_daily_bar`，缺口回补 Yahoo；日/周线服务端按 `mds.equity_split` + 分红因子**精确复权**（`priceAdjustment.ts`），盘中 15m/1h/4h 实时取
3. `MarketsClient` / `StockChartWorkspace` 用 Lightweight Charts（客户端不再复权）
4. 符号联想 `GET /api/data/symbol-search` 走 SEC company_tickers（全美股）
5. 批量回填：`npm run equity:sync-prices`（详见 [docs/US_EQUITY_KLINE.md](./docs/US_EQUITY_KLINE.md)）

### 美股行业

1. `equity:seed-sp500` → Wikipedia 成分 + GICS → `mds.equity_security`
2. 浏览器 → `/equity/sectors`；收益 `GET /api/equity/sector-returns`（Yahoo Finance Sector ETF，可选 Tiingo）
3. 财报聚合 / 经营叙事见 [docs/US_EQUITY_SECTOR_ANALYSIS.md](./docs/US_EQUITY_SECTOR_ANALYSIS.md)

### 用户偏好

- 用户宏观模板 JSON → `UserMacroChartPrefs`
- 系统内置模板（全局）→ `SystemMacroChartPrefs`（admin 写入）
- API：`/api/tools/macro-chart-prefs`

## 环境变量

复制 `.env.example` → `.env.local`（**勿提交**）。最少需要：

| 变量 | 用途 |
|------|------|
| `DATABASE_URL` | PostgreSQL |
| `FMP_API_KEY` | 宏观 unified / TTM PE |
| `APP_BASE_URL` | 邮件验证链接 |

可选：`FRED_API_KEY`、`IBKR_*`、`SMTP_*`。详见 `.env.example` 注释。

## 按计划更新宏观数据（P0）

| 表 | 说明 |
|----|------|
| `mds.statistical_agency` | 各国统计机构 |
| `mds.data_source` | FRED / 世行等连接器 |
| `mds.data_subscription` | 序列更新计划 + `next_run_at` |
| `mds.fetch_run` | 拉取日志 |

```bash
npm run db:migrate          # 先应用 migration
npm run data:seed-p0        # 机构 + 10 条 FRED 试点
npm run data:sync-calendar  # 官方/TE 发布日历 → nextRunAt（中国国家统计局走官网年历）
npm run data:worker         # 跑到期订阅（需 FRED_API_KEY）
npm run data:verify-phase1  # Phase 1 自检（加 --fetch --db）
npm run data:seed-phase2    # Phase 2：FRED 扩展 + usov + BIS debtcap + WB 试点
npm run data:verify-phase2  # Phase 2 自检（加 --live --db）
npm run data:probe-sources         # 探测获取方式 → metadata.fetchAcquisition
npm run data:probe-sources -- --scope=overview   # 仅 overview/debtcap/fred
```

Phase 1 跑通步骤与 cron 示例见 [docs/DATA_SCHEDULER_PHASE1.md](./docs/DATA_SCHEDULER_PHASE1.md)。  
Phase 2 扩展订阅见 [docs/DATA_SCHEDULER_PHASE2.md](./docs/DATA_SCHEDULER_PHASE2.md)。  
Phase 3 管理端调度与 WB 全量见 [docs/DATA_SCHEDULER_PHASE3.md](./docs/DATA_SCHEDULER_PHASE3.md)。  
Phase 4 Overview 重导、滞后告警、日历映射见 [docs/DATA_SCHEDULER_PHASE4.md](./docs/DATA_SCHEDULER_PHASE4.md)。  
Phase 5 usov 补全、e-Stat、Slack 告警见 [docs/DATA_SCHEDULER_PHASE5.md](./docs/DATA_SCHEDULER_PHASE5.md)。

**发布包（Phase B）**：经济日历按官方发布包对齐，而非逐指标匹配。

```bash
npm run data:seed-release-packages   # 写入 mds.release_package + 成员链接
npm run data:sync-calendar           # 包级日历匹配 → fan-out nextRunAt
```

管理端 `GET /api/admin/data-scheduler/release-packages` 查看包状态；指标目录行显示「发布包」列。  
**新指标接入六步清单**见 [docs/DATA_SCHEDULER_ONBOARD.md](./docs/DATA_SCHEDULER_ONBOARD.md)。

**宏观目录树约束**：所有国家使用统一九大顶层主题，指标必须归入业务子层级，末端单组最多 48 条；规则与部署流程见 [docs/DATA_CATALOG_TAXONOMY.md](./docs/DATA_CATALOG_TAXONOMY.md)。新增指标不得只依赖管理端手动拖拽，需补全 metadata 并更新 `globalCatalogTaxonomy.ts`。
日历与发布包配置以 `src/lib/data/scheduler/releasePackageCatalog.ts` 为准（`teEventMap.ts` 中 `TE_CALENDAR_BY_FRED` 仅遗留 fallback）。中国国家统计局发布包必须从 [国家统计局本年发布日程](https://www.stats.gov.cn/sj/fbrc/bnxxfb/) 解析官方北京时间，不得回退为 TradingEconomics 日历；官网临时失败时保留已有未来时刻并低频重试。
统一 seed/verify：`npm run data:seed -- --catalog=cpi`、`npm run data:verify -- --catalog=phase1`；日历覆盖入库：`npm run data:import-calendar-overrides`。

**部署落库**：`npm run data:apply`（幂等编排：migrate + 全 catalog seed + 发布包 + 目录布局 + 日历 + 各域自检；读 registry，新维度自动纳入）。开发库是缓存不是事实来源，云端跑此命令即从 git 代码 + FRED 重建 DB，观测由 worker 自动回填。详见 [docs/DATA_DEPLOY_SYNC.md](./docs/DATA_DEPLOY_SYNC.md)。

Windows 计划任务建议：每小时 `data:sync-calendar`，每 5 分钟 `data:worker`。

## 常用命令

日本 e-Stat API 需服务端 `ESTAT_APP_ID`：`data:seed-jp-estat-cpi` / `data:sync-jp-estat-cpi` / `data:verify-jp-estat-cpi -- --db`；`data:seed-jp-estat-labor` / `data:sync-jp-estat-labor` / `data:verify-jp-estat-labor -- --db`。CPI 使用 2025 基期官方接续指数；劳动力本批从 2018-01 开始，不能与更早人口基准数据硬拼。

**日本官方宏观数据（分批接入）**：`data:seed-jp-boj-macro` / `data:sync-jp-boj-macro` / `data:verify-jp-boj-macro -- --db`（BOJ API）；`data:seed-jp-meti-iip` / `data:sync-jp-meti-iip` / `data:verify-jp-meti-iip -- --db`（e-Stat公开METI历史Excel，无需key）；`data:seed-jp-esri-gdp` / `data:sync-jp-esri-gdp` / `data:verify-jp-esri-gdp -- --db`（ESRI季度GDP官方CSV）；`data:seed-japan-mof-jgb` / `data:sync-japan-mof-jgb` / `data:verify-japan-mof-jgb -- --db`（财务省15期限国债曲线，复用原jpov 2年/10年）。均注册统一seed/verify，配发布包和九主题目录；详细范围、修订口径与进度见 [JAPAN_DATA_ONBOARDING_PROGRESS.md](docs/research/JAPAN_DATA_ONBOARDING_PROGRESS.md)。GDP季调年率不得与旧jpov未折年季度金额拼接；BOJ短观2003Q4/2004Q1有官方口径断点；当前版本账本仅证明抓取时点可见，不是历史首发PIT。

```bash
npm install
npm run dev              # http://localhost:3000
npm run build            # 生产构建（先停 dev/start）
npm run start            # 生产运行
npm run lint
npm run db:migrate       # 应用他人 migration
npm run db:migrate:dev   # 本地改 schema 后生成 migration
npm run db:studio        # Prisma Studio
```

数据导入示例（需 DB 与 xlsx）：`npm run db:import-japan-overview-xlsx` 等，见 `package.json` 的 `db:*` 脚本。

**统一布局宏观 Excel**（列头 `国家:指标:子维度`）：见 [.cursor/prompts/macro-xlsx-import.md](./.cursor/prompts/macro-xlsx-import.md)。流程：`db:import-macro-xlsx --dry-run` → 加 preset → 正式导入 → `db:verify-macro-import`。

**TradingEconomics 指标页自动更新**（给定 URL，HTML 抓取 + 日历调度）：见 [.cursor/prompts/te-indicator-scrape.md](./.cursor/prompts/te-indicator-scrape.md)。ISM 制造业/服务业现以官网月报为主源：`data:seed-ism-te` / `data:seed-ism-svc-te` → `data:sync-ism-official` → `data:sync-calendar`（发布日跟 ISM 年历；TE 仅校对与失败兜底）；`data:verify-ism-official`（加 `--db`）。2026-09 起 ISM 官网报告页开始把所有月份 302 到 `ecommerce.ismworld.org/SSO/Login.aspx`（`isSsoRedirect` 已识别）——**`ismOfficialAdapter.ts` 的 `fetchIsmOfficialIncremental` 已经自动处理三级兜底**：官网失败 → 先试 PR Newswire 新闻稿（`src/lib/data/scheduler/ismOfficial/prNewswire/`，公开发布不受 SSO 墙影响，正文内嵌与官网相同的 AT A GLANCE/COMPARISON 表，分项覆盖比 TE 更全）→ 该分项配了 `teLabel` 时再退到 TE → 都失败才报 `error:"...（所有兜底均失败）"`。`ISM_OFFICIAL_MFG_SERIES`/`ISM_OFFICIAL_SVC_SERIES` 现在给全部分项都配了 `prNewswireLabel`，此前"该分项无 TE 兜底"的客户库存/新出口订单/进口（制造业）与供应商交货/库存/积压订单/新出口订单/进口/库存情绪（服务业）已随 PR Newswire 接入恢复更新。历史缺口回填：`data:backfill-ism-prnewswire`（翻页遍历 PR Newswire 新闻列表，按"覆盖最差仪器"的最新观测日 resume，`--max-pages`/`--no-resume`/`--fixture-list`/`--fixture-detail` 见脚本头注释）。

**新增宏观分析维度（拆维度 → 定指标 → 入库调度 → 建模板）**：走 Agent 流水线，见 [.cursor/prompts/macro-dimension-pipeline.md](./.cursor/prompts/macro-dimension-pipeline.md)；Spec 模板与已占用指标清单在 `docs/specs/`。
首个完成域「美国货币政策与金融条件」：`data:seed-monetary` / `data:verify-monetary`（加 `--db`）；新 FRED 指标目录归类 `data:sync-catalog-layout -- --keys=fred:<ID>,...`；文档 [docs/US_MONETARY_ANALYSIS.md](./docs/US_MONETARY_ANALYSIS.md)。
「美国消费与居民资产负债」：`data:seed-consumer-balance` / `data:verify-consumer-balance`（加 `--db`）；文档 [docs/US_CONSUMER_BALANCE_ANALYSIS.md](./docs/US_CONSUMER_BALANCE_ANALYSIS.md)。

「美国对外部门与美元」：`data:seed-external-dollar` / `data:verify-external-dollar`（加 `--db`）；文档 [docs/US_EXTERNAL_DOLLAR_ANALYSIS.md](./docs/US_EXTERNAL_DOLLAR_ANALYSIS.md)。

「美国国际收支」：`data:seed-us-balance-of-payments` / `data:verify-us-balance-of-payments -- --db`；BOP现行标准口径108条（本域 seed 107条、复用 `IEABC` 1条）按 `us.bea.international_transactions` 发布日历更新，IIP精选4条按 `us.bea.iip` 每168小时探测；文档 [docs/US_BALANCE_OF_PAYMENTS_ANALYSIS.md](./docs/US_BALANCE_OF_PAYMENTS_ANALYSIS.md)，Spec [docs/specs/us-balance-of-payments.spec.md](./docs/specs/us-balance-of-payments.spec.md)。
「美国制造业与库存周期」：`data:seed-industry-inventory` / `data:verify-industry-inventory`（加 `--db`）；文档 [docs/US_INDUSTRY_INVENTORY_ANALYSIS.md](./docs/US_INDUSTRY_INVENTORY_ANALYSIS.md)。

「中国国家统计局 PMI」：`data:seed-nbs-pmi` → `data:sync-nbs-pmi` / `data:verify-nbs-pmi`（加 `--db`）；制造业、非制造业及分项走新版国家数据 JSON 全历史 + 官方月报 Excel 首发，Spec [docs/specs/cn-nbs-pmi.spec.md](./docs/specs/cn-nbs-pmi.spec.md)。

「中国国家统计局 PPI」：`data:seed-nbs-ppi` → `data:sync-nbs-ppi` / `data:verify-nbs-ppi -- --db`；总项、生产/生活资料及 41 个工业门类走国家数据 JSON，全历史按基期分段回填；上年同月=100 指数同步保存同比，环比取上月=100。

「中国国家统计局规模以上工业增加值」：`data:seed-nbs-industrial` → `data:sync-nbs-industrial` / `data:verify-nbs-industrial -- --db`；总项、经济类型、三大门类与 41 个行业回填当月/累计同比，总项环比取月度发布稿（官方未发布分项环比）。

「中国国家统计局 GDP」：`data:seed-nbs-gdp` → `data:sync-nbs-gdp` / `data:verify-nbs-gdp -- --db`；季度生产法名义值、实际同比、总项实际环比与三大需求贡献率，年度生产法与支出法名义值及实际同比；仅保留国家统计局公开口径，不推算分项环比。

「中国宏观经济 Overview」：两套四图模板覆盖 GDP 量价与需求贡献、PMI 新订单、工业/社零/固投、固投三大领域、两本账广义财政支出、CPI/PPI 与进出口；基建累计同比扩展既有 `nbs-fai` 发布稿解析，文档 [docs/CN_ECONOMY_OVERVIEW_ANALYSIS.md](./docs/CN_ECONOMY_OVERVIEW_ANALYSIS.md)，Spec [docs/specs/cn-economy-overview.spec.md](./docs/specs/cn-economy-overview.spec.md)。

「中国国家统计局固定资产投资」：`data:seed-nbs-fai` → `data:sync-nbs-fai` / `data:verify-nbs-fai -- --db`；月度累计同比及行业、资金、构成、注册类型分项，年度名义值/同比，月度发布稿总项季调环比；1 月免报，官方未发布的分项环比不推算。

「中国国家统计局房地产开发与70城住房价格」：`data:seed-nbs-realestate` → `data:sync-nbs-realestate` / `data:verify-nbs-realestate -- --db`；房地产开发、施工/新开工/竣工、销售、到位资金及待售面积从官方月报 Excel 表1回填累计/期末值和同比；70城新建、二手住宅的城市级环比/同比/年内平均指数从公开月报表1、表2回填。仅保存官方公布口径，不由累计数推算当月值或环比。

「中国财政部财政收支」：`data:seed-mof-fiscal` → `data:sync-mof-fiscal` / `data:verify-mof-fiscal -- --db`；一般公共预算、政府性基金的累计收入/支出及分项累计额、同比，历史来自国库司月报归档；季度、年度对应月末累计口径，不推算单月值或环比。

「中国人民银行货币与信用」：`data:seed-pbc-monetary` → `data:sync-pbc-monetary` / `data:verify-pbc-monetary -- --db`；月度 M0/M1/M2、人民币贷款/存款、分部门累计增量、社融存量/增量及分项、同业利率和 LPR，历史来自人民银行公开归档；仅保留公告直接披露的余额、同比、累计增量或利率，不推算环比。

「中国金融监管总局银行业监管统计」：`data:seed-nfra-banking` → `data:sync-nfra-banking` / `data:verify-nfra-banking -- --db`；官网统计信息栏目静态 JSON 发现 xls/xlsx，首批接入银行业月度总资产/负债及同比与商业银行季度主要监管指标，共 42 条；两类无固定发布日历，按 24 小时 `probe_interval` 探测，必须区分月表境内口径与季度商业银行法人汇总口径；文档 [docs/specs/cn-nfra-banking.spec.md](./docs/specs/cn-nfra-banking.spec.md)。

「中国外汇与国际收支」：`data:seed-safe-external` → `data:sync-safe-external` / `data:verify-safe-external -- --db`；外汇及黄金储备、银行结售汇、代客涉外收付款、国际收支、国际投资头寸和全口径外债的公开时间序列表；按原表月/季/年频保存，不推算未发布的同比或环比。

「中国外贸与外部部门」：`data:seed-mofcom-trade` → `data:sync-mofcom-trade` / `data:verify-mofcom-trade -- --db`；商务部公开接口转载海关总署货物贸易统计，回填全国进出口、贸易方式、主要国别地区的当月/累计美元值和官方同比；发布包触发日常增量更新，不由累计数倒推非官方值。分商品维度已于 2026-09 迁出（见下条），旧的「外贸：商品构成」894 条序列由 `data:drop-mofcom-composition -- --apply` 一次性下线。

「中国海关主要商品量值」：`data:seed-gacc-commodity` → `data:sync-gacc-commodity` / `data:verify-gacc-commodity -- --db`；抓海关总署英文站统计月报表(13)/(14)（= 中文月报表13/表14 出口/进口主要商品量值表）的静态 HTML，进出口各 25 个重点商品 × 当月数量/当月金额/当月单价共 150 条序列，回填自 2020-01（源站 2018–2019 是另一套商品名录，不可对齐）。中文站 www.customs.gov.cn 与 stats.customs.gov.cn 挂瑞数动态防护恒返回 412，只能走英文站；该站仅有 HTTP，勿改 https。

「中国国家统计局 CPI」：`data:seed-nbs-cpi` → `data:sync-nbs-cpi` / `data:verify-nbs-cpi`（加 `--db`）；全国总项、核心项及八大类的指数、同比、环比走国家数据 UUID 接口全历史 + 官方月报 Excel 首发。

「CBOE VIX9D / VVIX」：`data:seed-cboe-vix9d-vvix` → `data:sync-cboe-vix9d-vvix` / `data:verify-cboe-vix9d-vvix`（加 `--db`）；9 日波动率与 VIX 之 VIX 走 CBOE 官方结构化 CSV 全历史（`cdn.cboe.com/api/global/us_indices/daily_prices/`），非 FRED 序列（已核实），日频 `probe_interval` 探测。

「NY Fed 全球供应链压力指数（GSCPI）」：`data:seed-nyfed-gscpi` → `data:sync-nyfed-gscpi` / `data:verify-nyfed-gscpi`（加 `--db`）；运输成本+制造业指标 PCA 合成的供应链压力标准化指数，走纽约联储官方 `gscpi_data.xlsx` 月度全历史（1998-01 起），非 FRED 序列（已核实），月频 `probe_interval`（72h）探测；归入「国民经济」目录。

「TSA 安检口日度旅客通过人数」：`data:seed-tsa-passenger-volumes` → `data:sync-tsa-passenger-volumes` / `data:verify-tsa-passenger-volumes -- --db`；`tsa.gov/travel/passenger-volumes` 当年滚动窗口 + `/travel/passenger-volumes/{year}` 年度归档（2019 起，页面本身无更早归档，回填深度上限即此），非 FRED 序列，日频 `probe_interval` 探测。

「AAR 美国铁路周度装车量/多式联运量」：`data:seed-aar-rail-traffic` → `data:sync-aar-rail-traffic` / `data:verify-aar-rail-traffic -- --db`；`aar.org` 每周三新闻稿正文抓取（归档列表 `/aar_news/weekly-rail-traffic-data/page/{n}/` 分页发现 URL，`sync` 支持 `--no-resume`/`--max-pages` 断点续抓），拆分 carloads/intermodal 两条仪器，回填深度上限 2019-01（正文句式核实置信度限制）；与 FRED 的 `RAILFRTCARLOADS`/`RAILFRTINTERMODAL`（BTS 按周汇总折算月频、滞后约 2 个月）口径与时效均不同，非重复口径，周频 `probe_interval` 探测。

「Cass 货运指数（Shipments/Expenditures）」：`data:seed-cass-freight-index` / `data:verify-cass-freight-index -- --db`；Cass Information Systems 编制、原生落在 FRED（`FRGSHPUSM649NCIS`/`FRGEXPUSM649NCIS`，Release「Cass Freight Index Report」rid=280，历史起 2016-01），走常规 FRED_API 接入，无需抓取；两条序列同源同批发布，月频 `probe_interval`（72 小时）探测，见 `us.cass.freight_index` 发布包。

「海外PMI（中国制造业 PMI 民间口径 + 欧元区综合 PMI）」：`data:seed-caixin-pmi-te` / `data:seed-euro-composite-pmi-te` → `data:sync-caixin-pmi-te` / `data:sync-euro-composite-pmi-te` → `data:sync-calendar` / `data:verify-caixin-pmi` / `data:verify-euro-composite-pmi`（加 `--db`）；S&P Global 编制（中国序列 TE 页现冠名 RatingDog，2025 年前为 Caixin/财新；FRED 均无镜像，已核实），走 TE 指标页叙述段抓取（页面无 `#calendar`/历史表），归入美国「对外与汇率 · 海外PMI」（比照 CFTC COT 惯例，用于美股外需传导分析），历史仅自接入起累积。

「美国非金融企业公司债存量/净发行（Z.1）」：`data:seed-corporate-bond-financing` → `data:sync-catalog`（常规 FRED_API，走标准调度）/ `data:verify-corporate-bond-financing`（加 `--db`）；`CBLBSNNCB`（存量 Level）+`NCBCBLQ027S`（净发行 Transactions，折年率）两条美联储 Z.1 资金流量表原生 FRED 序列，同一 Release，季度 `probe_interval`（168h）探测；SIFMA 官网"总发债规模"统计需填 HubSpot 表单下载（注册墙），按合规规则拒绝抓取，改用更权威的央行一手数据替代，归入「利率与信用市场 · 公司债市场」。

「FINRA 客户融资余额统计（NYSE 融资余额/杠杆率）」：`data:seed-finra-margin-debt` → `data:sync-finra-margin-debt` / `data:verify-finra-margin-debt`（加 `--db`）；FINRA 官网仅发布一份 `margin-statistics.xlsx`（Rule 4521(d) 会员行月度申报汇总，明确"不提供数据接口"），一次抓取拆出三条分项：Debit Balances（融资余额，即"股市杠杆率"最常引用口径，1997-01 起）、Free Credit Balances in Cash Accounts（现金账户闲置资金，1997-01 起）、Free Credit Balances in Securities Margin Accounts（保证金账户闲置资金，仅 2010-02 起有该分项，规则生效前无此统计），三者共享同一份源文件（client 内 60s 缓存避免重复请求），月频 `probe_interval`（72h）探测，归入「利率与信用市场 · 市场情绪」（与 CBOE VIX9D/VVIX 同组）。

「美股 IPO 月度统计（Ritter）」：`data:seed-ritter-ipo` → `data:sync-ritter-ipo` / `data:verify-ritter-ipo`（加 `--db`）；佛罗里达大学 Jay Ritter 的 `IPOALL.xlsx`（学术界标准公开数据集，FRED 对 IPO 零覆盖已核实，SDC/Dealogic 均付费），一次抓取拆出四条月频分项：首日平均涨幅（1960-01 起 761 点）、发行家数毛口径（1960-01 起 792 点，含 SPAC/直接上市/仙股/单位/封闭式基金）、发行家数净口径（1975-01 起 612 点，剔除上述）、定价高于申报区间中值占比（1980-01 起 534 点）。另接入同文件的 SPAC 两列：SPAC 发行家数（2020-01 起 72 点）、SPAC 首日平均涨幅（69 点，**源用小数记录、入库乘 100 统一为 %**，见 `scaleBy`）。共 6 条，归入「利率与信用市场 · 市场情绪」（与 CBOE VIX9D、FINRA 融资余额同组，同属风险偏好指标）。

⚠ 三个坑（都在 `ritterIpo/catalog.ts` 顶部注释里写全了）：①**源文件没有表头行**，列含义只写在末尾脚注，解析器靠「col0 是 1..12 月份 + col1 是可信年份」锚定数据行；②**年份是两位数**，60–99→19xx、0–59→20xx，另有 [1960, 次年] 兜底，源跨到 2060 会报错而非静默取错；③**四列起始年份各不相同且用字符串哨兵占位**（`"see 1975"`/`"see 1980"`/`"."`/`"na"`），必须逐列独立判断，已知哨兵静默跳过、未知文字计入 `skippedInvalid` 以便发现源改版。
⚠ 还有两列**已被源方弃更**：proceeds-weighted return、avg money left on the table、avg proceeds（col7/8/9，仅 2020-01→2023-02），**故意不接入**——挂上调度就是永不更新的僵尸序列。理由与判据写在 `ritterIpo/catalog.ts` 陷阱 5。
⚠ 这是**年度更新**的研究数据集（上一年数据次年 1 月补齐），"最新观测落后 9–14 个月"是正常状态，verify 的过期阈值因此放到 24 个月；它解决历史统计，不解决当期 IPO 跟踪。

**当期 IPO 跟踪的源调研结论（2026-09 实测，勿重复踩）：**
- **Nasdaq IPO API** — 数据最好（免费 JSON、回溯到 2000-01、含发行价/股数/募资额），但除 robots.txt 全站 Disallow 外，**服务条款明文禁止**："Not access or use the Service, or any process, whether automated or manual, to capture data or content from the Service"，并点名 scraping/data mining，且授权仅限 "personal, non-commercial use"。本项目是商业产品，**不可用**，勿再提。
- **SEC EDGAR** — 合规且权威，但没有"一个表单就等于一次 IPO"的干净信号：①`424B4` 包含增发与转售（实测 WeShop 2026-09-03 那份就是转售而非 IPO），直接计数会严重高估；②`8-A12B` 是交易所注册，实测 2026-07/08 为 136/169 件，而 Ritter 毛口径才约 30/月，**超计约 5 倍**（ETF、信托、封闭式基金、老公司发新证券类别都会报），需按 SIC/是否新注册人/有无并发 S-1·F-1 过滤。
- **EDGAR 结构化募资额确实存在**：S-1/F-1 的 Exhibit 107（`ex107_htm.xml`，ffd 命名空间 XBRL）直接给 `ffd:MaxAggtOfferingPric`、`ffd:AmtSctiesRegd`、`ffd:MaxOfferingPricPerScty`，**无需解析自由文本**。但那是**登记金额而非实际募资额**，且实测 0/12 份 424B4 带费用附件——最终定价只以散文形式存在于招股书封面。
- 做这条路时 Ritter 的月度家数可当**校准基准**验证过滤规则。FMP 的 `/ipos-calendar` 等端点在当前订阅下返回 `Restricted Endpoint`。

「内部人交易 Tier B 全市场底座（SEC DERA）」：`equity:sync-dera-insider` → `equity:verify-dera-insider`（加 `--full` 查季度连续性）；灌 SEC 经济与风险分析司（DERA）发布的 `insider-transactions-data-sets` 季度包，2006q1 起每季一个 zip（~14MB），落 `mds.dera_insider_{filing,transaction,owner}` 三表。实测全量 **81 季 / 721 万笔交易 / 24,011 个 ticker / 73 分钟**；日常增量用 `--latest`（回看最近 2 季，覆盖出版滞后与事后更正），`--cache-dir=.data/dera` 缓存 zip 避免重复下载。

**与 Tier A（`mds.insider_transaction` + 持股监控页）的边界**——两者并存互不覆盖，**不要把 Tier B 当 Tier A 用**：Tier A 是逐份 Form 4 XML 的证据级事实（含原文、SHA-256、脚注、共同申报人与人工裁定），支撑 `/equity/ownership`，成本高只覆盖重点池；Tier B 是 SEC 预解析的表格，**没有原始 XML 与脚注原文**，只能做总量统计、横截面与任意公司的历史查询，不能用于需要人工裁定的场景。全市场底座走 Tier B 是因为逐份抓 XML 要几千万次请求（627 只就跑了 3 天），DERA 只要 81 次。

**Tier A 的两类坑（2026-09 实测，均已处理，勿重走）**：

1. **「发行人非本公司」不是失败**。持股超 10% 的机构须以申报人身份为被投公司提交 Form 4，这些申报同时索引在申报人自己的 CIK 下，按 CIK 拉取必然连带取到。拒绝它们是对的，但曾计入 `coverage.failed`，而 `complete` 的判据含 `failed===0`，导致 BAC/GS/BX/C/BEN 等 162 只**永远无法 complete**，进而让 `ownershipEngine` 的 `supplyRatio90`/`sellingAdv30` 恒为 null、页面显示「覆盖不完整」——而数据其实是全的。现由 `ForeignIssuerFilingError` 归入 `coverage.skipped`。实例：BAC `0000070858-06-000161` 的发行人是 ONEIDA LTD。全量回填中这类占失败总数 90.9%。

2. **日期可能带 XSD 时区后缀**。`xs:date` 允许可选时区，高盛的申报代理输出 `2012-07-27-04:00`，而下游按严格 `YYYY-MM-DD` 校验，整份申报被丢弃（GS 418 份、DG 16 份）。`parseForm4Xml` 已归一化；不匹配完整「日期+时区」形状的值原样返回，畸形日期仍会被下游拒绝。

⚠ **申报人打错的年份只在读取端设界，不要在摄入端修**：有把年份首位打错的（`2025`→`0025`、`2015`→`0015`）。落库刻意保持「一行不合格即整份拒收」的严格语义，而这类坏行分散在原本正常的申报里——按行剔除会连带丢掉同申报的合法行（实测剔 9 行错的要丢约 13 行对的，净亏）。故 `ownershipMonitor.ts` 用 `TRANSACTION_DATE_FLOOR`（1990-01-01）在查询处设下界：全库最早合法交易日是 1994-06-01，1990 年前只有那 5 行首位打错的，界限干净；未来方向的同类错误（2028、2031）已被既有的 `transactionDate<=asOf` 挡住。新增读取路径若要按日期聚合或取 min/max，须同样设界。

⚠ **源端坑（均已实测，解析器已处理）**：①日期是 `DD-MON-YYYY` 不是 ISO；②`AFF10B5ONE` 同列混用 `'0'/'1'/'false'/''` 四种编码；③**各季度列集不同**——`AFF10B5ONE` 自 **2023q1** 起才有（2022q4 及更早整列不存在），故必须按列名而非列位取值、缺失写 null 而非 false，**2023 年之前算不出 10b5-1 占比，跨这条线的时间序列会出现假跳变**；④`RPTOWNER_RELATIONSHIP` 是逗号拼接多值；⑤无 ticker 的发行人写字面量 `NONE` 而不是空串。

⚠ **申报人填错必须靠 `anomaly` 列拦掉**（源保真、只打标不改值，**做金额汇总时必须 `where anomaly is null`**）：实测全量 33,850 笔（0.469%）——`no_ticker` 31,589、`date_after_filed` 1,664（交易日晚于申报日，多为年份手误）、`price_impossible` 542（单价 >$100 万；阈值取此是因 BRK.A 约 $70 万是真实价，不能误杀）、`date_impossible` 55（早于 1934-06-06 证券交易法生效，实测是"世纪打错"：申报日恰为交易日 100 年后）。不加过滤时单条错价即可把全市场月度买入额算成 48 亿亿美元。

⚠ **金额类汇总必须加 `price_check='verified'`**：SEC 原样发布申报人填写的价格，量级错位（×10³/×10⁶）不罕见且不限于冷门票（LLY 2023-08-28 报 `554101`，当日真实约 $554）。实测排除 anomaly 后仍有约 0.022% 的行贡献了 **99.92%** 的金额，不过滤时任何 sum 都只是在读这批错行。`equity:check-dera-prices` 用 `mds.equity_daily_bar` 的实际股价逐笔交叉校验，偏离达 10 倍判 outlier，覆盖率受日线宇宙限制（生产 1,146 只，P/S 交易约 22.6%）。

⚠⚠ **做这类校验时必须先还原复权口径**：`equity_daily_bar` 存的是**向今天复权后**的价格，Form 4 申报的是**当日真实成交价**。不乘上交易日之后的累计拆股比例直接比，会把所有拆股前的交易全部误判——实测误判率 14.3%（AAPL 2020-08-25 申报 499.42 会被拿去和复权后的 124.81 比，差的正是那次 4:1 拆股），还原后降到 0.26%。`check-dera-prices.ts` 已用 `mds.equity_split` 处理，改动时勿去掉这一步。

⚠ 只校验 P/S。`M` 的价是行权价、`A` 是授予价，与市价没有可比性，一并校验会把正常期权行权全部误判，故其余交易码保持 `price_check=null`。

⚠ **查询必须按 `transaction_code` 过滤**：实测 `A`(授予)+`F`(代扣税)+`M`(行权) 合计约六成，全是薪酬机制的机械产物、不含主观判断；有预测力的是 `P`(公开市场买入)/`S`(卖出)，全量比例为 845,038 : 2,610,603。直接算"内部人净买卖"而不筛代码，得到的是薪酬噪音不是信号。

## 模块分工建议（3–5 人）

| 模块 | 主要路径 | 分支前缀示例 |
|------|----------|----------------|
| 宏观 UI/模板 | `src/app/macro/`, `Macro*.tsx` | `feature/macro-*` |
| 美股 K 线 | `src/app/markets/`, `src/lib/data/providers/`, `src/lib/equity/{yahooChart,priceAdjustment,equityPriceStore}` | `feature/markets-*` |
| 认证/管理 | `src/app/auth/`, `api/auth/` | `feature/auth-*` |
| 数据/DB | `prisma/`, `scripts/` | `feature/db-*` |
| 工具页 | `src/app/tools/` | `feature/tools-*` |

**同一时间仅一人** 提交 `prisma/migrations/*` 变更。

## 个股经营里程碑（Skill）

用户可用自己的 AI 按 [`.cursor/skills/company-milestone-ingest/`](.cursor/skills/company-milestone-ingest/) 搜集单票产品/产能/影响该公司的政策。模板整包：`/templates/company-milestone/company-milestone-pack.zip`（改文件后 `npm run pack:company-milestone`）。在 **行情页** `/markets` 底部展开「事件筛选器」：**导入经营事件仅本地对本账号生效**；Admin 用 `events:import-ingest` 入库后全站可见；轴上本地优先于共享库与 SEC。亦可 CLI：

```bash
npm run events:validate-ingest -- <file.json>
npm run events:import-ingest -- <file.json>
```

## 数据底层复用原则（强制）

所有新功能必须遵守 [数据底层复用与单一事实源设计原则](./docs/DATA_FOUNDATION_REUSE_PRINCIPLES.md)：先复用已有 Source Adapter、scheduler、canonical fact store、统一 writer 和查询/计算服务，再考虑新增底层。不得为宏观、量化、美股行业或单个页面另建同源抓取器、同义事实表、复权/as-of/Regime/因子算法。确需新增表或底层能力时，设计文档必须先说明它表达的新事实、与现有底层的主从关系、上游血缘和重建方式。

## AI 工作检查清单

完成任务前确认：

- [ ] 只改了任务相关文件
- [ ] 未提交 `.env.local` 或密钥
- [ ] `useSearchParams` 页面有 `Suspense`
- [ ] 浏览器端 ID 用 `src/lib/randomId.ts`
- [ ] 本地 `npm run build` 通过（或说明为何 CI 会通过）
- [ ] 若改 schema：PR 中写明 `npm run db:migrate` 步骤
- [ ] 新功能已列出底层复用项；未新增平行 adapter、事实表、writer 或重复计算链

## 禁区

- 不要删除或重写已合并的 migration
- 不要把 API Key 写进客户端或提交到 Git
- 不要在未协调时大改 `MacroSection.tsx` 整体结构
- 生产部署密钥不要写进仓库（用服务器 `.env.local` 或 GitHub Secrets）

## 生产部署（阿里云 / GitHub Actions）

**代码不走服务器 `git pull`**。`main` push 触发 `.github/workflows/deploy.yml`：

1. GitHub Actions：`npm ci` → `npm run build` → `node scripts/deploy-pack.mjs` → `deploy.tar.gz`
2. `scp` 到服务器 `/opt/finance-site/`，解压覆盖 `.next`、`node_modules`、`src`、`scripts` 等
3. 服务器上：`npm run db:migrate` → `npm run data:apply -- --skip-migrate` → `pm2 restart finance-site`

数据库与指标订阅由 deploy 脚本幂等落库，详见 [docs/DATA_DEPLOY_SYNC.md](./docs/DATA_DEPLOY_SYNC.md)。

| 在服务器上 | 不要做 |
|-----------|--------|
| 保留 `.env.local`（`DATABASE_URL`、`FRED_API_KEY` 等） | `git pull` / 在服务器改业务代码 |
| 看 Actions 日志与 `pm2 logs` | 用 `git status` 判断是否已部署最新版 |
| deploy 失败时手动 `npm run data:apply` | `pg_dump` 同步开发库 |

若 `/opt/finance-site` 曾有 `git clone`，tar 解压后 `git status` 会一片红，可忽略或删除 `.git`。

**主机卡死排查落盘**（心跳 + 压力现场 + 开机捞 OOM）：见 [docs/OPS_HOST_DIAGNOSTICS.md](./docs/OPS_HOST_DIAGNOSTICS.md)；部署后在服务器装一次 cron（`host-diagnostics-snapshot.sh` 每 2 分钟）。

## 部署参考（内网 Windows）

```bash
npm run build
npm run start   # 默认 3000
```

构建前停止占用 Prisma 引擎的 node 进程。外网访问需自行配置反向代理与 DNS。
