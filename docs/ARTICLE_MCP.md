# ChatGPT 文章写作与发布

## 设计与复用

Next.js 15 App Router / React 19 / Prisma 5 / PostgreSQL。文章继续使用 `public.research_article`，管理入口仍是 `/articles/editor`；没有新增文章库或第二套编辑器。`ArticleDocument` / `ArticleMarkdown` 同时服务公开文章与私有预览。GFM 提供表格、引用、脚注、链接、图片；KaTeX 提供公式（`$$...$$`，单个 `$` 保留财经金额语义）。不解析原始 HTML；ReactMarkdown 默认 URL 过滤和 KaTeX `trust:false` 阻止脚本与危险链接。JSON-LD 转义 `<`。

检查时 `/api/weekly-reports/mcp` 与旧 OAuth 运行端点已退役，周报只保留 ingest API。文章 MCP 因此新增独立端点 `/api/articles/mcp`，使用官方 `@modelcontextprotocol/sdk` 的 Web Standards Streamable HTTP transport，stateless JSON 模式；每个请求新建 server/transport，不持久化 MCP 会话。GET/DELETE 返回 405，不提供 SSE 恢复流。请求体限制 1 MB。

复用原有 `WeeklyOAuthConsent` / `WeeklyOAuthGrant` / `WeeklyOAuthCredential` 表（名称为历史兼容），通过精确 resource 隔离文章授权。复用现有管理员密码 + TOTP 登录、账号状态和实时角色检查。没有复用周报 ingest 密钥，任何文章 MCP 调用都需要 OAuth Bearer。

## 部署及连接

1. `npm ci`；执行 `npm run db:migrate`（新增的唯一数据库变更是文章 SEO 两个 nullable 列，不改既有文章）。不要以 `db push` 替代 migration。
2. 在生产服务器设置 `APP_BASE_URL` 为最终 HTTPS 域名。例如 `https://gekkotech.cn`；若生产规范域名为 www，则全部连接和授权 URL 都使用 www。避免 MCP POST 被域名跳转。
3. 在 ChatGPT 的连接设置中取得实际 OAuth callback URL，将 public client 预登记到服务端环境变量：

   ```dotenv
   ARTICLE_OAUTH_CLIENTS=[{"clientId":"chatgpt-articles","name":"ChatGPT","redirectUris":["https://平台实际提供的完整回调地址"]}]
   ```

   不使用通配符；客户端 ID 可自行约定，但必须与连接设置完全一致。采用预登记 public client，token endpoint authentication 为 `none`，不需要 client secret；未开放 DCR，不从任意外部 URL 抓取客户端配置。
4. 构建、重启网站。现有 GitHub Actions 仍执行 `verify:commit`、发布 tar 包、数据库迁移与 PM2 重启，无需额外进程或端口。
5. 使用网站现有入口完成管理员密码 + TOTP 登录；ChatGPT 添加远程 MCP 连接，填写 `https://你的规范域名/api/articles/mcp`、OAuth 和已登记的 client ID。按实际需要授权下述 scopes。授权页面显示账号、客户端、回调地址和权限，并提供同意与拒绝。未登录时提示先在本站登录，再重新连接。
6. 编辑器内「管理 ChatGPT 文章授权」可打开 `/articles/connections` 撤销授权；桌面与手机使用同一可见入口。

发现端点：

- `/.well-known/oauth-protected-resource/api/articles/mcp`
- `/.well-known/oauth-authorization-server/api/articles/oauth`
- `/api/articles/oauth/authorize`、`/token`、`/revoke`

OAuth 授权码有效 5 分钟，强制 PKCE S256，绑定 client、精确 redirect 和 resource；授权页 nonce 10 分钟有效，绑定当前用户与登录会话，POST 检查 Origin，消费使用事务。访问令牌最长 1 小时，授权及刷新令牌最长 30 天。数据库只存 SHA-256。刷新令牌轮换，发现重用撤销整个 grant；授权撤销、账号停用、管理员角色撤销会立即阻止后续请求。禁止将令牌放在预览 URL 或聊天正文中。

## 工具契约

| 工具 | Scope | 行为 |
| --- | --- | --- |
| list_articles | articles:read | 当前用户文章，page/pageSize，category/keyword/status，createdAfter/Before、updatedAfter/Before；时间为 ISO 8601 |
| get_article | articles:read | id 或 slug 二选一；返回 content Markdown、SEO、来源、状态、时间与 canonicalUrl |
| create_article | articles:write | title/summary/content/category/tags；可选 slug/seoTitle/seoDescription/sources/dataCutoff；status 只允许 draft |
| update_article | articles:write | id + expectedUpdatedAt + 待修改字段；只修改草稿 |
| preview_article | articles:read | id 或 slug，返回原文及 previewUrl；链接需本站管理员登录且属于作者 |
| publish_article | articles:publish | id + expectedUpdatedAt，发布既有文章，已发布则返回 changed:false |
| unpublish_article | articles:unpublish | id + expectedUpdatedAt，撤回为草稿，已撤回则返回 changed:false |

所有工具均按授权用户限定作者。即使是管理员，MCP 也不能读写其他作者的私有草稿。公开 canonicalUrl 是最终文章地址，草稿时不代表该地址可访问。previewUrl 不携带访问凭证，匿名或非作者不能查看；预览页面 noindex，不加入 sitemap。管理员在同一浏览器已有有效登录后即可查看，ChatGPT 工具本身也可返回 Markdown 原文供阅读。

创建成功返回 `created:true`、id/status/previewUrl。发布成功返回 `success:true`、changed/id/status/canonicalUrl。发布前沿用原有校验：标题、摘要、正文、非未来 dataCutoff、至少一条来源。`sources` 是 HTTP(S) URL 数组，映射到原有 sourceManifest。不猜测财报的数据截止时间，应由用户或研究内容明确给出。

更新、发布、撤回必须传最近读取的 `updatedAt` 到 `expectedUpdatedAt`。数据库 `updateMany WHERE id AND updated_at` 原子比较，事务中读取保存结果；每次更新时间至少增加 1 ms。编辑器 PUT 也必须携带 expectedUpdatedAt，过期返回 HTTP 409，避免网页编辑覆盖 MCP 修改。旧的外部 PUT 调用方需先 GET 再提供此字段。冲突后重新读取与核对差异，不盲目覆盖。

MCP 错误使用 `isError:true` 与 `structuredContent:{success:false,error:{code,message}}`。主要 code：CONFLICT、NOT_FOUND、CONTENT_INVALID、INVALID_STATE、SLUG_CONFLICT、insufficient_scope、INTERNAL_ERROR；未知数据库错误仅写服务端日志，不返回内部细节。HTTP 身份失败返回 401 + WWW-Authenticate discovery；权限不足工具结果附 mcp/www_authenticate。没有永久删除工具。

示例创建参数：

```json
{"title":"Alphabet 季报分析","summary":"收入结构与资本开支观察","content":"## 核心结论\n\n...","category":"earnings-analysis","tags":["GOOG","GOOGL"],"sources":["https://abc.xyz/investor/"],"dataCutoff":"2026-10-27T00:00:00Z"}
```

先读取与修改草稿，调用 preview_article 核对，只有用户明确要求正式发布时才调用 publish_article。工具注解标记发布与撤回为 destructive，以便客户端展示确认；服务端权限校验不依赖这些注解。创建重试不会自动发布，但没有创建幂等键；创建结果丢失时先搜索列表核对，避免重复草稿。发布重试始终操作相同文章 ID，不创建新文章。

## 验证与上线验收

`npx tsx --test src/lib/articles/*.test.ts` 覆盖授权策略、PKCE、令牌轮换与撤销、权限、所有权、乐观锁、幂等状态转换、官方 SDK HTTP 工具发现、结构化错误、表格/脚注/公式及 XSS。全量检查使用 `npm run verify:commit`。

2026-10-27 本地验证：文章专项 14 项通过；全仓测试 1,238 项通过、1 项因环境跳过；Prisma 校验、全仓 lint 与生产构建通过。本机最后一次构建使用临时 `NODE_OPTIONS=--max-old-space-size=4096` 避免默认堆上限，不改变运行配置。共享 ArticleDocument 排版样例在 390px / 1440px 的 headless Chrome 中检查，手机页面 scrollWidth=390，无页面横向溢出。生产构建 HTTP 冒烟确认匿名 MCP 401 + discovery、元数据 200、匿名预览 404、匿名管理接口 401；不连接或修改生产数据库。

2026-10-28 提交前复查修正了 Prisma 模型位置：两个 SEO 字段属于 `Article`（`research_article`），不属于 `InvestmentReview`。新增生成客户端 DMMF 映射回归测试，避免 mock 数据层掩盖模型与迁移不一致的问题。

当日复验：全仓 1,241 项通过、1 项跳过，Prisma 校验与 lint 通过；首次复构建在旧构建目录下出现 Next.js 内部异常，保留旧目录并在全新目录重建后生产构建通过。生产 OAuth 连接仍须部署后实测，当前本地验证不代表线上服务已更新。

另在仓库指定的 Node 20.20.2 下验证文章专项 15 项全部通过。测试使用单一模块加载入口，并按可观察到的并发冲突行为断言，避免不同 Node/tsx 加载方式产生重复错误类原型影响断言。

上线后还需用实际 ChatGPT 客户端验证 OAuth 往返与 scope 授权、创建→读取→修改→预览→发布→公开访问→撤回，并确认匿名预览返回 404、旧版本修改返回 CONFLICT、撤销连接后 Bearer 返回 401。自动测试使用隔离的数据层替身，不写生产数据；它不能代替实际 ChatGPT 与生产 PostgreSQL 的连接验收。

规范参考：[OpenAI MCP 服务](https://developers.openai.com/plugins/build/mcp-server)、[OpenAI OAuth 授权](https://developers.openai.com/plugins/build/auth)、[MCP 官方文档](https://modelcontextprotocol.io/docs/develop/build-server)。
