# 日本宏观、金融与二级市场数据源调研

## 结论摘要

日本并不存在一个覆盖宏观、金融和证券市场所有维度的单一 API。最合理的生产组合是：用 **e-Stat** 做跨部门官方统计的目录和主 API，用 **日本银行（BOJ）时序统计 API** 做货币金融、价格和国际收支的高频主源，用 **EDINET API** 做上市公司法定披露，用 **JPX 的商业授权产品** 做可公开展示的证券市场行情与指数；其余主管部门以可下载 CSV/XLSX 为主，做发布日程驱动的文件抓取。

截至 2026-09-09，BOJ 已于 2026-02-18 上线 JSON/CSV 时序 API；这是日本金融宏观接入中最重要的近期变化。[1] e-Stat 也提供正式 REST API，但需注册并申请应用 ID；其强项是跨府省的表、分类和元数据，而不是保证每个部门自建网页所展示的数据都实时可 API 化。[2]

二级市场需把“数据能下载”与“可对外再分发”分开看。JPX 的 J-Quants API 是面向个人的订阅服务；其免费层有 12 周延迟，个人 API 订阅不能直接视为金融网站的公开分发授权。JPX 的 Pro 授权表对 open website/data-feed 单列定价与许可范围，应在上线前取得书面商业授权。[3][4]

## 获取方式分级

| 级别 | 含义 | 生产接入方式 | 典型来源 |
|---|---|---|---|
| A | 有公开、文档化 REST/API | 保存密钥；以元数据发现 + 增量拉取 + 原始响应归档为标准 adapter | e-Stat、BOJ、EDINET、MLIT 不动产信息库 |
| B | 官方稳定下载文件（CSV/XLSX/SDMX） | 发布日历触发；下载后做 schema/文件哈希/修订检测 | 内阁府、METI、财务省、海关、JNTO、JPX 免费统计 |
| C | 官方网页查询器或 PDF/HTML 公告为主 | 仅在无 B/A 路径时解析；留存原文件与版本，设置解析告警 | 海关明细检索、部分 MHLW、JMA、行业协会 |
| D | 付费/合约数据 | 先做再分发权、展示延迟和缓存期的合同审查；不得以个人账户替代 | JPX 实时/历史市场数据、指数、J-Quants Pro |

**重要边界：** API 并不等于免注册、无限制或允许再发布。e-Stat 明确要求账户和 Application ID；EDINET API 需要注册取得 API key；BOJ 要求遵守 API 注意事项，若发布使用该 API 的服务还要求通知 BOJ。[2][5][6]

## 发布部门与可用数据集总览

下表列的是适合建设“日本国家页 / 宏观仪表盘 / 日本市场页”的主要、可持续数据集，而非把 e-Stat 中的全部统计表逐一罗列。

| 主管/发布机构 | 重点数据集与维度 | 常见频率 | 最佳官方获取路径 | 分级 | 备注 |
|---|---|---:|---|---|---|
| 总务省统计局（SBJ/MIC）与 e-Stat | CPI、劳动力调查（就业/失业）、人口估计、住户收支、零售物价、人口普查、住宅土地、经济普查、社会人口统计 | 月/季/年/普查 | e-Stat REST；统计局 CSV/XLSX/PDF | A/B | CPI、劳动力、家庭消费是宏观核心；e-Stat 还汇集各府省公开统计表。[2][7] |
| 内阁府 ESRI | 季度/年度 GDP、支出/生产/收入法、平减指数、部门账户、资本存量、投入产出表 | 季/年 | 官方 CSV/XLSX；SDDS Plus/IMF SDMX | B | GDP 当期发布页面提供多张 CSV；季调历史会随每次发布回溯修订。[8][9] |
| 内阁府经济财政分析 | 景气动向指数（CI/DI）、景气观察者调查、消费者信心、机械订单 | 月 | CSV/XLSX/PDF 下载 | B | 景气观察者的全国/地区/行业 DI 有 2001 年以来的 Excel 时序。[10] |
| 经济产业省（METI） | 工业生产指数 IIP、生产/出货/库存、生产预测、商贸动态（零售/批发）、第三产业活动、服务业、特定服务业、工矿业生产动向 | 月/年 | METI 下载页，或 e-Stat 中相应统计表 | A/B | IIP 有 CSV 与 Excel 历史数据；生产动向调查提供商品、产能和开工率细项。[11][12] |
| 厚生劳动省（MHLW） | 每月勤劳统计（工资、工时、就业人数、实际工资）、一般职介、工资结构、人口动态、社会保障 | 月/年 | e-Stat 优先；MHLW XLSX/PDF 下载 | A/B/C | “劳动力调查”测劳动供给/失业，MHLW 每月勤劳统计测企业端工资和工时，两者不可替代。[13] |
| 财务省/财务综合政策研究所（MOF/PRI） | 法人企业统计（资产负债、利润、资本开支、库存、行业/资本金分层）、法人企业景气预测 BSI、国家财政/JGB、外汇干预 | 季/年/日 | e-Stat 时序表、MOF XLSX/CSV、公告 | A/B | 法人企业季度表可追溯至 1954Q2，年表至 1960；是资本开支、利润率和企业杠杆的权威 aggregate 源。[14][15] |
| 财务省关税局/日本海关 | 货物贸易：出口/进口金额、数量、HS 9 位品目、国别、概况品；贸易条件 | 月/年 | 固定 CSV 下载；网页查询器；e-Stat 链接 | B/C | 时序 CSV 覆盖 1979 年以来；明细查询维度强，但不是已文档化 REST API。[16][17] |
| 日本银行（BOJ） | 货币存量、货币基础、贷款贴现、资金循环、短观、企业物价 CGPI、服务价格 CSPI、投入产出物价、企业服务价格、BOP、汇率、利率及金融市场统计 | 日/月/季 | BOJ Time-Series Data Search API（JSON/CSV） | A | BOJ 自身说明覆盖 Money Stock、Flow of Funds、Tankan、CGPI、BOP；BOP 是受 MOF 委托编制。[1][6] |
| 财务省国际局 + BOJ | 国际收支、直接/证券投资、国际投资头寸 IIP、外债、对外/对内证券投资、外储 | 周/月/季/年 | MOF CSV/XLSX/SDMX；BOJ API 获取细项 | A/B | 证券跨境流量有周度和月度；BOP 月度时序自 1996 年起；MOF 页面明确把更细明细导向 BOJ 时序库。[18][19] |
| 金融厅（FSA） | EDINET：有价证券报告书、半年度报告、临时报告、大量持股报告；XBRL taxonomy/code list；银行/保险监管资料 | 日/事件 | EDINET REST API：JSON 文件清单、ZIP XBRL、PDF | A | API v2、响应格式与申请机制均为官方明示；适合日本上市公司基本面、持仓和事件文本，不是行情源。[5][20] |
| 日本交易所集团（JPX/TSE/OSE/TOCOM） | 个股 OHLC、复权、财报、上市公司主数据、股息、财报日历、投资者别交易、TOPIX、期权、融资余额、卖空、TDnet | 日/周/事件/盘中 | J-Quants API；JPX 公开统计下载；商业实时/历史 feed | A/D，部分 B | J-Quants 提供价格、公司财务、上市公司列表、股息、日历；tick/minute 与 TDnet 文件是 add-on，且不是实时。[3] |
| 日本证券业协会（JSDA） | 证券公司、股票/债券/衍生品、PTS、投信、线上证券交易、证券化等成员报送统计 | 周/月/季/年 | 官网表格/PDF/下载页 | B/C | 内容很广，但官网未提供可依赖的通用 REST API；适合补充融资、债券、行业活动指标。[21] |
| 投信投顾相关协会（JITA 等） | 公募投信资产净值、资金流、基金数量、投资者结构 | 月 | 协会 CSV/XLSX/PDF 页面 | B/C | 用作家庭风险资产配置、基金流量的补充；应逐源确认使用/再发布条款。 |
| 国土交通省（MLIT） | 新屋开工、建筑施工、地价公示、住宅/土地、运输、港口、住宿旅行；不动产交易价格 | 月/季/年/交易 | e-Stat/下载；不动产信息库 External API | A/B | 不动产信息库有外部 API 手册；住宅开工和建设统计适合地产周期。[22][23] |
| JNTO/观光厅 | 入境人数、国别、旅行目的、消费、住宿、地区到访和过夜 | 月/季/年 | JNTO 统计站 CSV；观光厅/e-Stat | B | JNTO 页面允许下载多种可定制 CSV；旅游是日本外需与服务出口的高频补充。[24] |
| 农林水产省（MAFF） | 农产品产量/价格、食品供需、库存、农业所得、林业、渔业、农产品贸易 | 月/年 | e-Stat 与 MAFF XLSX 年鉴/专题表 | A/B | 年鉴将食品、农林渔业、价格、金融等分为 19 个主题；更适合中低频产业分析。[25] |
| 资源能源厅/环境省/JMA | 能源供需、电力、燃料、温室气体、废弃物、气候/天气观测 | 日/月/年 | 部门下载/网页查询；部分 e-Stat 表 | B/C | 环境省有年度 Excel 环境统计集与排放数据链接；JMA 的公开网页数据不要当作已承诺的商用 API。[26][27] |

## 各维度的推荐指标包

### 1. 经济增长、需求与企业周期

优先建立以下月度—季度链条：

1. **GDP / GDP deflator / 分支出贡献 / 生产侧增加值**：ESRI 季度 GDP；保留每一次 vintage（初值、二次值、基准改定后值），不能只覆盖最新点。[8]
2. **工业和库存周期**：METI IIP 的生产、出货、库存、库存率与行业/财别分项；再接 Current Survey of Production 的实物产量、产能和开工率。[11][12]
3. **消费与家庭**：统计局家庭收支、消费动向、零售价格及 CPI；METI 商业动态中的零售/批发。
4. **资本开支与企业利润**：MOF 法人企业统计的销售、经常利润、设备投资、库存、资产负债表；用 BSI 和 BOJ Tankan 做领先判断。[14][15]
5. **领先/软数据**：内阁府 CI/DI、景气观察者、消费者信心、机械订单；景气观察者应单列现状与先行判断、行业和地区。[10]

### 2. 通胀、劳动力与居民部门

* **CPI**：全国与东京区部、总项、除生鲜、除生鲜能源、10 大类/细项、权重和基期衔接；统计局在 2026 年开始发布 2025 基期 CPI，接入器必须接受基期替换和历史回算。[7]
* **工资/工时**：MHLW 每月勤劳统计的名义工资、实际工资、加班、就业人数和行业分项；与劳动力调查的失业率、就业率、劳动参与率、雇佣形态合用。[13]
* **人口和住房**：人口估计、迁徙、家庭、住房土地；这是老龄化、空置住房和区域消费长期研究的底座。

### 3. 货币、信用、利率与资产负债表

BOJ API 是首选：货币基础/货币存量、贷款、存款、金融机构资产负债、资金循环（居民、企业、政府、海外部门的金融资产负债）、短观、CGPI/CSPI，以及收益率/汇率相关时序。[1][6]

MOF 补全财政和外部账户：JGB 发行/余额、预算执行、外汇干预、BOP/IIP/外债；对外证券投资周度流量是观察日本资金配置海外资产的关键数据。[18][19]

### 4. 外贸、汇率与国际收支

* 海关贸易：总额—区域—国家—HS9 品目的值量，适用于半导体设备、汽车、能源、农产品等专题；固定历史 CSV 适合批量回填，网页查询器仅补细粒度缺口。[16][17]
* BOP/IIP：经常账户（货物、服务、初次/二次收入）、直接投资、证券投资、区域和产业分解；MOF 有 SDMX 链接，深度序列应优先 BOJ API。[18][19]
* 旅游：入境人次、国籍、消费、过夜与目的地，是服务出口的及时 proxy。[24]

### 5. 日本二级市场、公司基本面和持仓披露

| 用途 | 优先源 | 关键限制 |
|---|---|---|
| 个股日线、复权、股息、上市公司主数据、财报摘要和业绩日历 | J-Quants API | 个人计划的数据历史、延迟与使用范围受订阅限制；公开站点需审查 Pro/数据分发授权。[3][4] |
| 盘中/逐笔、期权、实时行情、指数实时值 | JPX 商业市场数据 | 必须合同授权；不可假定 J-Quants 的日更 minute/tick 可以替代实时 feed。[3][28] |
| 法定财报、XBRL、持股/大额持股、临时公告 | FSA EDINET API | 以 filing/document ID 建证据链；XBRL taxonomy 会升级；“证券代码—EDINET 代码”映射要版本化。[5][20] |
| 交易所层面成交、投资者别、卖空、月度报价、市场统计 | JPX 公开统计/CSV | 很多是免费查看或下载，但数据产品公开再分发仍要逐项确认条款。[28] |
| 融资、PTS、债券、投信、券商行业活动 | JSDA / 相应行业协会 | 通常为可下载统计，无统一 API；更适合作为周/月频因子补充。[21] |

不建议把 EDINET 当作价格源，也不要把免费或个人价的 J-Quants 数据直接写入对外产品。对于本项目，已经存在 Yahoo 的美股行情链；日本市场若要产品化，应单列 `jpx` 合规行情 provider，而非复用不具日本商用授权保证的网页源。

## “有 API”与“网页可取”的精确判断

### 可以直接建设正式 adapter 的来源

1. **e-Stat API（REST）**：可检索统计表、元数据、统计数据和数据目录，JSON/XML/简易 CSV 均有规范；必须用 Application ID。先以 `getStatsList`/`getMetaInfo` 找表和分类代码，再调用数据端点，避免硬编码日文表头。[2]
2. **BOJ Time-Series API**：2026 年上线，返回 JSON/CSV；先下载 catalogue/layer 与 series code，再增量取数。尤其适合 money stock、Tankan、物价、资金循环与 BOP。[1][6]
3. **EDINET API v2**：REST，JSON 清单和 ZIP/PDF 文件，需 API key；适合批量法定披露、XBRL fact 解析和大额持股事件。[5][20]
4. **MLIT 不动产信息库 External API**：有正式 external API 手册和 endpoint；上线前应确认认证、配额与二次利用规则。[22]

### 应按“文件发布源”建设的来源

ESRI GDP、内阁府景气观察者、METI IIP/生产、MOF 企业统计与贸易、海关、JNTO、MAFF、MHLW 和 JPX 免费统计，均有稳定的 CSV/XLSX/PDF 发布页面或历史文件。[8][10][11][14][16][24] 这些不应被称为“网页爬虫源”：优先抓取页面明确链接的静态 CSV/XLSX，按发布日期建 release package，校验内容哈希、表结构和最新观测期。

### 只应作为最后手段的网页解析

海关的复杂品国交叉检索、部分部门的月报 HTML/PDF、JMA 网页查询和行业协会历史表可能只能靠页面交互取得。应只解析已公开、无登录、许可允许的页面；不得绕过 robots、验证码、登录或付费墙。对这类来源应保留 URL、下载时间、原文件、解析器版本和单元测试 fixture。

## 面向本仓库的数据接入建议

### P0：先形成日本宏观最小可用闭环

| 域 | 建议首批序列 | 上游/方式 |
|---|---|---|
| 增长 | 实质/名义 GDP、GDP deflator、分支出贡献、IIP 生产/出货/库存 | ESRI CSV；METI CSV |
| 通胀 | CPI 总项、核心、核心核心、10 大类；CGPI/CSPI | e-Stat；BOJ API |
| 劳动 | 失业率、就业人数、劳动参与率、名义/实际工资、加班 | e-Stat；MHLW/e-Stat |
| 消费 | 家庭消费、零售销售、消费者信心 | e-Stat；METI；内阁府 |
| 政策与金融 | 政策利率相关、货币存量、贷款、短观、JGB 收益率/发行 | BOJ API；MOF |
| 外部部门 | 出口/进口、贸易差额、经常账户、入境游客 | 海关 CSV；BOJ API/MOF；JNTO CSV |

这批数据可完全使用官方源，除 e-Stat 账户外不依赖付费市场数据。优先复用现有 scheduler、`data_subscription`、canonical observation writer、release package 与 catalog taxonomy；不要为日本另建平行的观测表或调度模型。

### P1：金融账户、行业与地产

接入 BOJ 资金循环、部门信贷、IIP/外债、跨境证券投资、MOF 法人企业统计、MLIT 新屋开工和不动产交易价、旅游、能源及农产品生产/价格。对所有“最新发布修订历史”的源，数据模型应保留 `as_of/release_date` 或至少留原始快照，GDP、CPI 基期和季调序列尤其如此。

### P2：日本二级市场产品化前置条件

1. 明确产品是内部研究、仅登录用户还是公开网站，以及是否展示实时、延迟或 EOD 数据。
2. 与 JPX/授权经销商确认对应产品的 **公开展示、缓存、衍生指标、再分发、用户数和地域** 权利；个人 J-Quants 方案不能替代此步骤。[3][4]
3. 将行情、公司行动、公告和财报分源：JPX（价格/公司行动/指数）、EDINET（法定 disclosure）、TDnet（适时披露，按授权）。
4. 采用本项目既有的 DB-first、复权和 source provenance 设计，但不复制美国 Yahoo adapter；日线与公司行动必须有同一可审计 source of truth。

## 实施风险清单

* **日文与分类码：** e-Stat API 的值依赖统计表 ID 与分类代码；UI 翻译不能替换原始日文代码和表版本。[2]
* **修订与基期：** GDP 的季调历史会回溯修订；CPI 已从 2020 基期进入 2025 基期。数据层必须标记 `preliminary/revised/final` 和基期。[7][8]
* **日期语义：** 日本财政年度为 4 月至次年 3 月；MOF 企业统计同时有 fiscal/calendar series。不要把 FY 标识成自然年。[14]
* **量纲与符号：** 海关贸易是日元千元；BOP/跨境证券投资的净买卖符号在历史口径中有说明，且 2014 年起的解释发生过反转。[16][19]
* **跨部门主从：** BOP/IIP 发布页属于 MOF，但编制细项/时序应以 BOJ API 作为数据 retrieval 主源；MOF 页面适合 release calendar 与高层校验。[6][18]
* **许可：** 公开可下载不自动赋予商用再发布权。交易所价格、指数和实时数据风险最高；上线前做 source-by-source license matrix。[3][4][28]
* **网页稳定性：** 下载链接、文件名、Excel sheet 常变；先用 release-page discovery + 静态文件下载，网页解析只作为 fallback。

## 建议的源优先级

1. **e-Stat + BOJ API**：宏观金融通用底座。
2. **ESRI / METI / MOF / Customs 静态数据**：填 GDP、实体部门、企业部门、贸易与财政外部账户。
3. **EDINET API**：日本公司财报与披露事实底座。
4. **MLIT / JNTO / MAFF**：地产、旅游、农业等专题维度。
5. **JPX/JSDA**：只有在授权模式已确定后再把二级市场数据对外产品化。

## Sources

1. 日本银行， [Launch of API Service for BOJ Time-Series Data Search](https://www.boj.or.jp/en/statistics/outline/notice_2026/not260218a.htm)，2026-02-18。
2. e-Stat， [API 使用说明与规范](https://www.e-stat.go.jp/api/en/api-dev/how_to_use)；[User Guide](https://www.e-stat.go.jp/api/en/api-info/api-guide)。
3. 日本交易所集团， [J-Quants API](https://www.jpx.co.jp/english/markets/other-data-services/j-quants-api/index.html)。
4. JPX Market Innovation & Research， [J-Quants Pro: Pricing and Usage Table](https://pro.jpx-jquants.com/pdfs/appendix-1-2-pricing-and-usage-table-en.pdf)。
5. 金融厅， [EDINET API documentation](https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WEEK0060.html)；[e-Gov API Catalog entry](https://api-catalog.e-gov.go.jp/info/ja/apicatalog/view/33)。
6. 日本银行， [Outline of Statistics and Statistical Release Schedule](https://www.boj.or.jp/en/statistics/outline)。
7. 日本总务省统计局， [Consumer Price Index](https://www.stat.go.jp/english/data/cpi/)。
8. 内阁府 ESRI， [National Accounts / GDP Statistics](https://www.esri.cao.go.jp/jp/sna/menu.html)；[Quarterly GDP release archive](https://www.esri.cao.go.jp/en/sna/data/sokuhou/files/2025/toukei_2025.html)。
9. 内阁府 ESRI， [SDDS Plus](https://www.esri.cao.go.jp/en/sna/sddsplus/sddsplus_top.html)。
10. 内阁府， [Economy Watchers Survey time-series tables](https://www5.cao.go.jp/keizai3/watcher.html)。
11. METI， [Indices of Industrial Production](https://www.meti.go.jp/english/statistics/tyo/iip/index.html)。
12. METI， [Current Survey of Production](https://www.meti.go.jp/english/statistics/tyo/seidou/index.html)。
13. 厚生劳动省， [Monthly Labour Survey](https://www.mhlw.go.jp/toukei/list/30-1.html)。
14. 财务省财务综合政策研究所， [Financial Statements Statistics of Corporations by Industry](https://www.mof.go.jp/pri/reference/ssc/results/data.htm)。
15. 财务省财务综合政策研究所， [Business Outlook Survey](https://www.mof.go.jp/pri/reference/bos/results/data.htm)。
16. 日本海关， [Trade Statistics Time Series](https://www.customs.go.jp/toukei/suii/html/time_e.htm)。
17. 日本海关， [Trade Statistics downloads](https://www.customs.go.jp/toukei/info/tsdl_e.htm)；[detailed search](https://www.customs.go.jp/toukei/search/futsu1.htm)。
18. 财务省， [Balance of Payments](https://www.mof.go.jp/english/policy/international_policy/reference/balance_of_payments/index.htm)；[historical BOP tables](https://www.mof.go.jp/english/policy/international_policy/reference/balance_of_payments/ebpnet.htm)。
19. 财务省， [International Transactions in Securities](https://www.mof.go.jp/english/policy/international_policy/reference/itn_transactions_in_securities/index.htm)；[International Investment Position](https://www.mof.go.jp/english/policy/international_policy/reference/iip/index.htm)。
20. EDINET， [API key registration guidance](https://disclosure2.edinet-fsa.go.jp/week0020.aspx)。
21. 日本证券业协会， [Statistics](https://www.jsda.or.jp/en/statistics/)。
22. 国土交通省不动产信息库， [External API manual](https://www.reinfolib.mlit.go.jp/help/apiManual/xit001/)。
23. 国土交通省， [Statistics](https://www.mlit.go.jp/english/statistics.html)。
24. 日本政府观光局， [Japan Tourism Statistics](https://statistics.jnto.go.jp/en/)；[data list](https://statistics.jnto.go.jp/en/graph/)。
25. 农林水产省， [第 99 次农林水产省统计表](https://www.maff.go.jp/j/tokei/kikaku/nenji/99nennji/index.html)。
26. 环境省， [环境统计集](https://www.env.go.jp/doc/toukei/tokeisyu.html)。
27. 环境省， [温室气体排放与吸收量](https://www.env.go.jp/earth/ondanka/ghg-mrv/emissions/)。
28. 日本交易所集团， [Data & Statistics](https://www.jpx.co.jp/english/markets/index.html)。
