# Prompt：TradingEconomics 指标页抓取 — 标准流程（以 ISM 制造业 PMI 为范本）

---

## 任务目标

给定 **TradingEconomics 指标页 URL**，为一组已入库的 `Instrument`（通常先经 [macro-xlsx-import.md](./macro-xlsx-import.md) 导入历史）配置：

1. **库内来源**、**数据源链接**、**获取方式**（管理页「数据更新目录」三列）
2. **经济日历**驱动的 **更新计划** 与 **下次更新**（`nextRunAt`）
3. **状态列**（等待下次更新 / 未更新 / 源端暂无新值 / 不可自动更新 + 日历对齐状态）
4. 可复用的 **解析器 + adapter + seed/sync 脚本**，供 `data:worker` 持续拉数

**禁止**：使用 TE 付费 JSON API Key 写入仓库；**禁止**跳过 fixture 实测直接写 parser；**禁止**未配置 `fetchAcquisition.status=known` 就参与调度。

**范本**：ISM 制造业 PMI → `https://tradingeconomics.com/united-states/business-confidence`

---

## 第〇部分：前置条件

| 步骤 | 命令 / 文件 |
|------|-------------|
| 历史观测已在库 | `npm run db:import-macro-xlsx -- --preset=ism`（或对应 preset） |
| 环境变量 | `.env.local`：`DATABASE_URL`；抓取/日历建议 `TE_CALENDAR_COOKIE`、`TRADINGECONOMICS_USER_AGENT`、`TE_CALENDAR_UTC_OFFSET_HOURS` |
| 仪器 code 稳定 | 如 `ism_us_ism_{sector}`，与 Excel preset 一致 |

---

## 第一部分：分析 TE 指标页（Agent 必做）

### 1.1 抓取与存档

```powershell
# 浏览器或 Node 抓取 HTML，保存 fixture 供离线开发
# 路径建议：.data/te-{dataset}-sample.html
```

使用与生产相同请求头（见 `tradingEconomicsIndicator/client.ts`）：

- `User-Agent` ← `TRADINGECONOMICS_USER_AGENT`
- `Cookie` ← `TE_CALENDAR_COOKIE`（403/空表时必需）

### 1.2 页面结构清单（在 HTML 中逐项确认）

| 区域 | 典型位置 | 用途 |
|------|----------|------|
| **Headline 最新值** | `#calendar` 表最新含 Actual 行；或 Related 表 | 主指标 value + 参考月 |
| **Components 表** | `<th>Components</th>` 下 `datatable-row` | 各分项最新值 |
| **Related 表** | `<th>Related</th>` | 有时含 headline 冗余校验 |
| **#calendar 发布日程** | `id="calendar"`，`an-estimate-row` | 历史/未来发布日（Actual 空=待发布） |

### 1.3 产出「指标映射表」（写入 catalog 模块）

对每个库内 `instrument.code`，明确：

| 字段 | 示例（ISM 制造业） |
|------|-------------------|
| `instrumentCode` | `ism_us_ism_headline` |
| `sector`（内部键） | `headline` |
| `teLabel`（页面行文本） | `ISM Manufacturing PMI` |
| 是否共用 headline 发布日 | 是 — 8 分项同一天的 TE 日历事件 |

映射文件范本：`src/lib/data/scheduler/tradingEconomicsIndicator/ismCatalog.ts`

```typescript
export const TE_ISM_PAGE_URL = "https://tradingeconomics.com/united-states/business-confidence";
export const ISM_SECTOR_TO_TE_LABEL: Record<string, string> = { headline: "ISM Manufacturing PMI", ... };
export const ISM_INSTRUMENT_CODES = [...];
export const ISM_TE_SYNC_SCRIPT = "scripts/data-worker/sync-ism-te.ts";
```

**新数据集**：复制为 `{dataset}Catalog.ts`，勿与 ISM 制造业混用 provider 名。

### 1.4 解析规则文档化

在 `parse{Dataset}Page.ts` 注释或 PR 中记录：

- 观测月如何从 `reference` 列推导（`referenceTextToObsDate`）
- calendar 行：日期列 + 时间列 + Actual 空值 = 下一发布
- 数值清洗（去 `%`、逗号）

先用 fixture 跑通，再 live fetch：

```powershell
npm run data:sync-{dataset}-te -- --fixture=.data/te-ism-sample.html
```

---

## 第二部分：代码模块（按顺序实现）

### 2.1 文件清单（ISM 制造业已实现）

| 模块 | 路径 |
|------|------|
| 映射 + URL | `tradingEconomicsIndicator/ismCatalog.ts` |
| HTTP 客户端 | `tradingEconomicsIndicator/client.ts` |
| HTML 解析 | `tradingEconomicsIndicator/parseIsmPage.ts` |
| 调度 adapter | `adapters/tradingEconomicsIsmAdapter.ts` |
| 一次性同步脚本 | `scripts/data-worker/sync-ism-te.ts` |
| 订阅/元数据 seed | `scripts/data-worker/seed-ism-te.ts` |
| worker 路由 | `runSubscription.ts` → `scrape.provider === "tradingeconomics_ism"` |

### 2.2 新数据集命名约定

| 项 | 约定 |
|----|------|
| `scrape.provider` | `tradingeconomics_{dataset}`（如 `tradingeconomics_ism`） |
| `DataSource.id` | `te-{dataset}`（如 `te-ism`） |
| seed 脚本 | `scripts/data-worker/seed-{dataset}-te.ts` |
| sync 脚本 | `scripts/data-worker/sync-{dataset}-te.ts` |
| npm | `data:seed-{dataset}-te`、`data:sync-{dataset}-te` |

### 2.3 Adapter 契约

```typescript
// 单条增量（worker 调用）
fetchXxxIncremental(metadata, instrumentCode, obsStart) → { points, sourceLatestObsDate }

// 整页（sync 脚本调用）
fetchAllXxxPoints({ fixturePath?, url? }) → parsed page
```

整页抓取应 **缓存 HTML 60s**，同一轮 worker 只请求 TE 一次。

### 2.4 注册 worker

在 `runSubscription.ts` 的 `REST_API` 分支中，按 `metadata.scrape.provider` 分发到新 adapter（勿改 FRED/BIS 逻辑）。

---

## 第三部分：metadata 与管理页三列

`seed-{dataset}-te.ts` 必须为每条仪器写入：

### 3.1 库内来源

```json
"source": "TradingEconomics",
"providerNote": "TradingEconomics"
```

管理页 **库内来源** ← `metadata.source`（或 DataSource.name）

### 3.2 数据源链接

```json
"sourceUrl": "https://tradingeconomics.com/united-states/business-confidence",
"officialUrl": "https://tradingeconomics.com/united-states/business-confidence"
```

管理页 **数据源链接** ← `officialUrl` / `sourcePageUrl` / `fetchAcquisition.officialUrl`

### 3.3 获取方式

```json
"fetchAcquisition": {
  "status": "known",
  "method": "te_ism_scrape",
  "methodLabel": "scripts/data-worker/sync-ism-te.ts",
  "fetchUrl": "https://tradingeconomics.com/united-states/business-confidence",
  "message": "TradingEconomics ISM 制造业 PMI 页 HTML 抓取"
},
"scrape": {
  "provider": "tradingeconomics_ism",
  "url": "...",
  "component": "headline",
  "teLabel": "ISM Manufacturing PMI",
  "script": "scripts/data-worker/sync-ism-te.ts"
},
"bootstrapOnly": false
```

管理页 **获取方式** ← `fetchAcquisition.methodLabel`（须为仓库内脚本路径）

**门禁**：仅当 `fetchAcquisition.status === "known"` 且 `bootstrapOnly === false` 时，`acquisitionStatus === "ready"`，才显示下次更新并参与 worker。

---

## 第四部分：经济日历（更新计划 + 下次更新）

### 4.1 统一走 TE Calendar 页（非指标页 #calendar）

`npm run data:sync-calendar` 会：

1. 带 Cookie 模拟 **`calendar-range=5,6`**（本月+下月），合并解析事件
2. 按 `teEventMap.ts` 关键词匹配下一发布
3. 写入 `releaseRule.calendarMatch` + `DataSubscription.nextRunAt`

ISM 制造业映射（**headline 一条，8 个分项共用**）：

```typescript
// teEventMap.ts — TE_CALENDAR_ISM_MANUFACTURING
keywords: ["ism manufacturing pmi", "ism manufacturing index"]
excludeKeywords: ["services", "non-manufacturing", "flash", "s&p", ...]
// calendarSpecForSubscription: instrumentCode.startsWith("ism_us_ism_")
```

**禁止**为每个分项单独配日历关键词；分项与 headline **同发布日**。

### 4.2 管理页「更新计划」文案

| calendarSync.status | summarizeReleaseRule 表现 |
|---------------------|---------------------------|
| `matched` + 有 releaseAt | `经济日历：ISM Manufacturing PMI @ {UTC}` |
| `no_match` | `经济日历：未来 90 天窗口内无匹配发布（等待 sync-calendar）` |
| `fetch_failed` | `经济日历未同步（403/网络），回退：每 N 小时探测` |

日历列辅助标签 ← `calendarSyncLabel`：已对齐 / 未匹配 / 拉取失败 / …

### 4.3 下次更新

- **字段**：`DataSubscription.nextRunAt`
- **计算**：`nextRunAtFromCalendarRule` = `calendarMatch.releaseAt` + `releaseDelayMinutes`（默认 3 分钟）
- 同步命令：

```powershell
npm run data:sync-calendar
# 单条调试
npm run data:sync-calendar -- --code=ism_us_ism_headline --verbose
```

### 4.4 TE 日历 Cookie

见 `.env.example`：`TE_CALENDAR_COOKIE`、`TE_CALENDAR_RANGE_PRESETS=5,6`  
未配置 Cookie 时常出现 **日历未匹配**（不是 parser 问题）。

---

## 第五部分：状态列逻辑

管理页 **状态** ← `resolveUpdateStatus` + `updateStatusLabel`：

| updateStatus | 显示 | 含义 |
|--------------|------|------|
| `on_schedule` | **等待下次更新** | `nextRunAt` 在未来 |
| `stale` | **未更新** | 已过发布窗口，本地未确认追上源端 |
| `source_current` | **源端暂无新值** | 已拉取，TE 页尚无更晚观测 |
| `not_applicable` | **不可自动更新** | 获取方式未确认 / 无订阅 |

**判定依赖**：

- `acquisitionStatus === "ready"`（获取方式 known + 非 bootstrapOnly）
- `subscription.enabled === true`
- `nextRunAt`、`calendarReleaseAt`、`lastFetchAt`、`sourceSync`

配置完成后在 `/admin/data-catalog` 目视：**获取方式** 有脚本路径、**更新计划** 有日历事件、**状态** 为「等待下次更新」而非「不可自动更新」/「日历未匹配」。

---

## 第六部分：标准执行顺序（Checklist）

```
[ ] 0. Excel 历史已导入（macro-xlsx-import.md）
[ ] 1. 抓取 TE 页 HTML → `.data/te-{dataset}-sample.html`
[ ] 2. 填写指标映射表 → `{dataset}Catalog.ts`
[ ] 3. 实现 `parse{Dataset}Page.ts`，fixture 单测通过
[ ] 4. 实现 `adapters/tradingEconomics{Dataset}Adapter.ts`
[ ] 5. `runSubscription.ts` 注册 scrape.provider
[ ] 6. `seed-{dataset}-te.ts`：DataSource + DataSubscription + metadata 三列
[ ] 7. `sync-{dataset}-te.ts`：live + `--fixture` 写入观测
[ ] 8. `teEventMap.ts`：calendarSpec + 关键词（headline 共用）
[ ] 9. `npm run data:seed-{dataset}-te`
[ ] 10. `npm run data:sync-{dataset}-te`（先 fixture 后 live）
[ ] 11. `npm run data:sync-calendar` → 8 条 ISM matched、nextRunAt 有值
[ ] 12. `npm run data:worker` 或 `data:sync-one -- --code=...` 试跑
[ ] 13. `/admin/data-catalog` 检查：库内来源 / 数据源链接 / 获取方式 / 状态
```

---

## 第七部分：ISM 制造业 PMI 命令速查（已实现）

```powershell
# 1. 历史（若尚未导入）
npm run db:import-macro-xlsx -- --file="...\美国_ISM_制造业PMI.xlsx" --preset=ism

# 2. 配置 TE 订阅与 metadata
npm run data:seed-ism-te

# 3. 抓取写入（开发时用 fixture）
npm run data:sync-ism-te -- --fixture=.data/te-ism-sample.html
npm run data:sync-ism-te

# 4. 日历对齐下次更新
npm run data:sync-calendar

# 5. 验证目录
npm run data:verify-catalog
npm run db:verify-macro-import -- --prefix=ism_us_ism_ --country=US --category=采购经理人指数 --expect-count=8
```

---

## 第八部分：扩展新 TE 页（如 ISM 服务业）差异点

| 项 | 制造业（已有） | 新页需注意 |
|----|----------------|------------|
| URL | `/business-confidence` | 新 URL，单独 `TE_*_PAGE_URL` |
| provider | `tradingeconomics_ism` | 新 provider 字符串，避免复用 |
| 日历关键词 | `ism manufacturing pmi` | **服务业**用 `ism services` / `non-manufacturing`，勿与制造业混 |
| 分项共用发布日 | 8 分项 ← 1 个 headline 日历 | 同样只匹配 headline 事件 |
| instrument 前缀 | `ism_us_ism_*` | 如 `ism_svc_us_svc_*`（已 Excel 导入） |

服务业 PMI 日历应单独增加 `TE_CALENDAR_ISM_SERVICES`，**exclude** `manufacturing`。

---

## 关键文件索引

| 用途 | 路径 |
|------|------|
| 日历抓取 | `tradingEconomicsCalendar/client.ts` |
| 日历匹配 | `teEventMap.ts`、`applyCalendarSchedules.ts` |
| 发布规则 | `releaseRule.ts` |
| 状态/获取方式 | `catalogAcquisition.ts`、`fetchAcquisition.ts` |
| 管理页聚合 | `adminCatalog.ts` |
| Excel 导入 | `.cursor/prompts/macro-xlsx-import.md` |

---

## Agent 交付物

完成新 TE 数据集时，PR / 汇报须包含：

1. **指标映射表**（code ↔ teLabel）
2. **fixture 路径**与解析样例输出（headline + 1 个分项）
3. **metadata 截图或字段清单**（三列 + calendarMatch）
4. **sync-calendar 一行 matched 示例**（eventTitle + releaseAt）
5. 新增 npm scripts 与 AGENTS.md 一行引用（若为新 dataset）
