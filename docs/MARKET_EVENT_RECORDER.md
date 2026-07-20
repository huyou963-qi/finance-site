# 事件记录器与 K 线标记

## 双源模型

| 源 | 内容 | 入库 |
|----|------|------|
| SEC `stockEvents` | 10-Q/10-K/8-K、拆分、业绩 metrics | **不**写入 `MarketEvent`，图表直接读 |
| `MarketEvent` | 政策、讲话、评级、目标价、经营新闻等 | AI Skill / 人工 |

## AI Skill 批补

Skill：`.cursor/skills/market-event-ingest/`

```bash
npm run events:validate-ingest -- .data/event-ingest-run.json
npm run events:import-ingest -- .data/event-ingest-run.json
```

禁止重复 SEC 已覆盖事件。

**库内去重**：除 `externalId` 外，同日 + 相同 `sourceUrl` / 标题+类型 / 正文指纹 / 评级机构+标的 视为同一事件——不新建，合并标签（见 Skill `reference/dedup.md`）。导入回报含 `merged`。

## 旧事件字段回填

```bash
npm run db:backfill-market-event-fields -- --dry-run
npm run db:backfill-market-event-fields
# 云上（代码部署后执行一次）
cd /opt/finance-site && npm run db:backfill-market-event-fields
```

## 批跑队列（自动搜集）

用「对象 × mode × 年」任务格驱动 Skill，人工确认后入库。

| 约定 | 值 |
|------|-----|
| 个股范围 | S&P 500（`mds.equity_security` 且 `gics_sector` 非空） |
| 时间主窗 | `2006-01-01` → 今天，按年切片 |
| 年份波次 | 先 2016+，再回补 2006–2015 |
| 队列文件 | `.data/market-event-ingest-queue.json`（gitignore） |
| 进度表 | `.data/market-event-ingest-record.md` |
| 输出 JSON | `.data/ingest/{object}-{mode}-{from}_{to}.json` |

### 优先级

1. **P0** US `policy` / `macro-event` / `speech` + 黄金（GLD/GC=F）
2. **P1** GICS 十一大类政策/宏观 + SPY/QQQ/TLT
3. **P2** SP500：`rating` → `price-target` → `ops-news`；（mega-cap 可加 `speech`）

### 命令

```bash
npm run events:ingest-seed-p0
npm run events:ingest-gen-sp500
npm run events:ingest-gen-sp500 -- --from-year=2016 --dry-run
npm run events:ingest-next -- --stats
npm run events:ingest-next
# Agent 完成一格 dry-run / import 后：
npm run events:ingest-next -- --done=<taskId> --output=.data/ingest/....json
```

Agent 规程见 Skill「批跑（队列驱动）」：SP500 格须先对账 `stockEvents`；连续批跑时校验通过即正式 import，并自动领取下一格。

### 上云

事件数据在 **PostgreSQL `market_event` 表**，不在 Git。本机批跑产物为 `.data/ingest/*.json`（gitignore）。

#### 1. 本机打包（推荐 tar.gz）

在项目根目录执行（Windows / Linux 均可用内置 `tar`）：

```powershell
# PowerShell（项目根）
tar -czf event-ingest.tar.gz -C .data/ingest .
```

仅打包部分文件时，可先 `cd .data/ingest`，再按前缀筛选，例如：

```powershell
cd .data/ingest
tar -czf ../../event-ingest-p1-etf.tar.gz QQQ-*.json SPY-*.json TLT-*.json
cd ../..
```

#### 2. 上传到服务器

```powershell
scp event-ingest.tar.gz user@服务器:/opt/finance-site/
```

#### 3. 服务器解压

```bash
cd /opt/finance-site
mkdir -p .data/ingest
tar -xzf event-ingest.tar.gz -C .data/ingest
# 解压后可删包：rm event-ingest.tar.gz
```

#### 4. 服务器入库（幂等）

单文件：

```bash
npm run events:import-ingest -- .data/ingest/QQQ-macro-event-2025-01-01_2025-12-31.json
```

批量（bash）：

```bash
for f in .data/ingest/*.json; do
  npm run events:import-ingest -- "$f"
done
```

`import-ingest` 按 `externalId` 幂等；重复执行多为 update/merge。

#### 其他

- **不要**把大批 ingest JSON 提交 GitHub；**不要**把批跑挂进 GitHub Actions 自动 import。
- 本机 `DATABASE_URL` 直连生产库 import（慎用，易误操作）。
- 应用代码走正常 `main` 部署即可；**上事件只需 tar + scp + 服务器 import**，不必为 JSON 单独发版。

## 图表 API（筛选与显示合一）

列表与 K 线标记共用同一套筛选参数：

```
GET /api/events/for-chart?symbol=AAPL&from=…&to=…&scopeMode=follow&assets=AAPL&types=company,rating&minImportance=MEDIUM
GET /api/events/chart-markers?symbol=AAPL&from=…&to=…&scopeMode=follow&assets=AAPL&types=company,rating&minImportance=MEDIUM
GET /api/events/symbol-profile?symbol=AAPL
```

| 参数 | 说明 |
|------|------|
| `scopeMode` | `follow` 按 assets/industries/countries 显式标签匹配（OR）；`range` 仅时间窗 |
| `assets` / `industries` / `countries` | 逗号分隔；空维度不约束 |
| `types` | 类型族 id（policy/macro/company/…）或点分 eventType |
| `includeSec` / `includeMarket` | `0` 可关 SEC / MarketEvent 源 |
| `minImportance` | LOW / MEDIUM / HIGH / CRITICAL |

换 K 线标的时侧栏按画像自动重算草稿（见 `chartSymbolProfile.ts`）：

| 标的类 | 资产 | 行业 | 默认类型 |
|--------|------|------|----------|
| 个股 | 填 | GICS（可补全） | 公司、评级 |
| 宽基股指（SPY/QQQ…） | 填 | — | 宏观、政策 |
| 行业 ETF（XLK…） | 不填 | 填 sector 码 | 宏观、政策 |
| 大类资产（商品/外汇/债券/加密） | 填 | — | 宏观、政策 |

统一 prefs：`event-view-filters-v1`（`EventViewFilterState`）。图层开关（图上标记 / SEC / 其它 / 文字）仅影响呈现，不单独成第二套内容筛选。

## 词表

`src/lib/data/eventTaxonomy.ts`
