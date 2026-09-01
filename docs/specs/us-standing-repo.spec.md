# Spec：美联储常备回购便利（SRF）操作利率

## §0 元信息

| 字段 | 值 |
|------|----|
| dimension id | `us-standing-repo` |
| 中文名 | 美联储常备回购便利（SRF）操作利率 |
| 状态 | `data-ready` |
| 接入范围 | 原始指标入库、历史回填、持续调度和目录归位；暂不创建内置模板 |
| 评审记录 | 2026-09-01 用户明确要求按 Agent B 接入 |

## §1 口径

用户称“常备借贷便利 SRF”。FRED 对应的美国工具不是中国人民银行 SLF，而是 Federal Reserve **Standing Repo Facility**；FRED 的系列正式名称写作 **Standing Repo (SRP) Operations Rate**。本次接入的是设施操作利率，不把普通回购交易总额 `RPONTSYD`/`RPONTTLD` 误标成 SRF 使用量。

## §2 复用门

全局代码与本地数据库检查均未发现 `SRFTSYD` 或 `sched_fred_SRFTSYD`。接入复用已有 `fred` DataSource、FRED adapter、canonical `MacroObservation` writer、scheduler 和发布包机制；不新增数据源、事实表、writer、adapter 或 migration。

## §3 指标清单

| seriesKey | 显示名 | Frequency | Units | Source | FRED Release | kind | code | 历史回填 | 调度 | 目录位置 |
|-----------|--------|-----------|-------|--------|--------------|------|------|----------|------|----------|
| `fred:SRFTSYD` | 美联储常备回购便利（SRF）操作利率 | Daily（日） | Percent（%），NSA | Federal Reserve Bank of New York | Temporary Open Market Operations | `fred_api` | `sched_fred_SRFTSYD` | FRED API 全历史（始于 2021-07-29） | `probe_interval` 24h；加入既有 `us.nyfed.rrp` 同 Release 包 | 美国 → 货币政策与流动性 → 政策利率 |

核验来源：<https://fred.stlouisfed.org/series/SRFTSYD>。2026-09-01 核验页面字段：Frequency=Daily、Units=Percent, Not Seasonally Adjusted、Release=Temporary Open Market Operations。

## §4 更新与目录设计

- FRED 页面给出下次发布日，但这是工作日连续数据，不按单月宏观发布事件调度；使用日频 `probe_interval` 24 小时。
- 依据 FRED 官方 `Release:` 字段，加入已有 `us.nyfed.rrp` 发布包；该包对应同一 Temporary Open Market Operations release，包仅负责分组/批量同步，成员仍沿用自身 probe 规则。
- `fredCatalog.ts` 静态目录归为“银行与货币”；统一美国税onomies最终落点为“货币政策与流动性 / 政策利率”。

## §5 交付物

| 交付物 | 路径 |
|--------|------|
| seed catalog | `src/lib/data/scheduler/standingRepoFredSeedCatalog.ts` |
| seed / verify | `scripts/data-worker/seed-standing-repo.ts` / `verify-standing-repo.ts` |
| 统一 registry | `standing-repo` |
| 发布包成员 | `us.nyfed.rrp` 增加 `SRFTSYD` |
| 静态目录 / taxonomy | `fredCatalog.ts` / `usCatalogTaxonomy.ts` |

## §6 数据验收

- [x] FRED Frequency / Units / Release 已逐项核验
- [x] 全局代码与本地 DB 查重，确认无美国 `SRFTSYD` 重复项
- [x] seed 后 DB `Instrument.freqLabel=日`、`unit=%` 抽查
- [x] FRED API 全历史回填：2021-07-29 → 2026-06-12，共 1,221 条
- [x] `fetchAcquisition.status=known`、订阅 enabled、发布包 `us.nyfed.rrp` 链接完整
- [x] 目录布局重建后归位“美国 → 货币政策与流动性 → 政策利率（日频）”；未分配 0
- [x] `data:verify -- --catalog=standing-repo` 通过

本地 `data:sync-calendar` 试跑受既有数据库 migration 漂移阻塞：库中缺少待应用 migration `20260831170000_scheduler_audit_logging` 的 `mds.scheduler_invocation`，同时库里存在本地代码没有的两条 migration，故没有冒险执行 migrate。该问题不影响本指标的 `probe_interval` 规则、强制同步、历史回填或 verify；部署环境按正常 migration 链应用后可完成日历总任务。
