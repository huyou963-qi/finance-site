# Spec：欧洲核心宏观概览（europe-core）

状态：`data-ready`（2026-09-22 已完成 seed、官方完整历史回填、发布包、目录、日历与 DB 验证）。

## 1. 目标与边界

只回答欧洲整体与重要国家的宏观方向，不建设细分结构数据库。区域层覆盖 `EU27_2020` 与 `EA21`；国家层覆盖德国、法国、意大利、西班牙、荷兰、波兰。英国不属于 EU/欧元区，留作独立 ONS 二期，不混入本域。

第一期仅保留六类可跨地区比较的 Eurostat 官方基础序列：实际 GDP 水平指数、HICP 总项指数、失业率、工业生产指数、零售销售量指数、政府名义总债务；另接 ECB 存款便利利率和欧元区 M3 存量。同比、环比、债务/GDP、利差等二次指标不得入库，在模板指标运算中计算。

## 2. 来源与数据口径

- Eurostat Statistics API：JSON-stat 2.0，无密钥；数据库是最新修订版，不提供历史 vintage。
- ECB Data Portal SDMX API：CSV，无密钥；采用官方完整 series key。
- 所有月/季度观测统一按期初日期保存；这只是存储约定，不代表期初已经可见。
- 当前版本适用于最新数据展示，不得当作严格历史 PIT 数据集。

## 3. 指标矩阵

下表每个 Eurostat 指标均落 8 个地理实体，共 48 条；ECB 另 2 条，总计 50 条。

| 指标 | dataset / 过滤条件 | 单位/频率 | 地理范围 | 分类 | 发布包 |
|---|---|---|---|---|---|
| 实际 GDP 季调指数 | `namq_10_gdp`; `CLV_I20/SCA/B1GQ` | 2020=100/季 | EU27、EA21、DE/FR/IT/ES/NL/PL | 国民经济 | `eu.eurostat.gdp` |
| HICP 总项指数 | `prc_hicp_minr`; `I25/TOTAL`（ECOICOP v2） | 2025=100/月 | 同上 | 通胀与价格 | `eu.eurostat.hicp` |
| 失业率（季调） | `une_rt_m`; `SA/TOTAL/PC_ACT/T` | %/月 | 同上 | 劳动力市场 | `eu.eurostat.unemployment` |
| 工业生产指数 | `sts_inpr_m`; `PRD/B-D/SCA/I21` | 2021=100/月 | 同上 | 国民经济 | `eu.eurostat.industrial_production` |
| 零售销售量指数 | `sts_trtu_m`; `VOL_SLS/G47_X_G473/SCA/I21` | 2021=100/月 | 同上 | 国民经济 | `eu.eurostat.retail_trade` |
| 政府名义总债务 | `gov_10q_ggdebt`; `GD/S13/MIO_EUR` | 百万欧元/季 | 同上 | 财政与公共债务 | `eu.eurostat.government_debt` |
| ECB 存款便利利率 | `FM:D.U2.EUR.4F.KR.DFR.LEV` | %/日 | 欧元区 | 利率与信用市场 | `eu.ecb.key_rates` |
| M3 货币存量 | `BSI:M.U2.N.V.M30.X.1.U2.2300.Z01.E` | 百万欧元/月 | 欧元区 | 货币政策与流动性 | `eu.ecb.monetary_aggregates` |

完整 code、单位、过滤条件、最小历史点数与新鲜度阈值以 `src/lib/data/scheduler/europeCore/catalog.ts` 为单一事实来源。

## 4. 复用门与查重

仓库原有 `te_eurozone_composite_pmi` 仅为欧元区综合 PMI 抓取序列，与本批官方硬数据不重复，继续保留但不纳入本批 seed。全仓检索未发现上述 Eurostat/ECB series key 或 `eurostat_*` / `ecb_ea_*` 仪器。复用现有 Instrument、DataSource、DataSubscription、ReleasePackage、FetchRun、MacroObservation 与统一 worker，不新增 migration 或事实表。

## 5. 调度、修订与异常处理

8 个包按真实官方发布主题分组。Eurostat GDP/HICP/就业/工业/零售/债务和 ECB 利率/M3 都有发布日，使用经济日历规则并保留按频率 fallback 探测；包用于原子更新和管理端批量同步。每次增量读取带 revision lookback，覆盖源端修订。

适配器必须拒绝未唯一定位到单序列的 Eurostat 响应、维度长度漂移、无效时期和非数值；空值跳过，0 与负值保留。ECB CSV 按列名读取 `TIME_PERIOD`/`OBS_VALUE`，不能依赖列位。

HICP 旧数据集 `prc_hicp_midx` 在 2025-12 停止；本域只使用 2026 起持续更新且回溯至 1996 的 `prc_hicp_minr`。旧 I15 与新 I25 指数绝不在同一 instrument 内拼接；检测到旧 seed 时先精确删除对应 HICP instrument 再按新口径全量重建。

## 6. 验收清单

- [x] 50 条 Instrument、DataSubscription 与 `fetchAcquisition=known`。
- [x] 8 个发布包及全部 50 个成员链接。
- [x] 官方完整历史回填，逐条至少一次 SUCCESS fetch run。
- [x] DB 频率、单位、首末日期、条数、新鲜度通过 `data:verify-europe-core -- --db`。
- [x] Eurostat/ECB parser 回归测试、TypeScript、lint、build 通过。
- [x] 状态改为 `data-ready` 并回填真实 DB 证据。

## 7. 2026-09-22 落库证据

- 统一入口 `data:verify -- --catalog=europe-core --db` 与实时源检查 `data:verify-europe-core -- --live --db` 均为 `PASS (50 series)`；48 条 Eurostat、2 条 ECB 共 24,866 条观测，全部具备订阅和正确发布包。
- 最新观测：GDP 至 2026Q2，HICP 至 2026-08，失业率至 2026-07（荷兰至 2026-08），工业生产与零售至 2026-07，政府债务至 2026Q1，ECB 存款便利利率至 2026-09-22，M3 至 2026-07。
- 历史深度按官方可用期完整回读：区域 GDP 自 1995Q1；国家 GDP 最早法国自 1980Q1；国家 HICP 自 1996-01；ECB 利率自 1999-01-01；M3 自 1980-01。
- `data:sync-calendar` 成功处理 2,475 个日历事件并写入本域 8 个包；当期 90 天 TE 窗口未给出可匹配的欧洲下一发布日期，系统按频率护栏安排 fallback 探测，不会停更。
- 目录 dry-run：`mds:eurostat_` 48/48、`mds:ecb_` 2/2 均已归类，无需改写持久化布局。
- 数据源探测：`--scope=all --skip-known` 对 Eurostat 48 条、ECB 2 条全部识别为已知获取方式并跳过，无 pending。
- 适配器测试 3/3、`tsc --noEmit`、定向 ESLint、生产 `next build` 均通过。构建保留一个与本域无关的既有 `jpMofCorporateFiscal/parser.ts` 的 `xlsx` 默认导入警告。
