# 新浪、同花顺、东方财富：免费现货黄金 K 线调研

实测日期：2026-10-11（北京时间）。目标是美元/金衡盎司的现货黄金 OHLC。只做公开页面和接口的少量只读验证，没有购买服务、登录账户、绕过验证码、借用网站项目 token 或接入生产页面。

## 结论

**技术上，新浪和东方财富都能免登录、免 API key 获取现货黄金 K 线。东财覆盖更完整，适合优先验证。** 同花顺网页有伦敦金报价，但本次未确认同等条件下可用的黄金历史 K 线接口。免付费读取不等于免费商业网站展示授权。

| 来源 | 品种 | 本次取得的数据 | 判断 |
|---|---|---|---|
| 新浪 | `XAU` / 行情代码 `hf_XAU` | 5184 根日线，2006-10-11 至 2026-10-09 | 日线已验证；周线可按统一交易周聚合；分钟线未确认 |
| 东方财富 | `122.XAU`，名称“黄金/美元”，搜索接口类型“现货” | 8945 根日线、1795 根周线、465 根 15m、120 根 1h | 优先候选；日线自 1992-05-19，分钟线本次仅返回最近一周 |
| 同花顺 | 网页代码 `XAUUSD`，名称“伦敦金” | 外汇网页当日开、高、低、最新价及买卖价 | 证明有黄金行情，不足以证明免费历史 OHLC；iFinD 正式 API 需要 token |

以上数量和范围是当日请求结果，不是长期稳定性、完整性或官方历史覆盖承诺。

## 1. 新浪

官方品种页：[伦敦金（现货黄金）CFD](https://finance.sina.com.cn/futures/quotes/XAU.shtml)。基本资料明确写 CFD 差价合约并非期货，报价单位美元/盎司。这是新浪供应商的伦敦金报价口径，不应标为 LBMA 定盘价。

已验证地址：

```text
https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_data=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=XAU
```

返回 JSONP 包装的数组，每条包含 `date/open/high/low/close/volume/position/s`。使用固定包装验证与 JSON.parse 解析，禁止 eval 上游响应。新浪自己公开的 `datas/k.js` 配置了这个日线接口；AKShare 的 `futures_foreign_hist(symbol="XAU")` 也是该源的封装，AKShare 不是独立的数据供应商或授权方。

2026-10-09 返回：open 4134.260、high 4207.460、low 4130.900、close 4194.390。

数据质量检查：

- 5184 条中有 132 条不满足 `low <= open/close <= high`，大多在早年；2020 年以来有 1 条。
- 例如 2012-12-25：open 1660.690，high 1657.010，close 1658.790，开盘和收盘均高于最高价。
- 全部 volume 为 0，不能当作真实全市场成交量。
- 日线可以提供图表；异常记录需隔离/标记并核验，不能修改 high/low 来“修复”或随意拼接另一源。
- 本次公开 `datas/k.js` 的 HF 配置只有日线与市场初始化地址；不能据此断言新浪完全没有分钟线，但本次未确认 XAU 分钟线。

授权：新浪财经用户协议 6.1 限制未经书面许可的商业使用与源页面外展示；10.1 也限制未经许可的程序监视、复制、传播、展示等。因此技术请求成功不构成上线到其他网站的授权。

## 2. 东方财富

官方品种页：[黄金/美元（XAU）](https://quote.eastmoney.com/option/122.XAU.html)。虽然 URL 位于 `/option/`，搜索接口返回 `QuoteID=122.XAU`、`SecurityTypeName=现货`，应按品种元数据而非 URL 目录判断资产类别。

搜索验证地址：

```text
https://searchapi.eastmoney.com/api/suggest/get?input=XAU&type=14&count=5
```

日线验证地址：

```text
https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=122.XAU&klt=101&fqt=0&beg=19900101&end=20500101&lmt=10000&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61
```

无需本次使用的 cookie、token、登录、特殊 Referer 或 API key，即返回 HTTP 200、`rc=0`、`data.klines`。这些是网页内部接口，无正式对第三方的免费 API 稳定性承诺。

| klt | 周期 | 本次条数 | 第一条 | 最后一条 |
|---|---|---:|---|---|
| 101 | 日线 | 8945 | 1992-05-19 | 2026-10-09 |
| 102 | 周线 | 1795 | 1992-05-22 | 2026-10-09 |
| 15 | 15 分钟 | 465 | 2026-10-05 06:15 | 2026-10-10 05:15 |
| 60 | 1 小时 | 120 | 2026-10-05 07:00 | 2026-10-10 05:15 |

`fqt=0` 为原始、不复权的请求。返回的字符串前六项依次为时间、开盘、收盘、最高、最低、量；**close 在 high 前**，不能套用新浪字段顺序。

2026-10-09 日线为 open 4134.63、close 4194.24、high 4207.51、low 4131.12。上述日线/周线/分钟线样本均通过基础 OHLC 包含关系检查；这不证明价格和历史没有其他错误。

分钟历史限制：即使 beg 设为 1990 年、lmt 设为 10000，本次也只返回最近一周。请求 2025-01-01 至 2025-12-31 的 15 分钟线返回 `rc=0`、空 klines；不能宣称可免费全量回填长期分钟历史。需取得许可后才考虑持续增量缓存，自接入起积累历史。

其他限制：

- 四组数据的 volume 全部为 0，现货成交量显示应关闭。
- 分钟时间尾端为次日清晨，和北京时间夜盘窗口相符；时间字符串时区及 bar 是开始还是结束标签必须进一步验证，不能直接当 UTC。
- 没有实测原生 4h。若由 1h 聚合，必须明确 session、桶对齐与不完整 bar，并处理跨日/休市。
- 同一天东财与新浪收盘相差 0.15 美元，约 0.0036%；这只是单日对照，不能证明两源历史可无缝拼接。

授权：东财法律声明第八条要求内容复制、传播等取得书面许可；服务协议也有行情数据复制、向他人提供和衍生用途限制。第十条中的交易所特定条款不应直接推定黄金受某个股票交易所管辖，仍需确认 XAU 的源供应商及黄金展示权。

## 3. 同花顺

[官方外汇频道](https://fe.10jqka.com.cn/) 免费公开显示伦敦金 `XAUUSD`，可读当日 open/high/low/latest 和 bid/ask。本次页面报价 latest 4194.1450，不能当作单独的历史日线数组。

排查结果：

- 外汇页面的旧脚本以 `d.10jqka.com.cn/v6/time/.../last.js` 提供分时绘图。这证明有分时取价路径，尚不证明 XAU 的历史 OHLC 可用。
- 新期货网页部分市场概览接口免登录返回成功，但当前数据为国内期货统计，不是现货黄金 K 线。
- 新网页行情 SDK 使用项目权限验证；本次没有借用网页项目 token 调用接口。
- 官方 iFinD 的 `cmd_history_quotation` 和 `high_frequency` 有 OHLC/高频能力，但请求要求 access_token。未确认免费的 XAU 历史权限，不能推荐为已验证免费源。

因此本次结论为“有免费展示报价，免费原始黄金历史 K 线未验证”，不是“同花顺不存在黄金 K 线”。

## 对项目的建议

从技术可用性和历史深度看，先验证东财作为独立 provider；新浪用于独立对照或用户明确选择的另一日线源。不同源不得默认自动拼接。公开网站使用前需要明确的黄金显示/缓存授权，本次三家都没有提供可据此确认的免费商用授权。

授权明确后的实现范围：

1. 新品种 `XAUUSD`，与 `GC=F` 分开，名称显示现货黄金与 COMEX 黄金期货。
2. 接入东财日线、周线和最近 15m/1h；4h 在固定规则下聚合。对历史不足周期如实提示起始时间。
3. provider / payload source / 路由自动分流一起扩展，兼容前端当前默认传 yahoo。
4. 关闭复权与成交量；存储 provider、报价口径、session/timezone，禁止把未知量自动换成 syntheticVolumes。
5. 在部署服务器复验可达性、限流、收盘后更新时间及分页；当前只是在本机少量请求成功。
6. 同步验证手机和桌面搜索、自选、周期切换、来源标识和历史追加。

## 实测记录与资料

- 只读探测脚本：`.codex-artifacts/spot-gold-public-source-probe.mjs`
- 2026-10-11 12:30 北京时间探测结果：`.codex-artifacts/spot-gold-public-source-probe-results.json`
- 脚本只输出条数、首尾和异常摘要，不落库、不执行远端 JavaScript；再次运行结果可能变化。
- 新浪官方图表配置：https://finance.sina.com.cn/sinafinancesdk/js/datas/k.js
- AKShare 源码：https://github.com/akfamily/akshare/blob/master/akshare/futures/futures_foreign.py
- 新浪协议：https://finance.sina.com.cn/roll/2021-05-12/doc-ikmxzfmm2033220.shtml
- 东方财富法律声明：https://about.eastmoney.com/home/disclaimer
- 东方财富服务协议：https://about.eastmoney.com/home/protocol
- 同花顺正式数据接口文档：https://quantapi.10jqka.com.cn/gwstatic/static/ds_web/quantapi-web/help-center/manual.html
- 同花顺法律声明：https://www.10jqka.com.cn/ia/pass_buck.php
