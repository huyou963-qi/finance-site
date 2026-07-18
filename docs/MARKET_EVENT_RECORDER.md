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

1. 本机批跑 → `.data/ingest/*.json`（不进 Git）
2. `scp` 到服务器 `/opt/finance-site/.data/ingest/`（或整包 `.data/`）
3. 服务器：`npm run events:import-ingest -- .data/ingest/<file>.json`
4. 或本机 `DATABASE_URL` 指向生产后 import（慎用）

**不要**把大批 ingest JSON 提交 GitHub；**不要**把批跑挂进 GitHub Actions 自动 import。

## 图表 API

```
GET /api/events/chart-markers?symbol=AAPL&from=2020-01-01&to=2026-01-01&expand=symbol&minImportance=MEDIUM
```

- `expand=symbol|industry|country`
- `includeSec=0` / `includeMarket=0` 可关单源
- `types=` 逗号分隔 eventType

## 词表

`src/lib/data/eventTaxonomy.ts`
