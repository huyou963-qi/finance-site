# 美股 EOD 不复权基准价 + 复权因子 — 数据源调研报告

> 生成时间：2026-06-11  
> 执行环境：finance-site 本地；`.env.local` 含 `FMP_API_KEY`（已实测）；**未配置** `TIINGO_API_TOKEN`（Tiingo 仅文档级验证 + 第三方限速汇总）  
> 抽样脚本：`node scripts/research/fetch-equity-source-samples.mjs`  
> 原始片段：`scripts/data/research/fmp-*.json`、`research-summary.json`

---

## 1. 结论摘要（200 字）

**值得**将「不复权 OHLC + 复权因子」落 PostgreSQL，替代 IB Trades + 前端猜拆股。**免费档无法一次性同步全美 ~1 万只 symbol**，但足以支撑 **自选 watchlist / 热门 500 只** 的生产级 K 线。

- **主方案（数据模型最优）**：**Tiingo EOD** — 每 bar 含 `open/high/low/close`（raw）、`adjClose`、`splitFactor`、`divCash`（CRSP 式）。免费 Starter：**50 req/h、1000 req/day、500 unique symbols/月** → 适合分月扩 watchlist，或升级 Power（$30/月）做全量。  
- **备方案（零新增 Key，已实测）**：**FMP stable** — `historical-price-eod/non-split-adjusted`（名义价，字段名误标为 `adjClose`）+ `full`（仅 split-adjusted）+ `dividend-adjusted` + `splits`/`dividends`。免费 **250 calls/天** → 全市场首轮回填约 **40 天/symbol 批次**，日更可行。  
- **不推荐**：IB Trades 作基准；yfinance 作生产主源（ToS/稳定性）。

---

## 2. 背景：为何要换管道

| 现状 | 问题 |
|------|------|
| `GET /api/data/klines` ← IBKR/Binance | IB `Trades` 历史**已是前复权**；API 无 `adjFactor` |
| `applyKlinePriceAdjustment` 客户端 | 跳变检测 + 硬编码 AAPL 等日历；后复权/不复权不可靠 |
| 无 `equity_bar` 表 | 无法审计、重复重算 |

落库后：`adjust=forward|backward|none` 变为 **确定性乘因子**，可删除大部分 `klineForwardAdjustment` / `klineIbkrNominal` 逻辑。

---

## 3. 数据源对比矩阵

| 数据源 | 免费额度 | 美股规模 | 历史深度（免费） | 原始 OHLC | 显式 split/div | 显式 adj 系列 | 批量全美 | 商用/再分发 | 集成难度 | 推荐 |
|--------|----------|----------|------------------|-----------|----------------|---------------|----------|-------------|----------|------|
| **Tiingo EOD** | 50/h, 1000/d, **500 sym/月** | 8 万+ | 30–50+ 年 | ✅ `open…close` | ✅ 每 bar `splitFactor`, `divCash` | ✅ `adjOpen…adjClose` | ❌ 免费不够 | Internal use only（Starter） | 中：新 Token + sync | **主方案** |
| **FMP stable** | **250 calls/天**，500MB/30d | 广 | 免费档约 5 年（部分 endpoint 更长） | ✅ `non-split-adjusted` | ✅ `/splits`, `/dividends` | ✅ `dividend-adjusted` vs unadj | ⚠️ 分批 40d/万 sym | 免费可内用；展示看 ToS | **低**（已有 Key） | **备方案** |
| **yfinance** | 无 Key | 广 | 长 | ✅ `auto_adjust=False` | ✅ actions 表 | ✅ `Adj Close` | ⚠️ 非官方 | **不适合**再分发 | 低 | 仅对照 |
| **Alpha Vantage** | 25/d | 中 | 中 | 部分 | 弱 | adjusted 为主 | ❌ | 限制 | 中 | 否 |
| **Finnhub** | 60/min 免费 | 中 | 1 年级 | ✅ | 有 endpoint | 部分 | ❌ | 限制 | 中 | 否 |
| **EODHD** | 20/d | 中 | **~1 年** | ✅ | 付费为主 | 有 | ❌ | 限制 | 中 | 否 |
| **Intrinio** | 试用 | 广 | 试用 | ✅ | ✅ `factor` 字段 | ✅ | ❌ | 付费 | 高 | 否 |
| **IBKR Trades** | 已有 | 已连 | 长 | ❌ 语义为前复权 | ❌ | ❌ | — | 账户条款 | 已集成 | **勿作基准** |

---

## 4. 实测：FMP（2026-06-11）

### 4.1 端点与语义（易踩坑）

| 端点 | 实测语义 | 字段注意 |
|------|----------|----------|
| `stable/historical-price-eod/non-split-adjusted` | **不调整拆股**的名义 OHLC | JSON 字段名为 `adjOpen/adjClose`，**勿被命名误导** |
| `stable/historical-price-eod/full` | **仅 split-adjusted**（FAQ 同 v3 `close`） | 字段 `open/close` |
| `stable/historical-price-eod/dividend-adjusted` | split + **dividend** 双调整 | 字段 `adjClose` |
| `stable/splits` | 拆股日历 | `numerator/denominator` |
| `stable/dividends` | 分红日历 | `dividend`, `adjDividend` |

### 4.2 拆股验证

**AAPL 2020-08-31（4:1）**

| 日期 | FMP non-split-adj `adjClose` | FMP full `close` | 说明 |
|------|------------------------------|------------------|------|
| 2020-08-28 | **499.24** | 124.81 | 499.24/4 ≈ 124.81 ✓ |
| 2020-08-31 | 129.04 | 129.04 | 除权日；后段为拆后刻度 |
| 比值 8/28 | — | — | 499.24/129.04 ≈ **3.87**（≈4:1） |

**NVDA 2024-06-10（10:1）**

| 日期 | FMP non-split-adj `adjClose` | FMP full `close` |
|------|------------------------------|------------------|
| 2024-06-07 | **1208.90** | 120.89 |
| 2024-06-10 | 121.79 | 121.79 |
| 比值 | 1208.9/121.79 ≈ **9.93**（≈10:1） | |

`/stable/splits` 返回 ex-date 与 ratio 与上表一致（AAPL 2020-08-31 4:1；NVDA 2024-06-10 10:1）。

### 4.3 分红验证（AAPL 2024-11-07 ~ 11-12）

该窗口 **non-split-adjusted** 与 **full** 的 close **相同**（无拆股）。**dividend-adjusted** 序列略低于 unadj（历史向前平滑分红），例如 2024-11-07：`unadj adjClose=227.48`，`div-adj adjClose=225.78`。可用于「前复权含分红」口径或交叉校验 `divCash`。

### 4.4 Tiingo 实测状态

**阻塞**：仓库未配置 `TIINGO_API_TOKEN`，未发 live 请求。  
**文档结论**（官方 EOD）：每 bar 同时提供 raw OHLC、`adjClose`、`splitFactor`、`divCash`；调整方法引用 CRSP。与 FMP 三分 endpoint 相比，**单 endpoint 更适合落库**。

---

## 5. 复权口径与落库公式

设 `P_t` = 不复权 close（基准列），`F_split(t)`、`F_div(t)` 为自上市起累积因子（最新日为 1 的前复权基准）。

| UI 选项 | 推荐实现 |
|---------|----------|
| **不复权** | 直接读 `open/high/low/close` |
| **前复权** | `OHLC_t × F_fwd(t)`，其中 `F_fwd(t)=adjClose_t/close_t`（Tiingo）或由 split/div 日历连乘 |
| **后复权** | `OHLC_t × F_back(t)`，`F_back(t)=1/F_fwd(t)×K`（K 为最新日锚定） |

**FMP 推导**（无 Tiingo 时）：

- 基准 OHLC ← `non-split-adjusted` 的 `adj*` 字段  
- 前复权（仅拆股）← `full` 的 `close/open/…`  
- 前复权（含分红）← `dividend-adjusted`  
- 或自建：`splits`/`dividends` + 基准 OHLC 自算（与 Tiingo CRSP 可能略有差异）

---

## 6. 限速与全量同步测算

假设活跃美股 **N = 10,000**（Tiingo `supported_tickers.zip` 过滤 NYSE/NASDAQ；FMP stock-list 类似量级）。

### Tiingo Starter（$0）

- **500 unique symbols / 月** → 全市场需 **≥20 个月** 才能轮询一遍（且每月 cap 500）  
- **1000 req/day** → 若每天拉 500 sym × 1 次全历史 ≈ 用满日配额  
- **结论**：免费 Tiingo **不适合**「全美日更库」；适合 **500 只核心池** 或 **付费 Power $30/月**（10k sym/h，100k/d）

### FMP Free（250 calls/day）

- 每 symbol 首轮回填至少 **2–3 calls**（unadj + full + splits）→ 实际 **~80–125 sym/天**  
- **N=10,000** → 首轮回填 **80–125 天**  
- 日更：每 sym 1 call（`full` 或 delta）→ 250 sym/天 → 全市场 **40 天轮询一圈**（仅日更不够；应对 **watchlist ≤250** 或付费档）

### 推荐分层

1. **Phase 1**：用户自选 + 热门 200–500 sym → FMP 或 Tiingo 免费均可  
2. **Phase 2**：S&P 500 成分（~503）→ Tiingo 免费 **刚好一月一批** 或 FMP 分 2 天  
3. **Phase 3**：全美 → Tiingo Power **或** FMP 付费 + 离线 bulk

---

## 7. 合规 checklist

| 源 | 持久化 | Web 展示 | 备注 |
|----|--------|----------|------|
| Tiingo Starter | ✅ 个人内用 | ⚠️ Internal use only | 对外产品需 Commercial 授权 |
| FMP Free | ✅ 评估/内用 | ⚠️ 再分发需 Data Display 协议 | 见 pricing 页免责声明 |
| yfinance | ⚠️ 灰色 | ❌ 不建议 | Yahoo 非官方 API |
| IBKR | 账户数据 | 已有 | 不适合作为 OHLC 基准库 |

---

## 8. 推荐落库架构（Phase 2 草案）

### 8.1 主方案：Tiingo + PostgreSQL

```
equity_instrument (symbol, exchange, tiingo_ticker, active)
equity_bar_daily (
  symbol, date,
  open, high, low, close, volume,          -- raw
  adj_close, split_factor, div_cash,       -- 因子/参考
  source='tiingo', ingested_at
)
```

- **同步**：`npm run data:sync-equity-eod`（新任务）  
- **增量**：Tiingo KB — 每日 `tiingo/daily/prices` bulk；若 `splitFactor≠1` 或 `divCash>0` 则重拉该 sym 全历史  
- **K 线 API**：`source=db` 优先；`adjust` 在查询层乘因子  

### 8.2 备方案：FMP（当前可立即开工）

```
equity_bar_daily — 存 non-split-adjusted OHLCV（映射 adj* → open/close）
equity_corporate_action — 来自 /splits、/dividends
equity_bar_adjusted_cache — 可选缓存 full / dividend-adjusted close
```

- 已有 `FMP_API_KEY`；与 TTM PE 共用配额，需 **配额预算**（250/d）  

### 8.3 不推荐单独使用

- IBKR Trades（前复权）  
- 客户端 `detectSplitLikeActions`（仅作 IB 实时 fallback）

---

## 9. 自检清单

- [x] FMP 成功调用（non-split-adjusted、full、dividend-adjusted、splits、dividends）  
- [ ] Tiingo live（需配置 `TIINGO_API_TOKEN` 后复测）  
- [x] AAPL 2020-08-31 拆股：名义价 ~499 → ~129，ratio ≈4  
- [x] NVDA 2024-06-10 拆股：名义价 ~1209 → ~122，ratio ≈10  
- [x] 分红窗口：div-adj 与 unadj 可区分  
- [x] 全市场 backfill 天数公式与分层策略  
- [x] 与现有 `FMP_API_KEY`、K 线三档 adjust UI 对齐  

---

## 10. 下一步行动

1. 在 `.env.local` 增加 `TIINGO_API_TOKEN`（可选）并复跑 `fetch-equity-source-samples.mjs` 做 Tiingo/FMP 并排表  
2. 选定 universe：**watchlist 500** vs **S&P 500** vs 全美  
3. 开 Phase 2：Prisma 迁移 + `data:sync-equity-eod` + `GET /api/data/klines?source=db`  
4.  deprecate 或降级 IB 历史 K 线为「实时补最后一根」而非全历史源  

---

## 参考

- Tiingo EOD 文档：https://api.tiingo.com/documentation/end-of-day  
- Tiingo 定价：https://www.tiingo.com/pricing  
- FMP non-split-adjusted：https://site.financialmodelingprep.com/developer/docs/stable/historical-price-eod-non-split-adjusted  
- FMP FAQ（close vs adjClose）：https://site.financialmodelingprep.com/faqs  
- 本仓库：`.cursor/prompts/us-equity-bars-data-source-research.md`、`src/lib/data/klineAdjustment.ts`
