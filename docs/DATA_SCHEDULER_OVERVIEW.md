# 美国经济 Overview — 数据调度

与 [US_OVERVIEW_ANALYSIS.md](./US_OVERVIEW_ANALYSIS.md) 及 `.cursor/prompts/us-overview-analysis-framework.md` 配套。

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

# 拉数 + 日历
npm run data:worker
npm run data:sync-calendar
npm run data:sync-ism-te
npm run data:sync-ism-svc-te

# 自检
npm run data:verify-overview -- --db
```

## FRED 序列清单

见 `src/lib/data/scheduler/overviewFredSeedCatalog.ts` → `OVERVIEW_FRED_SERIES`。

新增项（相对 P0 可能尚未单独 seed）：**DFEDTARU**、**PNFIC1**、**HOUST**、**EXPGSC1**、**IMPGSC1**、**FYFSGDA188S**、**GCEC1**、**PCEC96**、**RSAFS** 等支出法序列。

其余（CPIAUCSL、UNRATE、PAYEMS、INDPRO、A191RL1Q225SBEA 等）通常已由 P0 / Phase2 / CPI / Labor seed 创建，`data:seed-overview` 仅 upsert metadata 与订阅。

## ISM PMI

| 仪器 | Provider | 同步脚本 |
|------|----------|----------|
| `ism_us_ism_headline` | `tradingeconomics_ism` | `data:sync-ism-te` |
| `ism_svc_us_svc_headline` | `tradingeconomics_ism_svc` | `data:sync-ism-svc-te` |

日历：`teEventMap.ts` → `TE_CALENDAR_ISM_MANUFACTURING` / `TE_CALENDAR_ISM_SERVICES`。

## 计划任务建议

与 Phase 1 一致：每 5 分钟 `data:worker`；每小时 `data:sync-calendar`。ISM TE 可与 worker 到期订阅一并跑，或发布日前手动 `sync-ism-te` / `sync-ism-svc-te`。

## 无效 / TBD

当前 §3.1 **无 TBD**。扩展指标（CFNAI、UMCSENT 等）见 prompt §3.1 目录自选，不进默认两模板。
