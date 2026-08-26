# 美股行业分析（GICS Sector）

> 数据架构必须遵守 [`DATA_FOUNDATION_REUSE_PRINCIPLES.md`](./DATA_FOUNDATION_REUSE_PRINCIPLES.md)：行业模块消费宏观、量化因子和行情 canonical 底座，不另建平行数据链。

> 页面：`/equity/sectors` · 详情：`/equity/sectors/[sector]`  
> 与宏观「制造业与库存周期」(`industry-inventory`) **不同域**：本模块是 **股权 GICS 行业**，后者是宏观制造业周期。

## 回答的问题

| 问题 | 证据 |
|------|------|
| 哪些行业占优？ | Sector ETF vs SPY 相对收益 + 排行 |
| 成长 / 周期 / 防御谁强？ | 预置风格篮子等权超额收益 |
| 宏观是否支持？ | `sectorMacroMap` → 已有 `fred:`/`mds:` 序列 |
| 基本面是否支持？ | 行业财报中位数（营收/EPS 增速、利润率、PE） |
| 经营叙事是否共振？ | CompanyOperatingBrief + IndustryPeerResonance（外部 AI ingest） |

## 当前环境：月度正式锚 + 周度实时监测

行业首页不再把一个 `signalDate` 同时冒充“历史信号日期”和“今天的数据日期”，而是明确显示三种时间：

1. **月度归属**：正式 `MacroRegime` 的研究月份，用于历史复盘、行业模型排序和可审计前瞻账本；旧月份不能被新数据回写。
2. **最新官方输入**：增长、就业、收入、调查与通胀等月度数据在当时可见的最新期，用来解释月度锚为什么可能落后于自然日。
3. **实时监测截至**：请求时用 canonical `MacroObservation` 重算同一 Regime 分类器，再用 10Y−3M、HY OAS、VIX、10Y 通胀预期、WTI 和 10Y 收益率的四周变化做周度确认。

实时层是 **Nowcast，不是新的正式 Regime**：它可以提示环境正在偏离月度锚，但不会覆盖 `MacroRegime`，不会进入历史回测，也不会直接改写行业排序。页面按“实时环境变化 → 月度正式信号与行业排序 → 当前行业基本面”呈现；正式月度和临时实时结论发生分歧时，页面显式保留两者并等待官方数据确认。

底层仍是一套：`/api/equity/regime-nowcast` 调用 `src/lib/quant/macroRegime.ts`，读取统一 `MacroObservation`；关键输入通过同一 `DataSubscription`/release package 提升调度优先级，不新增 adapter、事实表或 writer。数据发布后由常驻 `data:worker` 增量更新，页面请求即重算；Stage H 额外按新鲜度做防漏补检（日频每天、月频每周），仍调用统一 subscription runner，并保留原 `nextRunAt`，不会提前推进发布包。无需为 Nowcast 增加第二套 cron。

## 历史轮动研究框架

> 「宏观阶段 → 行业基本面 → 估值 → 行业收益」的正式研究口径、时间对齐、可信度、
> API 契约与阶段化实施计划见
> [`docs/specs/us-sector-transmission.spec.md`](./specs/us-sector-transmission.spec.md)。
> 当前已完成阶段 A–H：30 阶段解析、传导面板、市值代理收益桥、SEC filing vintage / GICS 有效期 / ETF 持仓三层事实闸门、严格 ETF 权重端点重建、D1/D3 双轨对账、覆盖/无前视/性能/视觉总验收、Regime 的 2020+ 锁定前瞻检验、宏观 vintage + 不可回写真实前瞻账本，以及生产自动化与连续监控；完整口径、复算表与验收结果见
> [`docs/US_EQUITY_SECTOR_TRANSMISSION.md`](./US_EQUITY_SECTOR_TRANSMISSION.md)。

行业首页的「美国历史情境下的行业轮动」不是把历史收益简单外推为预测，而是把每段历史拆成一条可复核的因果链：

`冲击 / 制度变化 → 增长、通胀、利率、信用条件 → 行业盈利与估值传导 → 行业相对收益`。

1. **先分段。** 当前以 NBER 周期拐点、FOMC 政策切换、信用/流动性事件和改变行业定价主线的市场拐点，把 1998 年末至今拆为 30 个细分阶段；2007–2009、2020、2022–2023 等快速轮动期会进一步细分。分期定义见 `src/lib/equity/sectorHistoricalPeriods.ts`。
2. **再提出事前可解释的假设。** 每个阶段明确增长、通胀、政策、信用四维状态，列出关键事件及影响、盈利/估值传导机制和理论受益行业；该栏不随实际结果重写。
3. **用同一价格口径核验。** 前端只请求一次 `GET /api/equity/sector-returns?from=1998-12-16&to=2099-12-31&nav=1` 完整净值序列，再在浏览器内按 30 个阶段的首尾可得交易日计算总回报和相对 SPY 超额，避免重复拉取 30 次全历史。
4. **最后解释偏差。** 理论受益不等于当期第一：估值起点、行业权重、商品价格、政策与事件风险都可能改变排序。缺少历史的 ETF 不补造数据（XLC、XLRE 的样本期更短）。

页面保持“上方全历史走势图 + 下方横向阶段卡”的草图结构。点击卡片只缩放主图窗口；每张卡固定列出 SPY 与全部 11 个行业，并同时显示绝对收益和相对 SPY 超额。ETF 尚未上市或阶段内不足两个交易日时显示 `—`，不以区间外行情代替。手工收益矩阵仍可加入任意自定义区间，供继续做事件前后切片。

## 风格轮动宏观背景（总览顶栏）

| 指标 | 为何重要 |
|------|----------|
| ISM 制造业 PMI | 景气扩张/收缩 → 周期 vs 防御 |
| 10Y−3M 收益率曲线 | 衰退领先信号；倒挂偏防御，陡峭化偏早周期/金融 |
| 10Y 国债收益率 | 贴现率/久期；利率上行压制成长（科技/通信） |
| 美高收益债 OAS | 风险偏好；利差走阔偏防御，收窄偏周期/成长 |

配置：`src/lib/equity/sectorMacroMap.ts` → `CYCLE_BACKGROUND_KEYS`。  
不用工业生产同比：滞后且与 ISM 重叠。

## 数据命令

```bash
npm run db:migrate                 # 含 equity 相关表
npm run equity:seed-sp500          # Wikipedia → equity_security + index_constituent（Sub-Industry 回卷至 Industry）
npm run equity:verify-gics         # 校验 74 Industry 目录；加 --db 检查回卷率
npm run equity:sync-profiles       # 分日 FMP profile（默认 --limit=40）
npm run equity:sync-fundamentals  # Top-N 财报快照（默认 SEC companyfacts，--limit=100）
npm run equity:sync-weekly-fundamentals # 最近新增 10-Q/10-K → 当前季度快照 + PIT vintage
npm run equity:sync-fundamental-vintages # SEC accession 逐版本标准化历史
npm run equity:sync-sector-etf-holdings # State Street SPY + 11行业 ETF 每日持仓归档
npm run equity:import-sector-etf-holdings -- --file=<archived.xlsx> --etf=XLK --source=<source>
npm run equity:snapshot-current-classifications # 从观察日起保存当前 GICS，不倒填历史
npm run equity:import-sector-classifications -- --file=<history.csv> # 授权历史 GICS 导入
npm run equity:verify-sector-history-facts # 三层事实覆盖、权重与区间校验
npm run data:sync-regime-vintages -- --start=1998-01-01 # ALFRED 发布/修订版本
npm run equity:run-sector-regime-ledger # 冻结新信号 + 结算到期结果（均不可覆盖）
npm run equity:verify-sector-stage-g # 真实前瞻账本契约验收
npm run equity:run-sector-regime-stage-h # 每日版本增量、冻结、结算与健康检查
npm run equity:monitor-sector-regime-stage-h # heartbeat / 缺口 / 漂移 / 缺价监控
npm run equity:verify-sector-stage-h -- --run # Stage H 实库总验收
npm run equity:sync-sec            # Top-N SEC 8-K/10-Q/10-K 索引
npm run equity:sync-prices         # 个股/ETF 日线回填（--limit=500 / --symbols=AAPL,MSFT / --full 5年）
```

> **基本面为何曾为空：** 页面只读 `mds.equity_fundamental_snapshot`；未跑 sync 时表为空。旧路径依赖 FMP `income-statement`/`ratios?period=quarter`，当前免费/基础档常返回 **HTTP 402**。现已改为 **SEC EDGAR companyfacts**（免密钥）+ Yahoo 现价估 PE。

`npm run data:apply` 会在 migrate 后尝试 `equity:seed-sp500`（失败不阻断宏观落库；可用 `--skip-equity` 跳过）。

## 计划任务建议

| 频率 | 命令 |
|------|------|
| 每周 | `equity:seed-sp500` |
| 每日 | `equity:sync-profiles -- --only-missing` 与/或增量 limit |
| 每周 | `equity:sync-weekly-fundamentals`（扫描最近 10 天 SEC 10-Q/10-K，只刷新有新披露的公司） |
| 每日 | `equity:sync-sector-etf-holdings`（必须归档，官网只提供每日文件） |
| 历史回填时 | `equity:sync-fundamental-vintages -- --limit=... --last-filings=...` |
| 每日 | `equity:run-sector-regime-stage-h`（当前输入日/周新鲜度补检 + 45 天 ALFRED 增量窗口 + 新月份首次冻结 + 到期结算 + 健康检查） |
| 每小时 | `equity:monitor-sector-regime-stage-h`（独立检测任务缺跑、版本缺口、哈希漂移和到期缺价） |
| 每 5 分钟 | `data:worker`（统一更新所有到期订阅；Regime 正式输入与高频确认项具有较高调度优先级） |
| 每 6 小时 | `equity:sync-sec -- --limit=50` |
| 每日（可选） | `equity:sync-prices -- --limit=500`（不跑也可：页面访问会 lazy 回补） |

Sector ETF / SPY / 个股日线默认 **Yahoo Finance**（免密钥，不依赖 IBKR）。可选 `TIINGO_API_TOKEN` 作 fallback。FMP 免费档勿一次拉全量 501 profile。

日线现走 **db-first**（`mds.equity_daily_bar`，存 OHLCV + adjClose）：读取层 `src/lib/equity/equityPriceStore.ts` 查库优先，尾部过期或历史不足时才回补远端并落库；收益计算一律用 adjClose（复权）。

## Ingest（AI）

- `POST /api/equity/company-operating-briefs` — schema 见 `docs/specs/company-operating-brief.schema.json`
- `POST /api/equity/industry-peer-resonances` — schema 见 `docs/specs/industry-peer-resonance.schema.json`
- 鉴权：`EQUITY_INGEST_TOKEN` 或回退 `WEEKLY_REPORT_INGEST_TOKEN`

## 配置代码

- `src/lib/equity/gicsCatalog.ts` — GICS 11 ↔ ETF ↔ FMP normalize
- `src/lib/equity/gicsIndustryCatalog.ts` — GICS 74 Industry / 163 Sub-Industry + 周期/防御/两者标注
- `src/lib/equity/styleBuckets.ts` — 成长/周期/防御（Sector 级）
- `src/lib/equity/sectorMacroMap.ts` — 行业 → 宏观 keys

## GICS Industry 钻取

- 页面：`/equity/sectors/[sector]` → Tab **Industry**；详情 `/equity/sectors/[sector]/industries/[industry]`
- API：`GET /api/equity/sectors/[sector]/industries?from=&to=`、`.../industries/[industry]/constituents?from=&to=`、`GET /api/equity/industry-returns?industryCode=&from=&to=`
- 数据：`data/gics/gics-structure.json`（2023+ 官方树）+ `data/gics/industry-style-tags.json`（来自 Excel 周期/防御/两者）
- 收益：Industry **等权篮子**（非 S&P 付费指数）；个股与篮子区间涨跌来自 Yahoo 日线
- 重生成目录：`python scripts/equity/generate-gics-offline.py`（若存在）或 `npx tsx scripts/equity/build-gics-data.ts`

## 个股详情

- 页面：`/equity/stocks/[symbol]`（顶层路由；面包屑 Sector › Industry › Symbol 由 `equity_security` GICS 字段反查）。
- **已交付**：日 K（ECharts 蜡烛+成交量、财报「E」标记）、四线相对净值（个股 / Industry 等权 / Sector ETF / SPY）、1M–1Y 区间收益表；**基本面**（SEC 标准化三表、TTM 估值、PE/PB 历史带、DuPont、同业 RV）；**事件时间线**（季年报/8-K/拆股 + 经营简报）。
- API：`GET /api/equity/stocks/[symbol]/profile`、`.../prices`、`.../relative`、`.../fundamentals?quarters=`（默认 20，上限 70）、`.../peers`、`.../events`
- 计算：`src/lib/equity/stockRelative.ts`（等权净值 / RS / 超额）；TTM/比率读时计算（`ttm.ts` / `fundamentalRatios.ts`）
- 行业/板块成分表的代码与「个股」列内链此页；行情页顶栏「个股研究」回链（仅 `classifyChartSymbol`→equity）；「K线」保留 `/markets`
- 设计原稿：`docs/research/US_EQUITY_STOCK_DRILLDOWN_DESIGN.md`；行情叠加与 PE 口径见 `docs/MARKETS_CHART_LAYERS.md`

## Prisma 表

| 表 | Schema |
|----|--------|
| `mds.equity_security` | 证券主数据 |
| `mds.index_constituent` | SP500 成分快照 |
| `mds.equity_fundamental_snapshot` | 财报/估值缓存 |
| `mds.equity_fundamental_vintage` | 按 SEC accession 保存的财报标准化版本 |
| `mds.equity_sector_classification_history` | GICS/SIC 分类有效期历史 |
| `mds.sector_etf_holding` | SPY / Sector SPDR 日度持仓权重 |
| `mds.macro_observation_vintage` | 宏观观测的 ALFRED / worker 可见版本链 |
| `mds.sector_regime_signal_snapshot` | 月度 Regime 行业排序不可变快照 |
| `mds.sector_regime_forecast` | 逐行业 3/6/12 月预测与一次性到期结果 |
| `mds.equity_daily_bar` | 个股/ETF 日线（OHLCV+adjClose） |
| `mds.sec_filing` | SEC 披露索引 |
| `public.company_operating_brief` | 经营简报 |
| `public.industry_peer_resonance` | 同业互证 |

调研背景：`docs/research/US_EQUITY_INDUSTRY_RESEARCH.md`、`docs/research/US_EQUITY_OPERATING_TRACK_DECISION.md`。  
终端级缺口与数据源拍板：`docs/STOCK_FUNDAMENTALS_TERMINAL_GAP.md`。
