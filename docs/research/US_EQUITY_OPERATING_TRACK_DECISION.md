# 美股行业 + 高频经营跟踪 — 决策备忘录（Phase R5）

> 日期：2026-07-05  
> 依据：[US_EQUITY_INDUSTRY_RESEARCH.md](./US_EQUITY_INDUSTRY_RESEARCH.md) 实测数据

---

## 1. 决策问题

是否在 `finance-site` 内建设：**GICS 行业 → 成分股 → 行业走势 → 权重 → IR/SEC 披露 → AI 月度经营分析 → 行业互证** 全链路？

---

## 2. 数据成本对比

| 能力 | 方案 A：当前 FMP 免费档 | 方案 B：FMP 付费升级 | 方案 C：混合（推荐 MVP） |
|------|------------------------|---------------------|-------------------------|
| GICS 标签 | profile 单股 ✓ | + screener 批量 | Wikipedia 成分 + profile **分日缓存** |
| 成分股 | ✗ 402 | sp500-constituent ✓ | **Wikipedia**（501 条已验证） |
| 行业历史涨跌 | sector/industry performance ✓ | 同左 | FMP 聚合 + **Sector ETF**（IBKR K 线） |
| 成分权重 | ✗ ETF holdings 402 | etf/holdings ✓ | 市值加权自建 + 可选 SPY 对照 |
| IR 月度更新 | 自研 scrape | 同左 | **SEC 8-K 为主** + Top N IR RSS/HTML |
| AI 分析 | 外部 Automation | 同左 | 复用 WeeklyReport ingest 模式 |
| SEC 结构化 | EDGAR 免费 | SEC-API 付费省工 | **EDGAR submissions API** |

### 成本粗估（月）

| 项 | 估算 |
|----|------|
| FMP 升级（Starter/Pro，含 constituents + ETF） | ~$30–80 USD |
| SEC-API.io（可选，Exhibit 99 解析） | ~$50+ USD |
| IR scrape 维护人力 | 0.2–0.5 FTE（全 S&P500 IR） / **0.05 FTE**（Top 50 + SEC） |
| LLM（外部 Automation） | 按 token，Top 50 月度 ~$20–50 |

---

## 3. 维护成本评估（IR scrape 路径）

| 范围 | 维护 | 说明 |
|------|------|------|
| S&P 500 全量 IR HTML | **高** | 15 只试点仅 8/15 首页可抓；0 只真有 monthly 信 |
| Top 50 按市值 | **中** | 手工维护 `irSourceCatalog` + RSS 优先 |
| SEC 8-K + 10-Q | **低** | CIK 稳定，API 免费，合规 |
| 行业互证 batch | **低** | 依赖上游 brief JSON，无额外 scrape |

**结论：** 用户选择的「IR 页面抓取」应定位为 **补充层**，不能替代 SEC；否则月度覆盖率 <30%。

---

## 4. 推荐 MVP 范围（若进入开发）

### Phase 1（4–6 周）

1. **数据层**
   - `mds.equity_security`：ticker, cik, gicsSector, gicsIndustry, irUrl, marketCap, marketCapAsOf
   - `mds.index_constituent`：indexCode=`SP500`, symbol, asOfDate（Wikipedia seed）
   - Seed：`npm run research:seed-sp500`（封装 Wikipedia + profile 分日）

2. **行情**
   - Sector ETF（XLK…）走现有 IBKR K 线或 Tiingo
   - FMP `historical-sector-performance` → 宏观工具页 overlay

3. **披露**
   - Worker：按 CIK 增量拉 SEC submissions → 新 8-K/10-Q 入库
   - IR：仅 `irSourceCatalog` 中 `rss_first` + `html_news_list` 策略

4. **AI**
   - Schema：[company-operating-brief.schema.json](../specs/company-operating-brief.schema.json)
   - `POST /api/company-operating-briefs`（mirror weekly ingest）
   - 月度 Automation：Top 50 → brief JSON

### Phase 2（+4 周）

- 行业互证 batch + `/tools/industry-resonance` 只读页
- FMP 升级接入 sp500-constituent + SPY holdings 权重校验
- IR 扩至 S&P 500 中市值 Top 100

### 明确不做（首期）

- GICS Sub-Industry 官方指数全量
- 全 S&P500 IR HTML 通吃 parser
- 站内 LLM SDK

---

## 5. Go / No-Go 条件

| 条件 | 状态 |
|------|------|
| GICS 成分可免费获取 | ✓ Wikipedia |
| 单股 sector/industry 可获取 | ✓ FMP profile |
| 权重可近似 | △ 需缓存 worker 或 FMP 升级 |
| 高频经营文本可获取 | △ SEC ✓；IR 部分 ✓ |
| 与 finance-site 架构兼容 | ✓ worker + ingest 现成 |
| 团队可接受 IR 维护 | **需确认** |

**建议：Go（MVP Phase 1）** — 以 **SEC + Top 50 IR + GICS Sector** 为范围，权重用分日 profile 缓存，不阻塞主线。

---

## 6. 下一步（若批准开发）

1. PR：`feature/equity-industry-mvp` — Prisma 表 + Wikipedia seed script  
2. 协调 FMP 是否升级（constituents + ETF holdings）  
3. 编写 Cursor Automation prompt（月度 Top 50 brief + peer resonance）  
4. 管理端：`irSourceCatalog` YAML/TS 维护界面（可后置）

---

## 7. 参考文件

| 路径 | 内容 |
|------|------|
| `scripts/data/research/us-equity-industry/research_report_r1_r2.json` | FMP 端点实测 |
| `scripts/data/research/us-equity-industry/weight_benchmark_r2.json` | 全成分权重试验 |
| `scripts/data/research/us-equity-industry/ir_pilot_report.json` | IR 15 只试点 |
| `docs/specs/*.schema.json` | AI ingest schema |
