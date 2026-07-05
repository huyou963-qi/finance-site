# AGENTS.md — AI 与开发者上下文

本文件供 **Cursor / Copilot 等 AI** 与新人快速理解仓库。协作流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 项目是什么

本地/内网部署的金融数据站：**宏观仪表盘**（ECharts + PostgreSQL/FMP/FRED）+ **K 线行情**（Lightweight Charts + Binance/IBKR）+ 用户认证与部分工具页。

## 仓库结构

```
finance-site/
├── src/app/              # 页面 + API Route Handlers
│   ├── macro/            # 宏观主功能（最大模块）
│   ├── markets/          # K 线
│   ├── api/data/         # 宏观、K 线、目录 BFF
│   ├── api/auth/         # 登录注册
│   ├── api/tools/        # 模板偏好等
│   └── api/ibkr/         # IB 持仓/成交（可选）
├── src/components/       # Macro*、Candlestick*、图表叠加
├── src/lib/data/         # 数据层（providers、macro、ibkr）
├── prisma/               # schema + migrations
├── scripts/              # 导入/ETL（tsx）
├── .cursor/rules/        # 团队共享 Cursor 规则（必跟）
└── .github/              # PR 模板、CI
```

## 关键数据流

### 宏观

1. 浏览器 → `GET /api/data/macro?source=unified`（或 observations）
2. 服务端读 `FMP_API_KEY` / DB `mds` 观测表
3. `MacroSection` + `macroChartOption.ts` 渲染 ECharts

### K 线

1. 浏览器 → `GET /api/data/klines?symbol=...&provider=...`
2. `src/lib/data/providers/` 注册 Binance / IBKR 等
3. `MarketsClient` / `StockChartWorkspace` 用 Lightweight Charts

### 用户偏好

- 用户宏观模板 JSON → `UserMacroChartPrefs`
- 系统内置模板（全局）→ `SystemMacroChartPrefs`（admin 写入）
- API：`/api/tools/macro-chart-prefs`

## 环境变量

复制 `.env.example` → `.env.local`（**勿提交**）。最少需要：

| 变量 | 用途 |
|------|------|
| `DATABASE_URL` | PostgreSQL |
| `FMP_API_KEY` | 宏观 unified / TTM PE |
| `APP_BASE_URL` | 邮件验证链接 |

可选：`FRED_API_KEY`、`IBKR_*`、`SMTP_*`。详见 `.env.example` 注释。

## 按计划更新宏观数据（P0）

| 表 | 说明 |
|----|------|
| `mds.statistical_agency` | 各国统计机构 |
| `mds.data_source` | FRED / 世行等连接器 |
| `mds.data_subscription` | 序列更新计划 + `next_run_at` |
| `mds.fetch_run` | 拉取日志 |

```bash
npm run db:migrate          # 先应用 migration
npm run data:seed-p0        # 机构 + 10 条 FRED 试点
npm run data:sync-calendar  # Investing 经济日历 → nextRunAt
npm run data:worker         # 跑到期订阅（需 FRED_API_KEY）
npm run data:verify-phase1  # Phase 1 自检（加 --fetch --db）
npm run data:seed-phase2    # Phase 2：FRED 扩展 + usov + BIS debtcap + WB 试点
npm run data:verify-phase2  # Phase 2 自检（加 --live --db）
npm run data:probe-sources         # 探测获取方式 → metadata.fetchAcquisition
npm run data:probe-sources -- --scope=overview   # 仅 overview/debtcap/fred
```

Phase 1 跑通步骤与 cron 示例见 [docs/DATA_SCHEDULER_PHASE1.md](./docs/DATA_SCHEDULER_PHASE1.md)。  
Phase 2 扩展订阅见 [docs/DATA_SCHEDULER_PHASE2.md](./docs/DATA_SCHEDULER_PHASE2.md)。  
Phase 3 管理端调度与 WB 全量见 [docs/DATA_SCHEDULER_PHASE3.md](./docs/DATA_SCHEDULER_PHASE3.md)。  
Phase 4 Overview 重导、滞后告警、日历映射见 [docs/DATA_SCHEDULER_PHASE4.md](./docs/DATA_SCHEDULER_PHASE4.md)。  
Phase 5 usov 补全、e-Stat、Slack 告警见 [docs/DATA_SCHEDULER_PHASE5.md](./docs/DATA_SCHEDULER_PHASE5.md)。

**发布包（Phase B）**：经济日历按官方发布包对齐，而非逐指标匹配。

```bash
npm run data:seed-release-packages   # 写入 mds.release_package + 成员链接
npm run data:sync-calendar           # 包级日历匹配 → fan-out nextRunAt
```

管理端 `GET /api/admin/data-scheduler/release-packages` 查看包状态；指标目录行显示「发布包」列。  
**新指标接入六步清单**见 [docs/DATA_SCHEDULER_ONBOARD.md](./docs/DATA_SCHEDULER_ONBOARD.md)。  
日历与发布包配置以 `src/lib/data/scheduler/releasePackageCatalog.ts` 为准（`teEventMap.ts` 中 `TE_CALENDAR_BY_FRED` 仅遗留 fallback）。  
统一 seed/verify：`npm run data:seed -- --catalog=cpi`、`npm run data:verify -- --catalog=phase1`；日历覆盖入库：`npm run data:import-calendar-overrides`。

Windows 计划任务建议：每小时 `data:sync-calendar`，每 5 分钟 `data:worker`。

## 常用命令

```bash
npm install
npm run dev              # http://localhost:3000
npm run build            # 生产构建（先停 dev/start）
npm run start            # 生产运行
npm run lint
npm run db:migrate       # 应用他人 migration
npm run db:migrate:dev   # 本地改 schema 后生成 migration
npm run db:studio        # Prisma Studio
```

数据导入示例（需 DB 与 xlsx）：`npm run db:import-japan-overview-xlsx` 等，见 `package.json` 的 `db:*` 脚本。

**统一布局宏观 Excel**（列头 `国家:指标:子维度`）：见 [.cursor/prompts/macro-xlsx-import.md](./.cursor/prompts/macro-xlsx-import.md)。流程：`db:import-macro-xlsx --dry-run` → 加 preset → 正式导入 → `db:verify-macro-import`。

**TradingEconomics 指标页自动更新**（给定 URL，HTML 抓取 + 日历调度）：见 [.cursor/prompts/te-indicator-scrape.md](./.cursor/prompts/te-indicator-scrape.md)。范本：`data:seed-ism-te` → `data:sync-ism-te` → `data:sync-calendar`。

**新增宏观分析维度（拆维度 → 定指标 → 入库调度 → 建模板）**：走 Agent 流水线，见 [.cursor/prompts/macro-dimension-pipeline.md](./.cursor/prompts/macro-dimension-pipeline.md)；Spec 模板与已占用指标清单在 `docs/specs/`。
首个完成域「美国货币政策与金融条件」：`data:seed-monetary` / `data:verify-monetary`（加 `--db`）；新 FRED 指标目录归类 `data:sync-catalog-layout -- --keys=fred:<ID>,...`；文档 [docs/US_MONETARY_ANALYSIS.md](./docs/US_MONETARY_ANALYSIS.md)。

## 模块分工建议（3–5 人）

| 模块 | 主要路径 | 分支前缀示例 |
|------|----------|----------------|
| 宏观 UI/模板 | `src/app/macro/`, `Macro*.tsx` | `feature/macro-*` |
| K 线 / IBKR | `src/app/markets/`, `ibkr*`, `providers/` | `feature/markets-*` |
| 认证/管理 | `src/app/auth/`, `api/auth/` | `feature/auth-*` |
| 数据/DB | `prisma/`, `scripts/` | `feature/db-*` |
| 工具页 | `src/app/tools/` | `feature/tools-*` |

**同一时间仅一人** 提交 `prisma/migrations/*` 变更。

## AI 工作检查清单

完成任务前确认：

- [ ] 只改了任务相关文件
- [ ] 未提交 `.env.local` 或密钥
- [ ] `useSearchParams` 页面有 `Suspense`
- [ ] 浏览器端 ID 用 `src/lib/randomId.ts`
- [ ] 本地 `npm run build` 通过（或说明为何 CI 会通过）
- [ ] 若改 schema：PR 中写明 `npm run db:migrate` 步骤

## 禁区

- 不要删除或重写已合并的 migration
- 不要把 API Key 写进客户端或提交到 Git
- 不要在未协调时大改 `MacroSection.tsx` 整体结构
- 生产部署密钥不要写进仓库（用服务器 `.env.local` 或 GitHub Secrets）

## 部署参考（内网 Windows）

```bash
npm run build
npm run start   # 默认 3000
```

构建前停止占用 Prisma 引擎的 node 进程。外网访问需自行配置反向代理与 DNS。
