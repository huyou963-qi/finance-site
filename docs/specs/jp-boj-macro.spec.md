# 日本银行货币金融、企业价格与短观首批接入

状态：data-ready（2026-09-10，本地数据库已验证）。范围仅下表 9 条；不是 BOJ 全目录接入完成。

## 1. 来源与统计口径

按 [日本官方源调研](../research/JAPAN_OFFICIAL_DATA_SOURCE_RESEARCH.md) 与 agent-b 路径接入 BOJ 官方 JSON API。API 不需密钥，2026-02-18 上线：[官方公告](https://www.boj.or.jp/en/statistics/outline/notice_2026/not260218a.htm)。序列、频率、单位、起始期与注释来自官方 API 元数据，保存在 `src/lib/data/scheduler/boj/fixtures/metadata-selected.json`；各序列实际响应同时作为解析回归样本。

货币与贷款为官方余额水平，不是同比；CGPI/SPPI 为 2020=100 官方长序列，不推算同比。短观为实际景气判断 DI，不是预测值。所有值不缩放，亿日元对应源 `100 million yen`；季度按期初存储，例如 2026Q2 存 2026-04-01，不代表当日可见。

短观元数据明确：2003 年 12 月及之前与 2004 年 3 月及之后不连续。保留官方发布的历史及 `sourceNotes`，不得跨该断点解释为连续同口径变化。当前快照是最新修订历史，不能用于假设过去已知的 PIT 回测。

## 2. 底层复用与边界

复用 Instrument、DataSource、DataSubscription、ReleasePackage/Member、FetchRun，以及 `runDataSubscription` → `upsertMacroObservations` 的统一事实写入和重试调度。新增一个 `boj-time-series` REST_API source 与 BOJ adapter，无 migration、平行事实表或页面专用抓取器。历史 `jpov` Excel 增速指标不拼接入这些官方余额/指数/DI 序列，也不重写其历史。

## 3. 指标与目录

全部为 `gap_new_source / rest_api_existing`，目录 key 为 `mds:<code>`，国家为日本。分类由 BOJ catalog 元数据与 `globalCatalogTaxonomy.ts` 的 BOJ 映射驱动，归入统一九大主题；每个末端组远少于 48 条。

| code | 官方数据库 / 序列码 | 日本目录位置 | 单位 / 频率 | 首末观测 | 条数 |
|---|---|---|---|---|---:|
| boj_jp_m2 | MD02 / MAM1NAM2M2MO | 货币政策与流动性 → 货币存量 | 亿日元 / 月 | 2003-04—2026-08 | 281 |
| boj_jp_m3 | MD02 / MAM1NAM3M3MO | 货币政策与流动性 → 货币存量 | 亿日元 / 月 | 2003-04—2026-08 | 281 |
| boj_jp_m1 | MD02 / MAM1NAM3M1MO | 货币政策与流动性 → 货币存量 | 亿日元 / 月 | 2003-04—2026-08 | 281 |
| boj_jp_monetary_base | MD01 / MABS1AN11 | 货币政策与流动性 → 货币基础 | 亿日元 / 月 | 1970-01—2026-08 | 680 |
| boj_jp_cgpi | PR01 / PRCG20_2200000000 | 通胀与价格 → 企业商品价格 | 指数（2020=100）/ 月 | 1960-01—2026-07 | 799 |
| boj_jp_sppi | PR02 / PRCS20_5200000000 | 通胀与价格 → 服务业生产者价格 | 指数（2020=100）/ 月 | 1985-01—2026-07 | 499 |
| boj_jp_bank_loans | MD13 / FAAP@01 | 金融条件与银行 → 银行贷款 | 亿日元 / 月 | 2000-01—2026-08 | 320 |
| boj_jp_tankan_large_mfg | CO / TK99F1000601GCQ01000 | 国民经济 → 短观企业调查 | 百分点 / 季度 | 1974Q2—2026Q2 | 209 |
| boj_jp_tankan_large_nonmfg | CO / TK99F2000601GCQ01000 | 国民经济 → 短观企业调查 | 百分点 / 季度 | 1983Q2—2026Q2 | 173 |

## 4. 订阅、修订与归档

按真实统计发布分 6 包：`jp.boj.money_stock`（M1/M2/M3）、`jp.boj.monetary_base`、`jp.boj.cgpi`、`jp.boj.sppi`、`jp.boj.bank_lending`、`jp.boj.tankan`（两条）。首批采用 `probe_interval`：月频每 72 小时、季频每 168 小时。BOJ 有官方发布日程，但本批尚未编写官方日历适配器，因此明确使用定期探测，不伪造经济日历匹配；新值可有最多一个探测周期的获取延迟。订阅 enabled、fetchMethod=API、nextRunAt 由共享调度器维护，包供分组与批量刷新。

每次刷新请求单序列全历史，覆盖历史修订；单进程串行且请求间隔至少 2 秒，60 秒缓存去重；请求超时 60 秒。单条序列远低于 API 返回点数阈值，若出现 NEXTPOSITION 则拒绝截断响应。频率/单位漂移、重复日期、无效时期、数组不匹配、非数值均拒收；null 跳过，0 和负 DI 保留。

原始 JSON 按 SHA-256 保存到 `.data/boj/snapshots/<db>/<key>-<hash>.json`，相邻 meta 保存 URL、真实获取时间、hash 与 parserVersion。这些是实际抓取证据，不是官方历史首发版本；`.data` 不提交 Git，部署需保留可写目录。

## 5. 验证证据（2026-09-10）

```text
npx tsx --test src/lib/data/scheduler/boj/parser.test.ts
tests 3 / pass 3 / fail 0

npm run data:seed-jp-boj-macro
9 series seeded

npm run data:sync-jp-boj-macro
9 SUCCESS / inserted 3523 / changed 0 / skipped-invalid 0

npm run data:sync-jp-boj-macro
9 SKIPPED / inserted 0 / changed 0（真实重抓后无变化）

npm run data:verify-jp-boj-macro -- --db
jp-boj-macro verify PASS (9 series)
```

DB verify 检查真实频率/单位、fetchAcquisition=known、enabled、API、nextRunAt、probe 规则、6 包对应成员、成功 worker 日志及数据新鲜度。表中首末日期与条数为 DB aggregate 实测，合计 3,523 点。重新抓取全量不重复插入。发布包通过统一 `data:seed-release-packages` 写入并完成成员核验。仓库全量构建由本批集成流程统一执行。

## 6. 验收与发布事项

- [x] 官方元数据核验、固定 fixture 与原始响应归档。
- [x] 9 指标入库、完整官方历史回填、连续更新订阅。
- [x] 6 发布包、统一目录分类代码与 DB 成员核验。
- [x] 真实 worker 写入与二次抓取幂等、解析异常回归测试。
- [x] DB 字段、首末期、条数、更新状态核验。
- [ ] 面向外部正式发布服务前，按 [BOJ API notice](https://www.stat-search.boj.or.jp/info/api_notice_en.pdf) 完成服务通知邮件并在用户可查位置添加 API 来源与免责声明；本任务没有发送外部邮件。该事项已在 metadata 标记 `apiServiceReleaseNotificationRequired`。

后续可在同一个 BOJ adapter/catalog 扩充资金循环、国际收支等，不再建设第二个 BOJ 来源连接器。
