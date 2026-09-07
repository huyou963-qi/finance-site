# 专题文章发布功能

## 目标与边界

专题文章用于解释特殊问题、当前政策及其宏观/市场传导。系统提供“AI 研究与起草 → 管理员审阅 → 发布 → 公开阅读”的闭环，但不在文章模块复制宏观、行情、行业或量化事实。

一期不在浏览器内直接调用大模型。AI 使用项目 Skill 生成标准 bundle，管理员在发布工作台完成最终审阅。这使模型、密钥和研究过程与公开写接口解耦，也保留人工发布闸门。

## 页面与权限

| 页面 | 权限 | 用途 |
|---|---|---|
| `/articles` | 公开 | 已发布文章列表 |
| `/articles/[slug]` | 公开 | 文章正文、数据截止时间、来源清单 |
| `/articles/editor` | Admin | 新建/编辑草稿、图表粘贴、预览、发布/撤回 |

顶部导航对普通用户显示“专题文章”，对管理员显示“发布文章”。写 API、图片上传和草稿图片均校验 Admin；已发布文章的图片可公开读取。

## 数据流

```text
canonical macro / equity / quant data
              │ existing APIs and calculation services
              ▼
AI Skill or current /macro and /markets UI
              │ article bundle / chart screenshot
              ▼
Article draft + immutable chart assets + provenance
              │ publish validation and admin review
              ▼
public article + source manifest + data cutoff
```

文章只保存论述和图表渲染快照。图表资产同时保存 SHA-256、来源类型、来源页面、取图时间和源配置；因此文章发布后的视觉证据不会随实时页面漂移，而数值事实仍可沿来源路径回到单一事实层复核。

## 图表工作流

### 站内图表

1. 在 `/macro` 或 `/markets` 选择指标/标的、时间窗、复权方式与画线。
2. 点击页面已有“截图”按钮，将当前图表复制到剪贴板。
3. 在 `/articles/editor` 选择“站内宏观图表”或“站内行情图表”，填写包含查询参数的页面路径。
4. 在 Markdown 正文框粘贴；工作台上传图片并插入稳定的 `/api/article-assets/{id}` 地址。

### 外部图表

上传 PNG/JPEG/WebP 前填写原始页面 URL。外部图表不能只写图片 CDN 地址；来源清单应指向能解释数据口径与发布时间的原始页面。不得热链易变图片代替快照。

## 发布门禁

服务端在 `status=published` 时强制校验：标题、摘要、正文、数据截止时间与至少一条来源。截止时间不能在未来；来源 URL 仅允许站内路径或 HTTP(S)。图片只允许 PNG/JPEG/WebP，单张不超过 8MB，并返回 `nosniff` 响应头。

AI Skill 默认导入为草稿。只有命令显式带 `--publish` 才会公开：

```bash
npm run articles:import -- .codex/articles/<slug>/article.json --dry-run
npm run articles:import -- .codex/articles/<slug>/article.json
npm run articles:import -- .codex/articles/<slug>/article.json --publish
```

## 底层复用清单

- 宏观数据：复用 `/api/data/macro`、`/api/data/macro-observations`、现有 catalog 与 transform。
- K 线：复用 `/api/data/klines`、`equityPriceStore` 与 `priceAdjustment`，客户端不重做复权。
- 行业/量化：复用既有 `/api/equity/*`、`/api/quant/*` 和查询/计算服务。
- 截图：复用 `copyElementScreenshotToClipboard`，文章编辑器只负责接收与固化快照。
- 用户与权限：复用 `getUserByRequest` / `requireAdmin`。

新增的 `Article` / `ArticleAsset`（数据库表为 `research_article` / `research_article_asset`）只表达“发布内容”和“发布时视觉证据”这两个新事实，不构成平行行情库、宏观库、adapter、writer 或计算链。表名有意避开旧环境遗留的 `article/article_image/article_comment`。部署需要执行 `npm run db:migrate`。

## 后续阶段

一期稳定后可增加版本审阅与定时发布、对象存储替代数据库二进制、文章内可交互但锁定 as-of 的图表、来源失效巡检。接入模型服务时应让模型只提交草稿，发布权限继续留在独立 Admin 动作。
