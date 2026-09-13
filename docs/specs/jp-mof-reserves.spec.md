# 日本财务省国际储备核心月度数据接入 Spec

## 1. 范围与目的

本批接入日本财务省（MOF）按 IMF `International Reserves and Foreign Currency Liquidity` 模板公布的月度国际储备总额及主要构成。用途是观察日本外部缓冲、储备资产构成和黄金估值变化。只保存官方原样公布的存量，不在摄入层计算占比、环比或汇率换算。

现行表从 2000 年 4 月开始。财务省明确说明 2000 年 3 月以前与 2000 年 4 月以后采用不同标准、不可连续，因此本批不拼接旧口径。

## 2. 复用门检查

- 全局搜索 `foreign reserve`、`international reserve`、`外汇储备`、`外貨準備`、`reserve assets` 及日本 overview 的 `jpov_c*`，未发现同口径日本月度国际储备 Instrument、adapter 或 catalog。
- 已接入的 `jp.mof.jgb_yields` 是国债收益率，`jp.boj.balance_of_payments` 是 BPM6 月度流量；本批是月末储备资产存量，三者口径不同。
- 黄金模块的全球黄金储备量不是日本国别的 MOF 国际储备模板，不能复用。
- 结论：10 条均为新序列，无需迁移旧代码或拼接第三方历史。

## 3. 指标定义

| code | 中文名 | 官方列 | 单位 | 首期 |
|---|---|---|---|---|
| `mof_jp_reserves_total` | 外汇储备资产总额 | A. Official reserve assets | 百万美元 | 2000-04 |
| `mof_jp_reserves_foreign_currency` | 外币储备 | (1) Foreign currency reserves | 百万美元 | 2000-04 |
| `mof_jp_reserves_securities` | 外币储备：证券 | (a) Securities | 百万美元 | 2000-04 |
| `mof_jp_reserves_deposits` | 外币储备：存款 | (b) Deposits with | 百万美元 | 2000-04 |
| `mof_jp_reserves_imf_position` | IMF 储备头寸 | (2) IMF reserve position | 百万美元 | 2000-04 |
| `mof_jp_reserves_sdr` | 特别提款权 | (3) SDRs | 百万美元 | 2000-04 |
| `mof_jp_reserves_gold_value` | 黄金储备价值 | (4) Gold | 百万美元 | 2000-04 |
| `mof_jp_reserves_gold_volume` | 黄金储备数量 | volume in million fine troy ounces | 百万金衡盎司 | 2000-04 |
| `mof_jp_reserves_other_reserve_assets` | 其他储备资产 | (5) other reserve assets | 百万美元 | 2006-03 |
| `mof_jp_reserves_other_foreign_currency_assets` | 其他外币资产 | B. Other foreign currency assets | 百万美元 | 2008-09 |

所有指标均为日本全国、月末存量、名义美元估值、未季调。数据库用该月月首表示参考月份，同时以 `metadata.referencePeriod=month_end` 保留月末语义。黄金价值与黄金数量是官方分别公布的两条基础数据，不由本站换算。

## 3.1 官方源、结构与合规核实

- 官方入口：<https://www.mof.go.jp/english/policy/international_policy/reference/official_reserve_assets/index.htm>
- 历史 CSV：<https://www.mof.go.jp/policy/international_policy/reference/official_reserve_assets/historical.csv>
- 发布计划：<https://www.mof.go.jp/english/policy/international_policy/reference/official_reserve_assets/news.htm>
- 网站使用说明：<https://www.mof.go.jp/english/about_mof/notice/index.html>
- 2026 年 8 月发布页：<https://www.mof.go.jp/english/policy/international_policy/reference/official_reserve_assets/e0808.html>

文件是公开、无需登录的 Shift-JIS CSV。`robots.txt` 返回 404，没有针对目标路径的 robots 禁止项。MOF 网站说明除另有标记外适用 Public Data License 1.0；数据源标注为 `Source: Ministry of Finance Japan`。抓取不绕过访问控制，不使用 Cookie 或密钥。

CSV 是多行双语表头，数据区从 2000-04 连续到最新月。parser 在使用固定列位前同时校验以下英文锚点及列位：

- `A. Official reserve assets` 与 `B. Other foreign currency assets`；
- `Foreign currency reserves`、`IMF reserve position`、`SDRs`、`Gold`、`other reserve assets`；
- `Securities` 与 `Deposits with`；
- 标题和 `US$ millions` 单位。

日期优先核对公历年和日本年号；2023 年以后 CSV 不再重复公历年，parser 可由令和年号确定年份。数据必须逐月连续，分项开始公布后不得出现空洞。最新期还校验两条官方恒等式：外币储备 = 证券 + 存款；储备总额 = 外币储备 + IMF 头寸 + SDR + 黄金 + 其他储备资产。任一结构或恒等式变化均抛错，禁止静默错列。

## 4. 获取、快照与 PIT 边界

- `client.ts`：单次请求 30 秒超时，无应用层重试；同一 worker 批次缓存 60 秒，10 条序列共用一次下载。
- DataSource 限频：最小间隔 2 秒、每分钟最多 20 次。后续调度按 24 小时低频探测；实际在进程内通常一批仅请求一次。
- 每次下载原始字节写入 `.data/jp-mof-reserves/snapshots/<sha256>.csv`，`latest.json` 保存 URL、抓取时刻、SHA-256、ETag、Last-Modified 与 parser 版本。
- 入库每次解析完整历史，从而接受 MOF 的事后订正。`MacroObservationVintage` 只记录本站抓取时点看到的值，不能证明该值是历史首发值，当前实现不构成严格 point-in-time 数据集。
- 固化 fixture 的 SHA-256 为 `07e66e3a4d0eb18147e166e96ed1ba0a9df32bd8f15e44c14baac20185b0523c`，抓取于 2026-09-13，最新参考期 2026-08。

财务省网页保留显式修订公告。例如 2026 年 3 月和 4 月数据于 2026-06-19 订正，说明只取最新月不能正确维护历史。

## 5. 调度与发布机制

财务省说明每月末余额在次月上旬发布。2026 年 8 月数据于 2026-09-07 发布；当前官方计划给出的下一窗口为：

- 2026 年 9 月末数据：2026-10-01 至 2026-10-07；
- 2026 年 10 月末数据：2026-11-01 至 2026-11-09；
- 2026 年 11 月末数据：2026-12-01 至 2026-12-07。

官方只给日期窗口、没有固定时刻，不能伪造单一精确发布日期。订阅采用 `probe_interval=24h`，发布包建议为 `jp.mof.international_reserves`，10 条成员共享一份 CSV。后续若接入 MOF 窗口解析器，可在窗口内每日触发并在发现新参考期后停止；现阶段全年每日一次请求的流量也低于合规上限。

目录位置：`日本 > 对外与汇率 > 外汇储备`。建议共享 taxonomy 按 `mof_jp_reserves_` 前缀映射到该节点。

## 6. 实现与验证

独立文件：

- `src/lib/data/scheduler/jpMofReserves/{catalog,client,parser}.ts`
- `src/lib/data/scheduler/adapters/jpMofReservesAdapter.ts`
- `scripts/data-worker/{seed,sync,verify}-jp-mof-reserves.ts`
- `src/lib/data/scheduler/jpMofReserves/fixtures/historical.csv`

父任务需补充共享注册：worker provider 分发、package.json 三个命令、seed/verify registry、release package、global taxonomy 和 Japan catalog placement test。

验证清单：

- [x] 官方 fixture 解析出 10 条序列，标题、单位、列位和最新恒等式均通过。
- [x] 结构锚点被修改时 parser 抛错。
- [x] 已开始的分项出现空洞时 parser 抛错。
- [x] live CSV 与 fixture 均可解析，最新参考期为 2026-08。
- [x] seed/sync 后逐条核对 DB 点数、首末期、订阅状态与 vintage。
- [x] 发布包包含 10 条成员且订阅全部启用。
- [x] 目录落在 `日本 > 对外与汇率 > 外汇储备`。
