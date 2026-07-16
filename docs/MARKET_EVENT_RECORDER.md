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

## 部署与表 owner

本机与阿里云统一：`DATABASE_URL=postgresql://finance:…@…/finance`，表 owner 应为 `finance`。  
部署流水线在 `db:migrate` 前会跑 `npm run db:ensure-owner`（`scripts/db-ensure-app-owner.mjs`），用本机 `postgres` 超级用户把 `public`/`mds` 对象归属改回应用用户，避免 `must be owner of table`。

## 图表 API

```
GET /api/events/chart-markers?symbol=AAPL&from=2020-01-01&to=2026-01-01&expand=symbol&minImportance=MEDIUM
```

- `expand=symbol|industry|country`
- `includeSec=0` / `includeMarket=0` 可关单源
- `types=` 逗号分隔 eventType

## 词表

`src/lib/data/eventTaxonomy.ts`
