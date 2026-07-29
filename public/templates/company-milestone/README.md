# 个股经营里程碑模板包

用自己的 AI（Cursor / ChatGPT 等）按本包规程搜集某只股票的**产品 / 产能 / 影响该公司的政策**，生成标准 JSON，再在行情页导入。

## 文件

| 文件 | 用途 |
|------|------|
| `SKILL.md` | 给 AI 的完整规程（可整份粘贴进对话） |
| `ingest-output.schema.json` | JSON Schema |
| `example-TSLA.json` | 特斯拉范例（可直接导入预览） |

## 在本站使用

1. 打开 `/markets`，选择标的（如 `TSLA`）
2. 勾选顶栏 **经营时间轴**（会关闭两副图，下方展开水平轴）
3. **载入 TSLA 范本** 或 **导入 JSON**（你的 AI 产出的文件）
4. 点击时间轴节点，主图会定位到对应交易日附近

正式写入全站事件库（可选，需本机 CLI）：

```bash
npm run events:validate-ingest -- your.json
npm run events:import-ingest -- your.json
```

权威 Skill 目录（开发者）：`.cursor/skills/company-milestone-ingest/`
