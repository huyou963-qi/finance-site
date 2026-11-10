# 股票数据（多股 × 多指标取数表）Spec

> 状态：`P0 implemented`（2026-11-10：P0 代码与单测完成，页面尚未在登录态下做电脑/手机验收；P1–P3 未开始）。参照 Wind「股票分析工具」的交互：左上选指标、左下选股票、右侧按「股票 × 指标列」出表。
>
> 本页只是现有个股底座之上的**查询与展示层**：不新建同源抓取器、不新建事实表、不入库任何计算结果（遵守 [DATA_FOUNDATION_REUSE_PRINCIPLES](../DATA_FOUNDATION_REUSE_PRINCIPLES.md)）。唯一新增的存储是用户的列模板。

---

## §0 元信息

| 字段 | 值 |
|------|----|
| 功能 ID | `equity-stock-data`（`featureCatalog.ts` 登记为 `IN_DEVELOPMENT`） |
| 中文名 | 股票数据 |
| 路由 | 页面 `/equity/data`；API `/api/equity/stock-data/*` |
| 代码目录 | `src/app/equity/data/`、`src/components/stockData/`、`src/lib/equity/stockData/` |
| 分支 | `feature/equity-stock-data` |
| 前置条件 | 个股基本面底座（三张报表 143 科目、`equity_fundamental_snapshot`/`_vintage`、top-3000 宇宙回填）已完成 |
| 发布约束 | 用户确认发布前，不加顶部导航，其他页面不加指向本页的链接或按钮（见 AGENTS.md「页面设计约束」） |

## §1 目标与非目标

**目标**

1. 用户能从树形指标目录里选指标，并为每列设置报告期、口径、截止日等参数。
2. 股票来源：用户的自选股分组、系统股票池、按代码/名称搜索临时加入。
3. 右侧表格一次批量取数，支持排序、删除行列、保存为模板、导出。
4. 电脑版与手机版功能对等。
5. 指标目录可以扩展：以后加趋势/技术指标、内部人指标时，只需在注册表里加条目。

**非目标（本期不做）**

- 只做美股：不支持 A 股、港股及其他市场。股票池和自选股里的非美股代码直接过滤掉，表格上方提示「已忽略 N 只非美股标的」。
- 不提供「按当时披露版本」的历史取数：报表类一律用最新重述值。
- 不做条件选股引擎：已有 `/quant/screener`，本页的「筛选」只是对当前表格结果过滤（P3）。
- 不把任何指标计算结果写入宏观库或新事实表。

## §2 页面结构

### 2.1 电脑版（≥768px）

```
┌────────────────────────── 工具条 ──────────────────────────┐
│ 提取数据 | 修改参数 | 删除列 | 删除行 | 保存模板 | 导出 | 隐藏参数说明 │
├───────────────┬─────────────────────────────────────────────┤
│ 指标库｜我的模板 │ 序号 │ 代码 │ 简称 │ 指标列1 │ 指标列2 │ …     │
│  (树 + 搜索)   │──────┼──────┼──────┼─────────┼─────────┼──      │
├───────────────┤  1   │ AAPL │ 苹果 │   …     │   …     │        │
│ 股票池          │  2   │ MSFT │ 微软 │   …     │   …     │        │
│ (自选分组/系统池)│  …                                          │
│ [搜索代码/名称] │                                             │
└───────────────┴─────────────────────────────────────────────┘
```

- 左栏宽度可拖动，上下两块的比例也可拖动。（P0 未做，固定 300px、上 3 下 2；放到 P1）
- **加指标**：双击树节点，或把节点拖到表格上 → 弹出参数编辑器（带默认值）→ 确定后加一列。按住 Ctrl 多选，可以一次加多列，共用同一组参数。
- **加股票**：在股票池里点分组，把该组整组加入（可选替换或追加）；单击某只股票只加这一只。在搜索框回车，把搜到的股票加入表格；也可以一键收藏进自选分组。
- **表格**：冻结序号、代码、简称三列；列头分行写出指标名、报告期、口径、单位；点列头排序；拖动列头调整顺序；右键菜单提供修改参数、删除、复制本列。
- 「提取数据」触发取数。改动股票或列之后，表头提示「有未刷新改动」。

### 2.2 手机版（<768px）

- 顶部三个标签：**股票｜指标｜表格**，用户的选择三个标签之间共享。
- 「指标」标签：树和搜索。点指标后，参数从底部抽屉弹出；确定后提示「已加入第 N 列」，并提供「去表格」按钮。
- 「股票」标签：股票池和搜索框，行为与电脑版一致。
- 「表格」标签：只冻结代码列，其他列横向滑动；工具条收进「⋯」菜单，内容与电脑版相同。
- 验收要求：电脑版能用的每个操作，手机上都有入口（见 AGENTS.md）。

## §3 指标注册表

文件：`src/lib/equity/stockData/indicatorRegistry.ts`。这是一个纯数据和纯函数模块，要有单测。

```ts
type IndicatorDef = {
  id: string;                 // 例：fs.revenue, ratio.roeTtm, px.close
  label: string;              // 中文显示名
  path: string[];             // 树路径，例：["财务分析","利润表","收入"]
  source: SourceKind;         // 决定由哪个 resolver 批量取数
  params: ParamKind[];        // 该指标接受的参数
  unit: "currency" | "pct" | "ratio" | "perShare" | "shares" | "text" | "date" | "number";
  profiles?: StatementProfile[]; // 仅对特定报表格式有意义时标注
};
```

### 3.1 目录与来源（全部复用现有底座）

| 树一级 | 内容 | `source` | 现有实现 |
|------|------|----------|----------|
| 证券信息 | 名称、交易所、GICS 四级、市值、官网、上市状态 | `security` | `equity_security`、`nasdaqSymbolDirectory`、`equity_delisting` |
| 财务分析 › 三张报表 | 143 个标准化科目，按 `STATEMENT_LINES` 的分组生成树 | `statement` | `equity_fundamental_snapshot` 的独立列与 `lines` JSON |
| 财务分析 › 每股指标 | EPS、每股净资产、每股经营现金流、每股 FFO | `statementDerived` | `overviewDimensions`（`computeFfoPerShareTtm` 等） |
| 财务分析 › 盈利与质量 | 毛利率、营业利润率、净利率、ROE、现金含量、应计比率、资产负债率 | `ratio` | `fundamentalRatios.ts`；口径与 `factorRegistry` 质量类一致 |
| 财务分析 › 成长 | 营收同比、EPS 同比、营收加速度 | `ratio` | 同上 |
| 估值指标 | PE/PB/PS(TTM)、盈利/FCF/股息/回购收益率、EV/OCF | `valuation` | 截止日价格 × 基本面，复用 `factorCompute` 的计算函数 |
| 行情指标 | 收盘价、区间涨跌幅、区间成交额、换手率 | `price` | `equityPriceStore` + `priceAdjustment.ts` |
| 趋势与风险（P2） | 1/3/6/12 月收益、12−1 动量、距 52 周高点、60 日波动、Beta、12 月最大回撤 | `factor` | 现场计算与 `factor_snapshot` 二选一，见 §4.3 |
| 技术指标（P3） | 均线、均线偏离、RSI、MACD 等 | `technical` | 日线现场计算，不入库 |
| 内部人（P3） | 近 N 天公开市场买入/卖出金额、笔数、净买卖 | `insider` | DERA 表；强制只取 `P/S` 交易、`anomaly is null`、`price_check='verified'` |

约束：

- 同一个经济口径只登记一次。树里需要在多处出现的，用 `alias` 指向同一个 `id`。
- 科目在报表里的排序，以及某家公司没披露的科目怎么显示，都沿用 `statementTemplate.ts`：这一格显示「未披露」，不隐藏整列。
- 客户端只拿到 `label/path/params/unit`。取数规则和 SEC 标签映射只放在服务端，不发给浏览器。

### 3.2 参数

| `ParamKind` | 取值 | 默认 |
|------|------|------|
| `reportPeriod` | 最新一期（MRQ）／最新年报／指定年份 + 年报·Q1·Q2·Q3·Q4 ／ 多报告期（起止年份 + 期次勾选） | 最新年报 |
| `basis` | 单季／TTM／财年 | 流量类默认 TTM，时点类不适用 |
| `asOfDate` | 日期（行情、估值、趋势类） | 最近交易日 |
| `range` | 区间起止（区间涨跌、区间成交额） | 近 1 年 |
| `adjust` | 前复权／不复权 | 前复权 |
| `scale` | 原值／千／百万／十亿 | 按量级自动 |

> 报表类一律取 `equity_fundamental_snapshot` 的最新重述值，不提供按披露时点取数的开关（已决，§9）。

**多报告期展开**：一个指标选了多报告期，加列时按期次各生成一列（例如 2023、2024、2025 年报三列）。这几列共享同一个 `groupId`，「修改参数」会对整组一起生效。

> 报告期以公司**财年**为准，列头注明「FY2025」。财年不对齐日历年的公司（如 AAPL 9 月年结），在格子提示里写出实际截止日，取自 `fiscalDate`。

## §4 取数 API

### 4.1 `POST /api/equity/stock-data/query`

```jsonc
// 请求
{ "symbols": ["AAPL","MSFT"],
  "columns": [{ "key": "c1", "indicatorId": "fs.revenue", "params": { "reportPeriod": {"fy":2025,"q":"FY"}, "basis":"FY" } }] }
// 响应
{ "asOf": "2026-11-10",
  "rows": [{ "symbol":"AAPL", "name":"苹果", "cells": { "c1": { "v": 4.1e11, "s":"ok", "d":"2025-09-27" } } }] }
```

格子的状态 `s`：

| 状态 | 页面显示 | 含义 |
|------|----------|------|
| `ok` | 数值 | 正常取到 |
| `na` | 未披露 | 公司没有披露该科目 |
| `uncovered` | 未覆盖 | 不在基本面覆盖宇宙内 |
| `noPeriod` | 无此期 | 公司没有所选报告期（或该季凑不齐 TTM 的连续 4 季） |
| `noPrice`（P2） | 无行情 | 没有行情数据 |
| `notApplicable` | 不适用 | 例如 ETF 的报表指标 |

### 4.2 执行方式

1. 先校验：用 `requireSameOrigin` 做同源检查；用 `requireProUser` 校验 Pro 身份；额度检查见 §6。代码去掉后缀后去重，非美股代码在这一步剔除。
2. 按 `source` 给列分组，每个 resolver 拿到全部股票和本组的所有列，**每个来源只发一次批量查询**：
   - `statement`/`ratio`/`statementDerived`：一条 SQL 取 `symbol IN (...) AND period IN (所需期次集合)`，在内存里算 TTM 和比率；
   - `price`/`valuation`/`factor`：按截止日批量读日线，复权统一走 `priceAdjustment`。
3. 各 resolver 是纯函数加一层薄 IO，纯函数部分要有单测。
4. 缓存：同一组（股票集合 + 列）的结果在进程内缓存 10 分钟；报表类按数据的 `updatedAt` 作废缓存。

### 4.3 趋势类因子取哪一份

`factor_snapshot` 是月末快照。截止日恰好是月末且快照已经存在时，直接读快照；其他情况现场计算，调用 `factorCompute` 的同一个函数，保证口径只有一份。

### 4.4 其他接口

| 接口 | 用途 |
|------|------|
| ~~`GET /api/equity/stock-data/indicators`~~ | P0 不做：指标目录不含取数规则、且整页 Pro 专属无需按权益过滤，浏览器直接引用 `indicatorRegistry.ts` |
| `GET /api/equity/stock-data/pools` | 系统股票池列表与成员：标普 500（`IndexConstituent`）、GICS 11 个行业（行业 ETF 没有报表数据，P0 不放进股票池；搜索仍可加入 ETF，报表列显示「不适用」） |
| 自选股 | 复用 `/api/tools/market-watchlist`（GET/POST） |
| 搜索 | 复用 `/api/data/symbol-search` |
| `/api/equity/stock-data/templates` | 模板的增删改查（§5） |
| 导出 | 前端由当前结果直接生成 CSV/XLSX，不再请求服务端 |

## §5 存储

新增一张表（同一时间只允许一人提交 migration）：

```prisma
model UserStockDataTemplate {
  id        String   @id @default(cuid())
  userId    String
  name      String   @db.VarChar(60)
  columns   Json     // ColumnSpec[]，与 query 请求的 columns 结构一致
  symbols   Json?    // 可选：连同股票列表一起保存
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, name])
  @@schema("public")
}
```

- 当前未保存的表格状态（股票、列）存 `localStorage`，作为刷新后的恢复草稿，读写都包 try/catch。
- 系统内置模板（如「估值快照」「三年利润表」「质量因子」）P1 先写在代码里；需要线上编辑时，再照 `SystemMacroChartPrefs` 的做法建一份全局模板。

## §6 权限与额度

**整页 Pro 专属**（已决）：只有 Pro 会员（含 7 天试用）和管理员能用。

- 页面入口：`<FeatureGate featureId="equity-stock-data">`。开发期在 `/admin/feature-access` 里，游客、普通用户两列设为不可见。上线时切换为「已上线 + Pro 专属」：游客看到注册送试用的引导，普通用户看到升级引导，与其他 Pro 专属页一致。导航用 `useVisibleFeatures().can(...)` 过滤。
- 所有 `/api/equity/stock-data/*` 接口在服务端用 `requireProUser` 校验，不依赖前端拦截。
- 额度（服务端校验，前端同步提示）：

| 用户 | 单次股票数 | 单次列数 | 导出 | 模板 |
|------|-----------|---------|------|------|
| Pro / 管理员 | 50 | 50 | ✓ | ✓ |

- 多报告期展开出来的每一列都算 1 列。超出额度时，前端禁用「加入」并提示原因，服务端返回 400，不截断后静默返回。

## §7 分期与验收

| 阶段 | 范围 | 验收 |
|------|------|------|
| **P0 骨架** | 电脑版和手机版布局；指标树（证券信息、三张报表、每股、比率、成长）；自选股、系统股票池、搜索（只限美股）；`query` 接口；Pro 校验与 50×50 额度；排序、删除行列；导出 CSV | 50 只 × 50 列报表类取数 < 2 秒；五种格子状态显示正确；非 Pro 用户调用接口返回 403；手机三个标签的操作完整走通 |
| **P1 参数与模板** | 参数编辑器、多报告期展开、单季/TTM/财年口径；`UserStockDataTemplate`；系统内置模板；导出 XLSX | 多报告期列组可以整组修改参数；非日历财年的公司列头和格子提示正确 |
| **P2 估值、行情与趋势** | 估值、行情、趋势与风险指标；截止日、区间、复权参数 | 与 `factor_snapshot` 同月末的抽样值误差 < 1e-6 |
| **P3 进阶** | 对结果的条件过滤；按 GICS 分组统计（中位数、均值）；点格子看时序图（复用基本面概览图表组件）；技术指标；内部人指标 | 内部人金额的过滤条件有单测覆盖 |

每一期都要满足：`npm run build` 通过；电脑版和手机版各截图验收；新代码不暴露数据商名称、表名或内部文档（遵守 `commercial-ui-disclosure.mdc`）。

## §8 风险

- **覆盖面**：基本面只覆盖约 3000 只，行情宇宙更大。必须用 `uncovered` 状态区分「没覆盖」和「没数据」，不能都显示成空白。
- **服务器容量**（香港 2 核 / 4G）：单次最多 50×50，查询仍须按来源走单条 SQL，禁止逐股循环查库；技术指标的现场计算限制回看窗口。
- **口径重复**：比率、估值、因子必须调用已有函数，不在本模块重新实现。评审时检查是否出现同义计算。
- **财年对齐**：「2025 年报」按公司财年取数，与日历年不一致。列头和说明里要写清楚。

## §9 已决事项（2026-11-10）

| # | 问题 | 决定 |
|---|------|------|
| 1 | 市场范围 | 只做美股；非美股代码直接过滤并提示 |
| 2 | 权限、额度与导出 | 整页 Pro 专属；单次最多 50 只股票 × 50 列；Pro 可导出、可存模板 |
| 3 | 历史披露版本 | 不做，报表类一律用最新重述值 |
| 4 | 路由 | `/equity/data` |

## §10 P0 实现记录（2026-11-10）

| 位置 | 内容 |
|------|------|
| `src/lib/equity/stockData/` | `types.ts`（类型与 50×50 上限）、`indicatorRegistry.ts`（目录）、`request.ts`（校验）、`resolve.ts`（纯函数取值）、`query.ts`（服务端批量读取与缓存）、`pools.ts`、`display.ts`（格式化、排序、CSV）、`stockData.test.ts` |
| `src/app/api/equity/stock-data/` | `query`（POST）、`pools`（GET），都经 `requireProUser` |
| `src/components/stockData/` | `StockDataWorkspace`、`IndicatorPanel`、`StockPoolPanel`、`DataGrid`、`ParamEditor` |
| 复用改动 | `fundamentalRatios.ts` 抽出 `aggregateQuarterGroup` / `aggregateTrailingFour` / `withStatementDerived`（财年与 TTM 共用一套合成口径，个股基本面接口改用 `withStatementDerived`）；`equityFundamentalsStore.ts` 新增 `getQuarterlyFundamentalsBatch` |

- 财季归属以 `aggregateFiscalYears` 的财年分组为准，最新完整财年之后的季度依次记为下一财年 Q1–Q3，保证季报列与年报列对齐。
- 实测（本地库）：50 只 × 50 列，目录已缓存时约 0.2 秒；服务刚启动时上市目录首次下载被限制在 1.5 秒内，没等到就不据此剔除代码、也不缓存该次结果。
- P0 未做、移到 P1：左栏拖动调宽、拼音搜索指标。
