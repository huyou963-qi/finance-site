# Phase 3：可运维与目录全覆盖

## 任务清单

| # | 任务 | 交付 |
|---|------|------|
| 3.1 | 管理端调度 API | `POST /api/admin/data-scheduler/actions` |
| 3.2 | 拉取日志 API | `GET /api/admin/data-scheduler/fetch-runs` |
| 3.3 | 数据目录 UI | 调度工具栏、立即同步、最近拉取状态 |
| 3.4 | World Bank 全量 | `npm run data:seed-phase3-wb`（252 键，跳过已有） |
| 3.5 | usov YoY 变换 | `fredTransform.ts` + worker 自动同比 |
| 3.6 | 自检 | `npm run data:verify-phase3` |

## 管理页操作（需 admin 登录）

在 `/admin/data-catalog`：

- **刷新经济日历** → `sync_calendar`
- **跑到期任务** → `run_worker`（force，最多 25 条）
- **跑 BIS 订阅** → `run_worker_bis`
- **探测 overview** → `probe_overview`（usov/debtcap/sched_fred 等）
- **最近拉取日志** → 读取 `FetchRun`
- 每行 **立即同步** → `sync_one`

## CLI

```bash
npm run data:seed-phase3-wb          # 补全世行 14 国 × 18 指标
npm run data:seed-phase3-wb -- --dry-run
npm run data:verify-phase3 -- --db
```

## usov 同比

代码名含 `_yoy` 的 FRED 订阅（如 `usov_c16_cpi_yoy`）在拉取水平序列后自动计算 **同比 %** 再入库。

## Phase 4 预览

- usov 剩余 FRED 自动订阅
- jpov/chov 官方 API 替代 xlsx
- 告警去重与 Slack 集成
