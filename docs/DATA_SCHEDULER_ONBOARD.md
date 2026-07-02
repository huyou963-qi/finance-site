# 新指标接入清单（数据调度）

面向「可自动更新」的宏观序列。完整机制见 [DATA_SCHEDULER_PHASE1.md](./DATA_SCHEDULER_PHASE1.md) 与 [DATA_SCHEDULER_OVERVIEW.md](./DATA_SCHEDULER_OVERVIEW.md)。

## 六步流程

| 步骤 | 动作 | 命令 / 文件 |
|------|------|----------------|
| 1 | **入库**：创建 `Instrument` + 历史观测（可选） | `npm run db:import-macro-xlsx` / 领域 `data:seed-*` / 自定义 seed |
| 2 | **签约**：`DataSubscription` + `DataSource` | 同上 seed，或 `scripts/data-worker/seed-*.ts` |
| 3 | **发布包**：挂到官方发布包（多序列共用日历） | 编辑 `src/lib/data/scheduler/releasePackageCatalog.ts` → `npm run data:seed-release-packages` |
| 4 | **日历**：TE 经济日历对齐 `nextRunAt` | `npm run data:sync-calendar`（需 `TE_CALENDAR_COOKIE` 时见 Phase 4 文档） |
| 5 | **获取确认**：probe 或显式标 `known` | `npm run data:probe-sources`（支持 `--skip-known`、`--prefix`、`--fred-sleep-ms=600`；TE 模板 seed 预标 known） |
| 6 | **验证**：拉取 + 管理端目录 | `npm run data:worker` 或管理端「立即同步发布包」 |

> **新指标日历规则只改 `releasePackageCatalog.ts`**，不要往 `teEventMap.ts` 的 `TE_CALENDAR_BY_FRED` 加项（遗留 fallback，发布包优先）。

## 发布包 vs 单序列

- **一包多序列**（CPI 分项、ISM 制造业 PMI + 子项）：在 `releasePackageCatalog.ts` 的 `members` 里加 `fredSeriesIds` / `instrumentCodePatterns`，再 `data:seed-release-packages`。
- **单条 FRED 日频**（如 `T10Y2Y`）：用 `probe_interval` 规则，不参与经济日历（见 `PROBE_ONLY_FRED_SERIES`）。
- **TE 页面抓取**（ISM）：seed 后走 `sync_package` / worker，**不要**在生产用 `data:sync-ism-te`（仅本地 fixture 调试）。

## 自检命令

```powershell
# 订阅与发布包
npm run data:verify-catalog

# 领域自检（按场景选一个）
npm run data:verify-phase1 -- --db
npm run data:verify-overview -- --db
npm run data:verify-cpi -- --db

# 日历 + 拉取（需 .env.local 密钥）
npm run data:sync-calendar
npm run data:worker
npm run data:sync-all-stale
```

管理端：`/admin/data-catalog` → 筛选「仅显示未更新」；「仅数据库（未在 FMP 统一目录）」分类可见未进 FMP 树的 `chov_*` / `jpov_*` / `ism_*` 等。

## 同步方式（生产）

| 场景 | 推荐 |
|------|------|
| 单条无发布包 | 管理端「立即同步」或 `data:sync-one` |
| 发布包内多序列 | 管理端「立即同步发布包」或 API `sync_package` |
| 批量未更新 | 管理端「一键更新未更新指标」或 `data:sync-all-stale` |
| ISM TE 调试解析 | `npm run data:sync-ism-te -- --fixture=.data/te-ism-sample.html` |

## 计划任务（Windows 内网）

- 每 **5 分钟**：`npm run data:worker`
- 每 **小时**：`npm run data:sync-calendar`
- 可选：每小时 `npm run data:sync-all-stale`

## P1 统一命令（可选）

```powershell
npm run data:seed -- --list
npm run data:seed -- --catalog=cpi
npm run data:verify -- --catalog=overview -- --db
npm run data:import-calendar-overrides   # 将 .data 日历 JSON 迁入 DB
```

拉取日志 API 支持 `?code=`、`?package=us.bls.cpi`、`?packageSyncId=<uuid>`。

## 常见问题

| 现象 | 处理 |
|------|------|
| 状态「待确定」 | 跑 `data:probe-sources` 或检查 Excel bootstrap 是否需网络源 |
| `awaiting_calendar_match` | `data:sync-calendar`；检查发布包 `calendar.keywords` |
| 管理端看不到指标 | 可能在「仅数据库」分类；或尚未入库 |
| ISM 子项各自有同步按钮 | 应只在主指标行显示「立即同步发布包」（同包一次更新） |
