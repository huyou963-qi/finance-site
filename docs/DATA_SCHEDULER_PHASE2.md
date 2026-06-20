# Phase 2：扩大可调度订阅面

在 Phase 1（经济日历 + FRED worker）跑通后，本阶段扩展数据源与订阅数量。

## 任务清单

| # | 任务 | 命令 / 文件 |
|---|------|-------------|
| 1 | BIS CSV 适配器 | `adapters/bisAdapter.ts`, `adapters/bisCsv.ts` |
| 2 | World Bank 适配器 | `adapters/worldbankAdapter.ts` |
| 3 | Worker 接线 | `runSubscription.ts` → `REST_API` / `WORLD_BANK_API` |
| 4 | Phase 2 种子 | `npm run data:seed-phase2` |
| 5 | 自检 | `npm run data:verify-phase2 -- --live --db` |

## 订阅范围（seed-phase2）

| 来源 | 数量 | 说明 |
|------|------|------|
| FRED 目录扩展 | 18 | `sched_fred_*`（P0 已有 10 条不重复） |
| usov_* | 19 | 挂到已入库的 `usov_*` Instrument |
| debtcap BIS | 18 | `WS_DSR` / `WS_CREDIT_GAP`，跳过 4 条政府 leverage_nominal |
| World Bank 试点 | 30 | 6 国 × 5 指标（CN/JP/DE/GB/FR/IN） |

**合计约 87 条新增**（加上 P0 的 10 条 → **~97 enabled 订阅**）。

## 使用流程

```bash
npm run data:seed-p0          # 若尚未执行
npm run data:seed-phase2      # 扩展订阅
npm run data:sync-calendar    # FRED 月/季序列
npm run data:worker           # 拉取到期项
npm run data:verify-phase2 -- --live --db
```

### 前置数据

- **usov_***：需已导入 US Overview xlsx（`npm run db:import-us-overview-xlsx`）
- **debtcap_***：需已导入偿债能力 xlsx（`npm run db:import-debt-capacity-xlsx`）
- **FRED / WB**：无需额外导入（seed 会创建 Instrument）

跳过 World Bank 试点：

```bash
npm run data:seed-phase2 -- --skip-wb
```

## sourceSeriesKey 格式

| 数据源 | 格式 | 示例 |
|--------|------|------|
| FRED | `series_id` | `CPIAUCSL` |
| BIS | `flowId:seriesKey` | `WS_DSR:Q.US.H` |
| World Bank | `CC:INDICATOR` | `CN:FP.CPI.TOTL.ZG` |

## 发布规则

- FRED 月/季：同 Phase 1（`economic_calendar` + fallback）
- FRED 日频 / 市场序列：固定间隔探测
- BIS 季频：每 72 小时探测
- World Bank 年频：每 168 小时探测

## Phase 3 预览

- 管理页触发 sync / worker
- 剩余 222 条 World Bank 目录批量 seed
- usov YoY 变换层、jpov/chov 官方 API
