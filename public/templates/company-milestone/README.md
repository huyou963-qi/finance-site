# 个股经营里程碑模板包

用自己的 AI 按本包规程，为**任意股票**搜集**产品 / 产能 / 影响该公司的政策**，生成标准 JSON，在行情页「事件筛选器」导入。

整包下载：`company-milestone-pack.zip`（含下列文件）。

## 文件

| 文件 | 用途 |
|------|------|
| `README.md` | 使用说明（本文件） |
| `SKILL.md` | 给 AI 的规程（公司无关、通用） |
| `ingest-output.schema.json` | 输出 JSON 结构约束 |
| `example-TSLA.json` | 形状示例（勿照抄到其他公司） |

## 可见性

- **导入经营事件**：只保存在**你的浏览器本地**（按登录账号），仅对自己可见；与全站共享事件冲突时**优先显示你的本地事件**。
- **全站共享**：仅管理员将同一 JSON 经 `events:import-ingest` 写入事件库后，其他用户才能看到。

## 在本站使用

1. `/markets` 选择标的 → 底部点 **展开事件筛选器**
2. **下载SKILL** → 解压，把 Skill + Schema 交给你的 AI，指定 ticker
3. **导入经营事件**（本地）
4. 轴上会合并：你的本地 + 管理员共享库 + SEC 披露（本地优先）

```bash
# 仅管理员：发布到共享事件库
npm run events:validate-ingest -- your.json
npm run events:import-ingest -- your.json
```

更新本包源文件后执行：`npm run pack:company-milestone`
