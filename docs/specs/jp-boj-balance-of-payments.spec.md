# 日本国际收支核心月度序列（BOJ / MOF）

状态：`production-ready`  
核验日期：2026-09-13

## 1. 范围与来源

本批复用既有 `boj-time-series` DataSource、请求限速、原始 JSON 快照、统一 observation writer
和 `runDataSubscription`。数据由日本银行受财务省委托编制，BOJ 与 MOF 联合发布；正式获取源为
BOJ Time-Series API 的 `BP01` 数据库。

- 官方说明与口径：https://www.boj.or.jp/en/statistics/br/bop_06/index.htm
- 官方系列码表：https://www.boj.or.jp/en/statistics/br/bop_06/data/exbpsm6a.xlsx
- BOJ API 元数据：`/api/v1/getMetadata?format=json&lang=en&db=BP01`
- BOJ API 数据：`/api/v1/getDataCode?format=json&lang=en&db=BP01&code=<seriesCode>`
- MOF 发布日程：https://www.mof.go.jp/english/policy/international_policy/reference/balance_of_payments/index.htm

BOJ 明确说明：1996-01 至 2013-12 是依据 BPM6 重排的历史数据；可链接的序列从 2014-01
继续至当前 BPM6 数据。它们是同一个官方链接序列，不与 BPM5、BPM4 原表硬拼。每次同步重取
完整历史，以捕获二次初值、年度修订和再投资收益修订；快照只证明抓取时点可见，不是历史首发 PIT。

## 2. 复用门与查重

全库搜索现有日本 `jpov_*`、BOJ、FRED、e-Stat、MOF 和 provider catalog 后，未发现下列八条
日本国际收支同口径序列。现有 `boj_jp_*` 仅含货币存量、货币基础、价格、贷款和短观，因此不新建
BOJ source/client/parser，只扩展既有 BOJ adapter 对新的独立 catalog 的解析。

本批只保存 BOJ 已直接发布的 `Net balance`。数据库不从贷方与借方计算余额，也不从分项计算经常
账户或金融账户合计。没有接入季调序列，`seasonalAdjustment=NSA`。

## 3. 指标、目录与实测证据

全部为月频、单位 `亿日元`（API 原单位 `100 million Yen`），目录位置为
**日本 → 对外与汇率 → 国际收支 → 月频**。

| code | BOJ series code | 官方英文名 | 首末观测（2026-09-13） | 条数 |
|---|---|---|---:|---:|
| `boj_jp_bop_current_account` | `BPBP6JYNCB` | Current account / Net balance | 1996-01—2026-07 | 367 |
| `boj_jp_bop_goods` | `BPBP6JYNTB` | Goods / Net balance | 1996-01—2026-07 | 367 |
| `boj_jp_bop_services` | `BPBP6JYNSN` | Services / Net balance | 1996-01—2026-07 | 367 |
| `boj_jp_bop_primary_income` | `BPBP6JYNPIN` | Primary income / Net balance | 1996-01—2026-07 | 367 |
| `boj_jp_bop_secondary_income` | `BPBP6JYNSIN` | Secondary income / Net balance | 1996-01—2026-07 | 367 |
| `boj_jp_bop_financial_account` | `BPBP6JYNFB` | Financial account / Net balance | 1996-01—2026-07 | 367 |
| `boj_jp_bop_direct_investment` | `BPBP6JYNFB1` | Direct investment / Net balance | 1996-01—2026-07 | 367 |
| `boj_jp_bop_portfolio_investment` | `BPBP6JYNFB2` | Portfolio investment / Net balance | 1996-01—2026-07 | 367 |

实测元数据的 `LAST_UPDATE=20260908`，八条均无缺月、空值或重复月份。2026-07 最新值依次为：
29,888.5173、-3,998.8443、-5,129.3460、42,895.9899、-3,879.2822、17,626.0596、
26,213.4095、-6,753.0466 亿日元。保留 API 小数精度，不按新闻稿显示值预先四舍五入。

## 4. 符号、发布时间与订阅

- 经常账户及其分项：净额为贷方减借方。
- 金融账户及其分项：净获得金融资产减净发生负债；正负号不能按经常账户的“顺差/逆差”直接解释。
- 初值通常在参考月后约两个月发布；二次初值在所属季度末月后四个月发布，另有年度与再投资收益修订。
- MOF 当前公布的下一次初值为 **2026-10-08 08:50 JST**，对应 2026-08 数据；香港/北京时间为
  **2026-10-08 07:50**。其后当前表列出 2026-11-10、2026-12-08、2027-01-12、2027-02-08。
- 本批订阅规则为 `probe_interval: 72h`，发布包为 `jp.boj.balance_of_payments`。全历史 API 请求每次
  仅 367 点，远低于 BOJ 60,000 点分页门槛；72 小时探测也覆盖改期和非主发布日修订。发布包接入
  官方日历解析器后，可把 `nextRunAt` 精确对齐至官方 08:50 JST，并保留低频兜底探测。

## 5. 实现与验证

- Catalog：`src/lib/data/scheduler/bojExternal/catalog.ts`
- Adapter 复用：`src/lib/data/scheduler/adapters/bojAdapter.ts`
- Seed：`scripts/data-worker/seed-jp-boj-bop.ts`
- Sync：`scripts/data-worker/sync-jp-boj-bop.ts`
- Verify：`scripts/data-worker/verify-jp-boj-bop.ts`
- 官方响应 fixtures：`src/lib/data/scheduler/bojExternal/fixtures/*.json`

验证命令：

```bash
npx tsx --test src/lib/data/scheduler/bojExternal/catalog.test.ts
npx dotenv -e .env.local -- tsx scripts/data-worker/verify-jp-boj-bop.ts --live
npm run data:seed-jp-boj-bop
npm run data:sync-jp-boj-bop
npm run data:seed-release-packages
npm run data:sync-catalog-layout -- --keys=mds:boj_jp_bop_current_account,mds:boj_jp_bop_goods,mds:boj_jp_bop_services,mds:boj_jp_bop_primary_income,mds:boj_jp_bop_secondary_income,mds:boj_jp_bop_financial_account,mds:boj_jp_bop_direct_investment,mds:boj_jp_bop_portfolio_investment
npm run data:verify-jp-boj-bop -- --db
```

## 6. Agent B 完成清单

- [x] 逐条查重，确认无可直接复用的日本同口径 Instrument
- [x] 逐条实时核实 BOJ 数据库、系列码、名称、频率、单位、起止期和最新更新时间
- [x] 只保存官方原始净额，不存站内派生合计
- [x] 复用既有 BOJ DataSource、client、parser、快照与 dispatcher
- [x] Catalog、seed、sync、verify、官方 fixture 与单元测试已完成
- [x] 明确统一九主题目录位置、订阅间隔、修订机制和官方下一发布日期
- [x] 汇总 Agent 将 catalog 注册到统一 seed/verify registry、package scripts、发布包和日本目录映射
- [ ] 汇总后执行本地 DB 全量回填、目录重建与生产部署抽查
