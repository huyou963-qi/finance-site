# CPI 数据调度与更新机制

## 发布规律

- **来源**：美国劳工统计局（BLS）CPI，经 FRED 聚合。
- **时间**：通常每月中旬 **8:30 ET** 公布 **上月** 数据（具体日以 Investing 经济日历为准）。
- **范围**：Headline、Core 及所有 `CUSR0000*` 分项 **同一时刻** 发布；FRED 通常在发布后数分钟至数小时内更新。

## 本系统流程

```
Investing 经济日历  →  data:sync-calendar  →  DataSubscription.nextRunAt
                                              ↓
                                    data:worker（到期执行）
                                              ↓
                              FRED API  →  Observation 表
```

- 月频 CPI 系列：`releaseRule.type = economic_calendar`
- 日历匹配：`src/lib/data/scheduler/investingEventMap.ts`（关键词含 consumer price index / cpi m/m）
- 发布延迟：`releaseDelayMinutes`（避免源端尚未入库）
- 日历 403 / 无匹配：回退 `calendar_monthly` 或 `probe_interval`

## 日频驱动因子

| 序列 | 规则 |
|------|------|
| `T5YIE`、`T10YIE` | `PROBE_ONLY` — 固定间隔探测 |
| `DCOILWTICO` | 日频探测（可选日历 crude oil 事件） |

## 运维命令

```bash
npm run data:seed-cpi          # 幂等写入 Instrument + DataSubscription
npm run data:sync-calendar     # 建议：每小时
npm run data:worker            # 建议：每 1–5 分钟
npm run data:sync-one -- sched_fred_CPIAUCSL --force
npm run data:verify-cpi -- --db
```

### Windows 任务计划（示例）

与 `docs/DATA_SCHEDULER_PHASE1.md` 相同：每小时 sync-calendar，每 5 分钟 worker。

### 环境变量

- `FRED_API_KEY` — 必填
- `INVESTING_CALENDAR_COOKIE` — 日历 403 时配置

## 管理页

`/admin/data-catalog` → **美国** → 分类 **CPI 综合 / 住房 / … / 通胀驱动因子**

各指标列展示：**下次更新**、**更新计划**、**日历状态**、**立即同步**。

页面顶部 **美国 CPI 数据更新机制** 卡片为本节摘要。

## 种子与目录

- 种子定义：`src/lib/data/scheduler/cpiFredSeedCatalog.ts`
- 指标树：`src/lib/data/fredCatalog.ts`（`fred:{FRED_ID}`）
- Instrument code：`sched_fred_{FRED_ID}`
