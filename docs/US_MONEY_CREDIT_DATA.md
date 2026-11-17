# 美国货币供应量与银行信用

接入日期：2026-11-17。复用 FRED API、统一观测 writer、FetchRun 审计及现有 worker；无 schema 变更，不新增功能页。

实施状态：代码及静态验证已完成；香港只读盘点确认 M2 已有813条观测（1959-01至2026-09），其余11条待新增。生产隔离构建启动后 SSH 与健康检查超时，未切换新版；无法确认后续 seed/回填命令是否执行成功。部署、全历史逐点核验和目录线上验收尚未完成，不应将本文列出的目标范围当作已全部在生产可用。代码发布须走 GitHub Actions，不在香港主机执行构建。

## 来源与范围

原始发布机构为美联储，H.6 月报（FRED release 21）与 H.8 商业银行周报（release 22），香港通过现有服务端 FRED_API_KEY 获取。

| 序列 | 定义 | 季调 | 官方起点 | 美国目录 |
|---|---|---|---|---|
| M1SL | M1 | 是 | 1959-01 | 货币政策与流动性 > 货币供应量（月频） |
| M2SL | M2，复用现有 Instrument，不重复创建 | 是 | 1959-01 | 同上，迁出联储资产负债表 |
| CURRSL | M1 的流通现金分项 | 是 | 1959-01 | 同上 |
| DEMDEPSL | 活期存款 | 是 | 1959-01 | 同上 |
| MDLM | 其他流动存款（含储蓄） | 是 | 2020-05 | 同上 |
| STDSL | 小额定期存款 | 是 | 1959-01 | 同上 |
| RMFSL | 零售货币市场基金 | 是 | 1973-01 | 同上 |
| BOGMBASE | 基础货币总额 | 否 | 1959-01 | 货币政策与流动性 > 基础货币与准备金（月频） |
| TOTRESNS | 存款机构总准备金 | 否 | 1959-01 | 同上 |
| TOTBKCR | 全部商业银行总信贷 | 是 | 1973-01-03 | 金融条件与银行 > 银行信贷（周频） |
| TOTLL | 全部商业银行贷款与租赁 | 是 | 1973-01-03 | 同上 |
| DPSACBW027SBOG | 全部商业银行存款 | 是 | 1973-01-03 | 金融条件与银行 > 银行存款（周频） |

全部保存官方原始水平，单位统一十亿美元；catalog key 为 `fred:<ID>`，Instrument code 为 `sched_fred_<ID>`。不添加自算同比、环比、货币乘数或存贷比观测；需要时在图表层变换。

## 订阅与修订

- H.6：保留稳定包 ID `us.fed.m2`，中文名扩展为“美国 H.6 货币供应量与准备金”，9 条月频成员；复用 `fredReleaseCalendar/catalog.ts` 的 release 21 同源发布日历，发布后延迟 3 分钟，2 小时复探。calendar 同步前新订阅有 72 小时探测兜底。
- H.8：保留 `us.frb.h8_bank_assets`，新增 3 条周频成员，包改为周频/24 小时探测；原月频 BUSLOANS 保留其原生月频及既有订阅规则，不把它强行转换为周频。
- 首次通过统一 writer 全历史回填；日常继承系统默认近 3 个月修订窗口。更早的历史大修订须显式扩大 revisionLookback 后补抓；不能声称每日重读全部历史。
- seed 保留既有成功记录与 nextRunAt；统一 registry 接入 `data:apply`。发布包和目录布局由标准脚本落库，cron 继续每 5 分钟执行 worker、每小时同步日历。

## 重要定义边界

- M1 从 2020-05 起纳入储蓄存款，存在官方定义断点。不能把跨断点同比或环比解释为同口径的货币扩张。MDLM 仅自 2020-05 起，不拼接已停更旧储蓄存款序列。
- TOTRESNS 在 2020-04 以前包含用于满足准备金要求的库存现金，之后为准备金余额。
- BOGMBASE 的“流通中现金”与 CURRSL 的“M1现金分项”口径不同，且前者未季调，不能直接混加校验。
- RMFSL 仅零售货币基金，不代表全部机构与零售货币基金。
- 月度基础货币/总准备金与既有周度 WRESBAL 有不同频率及统计含义，保留原生频率，不互相替代。
- 当前观测与版本账本只证明实际抓取时点可见，未回填 ALFRED 历次版本，不能把最新历史值当作当年首发 PIT 数据。

## 命令与验收

```bash
npm run data:seed -- --catalog=us-money-credit
npm run data:seed-release-packages -- --packages=us.fed.m2,us.frb.h8_bank_assets
npm run data:sync-calendar -- --code=sched_fred_M1SL
npm run data:rebuild-global-catalog-layout
npm run data:verify-us-money-credit -- --db --sync --live
```

`--sync` 显式强制通过 runDataSubscription 更新，`--live` 对照 FRED 原始观测逐点验证完整日期、条数和值；不加 `--db` 只验证目录映射与每条序列唯一发布包归属。生产限量补抓应持 worker/calendar 运维锁，避免与 cron 重叠。

代码入口：`src/lib/data/scheduler/usMoneyCreditCatalog.ts`，`scripts/data-worker/seed-us-money-credit.ts`，`scripts/data-worker/verify-us-money-credit.ts`。线上 web 与 cron 两份源码均须更新，单改 DB 不会更新编译后的 FRED 静态目录。

官方参考：

- https://www.federalreserve.gov/releases/h6/about.htm
- https://www.federalreserve.gov/releases/h6/h6_technical_qa.htm
- https://www.federalreserve.gov/releases/h8/about.htm
- https://fred.stlouisfed.org/series/M1SL
- https://fred.stlouisfed.org/series/M2SL
