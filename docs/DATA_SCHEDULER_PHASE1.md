# Phase 1：经济日历调度跑通

目标：Investing 经济日历 → `nextRunAt` → `data:worker` 在发布时刻拉取 FRED 数据。

## 1. 环境准备

```bash
cp .env.example .env.local
# 填写 DATABASE_URL、FRED_API_KEY
# 若 sync-calendar 403，填写 INVESTING_CALENDAR_COOKIE
npm run db:migrate
npm run data:seed-p0
```

## 2. 日常命令（建议定时）

| 命令 | 频率 | 作用 |
|------|------|------|
| `npm run data:sync-calendar` | 每小时 | 从经济日历刷新各订阅 `nextRunAt` |
| `npm run data:worker` | 每 1–5 分钟 | 执行到期订阅的 FRED 拉取 |
| `npm run data:verify-phase1` | 部署前 / 排障 | 检查 env、日历解析、可选 DB |

### Windows 任务计划程序（示例）

**同步日历（每小时）**

- 程序：`cmd.exe`
- 参数：`/c cd /d C:\path\to\finance-site && npm run data:sync-calendar >> .data\calendar-sync.log 2>&1`

**Worker（每 5 分钟）**

- 参数：`/c cd /d C:\path\to\finance-site && npm run data:worker >> .data\worker.log 2>&1`

### Linux cron（示例）

```cron
0 * * * * cd /opt/finance-site && npm run data:sync-calendar >> /var/log/finance-calendar.log 2>&1
*/5 * * * * cd /opt/finance-site && npm run data:worker >> /var/log/finance-worker.log 2>&1
```

## 3. 验证清单

```bash
npm run data:verify-phase1          # 不连 DB：解析 + 可选拉取日历
npm run data:sync-calendar -- --dry-run
npm run data:sync-calendar          # 写入 nextRunAt
npm run data:worker                 # 仅跑到期项
npm run data:sync-one -- sched_fred_CPIAUCSL --force
```

管理页 `/admin/data-catalog` 应看到：

- **更新计划**：`经济日历：… @ … UTC`
- **日历已对齐** / **日历拉取失败**（403 时会回退间隔探测）

## 4. 规则说明

- **月/季宏观**（CPI、NFP、失业率等）：`economic_calendar` + Investing 匹配
- **日频 / 无日历**（`T10Y2Y`、`GS10`）：`probe_interval`，不参与 sync-calendar
- **403 / 无匹配**：自动回退 `releaseRule.fallback`，worker 仍按间隔运行

## 5. 故障排查

| 现象 | 处理 |
|------|------|
| `Can't reach database` | 启动 Postgres，检查 `DATABASE_URL` |
| 日历 0 条 + 403 | 配置 `INVESTING_CALENDAR_COOKIE` |
| `not_due` | `nextRunAt` 在未来，正常；或 `--force` 测试 |
| 无新观测 | 发布窗口内多跑几次 worker；检查 `FRED_API_KEY` |
