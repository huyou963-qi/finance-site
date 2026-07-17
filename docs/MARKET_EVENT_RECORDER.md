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

美国时间线等旧行可能仍是中文 `eventType`、空的 `scope/markerLabel/sourceKind/externalId`。  
用幂等脚本就地 UPDATE（**不必**再传 JSON；云库里已有这些行）：

```bash
# 本机
npm run db:backfill-market-event-fields -- --dry-run
npm run db:backfill-market-event-fields

# 云服务器（代码随 deploy 更新后执行一次）
cd /opt/finance-site
npm run db:backfill-market-event-fields -- --dry-run
npm run db:backfill-market-event-fields
```

## 图表 API

```
GET /api/events/chart-markers?symbol=AAPL&from=2020-01-01&to=2026-01-01&expand=symbol&minImportance=MEDIUM
```

- `expand=symbol|industry|country`
- `includeSec=0` / `includeMarket=0` 可关单源
- `types=` 逗号分隔 eventType

## 词表

`src/lib/data/eventTaxonomy.ts`
