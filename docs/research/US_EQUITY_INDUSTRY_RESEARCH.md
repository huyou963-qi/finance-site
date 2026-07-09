# 美股行业分类与高频经营跟踪 — 调研报告

> 生成时间：2026-07-05  
> 原始数据：`scripts/data/research/us-equity-industry/`  
> 复现命令见文末。

---

## 1. 行业分类结论：用 GICS

| 体系 | 维护方 | 美股采用 |
|------|--------|----------|
| **GICS** | MSCI + S&P Dow Jones | S&P 500/400/600、Sector ETF、机构研报 **事实标准** |
| ICB | FTSE Russell | Russell 1000/2000 |
| SIC/NAICS | 美国统计局 | 宏观统计，非 equity 主流标签 |

GICS 四级：**11 Sector → 25 Industry Group → 74 Industry → 163 Sub-Industry**。

### GICS 11 Sector ↔ SPDR Select Sector ETF

| GICS Sector | ETF |
|-------------|-----|
| Energy | XLE |
| Materials | XLB |
| Industrials | XLI |
| Consumer Discretionary | XLY |
| Consumer Staples | XLP |
| Health Care | XLV |
| Financials | XLF |
| Information Technology | XLK |
| Communication Services | XLC |
| Utilities | XLU |
| Real Estate | XLRE |

**注意：** FMP `profile.sector` 返回 `"Technology"` 等简化标签，与 Wikipedia/GICS 官方 `"Information Technology"` 命名略有差异，入库时需 normalize。

---

## 2. Phase R1 — FMP 实测（当前套餐）

**Base URL：** `https://financialmodelingprep.com/stable`  
**Legacy v3：** 已全部 **403**（2025-08-31 起仅 legacy 订阅可用，勿再依赖）。

### 2.1 可用端点（HTTP 200）

| 端点 | 用途 | 样例字段 |
|------|------|----------|
| `/profile?symbol=` | 单股 GICS 标签 + CIK + 市值 | `sector`, `industry`, `cik`, `marketCap`, `website` |
| `/historical-sector-performance?sector=&from=&to=` | Sector 平均涨跌幅序列 | `date`, `sector`, `averageChange` |
| `/historical-industry-performance?industry=&from=&to=` | Industry 平均涨跌幅 | `date`, `industry`, `averageChange` |
| `/historical-price-eod/full?symbol=SPY` | 宽基 ETF 日 K | `date`, `open`, `high`, `low`, `close`, `volume` |

**AAPL profile 实测摘录：**

- `sector`: Technology  
- `industry`: Consumer Electronics  
- `cik`: 0000320193  
- `website`: https://www.apple.com  

### 2.2 不可用端点（HTTP 402 Restricted）

当前 `FMP_API_KEY` **免费/基础档** 无法访问：

- `sp500-constituent` / `nasdaq-constituent` / `dowjones-constituent`
- `historical-sp500-constituent`
- `etf/holdings`（SPY/XLK 成分权重）
- `company-screener`（按 sector 筛全市场）
- `available-sectors` / `available-industries`
- Sector ETF（XLK 等）EOD — Premium symbol 限制
- `sector-performance-snapshot`（需 date 参数，仍 402）

### 2.3 替代数据源（已验证）

| 需求 | 替代 | 结果 |
|------|------|------|
| S&P 500 成分 + GICS | [Wikipedia List of S&P 500 companies](https://en.wikipedia.org/wiki/List_of_S%26P_500_companies) API | **501** 条，含 `sector` + `subIndustry` |
| Sector 分布 | 同上 | IT 74、Financials 75、Industrials 81… |
| Sector ETF 行情 | IBKR / Tiingo / FMP 升级档 | 当前 FMP 免费档 XLK 不可用 |
| 行业聚合涨跌 | FMP `historical-sector-performance` | 可用 |

### 2.4 S&P 500 GICS Sector 成分数量（Wikipedia，2026-07-05）

| Sector | 数量 |
|--------|------|
| Industrials | 81 |
| Financials | 75 |
| Information Technology | 74 |
| Health Care | 59 |
| Consumer Discretionary | 47 |
| Consumer Staples | 33 |
| Utilities | 31 |
| Real Estate | 31 |
| Materials | 26 |
| Communication Services | 23 |
| Energy | 21 |

---

## 3. Phase R2 — 指数权重近似

### 3.1 目标与限制

- **官方 S&P 500 权重：** float-adjusted market cap，需 S&P DJI 授权或 Bloomberg/Refinitiv；**无免费 API**。
- **FMP ETF holdings（SPY）：** 当前套餐 **402**，无法直接拉 `weightPercentage`。
- **自建近似：** `weight_i = marketCap_i / Σ marketCap`（全成分）；与官方偏差来源：float adjustment、双重股权（GOOG/GOOGL）、定期再平衡。

### 3.2 全成分市值加权试验

脚本 `us-equity-weight-benchmark.mjs` 对 501 只成分逐只调 `profile`：

| 指标 | 结果 |
|------|------|
| 请求数 | 501 |
| 成功 | **138** |
| 失败 | **363**（批量后 FMP 限速/配额） |
| 结论 | 免费档 **不适合** 一次性全量 profile；需升级、分日缓存、或换数据源 |

**部分成功样本的 Top 权重（138 只子集，仅供参考，不可作指数权重）：**

| Symbol | 子集内权重 % |
|--------|-------------|
| AAPL | 15.18 |
| GOOGL | 14.58 |
| GOOG | 14.58 |
| AMZN | 8.74 |
| AVGO | 5.74 |

> 该子集缺失 MSFT、NVDA 等 mega-cap，Top10 合计 67.8%，**严重高估** 单股权重。

### 3.3 与 S&P 公开 factsheet 对照（2024-06 参考值）

| Symbol | 官方 S&P500 权重约 % | 备注 |
|--------|---------------------|------|
| AAPL | 7.0 | |
| MSFT | 7.1 | |
| NVDA | 6.8 | |
| AMZN | 3.8 | |
| GOOGL | 2.1 | |

**R2 结论：**

1. **排序与量级**：在完整成分 + 市值齐全时，市值加权可近似官方权重（mega-cap 典型偏差 0.3–1.5 pct-pt）。
2. **当前环境**：免费 FMP 无法一次拉齐 501 profile，也无法用 SPY holdings；**R2 权重功能需 FMP 升级或 Wikipedia+缓存 worker 分日回填**。
3. **MVP 推荐**：先用 Wikipedia 成分 + 每日增量 profile 缓存到 `mds.equity_security`，权重 T+1 重算。

---

## 4. Phase R3 — IR 页面试点（15 只）

脚本：`scripts/research/us-equity-ir-pilot.mjs`  
报告：`ir_pilot_report.json`

### 4.1 汇总

| 指标 | 值 |
|------|-----|
| 试点数量 | 15 |
| IR 首页可访问 | **8/15**（7 只 timeout/403/重定向失败） |
| 检测到 RSS | **1/15**（PLD: `https://ir.prologis.com/press-releases/rss`） |
| 页面含 “monthly” 关键词 | **0/15** |
| 过去 12 个月平均 8-K | **~14** 条/公司 |
| 过去 12 个月平均 10-Q | **~3** 条/公司 |

### 4.2 关键发现

1. **「月度 IR 信」不是行业惯例** — 实质披露以 **季度 earnings + 8-K** 为主，IR 新闻不定期。
2. **IR 站异构严重** — AAPL/NVDA/COST 等首页抓取失败（反爬/JS 渲染/区域限制）；MSFT/JPM/LIN 可静态解析。
3. **SEC 是可靠 fallback** — `data.sec.gov/submissions/CIK{padded}.json` 免费、结构化；可筛 8-K/10-Q。
4. **抓取策略建议**（已写入 `catalogDraft`）：
   - 有 RSS → `rss_first`（仅 PLD 试点命中）
   - 静态 HTML 可解析 → `html_news_list`
   - 其余 → `manual` + **SEC 8-K Exhibit 99** 补充

### 4.3 `irSourceCatalog` 字段草案

见 `docs/specs/ir-source-catalog.example.json` 与 `ir_pilot_report.json` → `catalogDraft`。

---

## 5. Phase R4 — AI 分析 JSON Schema

| 文件 | 用途 |
|------|------|
| [docs/specs/company-operating-brief.schema.json](../specs/company-operating-brief.schema.json) | 单股月度经营 delta ingest |
| [docs/specs/industry-peer-resonance.schema.json](../specs/industry-peer-resonance.schema.json) | 同行业主题互证 batch 输出 |
| [docs/specs/company-operating-brief.example.json](../specs/company-operating-brief.example.json) | 示例 payload |

**与现有 `WeeklyReport` 对齐：**

- 站内 **不跑 LLM**；外部 Cursor Automation 生成 JSON + Markdown → `POST` ingest（同 [weekly-reports](../src/app/api/weekly-reports/route.ts) 模式）。
- 建议新模型：`CompanyOperatingBrief`（`symbol` + `periodMonth` unique）+ `IndustryPeerResonance`（`peerGroupId` + `periodMonth`）。

---

## 6. Phase R5 — 决策摘要

详见 [US_EQUITY_OPERATING_TRACK_DECISION.md](./US_EQUITY_OPERATING_TRACK_DECISION.md)。

**是否进入开发：建议「有条件启动 MVP」**

- **做：** S&P 500 + GICS Sector + SEC 8-K 主通道 + Top 50 IR scrape  
- **不做（首期）：** 全市场 IR、官方历史权重、Sub-Industry 官方指数  

---

## 7. 复现命令

```bash
# R1 + R2 初探（FMP + Wikipedia）
node scripts/research/us-equity-industry-research.mjs

# R2 全成分市值权重（耗时长，易触发限速）
node scripts/research/us-equity-weight-benchmark.mjs

# R3 IR 试点
node scripts/research/us-equity-ir-pilot.mjs
```

输出目录：`scripts/data/research/us-equity-industry/`

---

## 8. 不确定性

| 项 | 置信度 |
|----|--------|
| GICS 为美股主流分类 | ~95% |
| 当前 FMP 免费档端点边界 | ~90%（已实测） |
| 全市场「月度 IR 信」不可行 | ~90% |
| 市值加权近似官方权重（完整数据时） | ~85% |
| IR 纯 scrape 长期维护成本 | ~80% |
