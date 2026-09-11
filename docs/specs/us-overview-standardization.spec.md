# US_Overview 不合规序列退役与标准重入库（Agent B）

> 状态：`data-ready`（2026-09-11）
> 触发：香港生产「就业」图新增非农被写成 ~15 万的 PAYEMS 水平值。排查发现 US_Overview xlsx 导入的
> 9 条序列（来源标注 美国劳工部 / 美国经济分析局 / Wind）不符合项目入库标准：月末日期的预变换值，
> 又被调度器挂上 FRED 原始订阅写入月初水平值，两套口径混存；标普500 PE 无订阅、停在 2026-05。

## 1. 范围与处置

| 退役 code | 原名 | 原来源 | 处置 | 标准替代键 | 计算 |
|---|---|---|---|---|---|
| usov_c13_gdp_qoq_saar | GDP:不变价:季调:环比折年率 | 美国经济分析局 | 复用 | `fred:A191RL1Q225SBEA` | none |
| usov_c16_cpi_yoy | CPI:同比 | 美国劳工部 | 复用 | `fred:CPIAUCSL::yoy` | yoy（月） |
| usov_c17_core_cpi_yoy | 核心CPI:同比 | 美国劳工部 | 复用 | `fred:CPILFESL::yoy` | yoy（月） |
| usov_c18_pce_yoy | PCE:当月同比 | 美国经济分析局 | 复用 | `fred:PCEPI::yoy` | yoy（月） |
| usov_c19_core_pce_yoy | 核心PCE:当月同比 | 美国经济分析局 | 复用 | `fred:PCEPILFE::yoy` | yoy（月） |
| usov_c20_unrate_sa | 失业率:季调 | 美国劳工部 | 复用 | `fred:UNRATE` | none |
| usov_c21_unrate_sa_3mma | 失业率:3月移动平均 | 美国劳工部 | 删除 | —（无 MA 算子；源 UNRATE 已入库） | — |
| usov_c22_nfp | 新增非农就业人数:初值 | 美国劳工部 | 复用 | `fred:PAYEMS::diff` | diff（月） |
| usov_c28_sp500_pe | 市盈率:标普500 | Wind | 新接入 | `mds:us_sp500_pe` | none |

注：`fred:PAYEMS::diff` 是最新修订水平值的差分，不是「初值」；图例改名「新增非农就业人数」。

## 2. 复用门（§-1）

七条 FRED 序列均已由既有 seed 入库，**不新建** seed/订阅/发布包（本机与香港核对）：

| code | 发布包 | 首条 | 条数（HK） |
|---|---|---|---|
| sched_fred_A191RL1Q225SBEA | us.bea.gdp | 1950-01 | 305 |
| sched_fred_CPIAUCSL | us.bls.cpi | 1950-01 | 918 |
| sched_fred_CPILFESL | us.bls.cpi | 1957-01 | 834 |
| sched_fred_PCEPI | us.bea.pce | 1959-01 | 811 |
| sched_fred_PCEPILFE | us.bea.pce | 1959-01 | 811 |
| sched_fred_UNRATE | us.bls.employment_situation | 1950-01 | 919 |
| sched_fred_PAYEMS | us.bls.employment_situation | 1950-01 | 920 |

目录位置沿用 `FRED_US_ITEMS`（国民经济核算 / CPI 综合 / 通胀驱动因子 / 就业与工资）。

## 3. 新接入：标普500 市盈率 `us_sp500_pe`

- 源：`https://www.multpl.com/s-p-500-pe-ratio/table/by-month`（与 Shiller CAPE 同站同 `datatable` 结构，
  robots 全站开放）。口径：S&P 500 价格 / 过去 12 个月报告（GAAP）每股收益；最新月份带 `†` 估算标记，随财报修订。
- 频率 月 · 单位 倍 · 1871-01 起约 1860 条。
- 数据源复用 `multpl`；scrape provider `multpl_sp500_pe`（复用 CAPE 客户端/解析器，解析器新增剥离估算标记）。
- 订阅：`probe_interval` 72h（月频）。
- 发布包：新增 `us.multpl.valuation`（probePkg，成员 `us_shiller_cape` + `us_sp500_pe`，同站同频）。
- 目录：利率与信用市场 › 市场情绪（`usCatalogTaxonomy.ts` 显式规则）。
- 脚本：`data:seed-multpl-sp500-pe` / `data:sync-multpl-sp500-pe` / `data:verify-multpl-sp500-pe`。

## 4. 退役与模板（`data:seed -- --catalog=usov-retire`，幂等，随部署执行）

- 与管理端删除指标同逻辑：tombstone → 删抓取记录/发布包成员/订阅/仪器（级联观测与版本账本）→ 布局去幽灵键。
- 代码侧：`usOverviewLayout.ts` 移除 9 列（xlsx 重导入不再恢复）；`usovFredMap.ts` 移除映射；
  内置 US_Overview 模板改用标准键 + seriesCalcConfig（`usOverviewStandardSeries.ts`）。
- DB 侧：系统模板覆盖、自定义系统模板、用户工作区与用户模板中的旧键替换为标准键（保留图位与样式），c21 删除。
- 顺带修复：`buildExtractQueryFromKeys` 在模板含 `mds:` 键时会丢弃全部 `fred:` 键；模板目录过滤不识别 `::变换` 虚拟键。

## 5. 第二批（2026-09-11 下午）：收益率与黄金

| code | 问题 | 处置 | 替代 |
|---|---|---|---|
| usov_c07_gs10 国债收益率:10年 | 日频 xlsx 挂 FRED 月频 GS10，月初值混入、日值停在 2026-05-29 | 退役 | `fred:DGS10`（日频 H.15，us.frb.h15_rates） |
| usov_c08_gs2 国债收益率:2年 | 同上（GS2） | 退役 | `fred:DGS2`（同上） |
| usov_c09_10y2y 10年-2年 | 用户要求删除 | 退役 | —（不再单列利差） |
| usov_c05_comex_gold 期货收盘价(连续):COMEX黄金 | FRED GOLDAMGBD228NLBM 已下架（HTTP 400），停在 2026-05-29 | 改订阅 | 行情接口 Yahoo `GC=F`（COMEX 连续合约，口径一致） |
| goldov_c02_london_gold 伦敦金现:IDC | 无订阅，停在 2026-06-05 | 改订阅（用户确认口径变更） | Yahoo `GC=F` 续接 |

- 行情接口 = /markets 行情页同源的 Yahoo v8 chart（`src/lib/equity/yahooChart.ts`，已过滤节假日全 0 占位行）。
  新增调度适配器 `yahoo_chart`（`metadata.scrape.symbol`），数据源 `yahoo-chart`，probe_interval 24h，
  发布包 `us.yahoo.comex_gold`；seed：`data:seed -- --catalog=yahoo-gold-prices`。
- 伦敦现货在行情接口不可得（`XAUUSD=X` 等 404；stooq 有人机验证，不绕过）。伦敦金现 2026-06-05 前为 IDC 现货历史，
  此后为 COMEX 连续期货（通常高于现货 0.5%–1%），黄金模板「期现差」自此不再有期现含义。只续接不回写历史。
- 遗留：`usov_c04_spx_gld`（SPX/GLD 复合）同样依赖已下架的 GOLDAMGBD228NLBM，订阅在报 HTTP 400，未在本次范围内。

## 5b. 第三批（2026-09-11 晚）：计算型二次指标全部退役 + 宏观数据库约束

新约束写入 AGENTS.md「宏观数据库约束（强制）」与 Agent B/C 手册：库里只存有明确来源、稳定更新方式的标准基础数据；
二次指标在「指标运算」中实现（模板 `derivedCalcs` / `seriesCalcConfig`）。

| 退役 code | 原计算 | 模板处理 |
|---|---|---|
| usov_c04_spx_gld SPX/GLD | FRED SP500 ÷ 已下架金价 | 指标运算 `calc:usov-spx-gld` = 标普500 ÷ COMEX 金 |
| usov_c12_2y_effr 2年-EFFR | FRED GS2 − EFFR | 指标运算 `calc:usov-2y-effr` = DGS2 − EFFR |
| usov_c25 美国国债环比增加 | TREAST 周环比% | `mds:usov_c24_fed_treasuries::pct`（环比%） |
| usov_c26 环比增加 MA4 | 4 周均值 | 删除（无 MA 算子） |
| usov_c27 Fed Net Liquidity | WALCL − TREAST | 指标运算 `calc:usov-fed-net-liquidity` |
| goldov_c03 期现差 | c01 − c02 | 指标运算 `calc:gold-basis` |
| goldov_c07 COMEX 库存（百万） | c23 / 1e6 | 改用 c23（盎司） |
| goldov_c08 库存环比 | c07 差分 | `mds:goldov_c23_comex_stock_oz::diff` |
| goldov_c11 全球储备（百万盎司） | c24 × 35.27/1000 | 改用 c24（吨） |
| goldov_c09/c10/c16/c25 ETF 合计/换算/环比 | 六只 ETF 求和（PHAU 月频） | 删除（多序列同日合计无法用二元运算表达） |
| fiscal_primary_deficit_gdp | FYFSGDA188S − FYOIGDA188S | 指标运算 `calc:fiscal-primary-deficit-gdp` |
| fiscal_fgcec1_yoy | 调度器 YoY | `fred:FGCEC1::yoy`（FGCEC1 补入 FRED_US_ITEMS） |
| fiscal 其余 4 个比率 | FRED/Treasury 复合 | 删除（无模板引用） |
| sec_us_insider_buy_* 2 条 | Form 4 汇总 | 删除；cron 去掉 build-insider-sentiment |

- 代码侧：usov/fiscal/treasury 复合登记清空、`fredTransform` 恒为 none、IMF c11 换算分支、xlsx 派生列、seed 中的复合/YoY 段全部移除。
- 保留（不属于库内计算）：`quant_regime_*`（不存值，模型实时投影）、`jpov_*` 同比/环比（日本官方发布）。
- 遗留：期现差与 COMEX 库存依赖的 `goldov_c01_comex_active` / `goldov_c23_comex_stock_oz` 为 xlsx 历史存量（CME 授权待定，无自动更新）。
- 现货金价：LBMA（IBA 授权）、东方财富/新浪（robots Disallow + 条款禁止）、Yahoo/stooq/德国央行/富途 OpenAPI 均不可用；待 FMP 配额恢复验证 XAUUSD 日线后接入。

## 6. 数据（验收）

- [x] 复用门：七条 sched_fred_* 在库、订阅启用、发布包齐全
- [x] 新接入 us_sp500_pe：入库 + 全历史回填 + 订阅 + 发布包 + 目录
- [x] 9 条 usov 退役（本机 + 香港），tombstone 齐全
- [x] 模板引用全部替换
- [x] `data:verify -- --catalog=usov-retire` / `--catalog=multpl-sp500-pe` 通过
