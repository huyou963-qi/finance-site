# 库内去重与标签合并

与 `events:import-ingest`（`src/lib/data/marketEventsIngest.ts`）实现保持一致。

## 何时算同一事件

必须：**同一 UTC 日**（`occurredAt` 的 `YYYY-MM-DD`）。

再满足其一：

1. **来源 URL**：规范化后相等（去尾 `/`、小写、剥 `utm_*` / `fbclid` / `gclid`）
2. **标题 + eventType**：规范化标题相等，且类型规范化后相等
3. **正文指纹**：去空白后前 120 字符相等
4. **评级/目标价**：同日 + 主标的（`assets[0]`）+ 机构（`payload.agency` 或 `institutions[0]`）

## 命中后

- **不** `INSERT` 新行
- 数组合并：`tags` / `countries` / `industries` / `assets` / `persons` / `institutions` / `macroKeys`
- `importance`：取更高
- `content` / `title`：仅当草稿明显更长且更完整时才覆盖
- 若旧行无 `externalId`：写入本次 `externalId`（`sourceKind=ai_skill`）

## Agent 侧

写 JSON 前先 `GET /api/events?from=&to=`；纯重复用：

```json
{ "reason": "duplicate_existing", "hint": "<id> <title>" }
```

有新标签则仍放进 `events[]`，由 import 合并。
