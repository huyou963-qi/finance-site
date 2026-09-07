---
name: research-article-publisher
description: >-
  Research, draft, validate, and optionally publish Finova special-topic or current-policy
  analysis articles using the finance-site canonical macro/market data, captured charts,
  and properly attributed external evidence. Use for 专题文章、政策分析、特殊问题研究或文章发布。
---

# Research Article Publisher

为 Finova 写可复核的专题/政策文章，并生成网站可导入的 article bundle。默认只保存草稿；只有用户明确要求“发布”时才执行发布。

开始前阅读：

- 网站架构与数据复用规则：[`docs/ARTICLE_PUBLISHING.md`](../../../docs/ARTICLE_PUBLISHING.md)
- Bundle 字段：[`templates/article.schema.json`](./templates/article.schema.json)
- 最小示例：[`templates/example-article.json`](./templates/example-article.json)

## 数据与图表

优先复用站内统一事实层，不另建同源抓取器或事实表：

- 宏观：`/api/data/macro`、`/api/data/macro-observations` 与现有 catalog/transform。
- 行情：`/api/data/klines`、`src/lib/equity/equityPriceStore.ts` 与既有复权逻辑。
- 行业/量化：复用相应 `/api/equity/*`、`/api/quant/*`；不得在文章流程重算另一套口径。

每次取数记录查询路径/参数、数据截止时间和口径。文章里写“同比/环比/复权”等语义时必须与源数据一致；不确定的数据写 N/A，不推测。

站内图表优先在 `/macro` 或 `/markets` 设置好标的、区间、指标与画线后使用页面“截图”；图片 `sourceKind` 分别用 `internal_macro` 或 `internal_market`，`sourceUrl` 保存完整站内路径。也可在发布工作台直接粘贴截图。

外部图表仅在站内数据不足时使用，优先官方/一手来源；保存图片快照，同时登记原始页面 URL、获取时间、口径与必要授权说明。不可用第三方图表替换站内已有的同口径底层。

## 文章要求

- 开头给出可证伪的核心结论，区分事实、推断和情景判断。
- 用数据解释传导机制，不只罗列政策文本或价格涨跌。
- 明示 `dataCutoff`；禁止混入该时点之后的信息。
- 至少列出一个反例/风险情景与触发条件。
- 正文的图表在 `assets[]` 中登记，使用唯一 `{{chart:name}}` 占位符。
- 所有关键事实进入 `sourceManifest[]`；内部来源用 `internal`，外部来源用 `external`。
- 不写“保证收益”等承诺，结尾保留研究信息/非投资建议边界。

## 交付与发布

1. 在 `.codex/articles/<slug>/` 写 `article.json` 与图片；JSON 必须符合 Schema。
2. 先运行：`npm run articles:import -- <article.json> --dry-run`。
3. 默认运行：`npm run articles:import -- <article.json>`，只写入草稿。
4. 只有用户明确授权本次发布时，运行：`npm run articles:import -- <article.json> --publish`。
5. 导入后在 `/articles/editor?id=<id>` 人工核对预览、来源、图片和截止时间；公开页为 `/articles/<slug>`。

如果数据库或站内页面不可用，仍可完成 bundle 与校验，不得以猜测数据替代；说明未完成的取数/截图项并保持草稿状态。
