# 美股「行业结构 → 行业走势/基本面 → 个股走势/基本面」研究设计（Phase R6）

> 日期：2026-07-10
> 依据：[US_EQUITY_INDUSTRY_RESEARCH.md](./US_EQUITY_INDUSTRY_RESEARCH.md)、[US_EQUITY_OPERATING_TRACK_DECISION.md](./US_EQUITY_OPERATING_TRACK_DECISION.md)（Phase R5 方案 C 混合 MVP）
> 状态：Phase 1（价格持久层 + 个股走势页）已批准实施；Phase 2/3 为设计稿待批准

---

## 1. 目标

以金融分析师工作流为主线，把站内 equity 模块从「Sector（11）→ Industry（74）→ 成分股列表」延伸到**个股层的走势与基本面**，形成可下钻的完整研究链路：

> 行业结构（谁占多大权重、什么风格）→ 行业走势/基本面（哪个行业值得超配）→ 行业内个股（是行业 beta 还是个股 alpha，选哪只）

---

## 2. 分析框架：三层研究问题 → 站内能力映射

### 第一层：行业结构（市场由什么构成）

| # | 研究问题 | 站内能力 | 状态 |
|---|---------|---------|------|
| A1 | 11 个 GICS sector 的成分/市值分布、周期 vs 防御属性 | `gicsCatalog.ts` + `gicsIndustryCatalog.ts`（风格标签）+ `/equity/sectors` | 已有 |
| A2 | 当前处于何种风格轮动环境（成长/周期/防御） | `styleBuckets.ts` 风格得分 + 宏观顶栏（`CYCLE_BACKGROUND_KEYS`） | 已有 |
| A3 | 各 sector 近 1M–1Y 相对收益格局 | `SectorReturnMatrix` + `sectorReturns.ts` | 已有 |
| A4 | 各行业估值/盈利能力横截面对比 | `fundamentalsAgg.ts` 中位数表——仅 5 个年报指标，无 PB/PS/EV | 半缺 |
| A5 | 各 sector 对哪些宏观变量敏感 | `sectorMacroMap.ts`——Health Care/IT/Comm/Utilities 四个 pending | 半缺 |

### 第二层：行业走势与基本面（该行业值不值得超配）

| # | 研究问题 | 站内能力 | 状态 |
|---|---------|---------|------|
| B1 | Sector ETF 及 industry 等权篮子 vs SPY 走势与超额 | `SectorNavChart` + `computeEqualWeightBasketReturn` | 已有（实时拉全成分，慢） |
| B2 | 同一 sector 内 industry 级分化（谁领涨） | `fetchIndustryReturnsBatch` + Industry Tab | 已有（同样实时算） |
| B3 | 行业基本面季度维度趋势（营收/利润率环比改善或恶化） | 仅年报快照，无 10-Q 序列 | **缺** |
| B4 | 行业财报季经营叙事与同业互证 | `companyOperatingBriefs.ts` + `industryPeerResonance.ts`（AI ingest） | 已有 |
| B5 | 行业走势与宏观序列对照验证 | 宏观 Tab + `MacroChartPanel`（NBER 阴影） | 已有（映射不全） |

### 第三层：个股走势与基本面（行业内选哪只）

| # | 研究问题 | 站内能力 | 状态 |
|---|---------|---------|------|
| C1 | 个股 K 线与长周期走势 | 仅外链 `/markets` 通用页；无个股详情页、无 symbol API | **缺** |
| C2 | 个股相对 industry 篮子 / sector ETF / SPY 的相对强弱（行业 beta vs 个股 alpha） | `computeSymbolReturns` 只有 vs SPY | **缺** |
| C3 | 个股季度基本面序列（营收/EPS/利润率/FCF 逐季） | `EquityFundamentalSnapshot` 仅年报 5 指标 | **缺** |
| C4 | 个股估值在行业内的相对位置（PE/PB/PS/EV 横截面） | 仅 PE（Yahoo 现价 / 年报 EPS 估算） | **缺** |
| C5 | 个股财报事件与经营叙事时间线 | `SecFiling` 索引 + AI briefs 数据在库，无页面承载 | 半缺 |

---

## 3. 需要解决的问题清单

### 数据层

**P1. 个股/ETF 日线价格无持久层**（最高优先级；C1/C2/B1/B2 的共同地基）
- 现状：`freeEtfEod.ts` 每请求实时串行拉 Yahoo（80ms/只、`cache:no-store`），70 只成分的 industry 页 ~6s，易限流；仅 adjclose 单值，无 OHLCV；最长 5y。
- 方案：新建 `mds.equity_daily_bar`（OHLCV + adjClose），读取层 db-first + 缺口懒回补；批量回填脚本 `equity:sync-prices`。
- 涉及：`prisma/schema.prisma`、新 `src/lib/equity/equityPriceStore.ts`、`freeEtfEod.ts` 加 OHLCV 抓取、`scripts/equity/sync-prices.ts`。
- 数据源：Yahoo v8 chart（免密钥），Tiingo fallback。难度：中。

**P2. 季度基本面缺失、指标薄**
- 现状：`extractAnnualFundamentals` 只解析 10-K 年报 5 指标；TTM 是年报别名；无现金流/资产负债表/股本/股息。
- 方案：`secFundamentals.ts` 新增 `extractQuarterlyFundamentals`（companyfacts 帧 `fp:Q1..Q3 + form:10-Q` 对齐；财年错位公司 Q4 = FY − Q1..Q3 推算）；XBRL tag 扩展约 10 个（OCF、CapEx、Assets、Liabilities、StockholdersEquity、LongTermDebt、Cash、SharesOutstanding、DividendsPaid、NetIncome）。
- 数据源：SEC EDGAR companyfacts（免密钥，10 req/s 内 500 家全量约 1–2 分钟）。难度：高（帧对齐、财年错位）。

**P3. sectorMacroMap 四个 sector 宏观映射 pending**
- 方案：从库内已有 `Instrument`（`fredSeriesId` 归 `sched_fred_*`）盘点可用序列后补映射：Utilities→10Y 收益率+电力产出；IT→实际利率+半导体/资本开支代理；Health Care→医疗 CPI 分项+就业；Comm→消费者信心/广告代理。难度：低。

**P4. 个股主档展示字段**
- 方案：最小化，不加付费依赖；`sync-sec.ts` 访问 submissions 时顺带把 `sicDescription`/exchange 写入 `EquitySecurity.metadata`。难度：低。

### 计算层

**P5. 个股 vs 行业/板块相对强弱**
- 方案：新建 `src/lib/equity/stockRelative.ts` 纯函数：`computeRelativeSeries`（RS 归一化比值线）、`buildEqualWeightNavSeries`（行业逐日等权净值）、`computeSymbolReturnsVsBaskets`（在 `computeSymbolReturns` 基础上加 `excessVsIndustry`/`excessVsSectorEtf`）。复用 `normalizeNav`/`simpleReturn`。难度：低。

**P6. 真 TTM 与衍生估值**
- 方案：新建 `src/lib/equity/ttm.ts`：滚动 4 季求和（营收/净利/OCF/CapEx→FCF）；估值 = 现价（P1 价格库）× 股本 → 市值，算 PE(TTM)/PB/PS(TTM)/EV≈市值+长期债务−现金、FCF yield、股息率。TTM 不落库（遵守「DB 只存水平值」）。难度：中。

**P7. 行业聚合升级季度感知**
- 方案：`fundamentalsAgg.ts` 加 `periodType` 参数，输出行业季度中位数时间序列（供 B3 趋势图）。难度：低。

### 展示层

**P8. 个股详情页 + symbol API**（C1/C2 最终交付）
- 方案：顶层路由 `/equity/stocks/[symbol]`（Server page 校验 + 面包屑 Sector › Industry › Symbol）+ BFF 路由族 `/api/equity/stocks/[symbol]/{prices,relative,profile,fundamentals,filings}`，照 `industry-returns` route 模式（`parseReturnRange` + `apiErrorResponse`）。
- K 线：**不复用** `CandlestickPanel`——它是 `StockChartWorkspace` 别名，硬绑定 `/api/data/klines`（binance/ibkr 源），对 S&P500 全量依赖 IBKR 配置。改用 equity 模块既有 ECharts 栈自绘蜡烛图（数据来自 P1 价格库），保留「在行情页打开」次级链接。难度：中。

**P9. 行业页 ↔ 个股页联动 + 行业内估值-成长散点**
- 方案：`IndustryDetailClient`/`EquitySectorDetailClient` 成分表 symbol 内链个股页；industry 页加 ECharts scatter（x=营收 YoY，y=PE(TTM)，气泡=市值）。难度：低。

**P10. 个股财报事件与叙事时间线**
- 方案：个股页 tab 复用 `SecFiling`（按 symbol 过滤 API 化）+ `company-operating-briefs` 按 symbol 过滤。难度：低。

---

## 4. 分阶段实施

### Phase 1（已批准，本次实施）：P1 + P5 + P8 —— 走势闭环

交付：`/equity/stocks/AAPL` 秒开（K 线 + 个股/industry 等权/sector ETF/SPY 四线相对净值 + 区间收益卡）；industry/sector 页读路径切 db-first 提速；成分表内链个股页。

1. Migration：`mds.equity_daily_bar`（`(symbol,date)` 唯一，OHLCV+adjClose+source，`(symbol,date desc)` 索引）。
2. `freeEtfEod.ts` 增加 `fetchYahooDailyBars`（OHLCV+adjclose，复用现有 UA/解析骨架）。
3. `equityPriceStore.ts`：`getDailyClosesDbFirst(symbols, {limit|fromSec})`——查库→判缺口（最新 bar 落后 >1 交易日或历史不足）→回补 upsert→返回 `Record<string, ClosePoint[]>`（close 取 adjClose）。
4. `scripts/equity/sync-prices.ts` + `equity:sync-prices`（`--symbols= --limit= --full`）。
5. `industryReturns.ts` / `fetchSectorEtfCloses.ts` 切 `getDailyClosesDbFirst`；纯函数不动。
6. `stockRelative.ts` + 测试；API `prices/relative/profile`；页面 + `StockPriceChart`（蜡烛）+ `StockRelativeChart`（净值线）。

### Phase 2（设计稿）：P2 + P6 + P7 —— 基本面闭环

- Migration：`EquityFundamentalSnapshot` 加 `periodType VarChar(8) @default("FY")` 与 nullable 列 `netIncome/ocf/capex/totalAssets/totalLiabilities/equity/longTermDebt/cash/sharesOutstanding/dividendsPaid/fiscalDate`，加 `(symbol, periodType, asOf)` 索引。唯一键 `(symbol,period)` 不变——`FY2024` 与 `2025Q1` 天然不冲突。顺带修正模型注释（现标 "FMP 缓存"，实际主源是 SEC）。
- `extractQuarterlyFundamentals` + `sync-fundamentals --period-type=Q --quarters=12`；`ttm.ts`；`fundamentalsAgg.ts` 季度感知。
- 个股页「基本面」tab：逐季营收/EPS/毛利率/营业利润率/FCF 柱线图（`StockFundamentalTrend`）+ TTM 估值卡 + 行业中位数对比。
- 验证锚点：AAPL/MSFT（财年错位）、JPM（金融无毛利率）与 10-Q 原文核对。

### Phase 3（设计稿）：P3 + P4 + P9 + P10 —— 研究工作流闭环

- 补 4 个 sector 宏观映射；industry 成分表加 `excessVsIndustry`/TTM 估值列 + 估值-成长散点；个股页「事件与叙事」tab（filings 时间线 + briefs）；sectors 首页基本面表升级季度口径。

---

## 5. 关键架构决策

**D1. 价格落库：新建 `mds.equity_daily_bar`，不复用通用 `Bar` 表，不接调度族**
- `Bar` 无 adjClose 字段（复权价是收益计算正确口径），且要求为 500 只个股造 `Instrument` 记录、背 uuid join；equity 模块已确立 symbol 一等公民（`EquityFundamentalSnapshot`/`SecFiling` 均直存 symbol）。
- `DataSubscription/FetchRun` 调度族为「官方发布日历驱动」的宏观设计；股价是简单每日增量，lazy 回补 + 手动脚本足够，未来要 nightly 再挂 cron。

**D2. 个股路由：顶层 `/equity/stocks/[symbol]`，不嵌套 industry 下**
- 入口多样（收益矩阵/财报表/briefs/未来搜索）；GICS 重分类不断链；面包屑可从 `equity_security` GICS 字段一次反查渲染。与 `/markets` 通用工作台并列不冲突。

**D3. 季度基本面：扩展现表加 `periodType`，不建新表**
- 唯一键天然兼容；`fundamentalsAgg.ts` 等读方加一个 where 即可，避免双表双读。加列全 nullable、additive migration。

**D4. 覆盖范围：价格 lazy 回补 + 可选全量脚本；基本面脚本全量**
- 价格 lazy 对免费源最友好（访问即回补，冷门股不占预算）；`--full` 供一次性 5y 回填。基本面低频变动，SEC 限速内全量脚本（财报季每周跑）更简单且保证行业聚合覆盖率。

**D5. 个股 K 线自绘 ECharts，不复用 `CandlestickPanel`**
- `CandlestickPanel` = `StockChartWorkspace`，硬绑定 `/api/data/klines`（binance/ibkr），数据可得性依赖 IBKR 配置；equity 模块统一 ECharts 栈，数据来自自有价格库更可控。保留跳转 `/markets` 链接兼顾专业看盘。

---

## 6. Guardrails（明确不做）

1. 不做回测/组合引擎、交易信号、仓位、绩效归因——只做研究视图。
2. 不做盘中/分钟级行情，仅日线 EOD。
3. 不做完整三大报表明细浏览（仅 ~15 个选定 XBRL tag）。
4. 不引入付费数据源：FMP 保持 402 容错现状，Tiingo 仅 fallback，不上 Polygon/AlphaVantage 付费档。
5. 不做 point-in-time 成分/GICS 历史（不解决幸存者偏差；回测不做故可接受）。
6. 不做 screener/自选股/告警。
7. 不改 `/markets` 通用图表页与宏观 `DataSubscription/FetchRun` 调度族。
8. 不为个股新增 AI 生成管道，只消费已有 `company-operating-briefs` ingest。
