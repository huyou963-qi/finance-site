---
name: company-milestone-ingest
description: >-
  Collect company operating milestones (product launch/production, factory capacity)
  and policies that materially affect a ticker; emit MarketEvent ingest JSON for
  events:import-ingest. Use when building stock operating timelines, backfilling
  TSLA/AAPL-style narratives, or when a user asks to gather historical business
  events for a stock they follow.
---

# Company Milestone Ingest

为**单只股票**搜集「经营里程碑」与「影响该公司的政策」，生成可导入事件管理器的标准 JSON。

与 [`market-event-ingest`](../market-event-ingest/SKILL.md) 共用入库管线（`events:validate-ingest` / `events:import-ingest`），本 Skill 更窄：不跑宏观批队列、不做评级/目标价，专注**可读的经营叙事**。

## When to use

- 「搜集 TSLA / AAPL 历史经营重要事件」
- 「补产品发布、量产、工厂投产、影响该公司的补贴/监管」
- 用户要用自己的 AI 为关注标的做时间轴，再导入本站查看

## 输入

| 字段 | 必填 | 说明 |
|------|------|------|
| `symbol` | 是 | 美股 ticker，如 `TSLA` |
| `from` / `to` | 建议 | 默认上市日或 `2008-01-01` → 今天 |
| 行业提示 | 否 | GICS / 主营国家，加速政策检索 |

## 三类必须覆盖

1. **产品** `company.product` — 发布、量产、首交付、关键 SKU 放量  
2. **产能** `company.capacity` — 工厂签约/开工/投产、重大扩产  
3. **政策** `policy.*` — 国家/行业/国际规则中**确实影响该公司**需求、成本或准入者  

**禁止**：SEC 已覆盖的财报/10-K/8-K/拆分；传闻；无日期编造；把无关宏观政策硬挂到公司。

## Hard rules

1. 日期、数字、政策名禁止编造；无可靠来源 → `skipped[]`。  
2. 交叉验证 ≥2 独立权威源（IR、官方博客、政府公报、主要财经媒体）。  
3. 先对账：`GET /api/equity/stocks/{symbol}/events`（SEC）与 `GET /api/events?assets={symbol}&from=&to=`。  
4. 库内已有同日同政策 → **merge** `assets`/`tags`，不新建。  
5. `eventType` / `markerLabel` 以 [`src/lib/data/eventTaxonomy.ts`](../../../src/lib/data/eventTaxonomy.ts) 为准。  
6. 每条必须有 `externalId`、`markerLabel`（≤4 字）、`payload.impact.summary`。

## externalId

```
ai:milestone:{SYMBOL}:{yyyy-mm-dd}:{slug}
```

政策若站内已有宏观条目，优先沿用其 `externalId` 并 merge `assets`。

## payload.impact（时间轴主展示）

```json
{
  "impact": {
    "summary": "一句话：对该公司收入/成本/产能/估值叙事的影响",
    "channels": ["demand", "cost", "capacity", "margin", "narrative"]
  }
}
```

`content` 写事实；`impact.summary` 写**对该公司的影响**（政策类尤其重要）。

## importance

| 等级 | 何时 |
|------|------|
| CRITICAL | 改变公司商业模式或利润拐点的节点（如首次全年盈利、主力工厂投产） |
| HIGH | 显著放量/产能/政策（Model 3 量产、双积分、IRA） |
| MEDIUM | 规划发布、补充车型、次要工厂节点 |
| LOW | 少用 |

## Workflow

1. 解析 `symbol` + 时间窗  
2. 按 [reference/checklist.md](./reference/checklist.md) 检索三类事件  
3. 对账 SEC + 库内事件；准备 merge 或 create  
4. 写出 JSON（见 [templates/ingest-output.schema.json](./templates/ingest-output.schema.json)）  
5. `npm run events:validate-ingest -- <file.json>`  
6. `npm run events:import-ingest -- <file.json>`  
7. 在 `/markets` 勾选「经营时间轴」导入 JSON 查看  

范例：[templates/example-TSLA.json](./templates/example-TSLA.json)

站内下载副本：`/templates/company-milestone/`（Schema / Skill / 示例）。

## 展示约定（给站内 UI）

- **主**：个股经营时间轴（全量里程碑 + impact）  
- **辅**：K 线 / 基本面图仅默认显示 `HIGH`+`CRITICAL` 钉  

入库后 `assets` 含 ticker 即可被 `/api/events/chart-markers` 与里程碑页拉取。
