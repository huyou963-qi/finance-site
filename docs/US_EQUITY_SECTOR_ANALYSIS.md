# 美股行业分析（GICS Sector）

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
| 每日 | `equity:sync-fundamentals -- --limit=100` |
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

## 个股详情（Phase 1）

- 页面：`/equity/stocks/[symbol]`（顶层路由；面包屑 Sector › Industry › Symbol 由 `equity_security` GICS 字段反查）。含日 K（ECharts 蜡烛+成交量）、四线相对净值（个股 / Industry 等权 / Sector ETF / SPY，起点=100）、1M–1Y 区间收益表（绝对 / vs SPY / vs Sector ETF / vs Industry 等权）；基本面与事件叙事为 Phase 2/3 占位。
- API：`GET /api/equity/stocks/[symbol]/profile`（主档+归属+各窗口收益）、`.../prices?days=`（OHLCV 日线）、`.../relative?from=&to=`（归一化净值序列+区间超额）
- 计算：`src/lib/equity/stockRelative.ts`（等权净值 / RS 线 / vs 多基准超额，纯函数含测试）
- 行业/板块成分表的代码与「个股」列内链此页；「K线」保留外链 `/markets` 工作台
- 三层研究设计（含 Phase 2 季度基本面、Phase 3 联动）：`docs/research/US_EQUITY_STOCK_DRILLDOWN_DESIGN.md`

## Prisma 表

| 表 | Schema |
|----|--------|
| `mds.equity_security` | 证券主数据 |
| `mds.index_constituent` | SP500 成分快照 |
| `mds.equity_fundamental_snapshot` | 财报/估值缓存 |
| `mds.equity_daily_bar` | 个股/ETF 日线（OHLCV+adjClose） |
| `mds.sec_filing` | SEC 披露索引 |
| `public.company_operating_brief` | 经营简报 |
| `public.industry_peer_resonance` | 同业互证 |

调研背景：`docs/research/US_EQUITY_INDUSTRY_RESEARCH.md`、`docs/research/US_EQUITY_OPERATING_TRACK_DECISION.md`。
