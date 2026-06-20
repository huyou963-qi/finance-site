# 美国就业市场数据调度

## 发布规律

| 数据 | 来源 | 时间 |
|------|------|------|
| 非农、失业、参与率、时薪 | BLS（CES/CPS） | 每月第一个周五 **8:30 ET** |
| JOLTS 空缺/雇佣/离职 | BLS | 约滞后 **1 个月** |
| 初请 / 续请失业金 | DOL | 每周四 **8:30 ET** |

## 本系统流程

```
Investing 经济日历  →  data:sync-calendar  →  DataSubscription.nextRunAt
                                              ↓
                                    data:worker（到期执行）
                                              ↓
                              FRED API  →  MacroObservation
```

- 就业报告月频序列：`releaseRule.type = economic_calendar`（关键词 nonfarm payrolls / unemployment rate）
- JOLTS：`jolts` / `job openings` / `quits` / `hires`
- 初请 `ICSA`：weekly + `probe_interval` 或日历 jobless claims
- 日历 403：回退 `calendar_monthly` / `probe_interval`

## 运维命令

```bash
npm run data:seed-labor          # 幂等写入 20 条 FRED 序列 + 订阅
npm run data:sync-calendar       # 建议：每小时
npm run data:worker              # 建议：每 1–5 分钟
npm run data:sync-one -- sched_fred_UNRATE --force
npm run data:verify-labor -- --db
```

### 环境变量

- `FRED_API_KEY` — 必填
- `INVESTING_CALENDAR_COOKIE` — 日历 403 时配置

## 管理页

`/admin/data-catalog` → **美国** → **就业与工资 / 劳动力流动 / 领先与深度 / 就业结构**

## 种子与目录

- 种子：`src/lib/data/scheduler/laborFredSeedCatalog.ts`
- 模板布局：`src/lib/data/laborAnalysisLayout.ts`
- 指标树：`src/lib/data/fredCatalog.ts`
- Instrument code：`sched_fred_{FRED_ID}`

## JOLTS 验证注意

JOLTS 最新 obs 通常比 CES **晚约 1 月**；`verify-labor` 对 JOLTS 使用 **当前月 − 4** 的阈值，勿与非农最新月强行对齐判失败。
