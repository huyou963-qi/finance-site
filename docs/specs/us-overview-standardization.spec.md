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

## 6. 数据（验收）

- [x] 复用门：七条 sched_fred_* 在库、订阅启用、发布包齐全
- [x] 新接入 us_sp500_pe：入库 + 全历史回填 + 订阅 + 发布包 + 目录
- [x] 9 条 usov 退役（本机 + 香港），tombstone 齐全
- [x] 模板引用全部替换
- [x] `data:verify -- --catalog=usov-retire` / `--catalog=multpl-sp500-pe` 通过
