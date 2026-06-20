# Prompt：美股 EOD 不复权基准价 + 复权因子 — 调研结论与落库设计

> **状态（2026-06）**：调研 **已完成**，报告见 [`.cursor/research/us-equity-eod-data-sources.md`](../research/us-equity-eod-data-sources.md)。  
> **工程状态**：Phase 2（Prisma 表 + `data:sync-equity-eod` + K 线读 DB）**尚未实现**；行情页仍走 IBKR/Binance + 客户端复权。

---

## 任务目标

为 **finance-site** 行情页 K 线重构提供 **已定稿的数据方案** 与 **待实现的落库设计**，满足：

1. **美股 EOD（日 K）原始 OHLCV** — **不复权 / 名义成交价** 为基准（split 前真实报价）
2. **复权因子或可推导字段** — 至少支持 **拆股**；理想同时支持 **现金分红**
3. **覆盖范围** — 免费档 **无法全美日更**；生产建议 **watchlist 200–500** 或 **S&P 500**，全美需付费档或分批
4. **可入库** — 对接 PostgreSQL + `data-scheduler`（**待开发**），替代 IB 历史 + 前端猜拆股

---

## 调研结论摘要（已验证）

| 项 | 结论 |
|----|------|
| 是否值得「DB 存不复权 OHLC + 因子」 | **是** — 前/后/不复权可确定性计算，可审计 |
| 主方案 | **Tiingo EOD** — 单 endpoint 含 raw OHLC、`adjClose`、`splitFactor`、`divCash` |
| 备方案（可立即开工） | **FMP stable** — 已有 `FMP_API_KEY`；`non-split-adjusted` + `splits`/`dividends` |
| 免费全美日更 | **不可行** — Tiingo Starter 500 sym/月；FMP 250 calls/天 |
| 不推荐 | IB Trades 作基准（已是前复权）；yfinance 作生产主源 |

**FMP 实测（2026-06-11）**：AAPL 2020-08-31 4:1、NVDA 2024-06-10 10:1 名义价与 ratio 符合预期；`non-split-adjusted` 的 JSON 字段名 `adjClose` **实为名义 close**，勿与 legacy v3 混淆。

**Tiingo**：仓库当时未配 `TIINGO_API_TOKEN`，live 请求未跑；语义以官方 EOD 文档为准，落地前需补一次并排抽样。

**交付物（已有）**

| 产物 | 路径 |
|------|------|
| 调研报告（中文） | `.cursor/research/us-equity-eod-data-sources.md` |
| 抽样脚本 | `scripts/research/fetch-equity-source-samples.mjs` |
| FMP 脱敏 JSON | `scripts/data/research/fmp-*.json`、`research-summary.json` |

复跑抽样：`node scripts/research/fetch-equity-source-samples.mjs`（需 `.env.local` 中 `FMP_API_KEY`；可选 `TIINGO_API_TOKEN`）。

---

## 背景（本仓库 **当前** 实现）

| 模块 | 现状 |
|------|------|
| K 线 API | `GET /api/data/klines` ← IBKR / Binance |
| 复权 | `src/lib/data/klineAdjustment.ts` → `StockChartWorkspace` 客户端 `applyKlinePriceAdjustment` |
| 问题 | IB 历史为前复权语义；跳变检测 + 硬编码拆股日历；后复权/不复权不可靠 |
| FMP | `.env.example` 有 `FMP_API_KEY`；用于 TTM PE 等，**未**用于 K 线库 |
| DB | **尚无** `equity_bar` / `corporate_action` 表 |
| 宏观 CPI | 已实现 `mds` + scheduler（与本任务无关，勿混） |

---

## 数据源对比（定稿矩阵）

| 数据源 | 免费额度 | 原始 OHLC | split/div | 批量全美 | 推荐角色 |
|--------|----------|-----------|-----------|----------|----------|
| **Tiingo EOD** | 50/h, 1000/d, **500 sym/月** | ✅ 同行 raw + 因子 | ✅ 每 bar | ❌ | **主方案（模型最优）** |
| **FMP stable** | **250 calls/天** | ✅ `non-split-adjusted` | ✅ 独立 endpoint | ⚠️ 分批 ~80–125 sym/天 | **备方案（零新 Key）** |
| yfinance | 无 Key | ✅ 开发对照 | ✅ | ⚠️ ToS | **仅对照，非生产** |
| IBKR Trades | 已有 | ❌ 前复权语义 | ❌ | — | **实时补最后一根，不作历史基准** |

详细拆股日对照、分红窗口、限速公式见调研报告 §4–§6。

---

## 复权口径（查询层，与 UI 三档一致）

设 `P_t` = 不复权 close（基准列）：

| UI | 实现 |
|----|------|
| **不复权** | 读 `open/high/low/close` |
| **前复权** | `OHLC_t × F_fwd(t)`；Tiingo 可用 `adjClose/close`；FMP 可读 `full` 或自建因子 |
| **后复权** | `OHLC_t × F_back(t)`，最新日锚定 |

**FMP 映射**（无 Tiingo 时）：

- 基准 OHLC ← `stable/historical-price-eod/non-split-adjusted`（字段 `adj*` = 名义价）
- 仅拆股调整 ← `stable/historical-price-eod/full`
- 含分红调整 ← `stable/historical-price-eod/dividend-adjusted`
- 日历 ← `stable/splits`、`stable/dividends`

---

## Phase 2 落库设计（**待实现**）

### Prisma 表（草案）

```prisma
// equity_instrument — symbol, exchange, tiingo/fmp id, active
// equity_bar_daily — symbol, date, open, high, low, close, volume, source
// equity_bar_factor — symbol, date, split_factor, div_cash, adj_close, source
// equity_corporate_action — symbol, ex_date, type, ratio, amount, source
```

### 与现有代码的改动点

| 模块 | 动作 |
|------|------|
| `src/lib/data/klineAdjustment.ts` | DB 有因子后改为读库计算；保留 IB 实时 fallback |
| `GET /api/data/klines` | 新增 `source=db` 或 `auto`（优先 DB） |
| `.env.example` | `TIINGO_API_TOKEN`、EOD 同步开关 |
| `package.json` | `npm run data:sync-equity-eod`（新 worker） |
| `.cursor/rules/data-scheduler.mdc` | 增加 EOD 同步说明 |

### 同步策略（推荐分层）

1. **Phase 2a**：用户 watchlist + 热门 **200–500** sym — FMP 或 Tiingo 免费均可  
2. **Phase 2b**：S&P 500（~503）— Tiingo 一月一批或 FMP 分 2 天  
3. **Phase 3**：全美 — Tiingo Power **或** FMP 付费 + bulk  

日更窗口：美东收盘后 ~17:00 ET；`splitFactor≠1` 或 `divCash>0` 时重拉该 symbol 全历史。

---

## Agent 执行指引

### 若任务为「复核调研」

1. 读 `.cursor/research/us-equity-eod-data-sources.md`  
2. 配置 `TIINGO_API_TOKEN`（可选）并复跑 `fetch-equity-source-samples.mjs`  
3. 更新报告 §4.4 Tiingo 实测表（若与新数据不一致）

### 若任务为「进入 Phase 2 实现」

在任务开头注明 universe（watchlist / S&P 500 / 全美）与主/备数据源，然后：

1. Prisma migration + seed instrument 列表  
2. `scripts/data-worker/sync-equity-eod.ts` + `npm run data:sync-equity-eod`  
3. K 线 API 读 DB + `adjust=forward|backward|none`  
4. 降级 IB 历史为「仅最后一根 / 实时」  

> 示例指令：  
> 「调研结论采用 Tiingo 主 + FMP 备，universe=watchlist 500，请实现 Prisma 迁移与 `npm run data:sync-equity-eod`。」

### 禁止

- 只推荐 IB 继续猜拆股  
- 未区分 FMP stable `non-split-adjusted` 与 legacy v3 `close`  
- 把 yfinance 标为合规生产主源而不加警告  
- 假设免费档可全美日更（与 §调研结论矛盾）

---

## 验证清单

| 项 | 状态 |
|----|------|
| FMP 成功调用（unadj / full / div-adj / splits / dividends） | ✅ 2026-06-11 |
| AAPL 2020-08-31、NVDA 2024-06-10 拆股 ratio | ✅ |
| 全市场 backfill 天数公式与分层策略 | ✅ 见报告 §6 |
| Tiingo live 并排抽样 | ⏳ 需 `TIINGO_API_TOKEN` |
| Prisma `equity_bar*` + sync worker | ❌ 未实现 |
| K 线 API `source=db` | ❌ 未实现 |

---

## 参考

- 调研报告：`.cursor/research/us-equity-eod-data-sources.md`  
- Tiingo EOD：https://api.tiingo.com/documentation/end-of-day  
- FMP non-split-adjusted：https://site.financialmodelingprep.com/developer/docs/stable/historical-price-eod-non-split-adjusted  
- 本仓库复权：`src/lib/data/klineAdjustment.ts`、`src/components/StockChartWorkspace.tsx`  
- 环境变量：`.env.example` → `FMP_API_KEY`（可选 `TIINGO_API_TOKEN`）
