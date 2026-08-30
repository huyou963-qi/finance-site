# 投资案例标准文件

投资记录页可以导出供外部 AI 或自定义 Skill 使用的 JSON 文件。网站本身不调用模型，也不需要 `OPENAI_API_KEY`。

## 格式约定

- `schema`: 固定为 `finova.investment-case.v1`，Skill 应先检查此值。
- `schemaVersion`: 当前为 `1`。新增可选字段不改变版本；破坏兼容性的调整发布新版本。
- `exportedAt` / `dataCutoff`: 导出及分析数据截止时间，ISO 8601 UTC。
- `source.evidenceSha256`: `primaryEvidence` 的 SHA-256，用来识别同一份原始证据。
- `analysisRequest`: 分析目的、证据纪律、建议章节与粘贴回网站的输出格式。
- `primaryEvidence`: 案例概况、全部研究版本、Catalyst、交易计划和按发生时间升序排列的动作账本。
- `priorReviews`: 已有复盘的独立区域。它是派生观点，不应作为原始事实使用。

## 推荐 Skill 流程

1. 拒绝或提示无法识别的 `schema`。
2. 只把 `primaryEvidence` 当作原始输入；遵守 `analysisRequest.evidencePolicy`。
3. 使用文件的 `dataCutoff` 标明信息边界，不补造文件之外的事实。
4. 按 `analysisRequest.requestedSections` 输出中文 Markdown。
5. 用户把 Markdown 粘贴回案例的“导出 / 复盘”页面，并记录 Skill 或模型名称。

文件是用户私有投资记录的可移植副本，分享给第三方模型前应自行确认其中是否含有敏感仓位信息。
