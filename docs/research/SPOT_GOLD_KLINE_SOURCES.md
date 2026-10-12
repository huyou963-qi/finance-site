# 现货黄金 K 线数据源调研

调研日期：2026-10-11。范围：行情页展示美元/金衡盎司的 XAU/USD 开高低收，而非黄金期货、ETF 或每日定盘价。本文仅为调研与接入设计，未修改运行代码、购买服务或创建账户。

后续补充：新浪与东方财富免费网页接口已实测取得现货 OHLC；东财取得日线、周线和近期分钟线。三家国内源的范围、质量及授权分析见 [SPOT_GOLD_CN_FREE_SOURCES.md](./SPOT_GOLD_CN_FREE_SOURCES.md)。本文的商业 API 比较继续有效，免费技术可用性以补充报告为准。

## 项目现状与实测

- `src/lib/data/marketInstruments.ts` 的“黄金”是 `GC=F`，别名包含 `xau`，容易把现货搜索导向期货。
- `MarketsClient.tsx` 有 `XAUUSD` / `XAUUSD=X` 名称识别，但不构成现货数据接入。
- `/api/data/klines` 仅接受 `source=yahoo`；provider registry、`KlineProviderId`、`KlinePayload.source` 均仅定义 Yahoo。
- 日线走 `getAdjustedDailyBars` 与美股价格缓存，盘中走 Yahoo；现货宜有独立的 instrument/provider/priceType 语义。
- 公开 Yahoo chart 接口实测：`XAUUSD=X?range=1mo&interval=1d` HTTP 404，错误为 `No data found, symbol may be delisted`；同环境 `GC=F` HTTP 200，21 根日线，`instrumentType=FUTURE`。这是本次单次实测，不是对所有 Yahoo 代码的永久结论。
- 宏观已有 `wgc_gold_price_usd`，对应 WGC 发布的 LBMA 金价，adapter 只保存 date/value，不能还原真实 OHLC。
- `StockChartWorkspace.tsx` 在 volume 缺失时调用 `syntheticVolumes`。接入现货时必须处理缺量语义，不能把合成柱标为真实成交量。

## 数据源比较

| 数据源 | 已确认的能力 | 接入与授权判断 |
|---|---|---|
| Twelve Data | 官方品种页明确列出 `XAU/USD`，Gold Spot / US Dollar；`/time_series` 提供 OHLC，多周期、日期区间与最多 5000 根的 outputsize | 首选标准 API 候选。商业网页展示有 Business 方案，历史缓存、后端 JSON 交付边界需确认 |
| EODHD | 官方列出 `XAUUSD.FOREX`；EOD API 与 intraday API；后者提供 1m/5m/1h，可以聚合 15m/4h | 第二报价候选。XAU 单品种的实际盘中覆盖仍须带 key 验收；商业方案另行报价 |
| OANDA v20 | candle 定义有 bid/ask/mid OHLC、M15/H1/H4/D/W、complete 标记、报价次数 volume；日线时间对齐可配置 | 适合有相应 OANDA 账户的内部验证。先查账户 instruments 是否有 `XAU_USD`，不能假设所有地区账户支持；网站展示授权另核实 |
| Dukascopy | 官方提供 XAU/USD 图表、历史服务和获取 candles 的 API；官方网页写明 widgets 可免费放到网站 | 值得做历史/报价验证。API、历史导出、widget 的授权不是同一件事；本次未确认原始数据商业落库与公开展示许可 |
| TradingView widget | 可嵌入供应商提供的行情图表；widget FAQ 明确不能以 widget 导出数据 | 可做独立嵌入方案，不能直接供应现有 Lightweight Charts 的 candles；画线、事件和回测无法直接共用原有数据链 |
| 新浪伦敦金 XAU | 后续实测免费网页接口取得 5184 根日线，详见国内源补充报告 | 日线技术可用，但发现历史 OHLC 异常；未经许可的商业使用和源页外展示受协议限制 |
| Alpha Vantage | `GOLD_SILVER_SPOT` 和 `GOLD_SILVER_HISTORY`；历史文档示例为 daily close，支持 daily/weekly/monthly | 当前已核实材料不足以确认完整现货 OHLC，不能用该历史接口冒充 K 线源 |
| FMP | 商品 OHLC 文档示例是 `GCUSD`，分类涵盖 commodities/futures | 项目虽已有 FMP key，本次未确认 XAU/USD 现货 OHLC；不能直接把 GCUSD 标为伦敦金现 |
| WGC / LBMA | 黄金基准价格；LBMA/IBA 有使用与分发许可规则 | 适合宏观基准曲线；项目现有单值数据不能生成真实 K 线 |

### Twelve Data 的历史范围与费用

官方 Commodity 市场页面标示日线及以上自 1980-01-01、盘中自 2020-01-09。这是市场级说明，不能当作 XAU/USD 每个周期无缺口的验收结果；应调用 `/earliest_timestamp` 分周期核验。

2026-10-11 Business 价格页显示 Venture 月付起价 499 美元，年付 4990 美元/年，含 external display 与 commodities。个人方案不能用于向第三方商业展示；数据 redistribution 另需协议。对只用一个黄金品种的站点，可请求单品种报价，不能预设会提供折扣。

EODHD 个人 EOD / EOD+Intraday 页面虽有较低价格，但不代表网站商用许可。商业价格页提供另行询价入口。

## 建议接入方式

1. 统一站内代码 `XAUUSD`，中文名“现货黄金（美元/盎司）”；供应商映射为 Twelve Data `XAU/USD`、EODHD `XAUUSD.FOREX` 或 OANDA `XAU_USD`。现有 `GC=F` 改清楚显示“COMEX 黄金期货”，保留两者为独立品种。
2. 新增黄金 provider，扩展 registry 和 payload source 类型；按标的自动选择 provider，兼容现有客户端默认 source 参数，避免客户端仍传 yahoo 导致黄金被误路由。
3. 复用 KlinePayload 的 candles 和 before/fromSec/toSec 窗口协议。将上游结果转为升序、Unix 秒、有限正数 OHLC，检查 `low <= open/close <= high`，分页严格排除 before 边界并去重。
4. 首期覆盖页面现有 15m、1h、4h、1d、1w。Twelve Data 可直接映射 15min/1h/4h/1day/1week；EODHD 若仅原生 1m/5m/1h，则统一规则聚合，不能混用不同日线切分时间。
5. API key 仅在服务端。取得许可后缓存历史和增量；建议独立跨资产 bar 表，唯一键包含 instrument/provider/interval/priceType/time，避免同名黄金的 bid/mid 或不同供应商相互覆盖。
6. 现货关闭股票复权；记录并展示数据源、价格类型、时区/日线切分规则、数据更新时间。保留正常休市缺口，未完成 bar 明确标识，不补造价格。
7. 现货没有全市场统一成交量。缺量隐藏成交量与依赖真实成交量的功能；OANDA 的 volume 只能标为报价次数。禁止缺量时生成“真实成交量”。
8. 搜索同时支持“现货黄金、伦敦金、XAUUSD、XAU/USD”；桌面和手机都可搜索、加入自选、切换周期和识别来源。画线持久化需注意现有键含 source，避免 provider 变化后错绑。
9. 不同供应商历史不自动无标识拼接。主源失败时显示缓存/过期状态；若允许用户切换供应商，应显式展示并隔离数据。

服务端请求示意（未带个人 key 实测）：

```text
https://api.twelvedata.com/time_series?symbol=XAU%2FUSD&interval=1day&outputsize=300&apikey=SERVER_KEY
https://eodhd.com/api/eod/XAUUSD.FOREX?api_token=SERVER_KEY&fmt=json&period=d
```

## 采购前验收

- 日线/15m/1h/4h/1w 的最早时间、缺口、时间戳和最新数据延迟。
- 从部署服务器测试网络可达性与限流；不能仅凭本地一次成功推断阿里云长期可用。
- 检查同一天的 OHLC、节假日、周线切分、夏令时、未完成 K 线与分页重复。
- 授权明确覆盖网站桌面/手机、游客/会员、服务端缓存、历史落库和站内 chart JSON API；数据下载/分发若需额外许可，单独约定。
- 不向供应商发送询价或购买，除非用户进一步授权。

建议：需要保留现有图表交互时，先验证 Twelve Data 单品种数据并与 EODHD 商业报价比较；免费优先时考虑官方 widget，但原生图表功能范围须相应调整。本次没有证明存在“免费、可长期商用公开展示、可原始数据落库、完整多周期现货黄金”的来源。

## 官方资料

- Twelve Data 品种：https://twelvedata.com/markets/300755/commodity/xau-usd
- Twelve Data 市场历史范围：https://twelvedata.com/exchanges/commodity?group=reference
- Twelve Data 获取历史：https://support.twelvedata.com/en/articles/5656039-how-to-get-historical-prices
- Twelve Data Business 价格：https://twelvedata.com/pricing-business
- Twelve Data 使用许可：https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage
- EODHD 品种：https://eodhd.com/financial-summary/XAUUSD.FOREX
- EODHD 盘中：https://eodhd.com/financial-apis/intraday-historical-data-api
- EODHD 商业许可：https://eodhd.com/financial-apis/commercial-vs-personal-license-use
- EODHD 商业报价：https://eodhd.com/commercial-pricing
- OANDA candle 定义：https://developer.oanda.com/rest-live-v20/instrument-df/
- OANDA 账户与 instruments：https://developer.oanda.com/rest-live-v20/account-ep/
- OANDA 美国账户金属限制：https://help.oanda.com/us/en/faqs/tradestation-forex-ibfx-oanda-account-transfer-faqs.htm
- Dukascopy Trading Tools：https://www.dukascopy.com/trading-tools/api/documentation
- Dukascopy 历史服务：https://www.dukascopy.com/wiki/en/development/strategy-api/historical-data/
- Dukascopy IHistory：https://www.dukascopy.com/swiss/docs/interfaces/IHistory.htm
- TradingView widget 数据 FAQ：https://www.tradingview.com/widget-docs/faq/data/
- 新浪伦敦金：https://finance.sina.com.cn/futures/quotes/XAU.shtml
- Alpha Vantage 黄金接口：https://www.alphavantage.co/documentation/
- FMP 商品 OHLC 示例：https://site.financialmodelingprep.com/developer/docs/stable/commodities-historical-price-eod-full
- LBMA 基准许可：https://www.ice.com/publicdocs/IBA_LBMA_Gold_Price_Licensing_FAQ.pdf
