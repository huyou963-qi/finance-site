---
name: company-milestone-ingest
description: >-
  Generate finance-site local chart event JSON for a single company's milestones
  or a cross-asset research timeline. Supports importing once for every asset,
  including risk triggers, relief catalysts, and narrative turning points.
---

# Local Chart Event Ingest

为行情页「事件筛选器」生成可本地导入的事件 JSON。支持个股经营里程碑和跨资产专题研究（如 AI 风险触发与缓解），沿用同一字段和事件词表。

## 选择显示范围

- 单标的：query.importTarget 为 symbol（省略时的兼容默认值），query.symbol 可填写目标 ticker；导入到当前所选标的。
- 跨资产研究：query.importTarget 为 all-assets，省略 query.symbol；一次导入后，当前账号在同一浏览器、同一站点的所有资产图表都可查看，包括股票、指数、商品、外汇和债券。
- assets 表示事件实际关联的资产，不是显示白名单。跨资产专题可为空；不得为了在任意资产显示而硬挂无关 ticker。
- 页面下拉框可覆盖文件范围。导入按 externalId 更新同范围已有事件，保留其他事件；同一 externalId 的单标的版本优先于通用版本。可通过「清除通用事件」移除通用集合。
- 通用事件仍服从时间范围、事件类型、重要性、文字筛选和「图上显示」；「仅大预期差」模式不显示普通研究标记。市场/SEC 数据源开关不影响私人本地事件。
- 桌面、手机使用同一导入入口与显示规则；折叠事件栏后主图上的标记继续显示。

## 研究范围

个股经营研究按需求覆盖产品 company.product、产能 company.capacity、相关政策 policy.*，可补合作、资本、并购、供应链等真实节点。

跨资产专题按用户指定主题选择事件，不强制凑齐产品/产能/政策三类。可使用 company.earnings、speech.executive、market.anomaly、macro.release 等代码；不要为通过默认筛选而伪装事件类型。完整词表：src/lib/data/eventTaxonomy.ts。

私人跨资产研究可以引用财报作为需求验证或风险缓解催化剂，保留专题解释和原始来源，无需因 SEC 已收录就丢弃用户需要的观察节点。此例外仅适用于本地研究文件；不要生成冗余 SEC 文书/拆分，不要自动发布到共享库。管理员共享入库仍按 market-event-ingest 的 SEC 对账和去重规则执行。

## 事实与日期

1. 每个已发生事件交叉验证至少两个独立权威来源，转载同一稿不算独立源。无法确认的事件或日期放入 skipped，不编造。
2. 明确区分触发、加剧、反弹、缓解催化、价格修复、未解除和真正解除；不能用股价反弹推断信用风险已经解除。将阶段写入标题、content 和 markerLabel，不只放在自定义 payload 中。
3. 日期按原始事件的当地日期；日期精度不足一天不强行落某日。盘后公告仍标实际公告日期，在 content 说明下一交易日才体现完整市场反应。不用 DATE 假装精确时刻。
4. 用户只要已发生事件时，未来财报、会议和可能的融资都放入 skipped，不能作为已发生标记。

## 输出

结构见 ingest-output.schema.json，mode 保持 company-milestone 以兼容已有导入器。

- 必填 externalId、title、content、occurredAt、eventType、markerLabel、payload.impact.summary。
- markerLabel 最多四个汉字或短英文；importance 使用 LOW / MEDIUM / HIGH / CRITICAL。
- scope 使用 COMPANY / COUNTRY / INDUSTRY / CROSS；跨资产叙事通常 CROSS，assets 可以为空。
- 个股 externalId：ai:milestone:{SYMBOL}:{yyyy-mm-dd}:{slug}。
- 专题 externalId：ai:research:{TOPIC}:{yyyy-mm-dd}:{slug}，不要带显示标的，方便跨图复用和重复导入更新。
- payload.impact.summary 描述研究影响；channels 选 demand / cost / capacity / margin / narrative。
- sources[] 保存可核验的事实来源；本地导入完整保留 payload、来源、关联标签和时间精度。content 可附来源说明。
- 同一来源事实只生成一个节点；公告和次日市场反应可分开，但必须说明区别。

跨资产最小形状（仅结构示例，不可照抄事实）：

```json
{
  "mode": "company-milestone",
  "query": { "importTarget": "all-assets", "topic": "研究主题", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
  "events": [{
    "externalId": "ai:research:topic:YYYY-MM-DD:slug",
    "title": "触发｜可核实的事件",
    "content": "事实、阶段与影响；附原始来源链接。",
    "occurredAt": "YYYY-MM-DD", "datePrecision": "DATE",
    "importance": "HIGH", "scope": "CROSS", "eventType": "market.anomaly",
    "assets": [], "tags": ["research", "trigger"], "markerLabel": "触发",
    "payload": { "impact": { "summary": "研究影响", "channels": ["narrative"] } },
    "sources": [{ "url": "https://…", "note": "来源说明" }]
  }],
  "skipped": []
}
```

## 验证和交付

验证 Schema，并运行 npm run events:validate-ingest -- 文件.json；同时用 src/lib/equity/companyMilestones.ts 的 parseMilestoneIngestJson 验证页面实际解析。

交付 JSON 文件及简短导入说明：/markets → 展开事件筛选器 → 选择「按文件设置」或「全部资产通用」→ 导入本地事件 → 勾选图上显示、保留文件包含的类型。只写本地文件，不自动执行 events:import-ingest。

更新此 Skill 后同步仓库 .cursor/skills/company-milestone-ingest/ 与 public/templates/company-milestone/ 的 Skill、Schema，运行 npm run pack:company-milestone 重建下载包。example-TSLA.json 保留旧单标的兼容示例。

## 事件协议 v2：配色、阅读链接与事件包

- 兼容旧文件。新文件可写 `schemaVersion: 2`；单事件可选 `color: "#RRGGBB"`。未指定颜色时省略，使用系统默认。
- 用户指定颜色或阶段配色时遵循用户约定；同专题同阶段保持一致。颜色仅表达显示偏好，不替代事实、重要性或资产利多利空判断。
- `sources[]` 是事实证据；`readingLinks[]` 是可选扩展阅读，元素含 `url`、可选 `title`/`note`/`language`，仅 HTTP(S)。没有扩展阅读则省略，不要求 Wikipedia，也不得为凑链接编造来源。
- 本地包可带 `pack: { id, name, version, color, symbols }`；id 稳定，version 随更新变化。`pack.color` 是包默认色，单事件 color 优先。`pack.symbols` 可限定多个显示资产；全部资产通用时省略 symbols，使用 query.importTarget=all-assets。
- 事实关联的 assets 与本地显示范围分开；保持真实关联。精确时刻用带时区 DATETIME，只知道日期则 DATE，不补造时间。
- 本地导入先预览，确认后更新同包同 externalId；支持包开关、导出、删除备份。用户颜色覆盖与选中高亮不改变原事件事实。
- 服务器批量导入继续使用统一 writer；本地私人研究不自动发布到服务器。
