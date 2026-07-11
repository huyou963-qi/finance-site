# 美股 K 线行情（全美股 · 落库 · 精确复权）

`/markets` 与个股详情页的日线来源。覆盖**任意美股代码**（不限 S&P500），历史落库、增量拼接、前/后/不复权三口径精确计算。数据源统一 **Yahoo Finance v8 chart**（免密钥）。IBKR / Binance 已下线。

## 数据流

```
浏览器
  → GET /api/data/klines?symbol=AAPL&interval=1d&adjust=forward|backward|none
  → yahooKlineProvider (src/lib/data/providers/yahooKlineProvider.ts)
      · 1d/1w：equityPriceStore db-first（查 mds.equity_daily_bar）→ 缺口回补 Yahoo → 服务端精确复权
      · 15m/1h：实时取 Yahoo（不落库；历史窗口受限 60/730 天）；4h 由 1h 聚合；1w 由日线聚合
  → StockChartWorkspace（Lightweight Charts；客户端不再复权）
```

## 复权口径（priceAdjustment.ts）

Yahoo 返回：`close`（已按拆股回溯调整、未含分红）、`adjClose`（拆股+分红）、`events.splits`（精确拆股）。

| 模式 | 定义 | close 走向 |
|------|------|-----------|
| 不复权 `none` | 当日真实成交价（名义价）= `close × 未来拆股累计乘数`；成交量同步还原为名义股数 | 保留除权/除息跳空 |
| 前复权 `forward` | `= adjClose`（总收益口径），锚定最新价 | 末根 = 现价，历史价缩小 |
| 后复权 `backward` | 前复权 × 常数 K，锚定序列首根名义价 | 首根 = 上市首日名义价 |

前复权与后复权是同一条总收益曲线的两种缩放（相差常数），拆股与现金分红都精确抹平——不做任何“靠价格跳变猜拆股”的启发式。基准核对：NVDA 2024-06-10 十股拆一，`none` 拆股前一日 close≈1208、拆后≈121；`forward` 全程连续且末根=现价；`backward` 首根=1999 IPO 名义价。

## 落库（mds schema）

| 表 | 用途 |
|----|------|
| `equity_daily_bar` | 日线 OHLCV + adjClose（Yahoo quote 口径，原始未复权；复权在读取层算） |
| `equity_split` | 精确拆股事件（Yahoo events.splits） |
| `equity_price_coverage` | 每标的回填状态：firstDate/lastDate/fullHistory/notFound/lastCheckedAt |

首次访问某标的按 `period1=0` 拉全量历史（AAPL 可回溯至 1980 IPO）；之后按 `lastDate` 增量拉尾部并 upsert 拼接。无效代码写 `notFound` 负缓存，24h 内不重试。

> ⚠️ 抓取层对 Yahoo 静默降采样有保护：`range=max&interval=1d` 会被返回月线，故一律用 `period1=0` 取全量日线，并校验 `meta.dataGranularity` 与请求周期一致（`YahooGranularityError`）。

## 命令

```bash
npm run equity:sync-prices                     # 市值前 100 成分 + 11 Sector ETF + SPY
npm run equity:sync-prices -- --symbols=AAPL,GME,NVDA   # 任意美股代码
npm run equity:sync-prices -- --limit=500      # 市值前 500
npm run equity:sync-prices -- --full           # 强制重拉全量历史（含拆股事件）
```

不跑脚本也可用：页面首次访问会 lazy 回填。脚本用于批量预热与拆股事件补齐。

## 符号联想

`GET /api/data/symbol-search?q=apple` → SEC `company_tickers_exchange.json`（全美股约 1 万条，进程内缓存 24h）+ 常用 ETF 兜底。

## 关键文件

- `src/lib/equity/yahooChart.ts` — Yahoo 抓取（日线/盘中/拆股/分红 + 粒度校验）
- `src/lib/equity/priceAdjustment.ts` — 三口径精确复权纯函数（含测试）
- `src/lib/equity/equityPriceStore.ts` — db-first 落库 + 缺口拼接 + 覆盖状态
- `src/lib/data/providers/yahooKlineProvider.ts` — K 线 provider（周期聚合 + 窗口分页）
- `src/lib/equity/usEquitySearch.ts` — 全美股符号联想
