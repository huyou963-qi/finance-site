# 东方财富：现货黄金与中国市场 K 线

行情页 `/markets` 共用原有搜索、自选、画线、指标、周期和历史追加。美股继续走 Yahoo；现货黄金与沪深京港标的由服务端自动分流到东方财富。

## 代码与覆盖

| 品种 | 输入示例 | 上游 secid | 价格币种 |
|---|---|---|---|
| 现货黄金 | `XAUUSD` / `XAU/USD`，或搜索“黄金”“伦敦金” | `122.XAU` | USD / 金衡盎司 |
| 沪市 A 股 | `600519.SH` / `600519` / `SH600519` | `1.600519` | CNY |
| 深市 A 股 | `000001.SZ` / `000001` / `SZ000001` | `0.000001` | CNY |
| 沪市 B 股 | `900901.SH` / `900901` | `1.900901` | USD |
| 深市 B 股 | `200xxx.SZ` / `200xxx` | `0.200xxx` | HKD |
| 北交所 | `920002.BJ` / `920002` | `0.920002` | CNY |
| 港股 | `00700.HK` / `00700` / `HK00700` | `116.00700` | HKD |
| 沪深指数、场内 ETF | 搜索名称后选择带 `.SH` / `.SZ` 的代码 | 同对应市场 | 以具体品种为准 |

六位裸代码按常见号段推断市场，五位裸代码按港股处理。指数或代码有歧义时必须带后缀：`000001` 是深市平安银行，`000001.SH` 才是上证指数。自选和画线存储使用规范后的交易所后缀，避免混淆。港股 `8xxxx` 人民币柜台标 CNY，`09xxx` 美元 ETF 柜台标 USD，其余普通港股标 HKD。

搜索叠加东财网页联想与现有美股/商品目录，限定沪深京港及黄金，排除场外基金、其他国家证券等同码结果。黄金与 `GC=F` 分开显示，后者名称明确为 COMEX 黄金期货。

## 周期、复权与时间

- 15m / 1h / 1d / 1w 使用上游原生 K 线。
- 4h 使用小时线按北京时间自然四小时桶聚合；保留休市缺口，最后一桶可能尚未完成，不是四个交易小时的等时长成交桶。
- 股票前复权、后复权、不复权分别使用 `fqt=1/2/0`，以东方财富口径为准，不使用美股拆股和分红表处理中国市场。
- 黄金固定不复权；复权选择器禁用。
- 日线和周线保留供应商的交易日期（周线原生日期为周末交易日）；分钟字符串按 UTC+8 转 Unix 秒，显示北京时间，上游使用时间段结束标签。
- 沪深京成交量由手乘 100 转股，港股成交量按上游股数保存。黄金量不可用，副图和十字光标不显示量，禁止用价差生成模拟量。
- 中国市场隐藏美股公司分析、投资分析和 SEC/FMP TTM PE 入口；价格型技术指标、叠加和画线继续可用。
- 图表采用供应商返回的小数精度，保留沪市 B 股、港股等三位小数报价。

## 接口与历史

```text
GET /api/data/klines?symbol=XAUUSD&interval=1d&limit=400
GET /api/data/klines?symbol=600519.SH&interval=1d&adjust=forward
GET /api/data/klines?symbol=00700.HK&interval=15m&adjust=none
GET /api/data/klines?symbol=900901.SH&interval=1w&before=<Unix秒>
GET /api/data/symbol-search?q=腾讯
```

路由允许 `source=eastmoney`；旧客户端默认 `source=yahoo` 传入上述标的时也会自动分流。response source 明确返回 eastmoney。参数 `before` 与 `fromSec/toSec` 互斥，`before` 严格排除边界。

日线/周线按日期向左请求，留余量并清洗、排序、去重；首屏不是一次取全历史。分钟线取得上游当前窗口后在服务端裁剪，窗口到头返回 `hasMoreOlder=false`，页面停止重复追索。

2026-10-11 免费接口验证：黄金日线从 1992-05-19 起；15m/1h 只返回最近一周，请求 2025 年分钟历史为空。股票分钟覆盖可能与黄金不同，以供应商实际返回为准。退市/停牌标的可能仍可读取历史，并不代表当期还在交易。

K线响应使用服务端 PostgreSQL 共享缓存，按代码、周期、复权、条数和时间窗口隔离，带更新、硬过期、并发刷新锁和故障退避；详见 [共享缓存设计](./KLINE_RESPONSE_CACHE.md)。中国股票不写入美国 equity_daily_bar，分钟历史不会靠响应缓存自动永久积累。`availableFrom` 是当次返回窗口起点，不保证为证券上市日。

## 文件与验证

- `src/lib/data/eastmoneySymbols.ts`：规范化、市场、secid 与币种映射。
- `src/lib/data/eastmoneySearch.ts`：东方财富联想。
- `src/lib/data/providers/eastmoneyKlineProvider.ts`：请求、缓存、清洗、窗口和聚合。
- `src/lib/data/providers/eastmoneyKlineProvider.test.ts`：跨市场映射、字段顺序、时间转换、异常、分页、聚合和黄金缺量语义。
- 页面同时保留桌面和手机搜索、周期、复权、自选及画线入口。

```text
npx tsx --test src/lib/data/providers/eastmoneyKlineProvider.test.ts
npm run verify:quick
npm run build
```

本功能使用公开网页接口，不需要账户/API key；它不是官方承诺稳定的第三方免费 API。网站展示和缓存的权利须另行确认，技术接入不代表获得授权。来源与条款核查见 [国内源调研](./research/SPOT_GOLD_CN_FREE_SOURCES.md)。

## 2026-10-11 验收

- 全量测试 888 项通过，Prisma 校验、lint、生产构建通过。
- 17 项真实 HTTP 检查覆盖黄金日线/15m/4h、沪深 A/B 股、北交所、港股分钟线、沪深指数、中文名称搜索与无重叠日线分页。
- 另复验 `80700.HK` 人民币柜台、`09081.HK` 美元柜台、黄金和原有 AAPL，均返回正确来源及币种。
- 桌面黄金搜索、真实图表、复权禁用、无成交量 UI；390 × 844 手机港股分钟线、周期切换、技术指标、画线与自选入口均可用。手机 documentWidth 与视口同为 390，无横向溢出；前端无 error 日志。
- 本地 3000 端口服务已运行新构建；本次没有发布云端或修改数据库。
- 复验脚本与结果：`.codex-artifacts/eastmoney-http-verify.mjs`、`.codex-artifacts/eastmoney-http-results.json`；截图：`.codex-artifacts/eastmoney-desktop-gold.jpg`、`.codex-artifacts/eastmoney-mobile-hk.jpg`。
