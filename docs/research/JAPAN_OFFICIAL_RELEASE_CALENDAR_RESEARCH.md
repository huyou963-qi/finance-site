# 日本官方数据发布日历调研

更新日期：2026-09-10  
范围：已接入的日本 CPI、劳动力、METI 工业生产、ESRI GDP、BOJ 宏观、MOF 国债收益率，以及下一批拟接入的厚生劳动省每月勤劳统计。  
目的：为 `release_package` 确定官方发布时间来源、解析方式与 `economic_calendar` / `probe_interval` 调度策略。本文件只记录只读调研结果，不改变现有抓取器或数据库。

## 结论与优先级

除财务省国债收益率外，现有日本宏观发布包都有可用的官方未来发布日程，可从固定 URL 解析，不必继续依赖固定间隔探测，更不应以 TradingEconomics 代替官方日历。

| 发布包 / 数据域 | 官方日历 | 已确认时间 | 未来日期覆盖 | 建议调度 |
|---|---|---:|---|---|
| `jp.sbj.cpi` 全国 CPI | 总务省统计局 CPI 日程 + e-Stat | 08:30 JST | 约一个年度 | `economic_calendar`，发布后 10 分钟运行 |
| `jp.sbj.tokyo_cpi` 东京都区部 CPI | 同上，独立事件列 | 08:30 JST | 约一个年度 | 独立 `economic_calendar`，发布后 10 分钟运行 |
| `jp.stat.labor_force` 劳动力调查 | 总务省 XML + e-Stat | 基本集计 08:30；详细集计 14:00 JST | 约一个年度 | 当前序列只匹配基本集计；发布后 10 分钟运行 |
| MHLW 每月勤劳统计 | 厚劳省 XML + e-Stat | 速報、確報均通常为 08:30 JST | 约一个年度 | 同一发布包匹配速報和確報，两次均全历史刷新 |
| `jp.meti.iip` 工业生产指数 | e-Stat 统计日历 + METI 页面 | 速報 08:50；確報 13:30 JST | 约一个年度 | 匹配速報和確報，两次均全历史刷新 |
| `jp.esri.gdp` GDP | 内阁府 ESRI 发布日程 | 一次、二次速報均 08:50 JST | 多个未来季度 | `economic_calendar`；年度国民经济核算中只有模糊日期的项目另保留低频探测 |
| BOJ 六个发布包 | BOJ 半年更新 XLSX + 当周日历 | 时间序列通常 08:50 JST | 未来约 12 个月 | 六包均改用 `economic_calendar`；当周日历覆盖临时调整 |
| `jp.mof.jgb_yields` 国债收益率 | MOF 发布时间说明，无逐日年历 | 下一营业日 09:30 JST | 无 | 保留 `probe_interval` 24 小时，尽量安排在 09:40 JST 后 |

所有时间均为日本标准时间 JST（UTC+9，无夏令时）。调度入库时应转为 UTC；建议的“发布后 10 分钟”用于吸收网页、文件或 API 在名义发布时间后的短暂延迟，失败后继续使用共享退避重试。

## 1. 总务省统计局 CPI

### 官方来源

- 总务省统计局英文全年日程：[Release Schedule](https://www.stat.go.jp/english/data/cpi/1582.htm)
- e-Stat 稳定统计日历：[Consumer Price Index](https://www.e-stat.go.jp/release-calendar/statistics/00200573)
- 总务省 CPI 常见问题：[FAQ](https://www.stat.go.jp/english/data/cpi/1585.html)

英文日程页是静态 HTML 表，分别列出全国 CPI 和东京都区部 CPI 的参考月份及发布日期。e-Stat 页面以事件列表形式同时包含全国、东京都区部、年度/年度平均及基期改定等事件，事件标题、发布日期和时间均可见。

统计局说明的通常规则是：全国上月 CPI 在包含每月 19 日的那一周周五 08:30 发布；东京都区部当月初值在包含 26 日的那一周周五 08:30 发布。节假日会改变具体日期，因此只能用于合理性校验，不能替代官方表的实际日期。

2026 年可验证示例：

- 全国 2026 年 8 月数据：2026-09-18 08:30 JST。
- 东京都区部 2026 年 9 月数据：2026-10-02 08:30 JST。
- 2025 年基期接续指数历史重算：2026-08-07 16:00 JST。这类一次性基期改定事件不应误触发普通月度包，应单独识别或忽略。

### 调度建议

`jp.sbj.cpi` 和 `jp.sbj.tokyo_cpi` 必须保持两个独立发布包。解析时按日历事件标题精确区分“全国”和“東京都区部”，并排除年度平均、年度、基期改定及其他非月度事件。两个包均用 `economic_calendar`，在官方时刻后 10 分钟触发。日历同步建议每日低频检查一次。

## 2. 总务省劳动力调查

### 官方来源

- 总务省统计局英文全年日程：[Labour Force Survey Release Schedule](https://www.stat.go.jp/english/data/roudou/1543.html)
- 总务省日文发布安排页（提供 PDF 与 XML）：[調査結果の公表予定](https://www.stat.go.jp/data/roudou/index2.html)
- 机器可读 XML：[e-stat_roudou.xml](https://www.stat.go.jp/data/kouhyou/e-stat_roudou.xml)
- e-Stat 稳定统计日历：[Labour Force Survey](https://www.e-stat.go.jp/release-calendar/statistics/00200531)
- 2026 年 PDF：[2026 年公表予定](https://www.stat.go.jp/data/roudou/pdf/kohyo26.pdf)

机器可读 XML 是 UTF-16 BOM 文档，根节点为 `e-stat`，层级为 `os_code/class_1/class_2/.../class_5`。末端事件包含 `release_year`、`release_month`、`release_day`、`release_hour`、`release_minute`，并可能带 `internet_url`。2026 日程文件中可解析到从 2026-01-30 08:30 至 2027-03-30 08:30 的未来事件。

劳动力调查有两种主要发布：

- 基本集计：通常 08:30 JST，覆盖就业人数、失业人数、失业率等当前已接入的 12 条序列。
- 详细集计：通常 14:00 JST，属于另一组详细就业结构结果。

### 调度建议

`jp.stat.labor_force` 当前成员只应匹配“基本集計”事件，不能因同月“詳細集計”再次误触发。首选直接解析官方 XML，e-Stat 统计日历作为官方后备和人工校验来源。改为 `economic_calendar`，在 08:40 JST 触发；若以后接入详细集计，应建立独立发布包并按 14:00 JST 调度。

## 3. 厚生劳动省每月勤劳统计

### 官方来源

- 厚生劳动省结果页：[毎月勤労統計調査](https://www.mhlw.go.jp/toukei/list/30-1.html)
- 机器可读 XML：[e-stat_maikin.xml](https://www.mhlw.go.jp/toukei/kouhyou/e-stat_maikin.xml)
- e-Stat 稳定统计日历：[毎月勤労統計調査](https://www.e-stat.go.jp/release-calendar/statistics/00450071)

XML 是固定 URL 的结构化日历，根节点为 `e-stat`，下含调查、结果分类和具体发布事件；事件同样提供年、月、日、时、分字段。当前文件可见约一个年度的安排，实测日期范围为 2026-01-08 08:30 至 2027-02-26 08:30。

e-Stat 事件页明确区分速報和確報。例如 2026 年 7 月结果的速報为 2026-09-08 08:30 JST，確報为 2026-09-28 08:30 JST。结果页也说明历史数据会随確報、季节调整和基准修订更新。

厚劳省的[统计调查实施日程](https://www.mhlw.go.jp/stf/toukei/schedule.html)描述的是调查实施，不是结果发布时间，不能作为调度源。

### 调度建议

正式接入工资、工时和就业序列时，建立一个 MHLW 月度发布包，同时接受“速報”和“確報”两类事件。每次事件都进行完整历史刷新，以吸收初值修订和季节调整回溯；发布后 10 分钟运行。若数据模型需要区分 vintage，应在抓取账本记录抓取时点和事件类型，但不要把账本误作历史首发 PIT 数据。

## 4. METI 工业生产指数

### 官方来源

- 经济产业省 IIP 首页：[Indices of Industrial Production](https://www.meti.go.jp/statistics/tyo/iip/)
- e-Stat 稳定统计日历：[鉱工業指数](https://www.e-stat.go.jp/release-calendar/statistics/00550300)

METI 页面说明已发布覆盖 2025 年 11 月至 2027 年 2 月的发布时间表。e-Stat 的统计专页把每个事件列成日期、时间和标题，能稳定区分速報与確報。已确认的常规发布时间为：

- 速報：08:50 JST。
- 確報：13:30 JST。

例如 2026 年 8 月速報为 2026-09-30 08:50，確報为 2026-10-15 13:30。

### 调度建议

`jp.meti.iip` 改用 `economic_calendar`，同时匹配速報和確報，并按参考月份去重。现有抓取器读取完整历史工作簿，因此两次触发都应全历史刷新，以接收季节因子和历史修订。METI 部分页面对自动请求可能返回 403，调度解析应优先使用同一官方统计的 e-Stat 日历，不应尝试绕过访问控制。

## 5. 内阁府 ESRI GDP

### 官方来源

- 内阁府经济社会综合研究所英文发布日程：[Release Schedule of National Accounts](https://www.esri.cao.go.jp/en/sna/kouhyou/kouhyou_top.html)

该页是静态 HTML 表，列出参考期、发布阶段、日期和时间。当前可见多个未来季度。例如：

- 2026 年三季度一次速報：2026-11-16 08:50 JST。
- 2026 年三季度二次速報：2026-12-08 08:50 JST。
- 2026 年四季度一次速報：2027-02-15 08:50 JST。
- 2026 年四季度二次速報：2027-03-09 08:50 JST。

页面明确提示日程可能变更，实际文件有时会在名义时刻之后才可读取。季度 GDP 的一次、二次速報有精确日期和时间；年度国民经济核算中的少数项目可能只写“12 月中旬以后”等模糊描述。

### 调度建议

`jp.esri.gdp` 对季度一次、二次速報采用 `economic_calendar`，在 09:00 JST 首次抓取并使用共享退避重试；每次做完整历史刷新以接收修订。解析器应拒绝把模糊日期强行转换成任意时刻。若当前包也需要吸收仅有模糊窗口的年度修订，可额外保留每周一次的低频 `probe_interval`，但不能覆盖或删除已解析到的精确未来事件。

## 6. 日本银行宏观数据

### 官方来源

- BOJ 统计发布安排说明：[Schedule for Releases of Statistical Data and Publications](https://www.boj.or.jp/en/statistics/outline/)
- 未来约 12 个月 XLSX：[Schedule for Releases](https://www.boj.or.jp/en/statistics/outline/tkohyos.xlsx)
- 当前每周日历：[BOJ Time-Series Data Search Calendar](https://www.boj.or.jp/en/about/calendar/index.htm)
- 贷款数据归档：[Principal Figures of Financial Institutions](https://www.boj.or.jp/en/statistics/dl/depo/kashi/index.htm)
- 短观归档：[Tankan](https://www.boj.or.jp/en/statistics/tk/yoshi/index.htm)

BOJ 说明 XLSX 大约每年 6 月和 12 月更新，覆盖未来约 12 个月；标为时间序列的项目通常约 08:50 JST 发布。当前周日历一般每周五更新，按日列出精确时间与标题，适合覆盖半年表发布后的临时调整。

与现有六个发布包对应的官方标题为：

| 发布包 | 日历标题匹配 |
|---|---|
| `jp.boj.money_stock` | `Money Stock` |
| `jp.boj.monetary_base` | `Monetary Base` / `Monetary Base and the Bank of Japan's Transactions` |
| `jp.boj.cgpi` | `Corporate Goods Price Index` |
| `jp.boj.sppi` | `Services Producer Price Index` |
| `jp.boj.bank_lending` | `Principal Figures of Financial Institutions` |
| `jp.boj.tankan` | `Tankan` 的 Summary、Outline、Comprehensive Data Set |

当前日历中的可验证例子包括：2026-09-07 08:50 Monetary Base、09-08 08:50 Principal Figures、09-09 08:50 Money Stock、09-11 08:50 Corporate Goods Price Index、09-28 08:50 Services Producer Price Index；Tankan 的 Summary/Outline 为 2026-10-01 08:50，Comprehensive Data Set 为 2026-10-02 08:50。

### 调度建议

六个 BOJ 包均可改为 `economic_calendar`。每半年解析 XLSX 作为长周期基线，每日低频读取当前周日历并以其精确时间覆盖临时调整。标题匹配必须用归一化后的白名单，不应使用宽泛的 `includes("price")` 等规则。

Tankan 应在 Summary/Outline 发布后运行一次，并在次日 Comprehensive Data Set 发布后再运行一次，因为两次文件覆盖不同且完整数据集更晚。其他五包在对应标题发布后 10 分钟运行。

## 7. 财务省日本国债收益率

### 官方来源

- 财务省英文说明：[Interest Rate Q&A](https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/qa.htm)
- 财务省发布时间通知：[国債金利情報の公表時間](https://www.mof.go.jp/jgbs/reference/interest_rate/p230729.htm)

财务省说明该表按每个营业日 15:00 的市场收盘水平计算，于下一营业日 09:30 JST 发布。官网没有与 CPI 或 GDP 类似的全年逐日发布事件表，节假日也使简单工作日推算存在误差。

### 调度建议

`jp.mof.jgb_yields` 保留 `probe_interval` 24 小时。若调度器支持固定日内窗口，首次运行安排在 09:40 JST 之后；若不支持，继续滚动探测即可。周末、节假日或源尚未增加新观测时应记为正常无更新，不应算失败。不要为了形式统一生成一份推算的“官方日历”。

## 8. 页面结构、缓存与失败语义

建议新增一个 `jp_official` 日历 provider，而不是把这些事件映射进遗留 TE 日历。它需要三类解析器：

1. UTF-16 XML：总务省劳动力调查、厚劳省每月勤劳统计。
2. 静态 HTML 表/事件列表：统计局 CPI、e-Stat 统计专页、ESRI GDP、BOJ 当前周日历。
3. XLSX：BOJ 未来约 12 个月日程。

每次同步保存最小证据快照：来源 URL、抓取时间、内容哈希、解析器版本、解析出的事件标题与 JST 时刻。日历刷新建议每日一次；BOJ XLSX 即使半年更新，也可每日做条件请求或低频每周检查，当前周页面每日检查。

以下情况应使日历同步失败并告警，且必须保留数据库中已有的未来 `nextRunAt`，不能清空或退回 TE：

- 页面返回 200 但解析到零条事件。
- 同一标题和参考期出现冲突时间。
- 新版本让大量未来事件无解释地消失。
- 日期倒退、年份解析异常，或页面变成登录/验证码/错误页。
- XML/XLSX 编码、列名或层级发生不可识别变化。

## 9. robots 与使用条款

本次仅访问公开、无需登录的政府发布页和静态文件，未访问或输出任何密钥。

| 站点 | robots / 条款结果 | 风险与要求 |
|---|---|---|
| `stat.go.jp` | [robots.txt](https://www.stat.go.jp/robots.txt) 仅明确禁止 `/library/opac/`，目标日程路径未禁止；[使用条款](https://www.stat.go.jp/english/info/riyou.html)采用日本政府标准条款 | 可低频抓取；展示或再利用时注明来源，编辑内容需说明 |
| `e-stat.go.jp` | [robots.txt](https://www.e-stat.go.jp/robots.txt) 禁止若干管理、登录、搜索和内部路径，未禁止 `/release-calendar/`；[网站条款](https://www.e-stat.go.jp/en/terms-of-use)允许包括商业目的的再利用 | 使用稳定统计专页，低频抓取并注明来源；不要抓站内搜索结果替代固定 URL |
| e-Stat API | [API 条款](https://www.e-stat.go.jp/api/en/terms-of-use)要求注册、不得造成过量负载，并要求注明来源；[署名说明](https://www.e-stat.go.jp/api/en/api-info/credit) | 日历抓取本身不需要 API key；数据抓取继续遵守现有 `ESTAT_APP_ID` 管理和速率限制 |
| `mhlw.go.jp` | [robots.txt](https://www.mhlw.go.jp/robots.txt)未禁止 `/toukei/kouhyou/`；[使用条款](https://www.mhlw.go.jp/chosakuken/)采用日本政府标准条款 | XML 可低频抓取；注明来源及加工事实 |
| `meti.go.jp` | 自动请求 robots 时可能返回 403，无法据此证明允许抓取 | 调度优先使用 e-Stat 的官方统计日历镜像；不绕过 METI 访问控制 |
| `esri.cao.go.jp` / `cao.go.jp` | ESRI robots 端点未提供有效规则；[内阁府条款](https://www.cao.go.jp/notice/rule.html)采用日本政府标准条款 | robots 缺失不等于许可；只对公开日程页低频请求，注明来源 |
| `boj.or.jp` | robots 端点未提供有效规则；[BOJ Copyright](https://www.boj.or.jp/en/about/copyright.htm)要求来源标注，并对商业网站复制、转载保留事前联系要求 | 发布日期和时间属于事实元数据，但商业产品应保守处理：只存事件元数据与来源链接，不复制页面正文；现有 BOJ API 的署名和服务条款要求继续适用 |
| `mof.go.jp` | robots 端点未提供有效规则；[MOF Terms](https://www.mof.go.jp/english/about_mof/notice/index.html)采用日本政府标准条款 | 只低频读取公开说明和数据文件，注明来源 |

robots 端点返回 404 或不可读取不能视为抓取授权。实现仍应使用清晰 User-Agent、合理限速、条件请求、缓存和退避；如果官方站明确限制自动访问，应切换到其官方镜像或保留探测，而不是绕过限制。

## 10. 实施顺序

建议按以下批次落地，以便每批均可独立验证：

1. CPI 全国、东京区部和劳动力调查：总务省来源最稳定，XML/HTML 结构清楚，先替换现有 probe。
2. MHLW 每月勤劳统计：在正式接入工资数据时同步建立速報/確報双事件调度。
3. METI IIP 与 ESRI GDP：分别处理速報/確報和一次/二次速報，确保历史修订能被重新抓取。
4. BOJ 六包：完成 XLSX 长期表与当周页面的合并逻辑，再统一替换六个 probe。
5. MOF JGB：继续 24 小时探测，仅把日内运行时刻靠近 09:40 JST。

每批验证至少应覆盖：解析到的未来事件数、UTC 转换、发布包成员 fan-out、发布时点后实际数据可用性、官方页面临时失败时保留旧 `nextRunAt`，以及标题变化不会误匹配其他统计。
