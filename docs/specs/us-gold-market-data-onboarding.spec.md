# 美国黄金分析原始市场数据接入说明

更新：2026-08-22。当前数据库保留的范围是旧工作簿中的 **24 条 legacy 指标**。其中 8 条已复核为派生项，16 条为原始口径。此前提交 `9c28298` 已删除 `goldov_c04/c05/c12/c13/c14`，本次没有擅自恢复它们；因此历史口头统计的“27−5=22”与当前实际保留集合不一致。原始口径均保持现有 instrument code，不用近似 FRED/行情序列替换。

## 已确认的八条派生项

| code | 公式 | 处理 |
|---|---|---|
| `goldov_c03_basis` | `c01 - c02` | 派生，不独立抓取 |
| `goldov_c07_comex_stock` | `c23 / 1,000,000` | 派生，不独立抓取 |
| `goldov_c08_comex_stock_wow` | `c07(t) - c07(t-1)` | 派生，不独立抓取 |
| `goldov_c09_etf_holding` | `c25 × 35.2739619495804 / 1,000` | legacy 将吨换成百万**常衡盎司**，不是金衡盎司；4039 个重叠日最大差 0.0053 |
| `goldov_c10_etf_holding_wow` | `c09(t) - c09(t-1)` | 派生，不独立抓取 |
| `goldov_c11_global_reserve` | `c24 × 35.2739619495804 / 1,000` | legacy 将吨换成百万**常衡盎司**；100 个月最大差 0.0064 |
| `goldov_c16_etf_tons_wow` | `c25(t) - c25(t-1)` | 派生，不独立抓取 |
| `goldov_c25_etf_holding_tons` | `c17 + c18 + c19 + c20 + c21 + c22`（同一日期） | 4039 个重叠日最大差 0.02 吨，来自各分项仅保留两位小数 |

`c03/c08/c09/c10/c11/c16/c25` 在全部重叠日期上仅有历史工作簿保留精度导致的极小差异；`c07` 与 `c23` 的单位换算一致。`c09/c11` 的“盎司”历史标签实际使用 1 kg = 35.27396195 常衡盎司，不能悄悄改成金衡盎司；若要采用贵金属标准单位，应新建明确标注的序列。派生实现必须保留各自现有历史观测，直至单独的派生刷新任务上线。

## CFTC Managed Money 净仓位入库证据（Agent B，2026-08-22）

- `goldov_c06_mm_net` 已入库 **886** 个周度观测，首日 `2009-09-01`、末日 `2026-08-18`，单位为“张”；legacy 工作簿与 CFTC 重叠的 875 周逐点差异为 0。
- 主源仍为 CFTC Socrata Disaggregated Combined `kh3c-gbw2`，净仓位严格按 `m_money_positions_long_all - m_money_positions_short_all`，不含 spread。因本次环境访问 Socrata 返回 HTTP 403，adapter 已增加同一 CFTC 官方报告的年度压缩文件 `com_disagg_txt_<year>.zip` / `com_disagg_txt_hist_2006_2016.zip` 回退；年度文件不可用时才退到当期 `c_disagg.txt`。三者都是 Futures-and-Options Combined，不切换为 futures-only。
- 持续更新由启用的 `cftc-cot` API subscription 执行，并归入 `intl.cftc.disaggregated_combined` 周频发布包（包级 `probe_interval` 168 小时）；成员保留项目既有周频源 12 小时探测规则，以便在 CFTC 周五发布后及时入库。生产 `data:worker` 到期探测；可用 `data:sync-one -- goldov_c06_mm_net` 强制同步。verify 同时断言 source/series key、发布包、周频、单位、观测数和最近观测不滞后超过 14 天。

## ETF 产品映射、历史覆盖与获取门禁（Agent C，2026-08-22）

授权状态：用户于 **2026-08-22** 明确确认本项目已取得黄金 ETF 数据自动下载、保存、入库及站内展示许可。本 spec 只记录授权范围与日期，不保存许可正文、凭据或秘密。

复用门：全库搜索 instrument code、发行人、产品名、provider catalog、`seedCatalogRegistry.ts` 与 `releasePackageCatalog.ts`，未发现可复用的 ETF 持金量 adapter/source/subscription。工作簿首日、发行人产品成立日、ISIN 与现存值共同锁定了以下映射；不再以 ticker 文本猜测产品。

| code | 精确产品 | 标识 | legacy 历史覆盖 | 官方公开候选 | 自动接入结论 |
|---|---|---|---|---|---|
| `goldov_c17_spdr_etf` | SPDR Gold Trust / GLD | ISIN `US78463V1070` | 2004-11-18–2026-06-05，5421 日 | SPDR Historical Archive XLSX（日更） | **已实现**：官方 archive 的 `Tonnes of Gold` 为全历史直接披露值；24 小时 probe。 |
| `goldov_c18_ishares_etf` | iShares Gold Trust / IAU | CUSIP `464285204` | 2005-01-28–2026-06-05，5339 日 | 产品页 `Tonnes in Trust`（日更）；Data Download 仅含 NAV/份额 | **增量已实现**：只读取产品页直接披露吨数；历史表无吨数，旧历史保留 legacy 血缘，不用 NAV/金价反推。 |
| `goldov_c19_gbs_etf` | Gold Bullion Securities | ISIN `GB00B00FHZ82`；LSE `GBS/GBSS` | 2007-12-31–2026-06-04，4705 日 | WisdomTree Dataspan GBS 托管 bar-list PDF | **已实现**：以独立账户 `LAW DEBENTURE TRUST RE GBS` 锁定产品，直接读取 `Total Allocated Fine Weight` 金衡盎司并转吨；24 小时 probe。 |
| `goldov_c20_phau_etf` | WisdomTree Physical Gold | ISIN `JE00B1VS3770`；LSE USD `PHAU` | legacy 日频 2007-04-24–2026-06-04，4884 日 | WGC Gold ETF Holdings and Flows 月度 XLSX | **已接通（月频）**：Dataspan 的 MSL bar list 是多产品池化账户，不能归给 PHAU；许可 Goldhub 会话动态发现月表，唯一匹配 `phau ln equity` + 产品全名并读取直接披露吨数，7 天 probe。 |
| `goldov_c21_sgbs_etf` | WisdomTree Physical Swiss Gold | ISIN `JE00B588CD74`；LSE USD `SGBS` | 2009-12-17–2026-06-04，4190 日 | WisdomTree Dataspan SGBS 托管 bar-list PDF | **已实现**：以产品全名 `WisdomTree Physical Swiss Gold` 锁定账户，直接读取 `Total Fine Ounces` 并转吨；24 小时 probe。 |
| `goldov_c22_gold_etf` | Global X Physical Gold Structured / ASX `GOLD` | ISIN `AU00000GOLD7` | 2007-12-31–2026-06-04，4809 日 | Global X NAV/UOI + Metal Entitlement XLSX | **已接通**：同日官方 UOI × 每单位 GOLD 金衡盎司 ÷ `32,150.74656862798`；不是 AUM/价格反推。Entitlement 文件从 2022-02-01 覆盖，之前保留 legacy。现有 `GB` 国家分类是 legacy 错误，产品应归 `AU`。 |

robots 记录：`spdrgoldshares.com` 为 `Allow: /`；`ishares.com` 未禁止产品页但禁止 `*.dl` 等下载路径；`wisdomtree.eu` 为 `Allow: /`、`Disallow: /api`；`dataspanapi.wisdomtree.com/robots.txt` 返回 404（未发布 robots policy）；`globalxetfs.com.au` 为 `Allow: /`（仅禁止订阅参数）。robots 允许不覆盖合同条款；本项目另有上段记录的用户授权。Dataspan 是匿名可下载的发行人官方静态 PDF 文档接口，不是 Cloudflare challenge 绕过。GBS/SGBS fixture 已保存真实 PDF 并完成身份断言、parser test、adapter/subscription。

合规证据（2026-08-22 复核）：[SPDR Terms](https://www.spdrgoldshares.com/terms-and-conditions/)、[BlackRock Terms](https://www.blackrock.com/corporate/compliance/terms-and-conditions)、[WisdomTree Europe Terms](https://www.wisdomtree.com/be/terms-and-conditions)、[Global X GOLD 产品页及版权声明](https://www.globalxetfs.com.au/funds/gold/)、各站 `robots.txt`。产品身份依据对应发行人产品页，不使用搜索结果页或第三方 ticker 数据。

更新设计：按各发行人公开或许可交付文件解析 `date + tonnes/ounces in trust`；六只同一官方 as-of 日期齐全后才计算 `c25`，再按 legacy 常衡盎司系数刷新 `c09`，最后计算 `c10/c16`。GLD/IAU/GBS/SGBS/Global X 采用每 24 小时低频 probe；PHAU 使用 WGC 月度 XLSX individual fund breakdown，每 7 天 probe。部署可用 `WGC_GOLD_ETF_XLSX_URL` 显式覆盖，否则以 `WGC_GOLDHUB_COOKIE` 访问 Goldhub 页面并动态发现当月文件；请求统一 30 秒超时，Cookie 仅发送给 `gold.org` 域且不得记录。解析时若表内出现 ISIN `JE00B1VS3770` 则优先使用；当前表不含 ISIN，故严格要求 `phau ln equity` 与 `WisdomTree Physical Gold` 位于同一唯一列，缺失或歧义立即 FAILED。第三方新闻转载只零散列出最大流入流出基金，明确排除。

WGC 月表共解析 232 个 PHAU 月度点（2007-04-30–2026-07-31）。与 legacy 严格同日重叠 226 个月：近期差异主要是 legacy 两位小数舍入，但旧期最大绝对差 5.20073089 吨（2011-06-30），因此不得用当前 WGC 修订历史盲目覆盖旧日频数据。本轮明确保留 legacy 至 2026-06-04，仅拼接其后的 WGC 官方月末截面；metadata 记录 `legacy daily` → `WGC monthly` 频率切换及 `forwardFill=false`。这不是把月值伪装成日值，也不会前向填充。

Live 入库验证（2026-08-22/23）：`c17` 新增 52 点至 2026-08-20（1,038.93 吨），第二轮 `rowsUpserted=0`；`c18` 在 legacy 截止 2026-06-05 后新增一个官方直接披露截面 2026-08-21（458.65 吨），中间未获官方吨数的日期保持缺口，不插值；`c22` 更新至 2026-08-20（29.307340182582 吨）。`c19` live sync 新增 1 点至 2026-08-21（29.061243041607 吨），`c21` 新增 1 点至 2026-08-20（38.250554940457 吨）。`c20` WGC live sync 新增 2026-06-30（51.15244778 吨）与 2026-07-31（51.82077299 吨）两个官方月末点。两个日期均缺 IAU/GBS/SGBS 的同日官方点，因此没有刷新 `c25/c09/c10/c16`，也没有用邻近日值或前向填充凑齐篮子。

## 央行黄金聚合口径与入库证据（Agent B / Agent C，2026-08-22）

- `c24` 是“各国央行/官方部门黄金总量（吨）”的原始聚合，legacy 覆盖 2018-01-31–2026-06-30 共 100 个月；`c11` 只是 `c24` 的常衡盎司换算，不再视为第二个原始来源。
- IMF International Liquidity (IL，原 IFS 国际流动性表) 是物理黄金储备的官方基础源。已锁定 IL v13.0.1 的世界汇总键 `G001.RGV_REVS.FTO.M`：`G001` = World / All economies covered by dataset，`RGV_REVS` = Gold reserves (volume)，`FTO` = Fine troy ounces，`M` = 月频。该键本身就是 IMF 发布的世界汇总；不得另行把国家、ECB、IMF、BIS 相加，以免重复计算黄金存款等项目。
- World Gold Council 的 World Official Gold Reserves 文件以 IMF IFS 为主，并按已知未报变动/勘误调整；公开说明季度历史从 2000 年开始、Top 100 最新月末，月度文件在月初 10 日内更新且数据滞后两个月。这个“WGC 修订后的各国合计”最接近 legacy，但 Goldhub 下载需登录，WGC 条款又明确禁止 scrape、复制和在网络计算机发布，故不能自动接入。
- IMF 官方 SDMX 3.0 数据端点 `https://api.imf.org/external/sdmx/3.0` 可匿名调用，无需 API key。生产 query 为 `data/dataflow/IMF.STA/IL/+/G001.RGV_REVS.FTO.M`，adapter 对四个维度做身份断言，并按 IMF 返回的 fine troy ounces 除以 `32,150.74656862798` 转为公吨。World Bank `total reserves (includes gold)` 是美元计价的总储备，FRED 检索到的主要是 `Total Reserves excluding Gold`，两者均不等于物理黄金持有量，明确排除。
- 已回填 `c24` **841** 个月度观测，首日 `1950-12-31`、末日 `2026-06-30`，最新值 `36,815.89190330463` 吨；原有 100 个 legacy 重叠月均按 IMF 官方口径刷新，不把两种方法静默拼接。`c11` 同步刷新为 841 点，并在全部重叠日期满足 `c24 × 35.2739619495804 / 1,000`，最新值 `1,298.642370137033` 百万常衡盎司。
- 持续更新由 `imf-il` API subscription 和 `intl.imf.international_liquidity_gold` 月频发布包执行，包级 probe interval 为 72 小时；worker 每次读取官方全序列并由统一 writer 按修订窗口幂等更新。可用 `data:sync-one -- goldov_c24_global_reserve_tons` / `goldov_c11_global_reserve` 强制同步，`data:verify-gold-market -- --db` 校验 source、series key、发布包、频率、单位、历史覆盖、滞后和 c11 派生公式。

来源证据：[IMF International Liquidity dataset](https://data.imf.org/Datasets/IL)、[IMF IFS 访问迁移说明](https://data.imf.org/en/news/accessing)、[WGC Gold Reserves by Country](https://www.gold.org/goldhub/data/gold-reserves-by-country)、[WGC Terms（明确禁止 scrape）](https://www.gold.org/terms-and-conditions)。

## 当前 16 条原始口径及相关派生项的来源结论

| code | 工作簿精确口径 | 结论 | 更新机制 / 阻塞原因 |
|---|---|---|---|
| `goldov_c01_comex_active` | COMEX 黄金活跃合约收盘价 | 待授权 | CME 市场结算价；需 CME 市场数据许可/API，不能用网页抓取。 |
| `goldov_c02_london_gold` | 伦敦金现 IDC | 待确认供应商合同 | `IDC` 是原口径的一部分；LBMA 或其他现货报价并不等价，须取得 IDC/ICE Data 的原始序列授权。 |
| `goldov_c06_mm_net` | CFTC 管理基金净持仓 | 已接通并补官方 bulk fallback | CFTC Socrata `kh3c-gbw2`，按报告字段 `m_money_positions_long_all - m_money_positions_short_all`；Socrata 失败时回退官方 Disaggregated Combined 年度 ZIP，当期文本为末级回退；归入 168 小时 probe 发布包。886 点，2009-09-01–2026-08-18。 |
| `goldov_c09_etf_holding` | 六只 legacy 黄金 ETF 合计（百万常衡盎司） | 派生已确认、上游待许可 | `c25 × 35.2739619495804 / 1,000`；不是标准金衡盎司。 |
| `goldov_c11_global_reserve` | 各国央行/官方部门黄金总量（百万常衡盎司） | 已接通的派生序列 | 由 IMF IL 官方 `G001.RGV_REVS.FTO.M` 的 `c24 × 35.2739619495804 / 1,000` 刷新；841 点，1950-12-31–2026-06-30。 |
| `goldov_c15_ppi_yoy` | PPI 所有商品、非季调、同比 | 已接通 | BLS Public Data API `WPU00000000`，由官方 NSA 指数计算同月同比；并入 `us.bls.ppi` 发布包。 |
| `goldov_c17_spdr_etf` | SPDR Gold Trust / GLD 持金量（吨） | 已实现 | ISIN `US78463V1070`；官方 archive 全历史直接吨数，24 小时 probe。 |
| `goldov_c18_ishares_etf` | iShares Gold Trust / IAU 持金量（吨） | 官方直接披露增量已实现 | CUSIP `464285204`；产品页 `Tonnes in Trust` 日更；历史 Excel 无吨数字段，不做近似反推。 |
| `goldov_c19_gbs_etf` | Gold Bullion Securities 持金量（吨） | 已接通 | ISIN `GB00B00FHZ82`；官方 Dataspan GBS 独立托管账户 PDF 的 allocated fine ounces 转吨，24 小时 probe。 |
| `goldov_c20_phau_etf` | WisdomTree Physical Gold 持金量（吨） | 已接通（月频增量） | ISIN `JE00B1VS3770`；许可 WGC individual fund tonnes 月表，动态发现或显式 URL 覆盖，7 天 probe；legacy 日频截止后只保存月末 as-of 点，不前向填充。 |
| `goldov_c21_sgbs_etf` | WisdomTree Physical Swiss Gold 持金量（吨） | 已接通 | ISIN `JE00B588CD74`；官方 Dataspan 产品账户 PDF 的 total fine ounces 转吨，24 小时 probe。 |
| `goldov_c22_gold_etf` | Global X Physical Gold Structured / ASX GOLD 持金量（吨） | 已接通 | ISIN `AU00000GOLD7`；动态发现官方 NAV/UOI 与 Metal Entitlement XLSX，同日相乘并由金衡盎司转吨，非 AUM/价格反推。 |
| `goldov_c23_comex_stock_oz` | COMEX 黄金库存（金衡盎司） | 待授权 | CME 的 Gold Stocks 是精确公开报告口径，但网站数据条款明确禁止脚本/机器人抓取；联系 CME GCC 获取可自动化的 report/data feed 许可。 |
| `goldov_c24_global_reserve_tons` | 各国央行/官方部门黄金总量（吨） | IMF 官方世界汇总已接通 | IMF IL `G001.RGV_REVS.FTO.M`，fine troy ounces 转公吨；841 点，1950-12-31–2026-06-30；72 小时 probe 的月频发布包更新。 |
| `goldov_c25_etf_holding_tons` | 六只 legacy 黄金 ETF 持有量合计（吨） | 派生已确认、上游待许可 | `c17+c18+c19+c20+c21+c22`；4039 个重叠日最大差 0.02 吨。 |
| `goldov_c26_dxy` | ICE 美元指数 DXY | 待授权 | ICE Data Indices 的 DXY 是受许可指数；FRED 广义美元指数口径不同，不能替换。 |
| `goldov_c27_brent` | ICE 布伦特原油连续期货结算价 | 待授权 | 需 ICE Futures 的连续合约结算数据；EIA/FRED 布伦特现货不等价。 |
| `goldov_c28_real_rate` | 美国实际利率 | 已接通 | World Bank Open Data API `US:FR.INR.RINR`；年度、年末观测日期、每周探测新年值。 |
| `usov_c28_sp500_pe` | 标普 500 PE | 待定义/授权 | 工作簿来源 Wind，尚未说明 trailing/forward、收益口径和指数版本；S&P 官方 P/E 数据需按所需版本取得授权。 |

`sched_fred_PRFIC1` 不属于上述 legacy 黄金/Overview 原始口径：它已是有效的 FRED `PRFIC1` 定时订阅，存在 `fetchAcquisition=known`、启用订阅和下次运行时间，无需重复创建同序列。

## 合规与下一步

- 已验证来源的 `c06/c11/c15/c24/c28` 会被设为 `fetchAcquisition.status=known`、启用订阅并由 worker 更新；`c11` 是与 `c24` 同源、保留 legacy 单位的派生输出。
- CME 页面返回的规则明确禁止使用脚本、机器人等抓取机制；因此本项目不实现网页绕过。对于 `c01/c23`，取得 CME data feed/许可和 API 凭据后，再实现经授权适配器。
- ICE DXY、ICE Brent 和精确 S&P 500 P/E 同样必须由持牌数据源提供。将来接入时把凭据放入部署环境变量，不提交到仓库，并在适配器中写明供应商、合约/指数版本、调整规则、时区及再分发限制。
- `c11` 已随 IMF 官方 `c24` 刷新；ETF 授权范围已确认，`c17` 已按 fixture → parser test → adapter → subscription 实现全历史文件，`c18` 接入官方直接披露的日常吨数，`c19/c21` 接入官方 Dataspan 托管 bar list，`c20` 接入许可 WGC 月表，`c22` 接入官方 UOI×Metal Entitlement。不得用池化 bar list、NAV/AUM/金价或份额反推。`c09/c10/c16/c25` 必须等六只同一官方 as-of 日期数据齐全后刷新；当前仍无这样的新增日期。
