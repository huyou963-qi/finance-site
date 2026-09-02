# Spec：美联储常备回购便利（SRF）操作与使用量

## §0 元信息

| 字段         | 值                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------- |
| dimension id | `us-standing-repo`                                                                           |
| 中文名       | 美联储常备回购便利（SRF）操作与使用量                                                        |
| 状态         | `data-ready`                                                                                 |
| 接入范围     | 操作利率、接受量总计、抵押品分项和可得提交量；历史回填、持续调度和目录归位；暂不创建内置模板 |
| 评审记录     | 2026-09-02 用户要求按 Agent B 接入 SRF 使用量及同报告相关指标                                |

## §1 权威报告与口径

SRF 日频使用量的权威事实源是纽约联储 **Repo Operations** 每次操作结束后发布的汇总结果及 Markets Data API，不是 H.4.1 周报或年度公开市场操作报告。FRED 将每日结果聚合到 `Temporary Open Market Operations` Release。

- 纽约联储操作结果：<https://www.newyorkfed.org/markets/desk-operations/repo>
- 纽约联储 SRF FAQ：<https://www.newyorkfed.org/markets/repo-agreement-ops-faq>
- Markets Data API 示例：<https://markets.newyorkfed.org/api/rp/repo/all/results/last/10.json>
- FRED Release：<https://fred.stlouisfed.org/release?rid=379>

强制解释边界：

1. `RPON*` 系列始于 2000 年；SRF 于 2021-07-29 才建立。2021-07-29 前只能解释为历史临时隔夜回购操作，不能称为 SRF 使用量。
2. 纽约联储说明 Repo Operations 结果包含所有回购操作，包括 small-value exercises。因此 `RPON*` 是 SRF 当前使用量的公开日频代理，但没有自动剔除技术测试。
3. H.4.1 的 `H41RESPPALGTRONWW` 是周三回购协议余额且混合国内回购，仅适合交叉验证，不作为纯 SRF 主序列。

## §2 复用门

接入前代码与本地 DB 仅已有 `SRFTSYD`（SRF 操作利率）以及反向回购 `RRPONTSYD` / `RRPONTSYAWARD`。五条 `RPON*` 指标均不存在。

本次复用已有 `fred` DataSource、FRED adapter、canonical `MacroObservation` writer、scheduler、24 小时 `probe_interval` 和 `us.nyfed.rrp` 发布包；不新增数据源、事实表、writer、adapter 或 migration。

## §3 指标清单

| FRED ID      | 显示名                                   | Frequency | Units                       | code                    | 历史范围                                | 更新                                     |
| ------------ | ---------------------------------------- | --------- | --------------------------- | ----------------------- | --------------------------------------- | ---------------------------------------- |
| `RPONTTLD`   | SRF 使用量（隔夜回购接受量总计）         | Daily     | Billions of US Dollars，NSA | `sched_fred_RPONTTLD`   | 2000-01-03 起；SRF 口径从 2021-07-29 起 | 24h probe                                |
| `RPONTSYD`   | SRF 使用量：美国国债抵押品               | Daily     | Billions of US Dollars，NSA | `sched_fred_RPONTSYD`   | 2000-01-03 起；SRF 口径从 2021-07-29 起 | 24h probe                                |
| `RPONAGYD`   | SRF 使用量：机构债抵押品                 | Daily     | Billions of US Dollars，NSA | `sched_fred_RPONAGYD`   | 2000-01-03 起；SRF 口径从 2021-07-29 起 | 24h probe                                |
| `RPONMBSD`   | SRF 使用量：机构 MBS 抵押品              | Daily     | Billions of US Dollars，NSA | `sched_fred_RPONMBSD`   | 2000-01-03 起；SRF 口径从 2021-07-29 起 | 24h probe                                |
| `RPONTSYSAD` | SRF 提交量：美国国债抵押品（非总提交量） | Daily     | Billions of US Dollars，NSA | `sched_fred_RPONTSYSAD` | 2000-07-07 起；SRF 口径从 2021-07-29 起 | 24h probe                                |
| `SRFTSYD`    | SRF 操作利率                             | Daily     | Percent，NSA                | `sched_fred_SRFTSYD`    | 2021-07-29 起                           | 24h probe；政策阶梯序列可阶段性不变/停发 |

属性逐项核验于 2026-09-02 完成；六条均属于 New York Fed / `Temporary Open Market Operations`。五条量指标在 metadata 持久化 `srfRegimeStartDate=2021-07-29` 和解释警示。

### 本次明确不接入

- `RPT*` 全期限序列：当前与 overnight 主序列重复，不增加分析信息。
- `RPTM*` term 序列：最后观测为 2025-08-21，不是当前 standing overnight facility 的主指标。
- H.4.1 `H41RESPPALGTRONWW`：混合余额，只作交叉验证。
- 纽约联储 API 中机构债/MBS 提交量：FRED 没有完整独立映射；为保持 canonical FRED 单一写入链，本次不新建平行抓取器。需要日内两场操作或完整提交明细时，另行评审复用型 NY Fed Markets API adapter。

## §4 更新方式

- 纽约联储在每个营业日操作结束后发布结果；FRED 通常同日更新并提供下一营业日发布日期。
- 六条均加入现有 `us.nyfed.rrp` probe 型发布包，成员各自保留 `probe_interval=24h`；不依赖经济日历。
- worker 使用现有 FRED revision lookback 重取近期窗口并由统一 writer 幂等 upsert，可覆盖源端修订。
- `SRFTSYD` 是政策设定阶梯序列，不能用普通日频量指标的 14 日 freshness 门槛；五条量指标需要保持最近营业日时效。

## §5 交付物

| 交付物              | 路径                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| seed catalog        | `src/lib/data/scheduler/standingRepoFredSeedCatalog.ts`                 |
| seed / verify       | `scripts/data-worker/seed-standing-repo.ts` / `verify-standing-repo.ts` |
| 统一 registry       | `standing-repo`                                                         |
| 发布包              | `us.nyfed.rrp`（8 个成员：本域 6 条 + 既有 ON RRP 2 条）                |
| 静态目录 / taxonomy | `fredCatalog.ts` / `usCatalogTaxonomy.ts`                               |

## §6 数据验收

- [x] FRED Frequency / Units / Release 已逐项核验
- [x] 全局代码与本地 DB 查重；五条 `RPON*` 为新指标，`SRFTSYD` 复用
- [x] seed 后 DB `freqLabel` / `unit` 抽查通过
- [x] `fetchAcquisition.status=known`、订阅 enabled、发布包链接完整
- [x] 目录归位“美国 → 货币政策与流动性 → 财政部账户与货币市场”；自定义布局已归类，无需新增项
- [x] `data:verify -- --catalog=standing-repo` 通过

| FRED ID      | 首日       | 末日       | 观测数（2026-09-02 验收） |
| ------------ | ---------- | ---------- | ------------------------- |
| `RPONTTLD`   | 2000-01-03 | 2026-09-01 | 3,289                     |
| `RPONTSYD`   | 2000-01-03 | 2026-09-01 | 3,288                     |
| `RPONAGYD`   | 2000-01-03 | 2026-09-01 | 3,279                     |
| `RPONMBSD`   | 2000-01-03 | 2026-09-01 | 3,280                     |
| `RPONTSYSAD` | 2000-07-07 | 2026-09-01 | 3,221                     |
| `SRFTSYD`    | 2021-07-29 | 2026-06-12 | 1,221                     |

本地 `data:sync-calendar` 试跑仍受既有数据库 migration 漂移阻塞：缺少 `mds.scheduler_invocation`，同步写入审计时也缺少 `mds.schedule_audit_event`。该问题未阻止六条指标 seed、发布包链接、强制全量回填、获取确认或 DB verify；部署环境按正常 migration 链运行 `data:apply` 后，24 小时 probe 规则即可由 worker 持续执行。
