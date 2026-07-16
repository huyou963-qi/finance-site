---
name: market-event-ingest
description: >-
  Retrieve authoritative sources and generate structured MarketEvent ingest JSON
  for policy, macro, company news, speeches, ratings, and price targets.
  Use when backfilling chart events, syncing ratings/targets, recording FOMC/policy
  nodes, or maintaining /events. Never regenerate SEC filings/earnings/splits
  already covered by stockEvents. Deduplicate against DB by externalId and by
  same-day + sourceUrl / title+type (merge tags instead of creating duplicates).
---

# Market Event Ingest

为 finance-site 事件记录器检索并生成**可幂等入库**的事件。公司层财报/8-K/拆分已由 SEC `stockEvents` 覆盖——**禁止重复生成**。

库内已有「同一事件」（即使 `externalId` 不同）时：**不新建**，应合并标签或写入 `skipped[]`。

## When to use

- 「为某国/某行业/某股票补事件」「同步评级与目标价」「录入 FOMC/政策」
- 「生成某标的 K 线事件」「批量补非 SEC 公司大事」
- 维护 `/events` 或行情标记数据

## Modes

| Mode | 覆盖 | 默认 scope | 备注 |
|------|------|------------|------|
| `policy` | 财政/货币/监管/贸易 | COUNTRY / INDUSTRY | |
| `macro-event` | 地缘、危机、灾害、异动 | COUNTRY / CROSS | |
| `company-matter` | SEC **未覆盖**的公司事项 | COMPANY | 先对账 stockEvents |
| `ops-news` | 经营新闻叙事 | COMPANY | 排除传闻 |
| `speech` | 官员/高管/投资人讲话 | 视主体 | |
| `rating` | 评级变动 | COMPANY | 禁止编造 |
| `price-target` | 目标价 | COMPANY | 必须有数字 |
| `era-timeline` | 长周期时代阶段 | COUNTRY | 详见 `.cursor/prompts/market-events-us-history-timeline.md` |
| `symbol-backfill` | 按 ticker 补非 SEC 事件 | 混合 | 先拉排除集 |

## Hard rules

1. **禁止编造**日期、评级、目标价、数字；无可靠来源 → 写入 `skipped[]`。
2. **禁止重复 SEC**：财报/年报/8-K/拆分一律不入库。`company-matter` / `symbol-backfill` 须先查：
   `GET /api/equity/stocks/{symbol}/events` 或说明依赖已有 SEC 数据；命中则 `skipped: { reason: "covered_by_sec" }`。
3. **禁止重复库内同一事件**（见下方「库内去重」）：命中则不新建；可合并标签后仍输出该条（由 `events:import-ingest` 做 merge），或 `skipped: { reason: "duplicate_existing" }`。
4. 交叉验证 ≥2 个独立权威源（见 `reference/source-whitelist.md`）。
5. `eventType` / `scope` / 缩略字以代码词表为准：`src/lib/data/eventTaxonomy.ts`。
6. 每条必须有 `externalId` + `markerLabel`（≤4 汉字或短英文）。

## 库内去重（内容 / 日期 / 来源）

`externalId` 幂等不够：不同 slug 可能描述同一事实。检索与入库前必须按下列规则对账 `public.market_event`。

### Agent 检索步骤（写 JSON 前）

1. 用本次时间窗调用：
   `GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=2000`
   （可加 `countries` / `assets` 缩小范围）
2. 对每条拟写入草稿，与返回列表比对；命中则：
   - **优先**：仍放入 `events[]`，补齐**新增**的 `tags` / `countries` / `industries` / `assets` / `persons` / `institutions` / `macroKeys`（并尽量沿用已有行的 `externalId` 若有），让 import **merge**；
   - 或：不写入 `events[]`，记入 `skipped: { reason: "duplicate_existing", hint: "<existingId> <title>" }`。
3. 最终以 `npm run events:import-ingest` 为准——导入层会再查库，防止漏判。

### 判定为「同一事件」（满足日期 + 任一内容条件）

**日期**：`occurredAt` 同一 UTC 日历日（`YYYY-MM-DD`）。

**内容条件（任一）**：

| # | 条件 | 说明 |
|---|------|------|
| A | `sourceUrl` 相同 | 规范化后比较：trim、去尾 `/`、小写；忽略常见跟踪参数（`utm_*`、`fbclid` 等） |
| B | 标题 + 类型相同 | 规范化标题（小写、压缩空白）且 `eventType` 规范化后相同 |
| C | 正文指纹相同 | 去掉空白后正文前 120 字相同（防换源同稿） |
| D | 评级/目标价特判 | 同日 + 同 `assets[0]` + `payload.agency`（或 `institutions[0]`）相同 |

命中任一条 → **同一事件**，不得 `create` 新行。

### 命中后如何处理标签

- **合并（默认）**：数组字段做并集（`tags`、`countries`、`industries`、`assets`、`persons`、`institutions`、`macroKeys`）。
- **不覆盖**已有叙事，除非草稿明显更完整（更长且含新事实）；重要性取更高档。
- **补 `externalId`**：若库内行尚无 `externalId`，写入本次草稿的 `externalId` 便于以后幂等。
- 纯重复且无新标签 → `skipped: duplicate_existing` 即可。

### 入库层保证

`events:import-ingest` 顺序：

1. `(sourceKind, externalId)` 命中 → update / merge 标签  
2. 否则语义去重命中 → merge 到已有行（不新建）  
3. 否则 create  

回报里会区分 `created` / `updated`（含语义合并）。

详见 `reference/dedup.md`。

## Output schema

见 `templates/ingest-output.schema.json`。顶层：

```json
{
  "mode": "policy",
  "query": { "country": "US", "from": "2024-01-01", "to": "2024-12-31" },
  "events": [ /* IngestEventDraft */ ],
  "skipped": [
    { "reason": "covered_by_sec", "hint": "AAPL 2024-05-02 earnings" },
    { "reason": "duplicate_existing", "hint": "<uuid> FOMC 降息 50bp" }
  ]
}
```

`externalId` 约定：

| 类型 | 格式 |
|------|------|
| 政策/宏观 | `ai:{mode}:{country\|industry}:{yyyy-mm-dd}:{slug}` |
| 公司/新闻 | `ai:company:{SYMBOL}:{yyyy-mm-dd}:{slug}` |
| 讲话 | `ai:speech:{person}:{yyyy-mm-dd}:{slug}` |
| 评级 | `ai:rating:{agency}:{SYMBOL}:{yyyy-mm-dd}` |
| 目标价 | `ai:pt:{agency}:{SYMBOL}:{yyyy-mm-dd}` |

## Workflow

1. 解析意图 → 选 mode（可多 mode）
2. WebSearch / WebFetch 检索并交叉验证
3. **拉库内同时间窗事件**，按「库内去重」过滤 / 准备 merge 标签
4. 写出 ingest JSON 到临时文件（如 `.data/event-ingest-run.json`）
5. `npm run events:validate-ingest -- <file.json>`
6. `npm run events:import-ingest -- <file.json>`（自动 externalId + 语义去重）
7. **更新检索进度记录表**：追加一行到 `.data/market-event-ingest-record.md`，至少记录 `mode / assets / tags / industries(GICS) / eventType(s) / query.from→query.to / 输出 event 记录文件路径 / 状态（validate/import dry-run 或正式 import）`
8. 回报：写入 N / 更新（合并）M / 跳过 K / 失败原因

入库 `sourceKind` 固定为 `ai_skill`。

## References

- `reference/dedup.md` — 去重与标签合并细则
- `reference/event-taxonomy.md` — 类型与缩略字（与 TS 同步说明）
- `reference/source-whitelist.md` — 优先源
- `reference/gics-alias.md` — 行业标签
- 时代线长文：`.cursor/prompts/market-events-us-history-timeline.md`
