# 美国经济 Overview — 数据调度

与 [US_OVERVIEW_ANALYSIS.md](./US_OVERVIEW_ANALYSIS.md) 及 `.cursor/prompts/us-overview-analysis-framework.md` 配套。  
新指标接入总清单见 [DATA_SCHEDULER_ONBOARD.md](./DATA_SCHEDULER_ONBOARD.md)。

## 数据源概览

| 类型 | 键前缀 | 说明 |
|------|--------|------|
| FRED | `fred:{ID}` / `sched_fred_{ID}` | **16** 条默认双模板序列 |
| ISM MDS | `mds:ism_*` / `mds:ism_svc_*` | 制造/服务业 PMI（**L2S 可选**，不进默认 8 槽） |

## 初始化

```powershell
# FRED 订阅（幂等，复用 P0/Phase2/CPI/Labor 已有项）
npm run data:seed-overview

# ISM（若尚未配置 TE）
npm run data:seed-ism-te
npm run data:seed-ism-svc-te
npm run data:seed-release-packages

# 日历 + 拉取
npm run data:sync-calendar
npm run data:worker

# 自检
npm run data:verify-overview -- --db
```

## FRED 序列清单

见 `src/lib/data/scheduler/overviewFredSeedCatalog.ts` → `OVERVIEW_FRED_SERIES`。

新增项（相对 P0 可能尚未单独 seed）：**DFEDTARU**、**PNFIC1**、**HOUST**、**EXPGSC1**、**IMPGSC1**、**FYFSGDA188S**、**GCEC1**、**PCEC96**、**RSAFS** 等支出法序列。

其余（CPIAUCSL、UNRATE、PAYEMS、INDPRO、A191RL1Q225SBEA 等）通常已由 P0 / Phase2 / CPI / Labor seed 创建，`data:seed-overview` 仅 upsert metadata 与订阅。

## ISM PMI

| 仪器 | Provider | 发布包 | 生产同步 |
|------|----------|--------|----------|
| `ism_us_ism_*` | `tradingeconomics_ism` | `us.ism.manufacturing` | 管理端「立即同步发布包」/ `data:worker` / `sync_package` |
| `ism_svc_us_svc_*` | `tradingeconomics_ism_svc` | `us.ism.services` | 同上 |

日历：在 `releasePackageCatalog.ts` 中 `us.ism.manufacturing` / `us.ism.services` 的 `calendar` 字段维护（**不要**再改 `teEventMap.ts` 的 ISM 常量）。

本地调试 HTML 解析（非生产）：

```powershell
npm run data:sync-ism-te -- --fixture=.data/te-ism-sample.html
npm run data:sync-ism-svc-te -- --fixture=.data/te-ism-svc-sample.html
```

## 计划任务建议

与 Phase 1 一致：每 5 分钟 `data:worker`；每小时 `data:sync-calendar`。ISM 与包内其他序列一样，由 worker 或管理端包级同步触发，无需单独 cron `sync-ism-te`。

## 无效 / TBD

当前 §3.1 **无 TBD**。扩展指标（CFNAI、UMCSENT 等）见 prompt §3.1 目录自选，不进默认两模板。
