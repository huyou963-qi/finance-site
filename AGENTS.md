# AGENTS.md — AI 与开发者上下文

本文件供 **Cursor / Copilot 等 AI** 与新人快速理解仓库。协作流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 项目是什么

本地/内网部署的金融数据站：**宏观仪表盘**（ECharts + PostgreSQL/FMP/FRED）+ **美股 K 线行情**（Lightweight Charts + Yahoo Finance，全美股日线落库 + 精确复权）+ **美股行业**（GICS Sector ETF / 财报 / 经营叙事）+ 用户认证与部分工具页。

## 仓库结构

```
finance-site/
├── src/app/              # 页面 + API Route Handlers
│   ├── macro/            # 宏观主功能（最大模块）
│   ├── markets/          # K 线
│   ├── equity/           # 美股行业（GICS）
│   ├── api/data/         # 宏观、K 线、目录 BFF
│   ├── api/equity/       # 行业、财报、经营简报 ingest
│   ├── api/auth/         # 登录注册
│   └── api/tools/        # 模板偏好等
├── src/components/       # Macro*、Candlestick*、图表叠加
├── src/lib/data/         # 数据层（K 线 providers、macro、目录）
├── src/lib/equity/       # GICS / 风格篮子 / 行业收益与财报
├── prisma/               # schema + migrations
├── scripts/              # 导入/ETL（tsx）；scripts/equity/*
├── .cursor/rules/        # 团队共享 Cursor 规则（必跟）
└── .github/              # PR 模板、CI
```

## 关键数据流

### 宏观

1. 浏览器 → `GET /api/data/macro?source=unified`（或 observations）
2. 服务端读 `FMP_API_KEY` / DB `mds` 观测表
3. `MacroSection` + `macroChartOption.ts` 渲染 ECharts

### K 线（美股，全部落库）

1. 浏览器 → `GET /api/data/klines?symbol=AAPL&interval=1d&adjust=forward|backward|none`
2. `yahooKlineProvider` → `equityPriceStore`：db-first 读 `mds.equity_daily_bar`，缺口回补 Yahoo；日/周线服务端按 `mds.equity_split` + 分红因子**精确复权**（`priceAdjustment.ts`），盘中 15m/1h/4h 实时取
3. `MarketsClient` / `StockChartWorkspace` 用 Lightweight Charts（客户端不再复权）
4. 符号联想 `GET /api/data/symbol-search` 走 SEC company_tickers（全美股）
5. 批量回填：`npm run equity:sync-prices`（详见 [docs/US_EQUITY_KLINE.md](./docs/US_EQUITY_KLINE.md)）

### 美股行业

1. `equity:seed-sp500` → Wikipedia 成分 + GICS → `mds.equity_security`
2. 浏览器 → `/equity/sectors`；收益 `GET /api/equity/sector-returns`（Yahoo Finance Sector ETF，可选 Tiingo）
3. 财报聚合 / 经营叙事见 [docs/US_EQUITY_SECTOR_ANALYSIS.md](./docs/US_EQUITY_SECTOR_ANALYSIS.md)

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

**部署落库**：`npm run data:apply`（幂等编排：migrate + 全 catalog seed + 发布包 + 目录布局 + 日历 + 各域自检；读 registry，新维度自动纳入）。开发库是缓存不是事实来源，云端跑此命令即从 git 代码 + FRED 重建 DB，观测由 worker 自动回填。详见 [docs/DATA_DEPLOY_SYNC.md](./docs/DATA_DEPLOY_SYNC.md)。

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
「美国消费与居民资产负债」：`data:seed-consumer-balance` / `data:verify-consumer-balance`（加 `--db`）；文档 [docs/US_CONSUMER_BALANCE_ANALYSIS.md](./docs/US_CONSUMER_BALANCE_ANALYSIS.md)。

「美国对外部门与美元」：`data:seed-external-dollar` / `data:verify-external-dollar`（加 `--db`）；文档 [docs/US_EXTERNAL_DOLLAR_ANALYSIS.md](./docs/US_EXTERNAL_DOLLAR_ANALYSIS.md)。
「美国制造业与库存周期」：`data:seed-industry-inventory` / `data:verify-industry-inventory`（加 `--db`）；文档 [docs/US_INDUSTRY_INVENTORY_ANALYSIS.md](./docs/US_INDUSTRY_INVENTORY_ANALYSIS.md)。

「中国国家统计局 PMI」：`data:seed-nbs-pmi` → `data:sync-nbs-pmi` / `data:verify-nbs-pmi`（加 `--db`）；制造业、非制造业及分项走新版国家数据 JSON 全历史 + 官方月报 Excel 首发，Spec [docs/specs/cn-nbs-pmi.spec.md](./docs/specs/cn-nbs-pmi.spec.md)。

「中国国家统计局 PPI」：`data:seed-nbs-ppi` → `data:sync-nbs-ppi` / `data:verify-nbs-ppi -- --db`；总项、生产/生活资料及 41 个工业门类走国家数据 JSON，全历史按基期分段回填；上年同月=100 指数同步保存同比，环比取上月=100。

「中国国家统计局规模以上工业增加值」：`data:seed-nbs-industrial` → `data:sync-nbs-industrial` / `data:verify-nbs-industrial -- --db`；总项、经济类型、三大门类与 41 个行业回填当月/累计同比，总项环比取月度发布稿（官方未发布分项环比）。

「中国国家统计局 GDP」：`data:seed-nbs-gdp` → `data:sync-nbs-gdp` / `data:verify-nbs-gdp -- --db`；季度生产法名义值、实际同比、总项实际环比与三大需求贡献率，年度生产法与支出法名义值及实际同比；仅保留国家统计局公开口径，不推算分项环比。

「中国国家统计局固定资产投资」：`data:seed-nbs-fai` → `data:sync-nbs-fai` / `data:verify-nbs-fai -- --db`；月度累计同比及行业、资金、构成、注册类型分项，年度名义值/同比，月度发布稿总项季调环比；1 月免报，官方未发布的分项环比不推算。

「中国财政部财政收支」：`data:seed-mof-fiscal` → `data:sync-mof-fiscal` / `data:verify-mof-fiscal -- --db`；一般公共预算、政府性基金的累计收入/支出及分项累计额、同比，历史来自国库司月报归档；季度、年度对应月末累计口径，不推算单月值或环比。

「中国人民银行货币与信用」：`data:seed-pbc-monetary` → `data:sync-pbc-monetary` / `data:verify-pbc-monetary -- --db`；月度 M0/M1/M2、人民币贷款/存款、分部门累计增量、社融存量/增量及分项、同业利率和 LPR，历史来自人民银行公开归档；仅保留公告直接披露的余额、同比、累计增量或利率，不推算环比。

「中国外汇与国际收支」：`data:seed-safe-external` → `data:sync-safe-external` / `data:verify-safe-external -- --db`；外汇及黄金储备、银行结售汇、代客涉外收付款、国际收支、国际投资头寸和全口径外债的公开时间序列表；按原表月/季/年频保存，不推算未发布的同比或环比。

「中国国家统计局 CPI」：`data:seed-nbs-cpi` → `data:sync-nbs-cpi` / `data:verify-nbs-cpi`（加 `--db`）；全国总项、核心项及八大类的指数、同比、环比走国家数据 UUID 接口全历史 + 官方月报 Excel 首发。

## 模块分工建议（3–5 人）

| 模块 | 主要路径 | 分支前缀示例 |
|------|----------|----------------|
| 宏观 UI/模板 | `src/app/macro/`, `Macro*.tsx` | `feature/macro-*` |
| 美股 K 线 | `src/app/markets/`, `src/lib/data/providers/`, `src/lib/equity/{yahooChart,priceAdjustment,equityPriceStore}` | `feature/markets-*` |
| 认证/管理 | `src/app/auth/`, `api/auth/` | `feature/auth-*` |
| 数据/DB | `prisma/`, `scripts/` | `feature/db-*` |
| 工具页 | `src/app/tools/` | `feature/tools-*` |

**同一时间仅一人** 提交 `prisma/migrations/*` 变更。

## 个股经营里程碑（Skill）

用户可用自己的 AI 按 [`.cursor/skills/company-milestone-ingest/`](.cursor/skills/company-milestone-ingest/) 搜集单票产品/产能/影响该公司的政策。模板整包：`/templates/company-milestone/company-milestone-pack.zip`（改文件后 `npm run pack:company-milestone`）。在 **行情页** `/markets` 底部展开「事件筛选器」：**导入经营事件仅本地对本账号生效**；Admin 用 `events:import-ingest` 入库后全站可见；轴上本地优先于共享库与 SEC。亦可 CLI：

```bash
npm run events:validate-ingest -- <file.json>
npm run events:import-ingest -- <file.json>
```

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

## 生产部署（阿里云 / GitHub Actions）

**代码不走服务器 `git pull`**。`main` push 触发 `.github/workflows/deploy.yml`：

1. GitHub Actions：`npm ci` → `npm run build` → `node scripts/deploy-pack.mjs` → `deploy.tar.gz`
2. `scp` 到服务器 `/opt/finance-site/`，解压覆盖 `.next`、`node_modules`、`src`、`scripts` 等
3. 服务器上：`npm run db:migrate` → `npm run data:apply -- --skip-migrate` → `pm2 restart finance-site`

数据库与指标订阅由 deploy 脚本幂等落库，详见 [docs/DATA_DEPLOY_SYNC.md](./docs/DATA_DEPLOY_SYNC.md)。

| 在服务器上 | 不要做 |
|-----------|--------|
| 保留 `.env.local`（`DATABASE_URL`、`FRED_API_KEY` 等） | `git pull` / 在服务器改业务代码 |
| 看 Actions 日志与 `pm2 logs` | 用 `git status` 判断是否已部署最新版 |
| deploy 失败时手动 `npm run data:apply` | `pg_dump` 同步开发库 |

若 `/opt/finance-site` 曾有 `git clone`，tar 解压后 `git status` 会一片红，可忽略或删除 `.git`。

**主机卡死排查落盘**（心跳 + 压力现场 + 开机捞 OOM）：见 [docs/OPS_HOST_DIAGNOSTICS.md](./docs/OPS_HOST_DIAGNOSTICS.md)；部署后在服务器装一次 cron（`host-diagnostics-snapshot.sh` 每 2 分钟）。

## 部署参考（内网 Windows）

```bash
npm run build
npm run start   # 默认 3000
```

构建前停止占用 Prisma 引擎的 node 进程。外网访问需自行配置反向代理与 DNS。
