# 美国周度市场定价与经济确认数据

本文记录美股行业「周度市场正在交易什么宏观背景」所需的数据接入、调度和重建方式。页面算法只消费统一宏观事实库；本域不新建 adapter、事实表或 writer。

## 分层与频率

| 序列 | 频率 / 单位 | 用途 | FRED Release / 发布包 | 更新方式 |
|---|---|---|---|---|
| `T5YIFR` | 日 / % | 纯市场定价层：5Y5Y 远期通胀预期 | Interest Rate Spreads / `us.frb.interest_rate_spreads` | FRED API，6 小时探测 |
| `VXVCLS` | 日 / 指数 | 纯市场定价层：3 个月隐含波动率 | CBOE Market Statistics / `us.cboe.market_statistics` | FRED API，6 小时探测 |
| `ANFCI` | 周 / 指数 | 周度经济确认层：剔除经济活动影响后的金融条件 | Chicago Fed NFCI / `us.chicagofed.nfci` | FRED API，12 小时探测 |
| `WEI` | 周 / 指数 | 周度经济确认层：Lewis-Mertens-Stock 周度经济活动 | Weekly Economic Index (Lewis-Mertens-Stock) / `us.fred.weekly_economic_index` | FRED API，12 小时探测 |

`WEI` 是 Lewis、Mertens、Stock 联合构建并由 FRED 分发的序列，不把它错误归属为单一地区联储的官方发布。发布包使用中性命名。

## 复用并修复的既有序列

`T5YIE`、`DTWEXBGS`、`NFCI`、`ICSA`、`DCOILWTICO`、`VIXCLS` 不重复创建 Instrument，只修复订阅、新鲜度和发布包：

- `ICSA` 保留经济日历调度，按 Initial Jobless Claims 发布事件更新；日历同步会 fan-out 到订阅。
- `DCOILWTICO` 归入 EIA Spot Prices 探测包，不再错误跟随 Weekly Petroleum Status Report 的原油库存发布时间。
- `VIXCLS` 与 `VXVCLS` 共用 CBOE Market Statistics 发布包。
- 其余日频或周频序列使用 6/12 小时探测；探测只决定拉取时机，最终事实仍由 FRED adapter 和 canonical observation writer 写入。

## 部署与持续更新

```bash
npm run data:seed-market-pricing
npm run data:seed-release-packages
npm run data:sync-calendar
npm run data:verify-market-pricing -- --db
```

`market-pricing` 已注册到统一 seed/verify registry，因此生产 `npm run data:apply` 会幂等创建或修复目录、发布包和订阅。之后由现有 `data:worker` 按 `nextRunAt` 自动增量拉取；Windows 建议继续按仓库约定每 5 分钟运行 worker、每小时同步经济日历。

如需从代码和 FRED 重建开发库，先运行 seed 与发布包，再分别执行 `npm run data:sync-one -- sched_fred_<ID>`；空库首次同步会通过统一 FRED adapter 回填可用历史，最后运行 verify。不要从另一数据库复制观测，也不要另建页面专用抓取链。

## 当前全历史基线（截至 2026-08-25）

| 序列 | 起始观测 | 最新观测 | 观测数 |
|---|---:|---:|---:|
| `T5YIFR` | 2003-01-02 | 2026-08-24 | 5,915 |
| `VXVCLS` | 2007-12-04 | 2026-08-21 | 4,708 |
| `ANFCI` | 1971-01-08 | 2026-08-14 | 2,902 |
| `WEI` | 2008-01-05 | 2026-08-15 | 972 |

自检使用宽松但可发现截断历史的下限，并同时检查最新日期、FRED 获取状态、订阅类型和发布包归属。
