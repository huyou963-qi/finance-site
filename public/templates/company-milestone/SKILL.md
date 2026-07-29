---
name: company-milestone-ingest
description: >-
  Collect operating milestones for ANY listed company (product, capacity, and
  policies that affect that ticker). Emit JSON for finance-site operating
  timeline import (user-local) or admin shared MarketEvent ingest.
---

# Company Milestone Ingest

为**任意一只股票**搜集经营里程碑，生成可导入站点「事件筛选器」的标准 JSON。

## Skill 与 Schema（同一套）

| 文件 | 角色 |
|------|------|
| **本 Skill** | 检索范围、硬规则、字段语义 |
| **`ingest-output.schema.json`** | 输出结构约束 |

按 Skill 搜集，产出必须符合 Schema。`example-TSLA.json` 仅为形状示例。

## 可见性（导入后）

| 路径 | 效果 |
|------|------|
| 行情页「导入经营事件」 | **仅本机当前账号本地可见**；与共享事件冲突时**优先显示你的本地事件** |
| 管理员 `events:import-ingest` | 写入全站共享事件库，其他用户可见 |

## 输入

| 字段 | 必填 | 说明 |
|------|------|------|
| `symbol` | 是 | ticker 大写 |
| `from` / `to` | 建议 | ISO 日期 |
| 行业 / 国家 | 建议 | 加速检索 |

一条运行只服务一个 `symbol`。

## 打标约定

| 字段 | 约定 |
|------|------|
| `scope` | 公司用 `COMPANY`；政策可用 `COUNTRY`/`INDUSTRY`，必须挂 `assets` |
| `assets` | 必含目标 ticker |
| `eventType` | 见下表 |
| `tags` | 建议含 `milestone` |
| `markerLabel` | ≤4 字 |
| `payload.impact.summary` | 建议必填 |
| `externalId` | `ai:milestone:{SYMBOL}:{yyyy-mm-dd}:{slug}` |

## 三类必须覆盖

1. **产品** `company.product`  
2. **产能** `company.capacity`  
3. **政策** `policy.fiscal` / `policy.monetary` / `policy.regulatory` / `policy.trade`（确实影响该公司）

可选：`company.mna`（并购）· `company.capital`（回购/增发/分红）· `company.partnership`（合作/大单）· `company.litigation`（诉讼）· `company.supply`（供应链）

**禁止**：SEC 常规财报/拆分；传闻；无日期编造；无关宏观硬挂公司。

## Hard rules

1. 禁止编造；无来源 → `skipped[]`  
2. 交叉验证 ≥2 权威源  
3. 每条必有 `externalId`、`title`、`content`、`occurredAt`、`eventType`、`markerLabel`、`payload.impact.summary`  

## payload.impact

```json
{
  "impact": {
    "summary": "一句话：对该公司收入/成本/产能/估值叙事的影响",
    "channels": ["demand", "cost", "capacity", "margin", "narrative"]
  }
}
```

## 最小骨架

```json
{
  "mode": "company-milestone",
  "query": { "symbol": "{SYMBOL}", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
  "events": [
    {
      "externalId": "ai:milestone:{SYMBOL}:YYYY-MM-DD:short-slug",
      "title": "中文标题",
      "content": "事实陈述……",
      "occurredAt": "YYYY-MM-DD",
      "datePrecision": "DATE",
      "importance": "HIGH",
      "scope": "COMPANY",
      "eventType": "company.product",
      "assets": ["{SYMBOL}"],
      "countries": ["US"],
      "tags": ["milestone", "product"],
      "markerLabel": "产品",
      "sourceUrl": "https://…",
      "payload": {
        "impact": {
          "summary": "对该公司……",
          "channels": ["demand", "narrative"]
        }
      },
      "sources": [{ "url": "https://…", "note": "来源说明" }]
    }
  ],
  "skipped": []
}
```

## 检索清单

### 产品
- 首款量产/商业化、主力产品发布与量产、收入结构转折 SKU、重大停产

### 产能
- 关键设施协议/开工/投产、上游产能、海外本地化、重大关停

### 政策
- 补贴/抵免、强制标准、准入、关税/出口管制（须写对该公司的 impact）

### 排除
- 季报年报日、常规拆分/人事 8-K、评级目标价、无日期传闻

## Workflow

1. 用户给出 `symbol` + 时间窗  
2. 按清单检索并交叉验证  
3. 对照 Schema 写出 JSON  
4. 在 `/markets` 底部展开「事件筛选器」→「导入经营事件」（本地生效）
