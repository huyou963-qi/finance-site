# GekkoTech MCP：指标查询、系统图表和文章嵌入

## 架构审计与实现范围

- Next.js 15 / React 19 / Prisma 5 / PostgreSQL，部署沿用 Actions tar + PM2。
- 已有 MCP 为 `/api/articles/mcp`，官方 SDK WebStandard Streamable HTTP、无状态 JSON。继续使用该端点，版本 1.1.0，共 13 个工具；原七个文章工具不变。
- 宏观事实来自 `mds.Instrument` / `MacroObservation`。`MacroObservationVintage` 记录被证明可见的版本，和最新值快表用途不同。查询不走外部数据提供商、不触发回填、不修改原始行情。
- 网站还有独立的股票 K 线、复权与期货链路。首批 MCP 明确只开放已有宏观时间序列，不把股票日线、期货连续价格或现货混成同一种序列。
- 图表目录来自 `macroPresetTemplates` 及 `SystemMacroChartPrefs` 的系统覆盖、自定义系统模板。排除隐藏模板，完全不读取 `UserMacroChartPrefs`。
- 复用 ECharts `macroPayloadToChartOption`、`macroCalculationEngine`、`macroSeriesTransform`、`macroRolling` 和 `macroDerivedCalc`。首批嵌入支持时序图和普通二元派生，保留原模板左右轴、颜色、线型、单位缩放、滚动与重采样配置。高级图型/高级公式等不支持时明确拒绝，不伪装成折线。
- 文章仍用 `research_article`，预览与正式页共用 `ArticleDocument` / `ArticleMarkdown`；附件仍用 `research_article_asset`。**没有 schema 修改、没有新 migration、没有第二套文章后台。**

## 新工具契约

所有返回均同时提供 MCP text JSON 和 structuredContent；失败为 `isError:true`、`{success:false,error:{code,message}}`。下列 ID 必须来自搜索结果，不靠猜测。

| 工具 | 参数 | 主要返回 |
|---|---|---|
| `search_market_indicators` | `query`；可选 `category`、`limit`（1–40，默认20） | `indicators[]`：indicatorId（数据库 UUID）、catalogKey、code、name/nameEn/description、symbol、provider、sourceUrl、originalIndicatorId、frequency、unit/nativeUnit、currency、market、location、instrumentType、availableFrom/To、lastUpdatedAt；`truncated` |
| `query_market_data` | `indicatorIds`（1–8）、`startDate/endDate`；可选 frequency、maxPoints（1–1000，默认500）、cursor、dataCutoff | `series[]`：indicator、points、coverage、timezone、transformations、revisionFingerprint；顶层 nextCursor/truncated/retrievedAt |
| `calculate_market_series` | `operation`、`leftIndicatorId`、`startDate/endDate`；可选 rightIndicatorId、alignment、window、quantile、leftConversion、allowDifferentInstrumentTypes | formula、inputs（含来源/口径/修订指纹）、unit、points 或 statistic、validSamples/missingSamples、missingValuePolicy、warnings |
| `search_charts` | 可选 query、tags、limit（1–40） | charts[]：chartId、title、description、page、indicatorIds、indicators（真实覆盖范围）、chartType、supportsEmbed/Interaction、access、previewUrl、lastUpdatedAt（未知为 null）；truncated |
| `get_chart` | `chartId` | title/description/page、template（只含系统配置）、slot/keys、indicators（单位、来源、覆盖范围）、supportsEmbed、access、默认时间范围说明 |
| `attach_chart_to_article` | articleId、chartId、expectedUpdatedAt、displayStartDate/displayEndDate；可选 placement、displayOptions、renderMode、dataCutoff | attached/changed、articleId、referenceId、chartId、renderMode、updatedAt、previewUrl；首次写入含更新后的 article |

日期严格使用真实存在的 `YYYY-MM-DD`；时间使用含时区的 ISO 8601。完整机器 schema 在 `src/lib/market/schema.ts`，MCP tools/list 自动注册。

`frequency` 只接受 `native/daily/weekly/monthly/quarterly/annual`，用于校验原生频率，不自动重采样。原始 FRED 美元/桶及美元/加仑有明确等价单位标签；不隐含数值换算。未知语义不猜测。

`points[]` 每点含 date/value/unit/missing、publishedAt、availableAt、lastUpdatedAt、revised、revisionCoverage。数据日期是日期标签，不代表 UTC 零点发布；发布日期只在 ALFRED 明确初始版本证据存在时返回。抓取账本的 availableAt 不冒充官方发布时间。修订账本未覆盖时 revised 为 null；captured_versions 不保证完整首发历史。

`dataCutoff` 查询仅选账本中 availableAt 不晚于该时刻的最新版本。没有证据的日期留空，绝不退回当前快表。修订指纹可用于后续比较，但不能替代源方完整版本史。未知合约月份为 null；连续期货换月规则未知时明确说明，不能将 Yahoo CL=F 当作固定月份合约或交易所最终结算。

分页使用顶层 nextCursor，保持相同参数并将其传给 cursor。游标是共同安全日期，避免一个序列点数较多时跳过另一序列的日期。不同指标日期合并后缺失标为 null；周末/节假日不自动制造日度观测。coverage 为各自分页读取范围，不代表完整请求区间已有数据。查询范围上限30年，每页共同日期最多1000个，最多8条；总点数最多2000（含缺失占位），多指标时自动降低每页共同日期上限并返回 effectiveMaxPoints；超出版本扫描上限20000行要求缩短范围。

## 计算规则

白名单：spread、ratio、change、pct_change、weekly_change、rolling_mean、yoy、mom、min、max、quantile、correlation。没有任意 SQL、Python、JavaScript 或用户公式执行入口。

- spread/ratio/correlation 只对同日有效数据，要求相同已知原生频率和单位；现货/期货等类型不同，默认 `BASIS_MISMATCH`，必须得到用户明确同意才能将 allowDifferentInstrumentTypes 设为 true。
- 受支持显式换算：`leftConversion:"usd_per_gallon_to_usd_per_barrel"`，仅已核实 USD/gal 乘42后变 USD/bbl。可用于纽约港 ULSD−WTI 裂解，但仍须注明地区和价格基准。
- change/pct_change 使用前一观测；weekly_change 使用恰好7个日历日前，缺少同日不以最近日期代替。yoy 按日历上年同期，月度指标按同月匹配；mom 首批仅支持原生月度。变化和窗口只在请求区间内取样，历史不足为 null。
- rolling_mean 需要完整 window（2–260）窗口；不补缺失值。分位数是排序样本上线性插值，**不代表补原始时间序列**。相关系数为同日完整样本 Pearson，常数序列或不足2点返回 null。
- 计算最多1000个输入日期，超限直接报错，不用截断数据生成似完整的统计结果。
- 图表显示沿用原模板计算；计算工具输出独立注明公式。原模板滚动均值沿用 `trailingMean`（按原始非空观测计数），与工具 rolling_mean 的完整日期窗口含义不同，配置原样返回，不混淆。

## 图表引用、快照与前端

例如 `builtin-us-oil-diesel-monitor:0` 是系统模板 ID + 稳定图位0；它确实来自已有原油监测模板，未新增假图表。模板图位的语义由管理员维护。隐藏或删除后的图表即使有旧引用也不重新暴露。

插入参数示例（文章ID、更新时间必须取实际返回值）：

```json
{
  "articleId": "实际文章UUID",
  "chartId": "builtin-us-oil-diesel-monitor:0",
  "placement": {"type":"after_heading","heading":"一、Brent与WTI的异常背离"},
  "renderMode":"snapshot",
  "displayStartDate":"2026-10-01",
  "displayEndDate":"2026-10-28",
  "displayOptions":{"height":420,"showSource":true,"showLastUpdated":true,"allowTimeRangeChange":true},
  "expectedUpdatedAt":"最近读取的文章updatedAt"
}
```

正文仅存严格白名单围栏，不接受 HTML/iframe/脚本/任意 URL：

````text
```gekko-chart
{"referenceId":"附件UUID"}
```
````

`referenceId` 对应原附件表里 sourceKind=`chart-reference` 的不可变 JSON。附件保存 chartId、固定显示范围、renderMode、dataCutoff、createdAt、displayOptions 与系统配置。sourceConfig 保留操作者、grant、前后版本和操作指纹审计；这些审计字段不会通过公开文章/图片接口下发。

- **live（默认）**：稳定引用系统图表，使用最新数据库数据/系统配置；默认显示范围固定在写入时指定的日期，不会几年后自动跳转到别的研究窗口。允许的读者可手动切换范围。正文结论不自动修改。
- **snapshot**：把当次真实结果与配置保存到附件，之后只在已存样本里切换范围，不重新读取行情。无 dataCutoff 时冻结抓取时可见的最新值，并记录抓取时刻；指定历史 dataCutoff 时只用可见版本账本，缺少证据不回退。快照是显式需求的冻结结果，不复制一套行情库；普通实时引用不存数据集。
- 展示复用 ECharts 配置构建，legend、axis tooltip、slider/inside zoom、左右轴单位、来源、日期、修订更新时间、空值和错误状态。tooltip 使用 richText，防止源方名称进入任意 HTML。
- 自适应宽度，移动端日期控件折行，高度 `clamp(300px,65vh,设定高度)`。图表失败时保留文章其余 Markdown，显示重试及宏观入口。
- 私有预览、正式文章和编辑器的 Markdown 都使用同一个 ArticleChart，不引入第二个渲染器。`/articles/charts/[chartId]` 供检索结果预览，noindex。

## 权限与安全

复用管理员 OAuth Bearer + PKCE、active/TOTP 状态检查。五个只读工具使用既有 `articles:read`，插入使用 `articles:write`，发布/撤回仍独立要求原权限。新增工具无权发布，也不能改原始数据。OAuth 权限页说明 read 包括写作所需站内指标与系统图表。

插入限定本人草稿。事务中 CAS 同时比较作者/状态/updatedAt，原子写正文与附件；过期拒绝，重复完全相同操作返回现有 referenceId，不重复插入。修改已发布文章仍先 unpublish。最多30个引用/篇，单附件上限2MB；重名标题、代码块内标题、未找到标题明确报错。

浏览器数据接口 `/api/article-charts/[id]` 每次复用宏观 feature policy；文章内引用还同时检查 articles feature policy。权限表故障关闭访问，不使用导航的故障默认放行；草稿还需作者管理员登录。已发布文章只向同时具有文章和宏观权限的读者提供图表数据。原 `/api/article-assets/[id]` 拒绝直接读取 chart-reference，防止绕过权限读取冻结 JSON。URL 不携带令牌，响应 private/no-store。

Prisma 参数化过滤；唯一 SQL 是固定的事务内 statement_timeout 设置，不拼用户SQL。历史读事务最多15秒、单条语句12秒、等连接3秒。MCP每用户每进程60次/分钟、最多3个并行调用；数据缓存30秒，最多100项。分布式部署可将限流/缓存迁移至 Redis（当前为 PM2 单站）。

## 测试与真实数据库验收

专项：`npx tsx --test src/lib/market/market.test.ts src/lib/articles/*.test.ts`。完整提交检查：`npm run verify:commit`。

专项覆盖中文别名、两指标查询、同日价差、现货/期货拒绝、单位换算、空值、历史截止不回退、版本修订、真实模板发现/配置、标题插入、幂等、草稿归属、状态、乐观锁、审计、Markdown XSS、预览/公开图表接口、宏观权限及来源故障。SDK HTTP tools/list 检查13个工具和安全元数据，原文章生命周期回归保留。

可重复真实库验收脚本：

```bash
npx tsx scripts/test/article-market.integration.ts
# 下面才会持久化一个草稿；从不调用 publish_article：
npx tsx scripts/test/article-market.integration.ts --create-draft
```

脚本默认读取配置数据库，不复制或写入原始行情。不提供10月数据时明确失败，不用随机值替代。验收工件 `.codex-artifacts/article-market-acceptance.json` 不提交Git。

2026-10-28 真实验收：本地库现货仅到09-29，不能用它验证10月研究；在临时源码目录对生产库运行服务级验收（未替换线上服务）。Brent/WTI 各14个有效观测到10-20；10-14→10-20 两端点 Brent −11.33、WTI +11.55 USD/bbl。价差、EIA库存、已有图表和两序列快照均由真实数据产生。创建草稿 `84bc2d8a-6e97-4027-b2c7-f89bd12ed688`，状态 draft，未正式发布。该验收是服务级调用，**不是生产新工具已经被 ChatGPT 发现的证明**。生产私有预览的交互图表需本变更部署后才可显示。

双端浏览器实测：1440×1000桌面与390×844手机宽度正常显示真实数据库图表，页面 scrollWidth 分别为1440/390，手机画布宽318。日期控件可将显示区间切到2026-09-01至09-29，来源/单位保留，图例与滑块不重叠；本地浏览器使用9月真实数据，不冒充10月数据。实体手机触摸尚未单独验收。预览/正式文章共用渲染器及受保护接口均有回归覆盖，生产草稿的完整页面显示仍须部署后登录核验。

浏览器实测还修正了 App Router 页面图表ID百分号编码导致的404，增加对应白名单回归；日期提交从实际FormData取值，避免日期输入变更与状态同步时序造成区间复原。

构建及完整测试的最终结果见本PR记录。ALFRED publishedAt 返回已证明的发布日期 `YYYY-MM-DD`，不伪造零点的发布时刻；availableAt/lastUpdatedAt 则为带时区时间戳。

提交验证（2026-10-28，Node 20.20.2）：全仓1,251项通过、1项Linux专用测试按环境跳过；Prisma schema、lint、生产构建通过。最后补充“文章权限与宏观权限同时检查”后，市场专项9项、lint和生产构建再次通过。生产构建冒烟确认编码图表预览URL为200、9月范围接口返回21个真实观测日；未在生产发布文章或部署扩展。

## 部署及重新发现工具

1. 按仓库流程提交功能分支PR，至少1人审查、CI成功后合并main。
2. 沿用现有 Actions 部署；没有额外migration、环境密钥、端口或MCP进程。原 OAuth 客户端ID和端点保持不变。
3. 新版部署完成后，在 ChatGPT 的 GekkoTech MCP 设置重新加载/刷新工具；界面没有刷新入口时断开后重新连接同一服务器并重新授权。新对话通过 `@GekkoTech MCP` 使用。
4. 确认工具列表13项（原7+新增6），再执行搜索→查询→计算→草稿→插图→预览。仅在用户明确要求后正式发布。
5. 用网站管理员登录打开上述草稿预览，检查来源、单位、日期、图表交互及手机布局。再以无登录状态检查草稿不可读；宏观权限被限制时图表应显示权限提示。

首批限制：宏观原生序列；不提供股票OHLC工具或高频成交；没有自动跨频聚合；高级图型/派生链/自取数图位拒绝嵌入；日期窗口最多1000个原始观测；版本账本不是完整PIT，无法证明的历史值不会提供；不会自动补抓源方尚未入库的数据。生产部署、ChatGPT发现及真人审查仍是独立上线步骤。

官方工具与传输协议参考：[MCP Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)。

## 文件清单

| 文件 | 用途 |
|---|---|
| `src/lib/market/schema.ts` | 输入白名单、限制、结构化业务错误 |
| `src/lib/market/indicators.ts` | 真实指标、双语别名、来源语义、覆盖范围 |
| `src/lib/market/data.ts` | 数据及版本读取、缓存、共同游标、总响应点数限制 |
| `src/lib/market/calculate.ts` | 白名单计算及口径/单位/缺失校验 |
| `src/lib/market/charts.ts` | 系统图表目录、配置及既有计算/显示逻辑复用 |
| `src/lib/market/chartReference.ts` | 安全Markdown引用与标题定位 |
| `src/lib/market/attach.ts` | 草稿CAS、幂等引用、快照、附件审计 |
| `src/lib/market/tools.ts` | 六个工具定义、权限与限流 |
| `src/lib/market/market.test.ts` | 数据/计算/图表/草稿/交付接口测试 |
| `src/lib/articles/articleMcp.ts` | 在现有MCP注册新工具、统一结构化错误 |
| `src/lib/articles/articleMcp.test.ts` | 原文章行为及13工具SDK传输回归 |
| `src/lib/articles/articleStore.ts` | 图表附件审计字段不向读取者下发 |
| `src/components/articles/ArticleChart.tsx` | 双端交互图表、范围、来源、降级 |
| `src/components/articles/ArticleMarkdown.tsx` | 共用渲染器的严格引用解析 |
| `src/components/articles/ArticleDocument.tsx` | 正文截止与图表更新策略说明 |
| `src/app/api/article-charts/[id]/route.ts` | 受权限保护的实时/快照响应 |
| `src/app/api/article-assets/[id]/route.ts` | 阻止绕过图表权限读取JSON |
| `src/app/articles/charts/[id]/page.tsx` | 系统图表预览页 |
| `src/app/api/articles/oauth/authorize/route.ts` | 授权说明包括站内指标/系统图表 |
| `scripts/test/article-market.integration.ts` | 真库验收、可选创建草稿、从不发布 |
| `docs/ARTICLE_MCP.md`、`docs/MARKET_MCP.md` | MCP契约、实施审计、上线及限制 |
