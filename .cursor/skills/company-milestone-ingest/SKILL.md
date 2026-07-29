---
name: company-milestone-ingest
description: >-
  Collect operating milestones for ANY listed company (product launch/scale-up,
  capacity/factory nodes, and policies that materially affect that ticker).
  Emit JSON for the markets operating timeline (user-local import) or admin
  events:import-ingest into shared MarketEvent. Use when building stock operating
  timelines or gathering historical business events for a ticker.
---

# Company Milestone Ingest

为**任意一只股票**搜集「经营里程碑」与「影响该公司的政策」，生成标准 JSON。

与 [`market-event-ingest`](../market-event-ingest/SKILL.md) **共用同一套字段与词表**（不另建事件类型体系）。本 Skill 更窄：专注产品/产能/挂票政策，不做评级/目标价/宏观批队列。

**Skill + Schema 是一套**：规程见本文件，结构见 [`templates/ingest-output.schema.json`](./templates/ingest-output.schema.json)。

## 可见性（导入后谁能看见）

| 路径 | 谁 | 效果 |
|------|-----|------|
| `/markets` →「导入经营事件」 | 任意登录用户 | **仅该用户浏览器本地**（按 userId+标的），只对自己生效；冲突时**优先于**共享库/SEC 显示 |
| `npm run events:import-ingest` | **Admin / 运维** | 写入共享 `MarketEvent`，其他用户在经营轴/K 线可见 |

普通用户 Skill 产出 → 本地导入即可；全站共享须管理员入库。

## When to use

- 「搜集 `{SYMBOL}` 历史经营重要事件」
- 「补产品发布、量产、工厂/产能、影响该公司的补贴/监管」
- 用户要用自己的 AI 为关注标的做时间轴

## 输入

| 字段 | 必填 | 说明 |
|------|------|------|
| `symbol` | 是 | ticker，一律大写 |
| `from` / `to` | 建议 | 上市日或合理起点 → 今天 |
| 行业提示 | 否 | GICS / 主营 / 国家 |

**一条运行只服务一个 `symbol`。**

## 打标约定（本地与入库相同）

| 字段 | 约定 |
|------|------|
| `scope` | 公司本体 `COMPANY`；政策可用 `COUNTRY`/`INDUSTRY`，但必须挂 assets |
| `assets` | **必含** 目标 ticker |
| `eventType` | 见下表 |
| `tags` | 建议含 `milestone` |
| `markerLabel` | ≤4 字 |
| `payload.impact.summary` | 经营类建议必填 |
| `externalId` | `ai:milestone:{SYMBOL}:{yyyy-mm-dd}:{slug}` |

## 必须覆盖

1. **产品** `company.product`  
2. **产能** `company.capacity`  
3. **政策** `policy.*`（确实影响该公司者）  

可选（若检索到且非 SEC 重复）：`company.mna` / `capital` / `partnership` / `litigation` / `supply`（详见词表；亦可用 `company-matter` 模式）。

**禁止**：SEC 已覆盖财报/8-K/拆分；传闻；无日期编造；无关宏观硬挂公司。

## 允许的 eventType（本模式核心）

| eventType | scope 建议 |
|-----------|------------|
| `company.product` | `COMPANY` |
| `company.capacity` | `COMPANY` |
| `policy.fiscal` / `monetary` / `regulatory` / `trade` | `COUNTRY` / `INDUSTRY` / `CROSS` |

完整词表：[`src/lib/data/eventTaxonomy.ts`](../../../src/lib/data/eventTaxonomy.ts)。

## Hard rules

1. 禁止编造；无来源 → `skipped[]`  
2. 交叉验证 ≥2 权威源  
3. 对账 SEC：`GET /api/equity/stocks/{symbol}/events`  
4. Admin 入库前对账库内并去重 merge  
5. 每条：`externalId`、`markerLabel`、`payload.impact.summary`  
6. 符合 Schema  

## payload.impact

```json
{
  "impact": {
    "summary": "一句话：对该公司收入/成本/产能/估值叙事的影响",
    "channels": ["demand", "cost", "capacity", "margin", "narrative"]
  }
}
```

## Workflow

1. 解析 `symbol` + 时间窗  
2. 按 [reference/checklist.md](./reference/checklist.md) 检索  
3. 写出 JSON（[templates/ingest-output.schema.json](./templates/ingest-output.schema.json)）  
4. **用户**：`/markets` → 事件筛选器 →「导入经营事件」（本地）  
5. **Admin 全站共享**（可选）：
   ```bash
   npm run events:validate-ingest -- <file.json>
   npm run events:import-ingest -- <file.json>
   ```

示例形状：[templates/example-TSLA.json](./templates/example-TSLA.json)  
用户包：`/templates/company-milestone/company-milestone-pack.zip`（改完跑 `npm run pack:company-milestone`）。

## 经营轴展示

行情页「事件筛选器」合并三层：**用户本地 > 共享 MarketEvent > SEC**；默认类型 `company.*` + 挂票 `policy.*`。
