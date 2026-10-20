# 美国宏观一致预期：来源、成本与现有数据系统接入评估

日期：2026-10-12。用户当前选择：没有 TE 订阅，先评估来源与成本。本轮只读检查、一次已有 FMP API 只读探测及本文；不购买、不新增实时抓取、不改 schema、不写生产库。

## 结论

实际值沿用现有官方/FRED adapters、DataSubscription、发布包、MacroObservation、MacroObservationVintage 及统一 writer。一致预期是另一种调查事实，不能存成普通宏观指标，也不能由本站 nowcast 替代。

需要新增来源中立的“逐次发布/分项身份”和“一致预期不可覆盖快照”，由现有 scheduler 体系调度，现有事件 API 查询时投影到研究视图。先确认授权与样本，再选择 provider adapter。无需重写宏观抓取链。

## 1. 候选来源与成本

公开价格只是个人研究参考，不是站内展示报价；接口覆盖、历史版本、更新频率和实际合同需另行核实。

| 来源 | 公开参考 | 已核实能力 | 未确定项 |
|---|---|---|---|
| Trading Economics | 官方价格页检索可见 Standard $199/月，$49试用周，500 REST请求/月；动态价格页正文未完整显示档位，采购前需确认。Enterprise询价 | 调查Forecast、自有TEForecast、实际/前值/修订、事件ID、重要性、UTC时刻；声明提供PIT日历 | 本项目存储、公开/会员展示权；PIT如何还原某个发布前截止时刻；历史深度、延迟、报价 |
| FMP | 个人年付折算 Starter $19、Premium $49、Ultimate $99/月；经济日历所需档位未确认，展示另需协议 | 现有系统已使用FMP；stable economic-calendar样例有actual、estimate、previous、impact、unit；时间UTC | estimate是否调查均值/中位数及来源；未来预期非空率、稳定事件ID、修订/PIT、接口档位及展示授权 |
| Finnhub | 官方经济数据价页检索可见 $50/月、按季付、Personal Use；站内用途需另外确认 | 专门经济日历产品，价页列10年日历数据 | 调查口径、发布前版本与本项目商业展示费用；未做账号实测 |
| EODHD | Economic Events具体档位待确认；普通All-in-One公开$99.99/月不是该端点的确定报价 | 官方Economic Events文档有actual/previous/estimate及period/comparison | estimate调查来源、事件ID、发布时间精度、更新延迟、PIT和展示授权 |

官方来源：

- [TE价格](https://tradingeconomics.com/api/pricing.aspx?source=%2Fapi%2Fwidgets.aspx)、[TE字段](https://docs.tradingeconomics.com/economic_calendar/schema/)、[TE PIT](https://docs.tradingeconomics.com/economic_calendar/point-in-time/)。PIT页面虽声称时点数据，但示例主要是历史日期范围参数，没有清楚给出独立as-of参数；不能据此承诺完整发布前预期修订历史。
- [FMP经济日历](https://site.financialmodelingprep.com/developer/docs/stable/economics-calendar)、[FMP文档样例](https://site.financialmodelingprep.com/developer/docs)、[FMP价格与展示协议要求](https://site.financialmodelingprep.com/pricing-plans)、[FMP时区FAQ](https://site.financialmodelingprep.com/faqs?code=bulk)。
- [Finnhub经济数据价格](https://api.finnhub.io/pricing-economic-data-api)。
- [EODHD Economic Events](https://eodhd.com/financial-apis/economic-events-data-api)、[EODHD价格](https://eodhd.com/pricing)。

TE Forecast 是调查一致预期；TEForecast 是供应商模型，不可混用。TE日历说明称调查平均数，因此不能默认中位数。FMP/EODHD仅有estimate字段名称尚不足以证明它符合用户要求的市场调查一致预期。

已有FMP探测：使用已有环境配置，单次请求2026-10-12—2026-10-26，HTTP429，提示Limit Reach。未输出密钥、请求完整URL，未重复请求。429不能证明端点未授权，也不能证明可以访问，待额度恢复或账号档位确认后再检验样本。

未确认有可直接用于本项目自动采集、存储和展示且覆盖完整的免费一致预期源。公开可阅读不自动等于授权长期采集与站内展示。官方数据源可继续解决实际值和日程。

## 2. 与当前底座的分工

| 内容 | 复用/新增 |
|---|---|
| 发布包定义及宏观序列成员 | 复用ReleasePackage、ReleasePackageMember、releasePackageCatalog |
| 官方计划与抓取排程 | 复用日历adapter和scheduler；nextRunAt不是发布时间 |
| 当前实际数据 | 复用MacroObservation与upsertMacroObservations |
| 可见版本事实 | 复用MacroObservationVintage与appendMacroObservationVintages |
| 每次报告及分项身份、改期状态 | 新事实：发布实例；关联包、指标/指标变换、参考期、provider事件ID |
| 每个时点的调查预期 | 新事实：append-only预期快照；不可塞进MacroObservation |
| 新闻政策背景 | 复用MarketEvent与现有Skill |
| 图表和预期差 | 现有API读取上述事实，复用macroEventSurprise；模型结果不写宏观基础库 |

现有TE web client只解析标题、时间和国家，importance当前也写null；不能仅打开开关就得到预期值。若选TE，授权API协议作为同一TE来源目录下的扩展，共享类型、限流、解析与日志；不在页面另写fetch。

## 3. 发布与快照的新事实语义

发布实例至少包含：releasePackageId（可暂未映射）、指标/口径ID、参考期、provider+providerEventId、计划时间、时间精度/是否估计、实际公开时间（有证据才保存）、状态、来源重要性、官方与provider来源链接。

一个报告组关联多条分项，不将CPI环比/同比、headline/core或非农/失业率/时薪计为独立报告。发布身份不能只依赖日期：同日同类发布须保留；改期保留历史关联，取消事件不删除已有快照。

预期快照至少包含：发布分项ID、provider、调查统计量、值、单位、sourceUpdatedAt（源有才填）、capturedAt、来源证据/响应校验摘要、前值/修订证据、来源版本及授权范围标识。

capturedAt采用响应完成/解析时刻，不能采用请求开始时间以跨过公布瞬间的响应冒充发布前快照。LastUpdate是供应商整条记录更新时间，不默认是预期的修改时间。

发布前冻结规则：选择实际公开边界之前、且当时尚无actual的最新合格快照。不能把发布后返回的Forecast标为发布前；提前发布、改期及时间不确定时降级为证据不足。应保存边界附近的捕获记录和错误日志。

## 4. 自动更新建议

用现有5分钟worker触发“是否到期”检查，但只在预期订阅到期时调用provider。共享抓取一个窗口中的美国2/3级事件，不按用户、资产或分项重复调用。

试行排程：

1. 每6小时发现未来30天日程和当前可用预期。
2. 在T−24小时、T−6小时、T−1小时和T−10分钟附近补快照；最终准确度受worker触发与源延迟限制。
3. 发布后T+5分钟、T+30分钟捕获provider状态；官方实际继续走现有worker，可通过统一runDataSubscription做有界补检，保留发布包排程。
4. 晚到数据使用退避重试，429按预算和Retry-After退避；不会每5分钟无条件扫全部。
5. 值未变仍需保留最近核查时间证据；可保存轻量捕获记录并引用已有值版本，不能回写旧快照的捕获时间。

预算粗估：每月全窗口刷新120次，若N次报告各增加6次请求，则120+6N（未合并同时间事件、未含重试/回填）。N=30约300次，N=60约480次。500请求/月可能缺乏余量，全部2/3星覆盖应实测N并合并请求后评估。历史回填另算，不从浏览器刷新触发源请求。

未来没有Forecast的记录仍展示事件与“预期尚未提供”，不填写0或TEForecast。Jackson Hole、记者会等记录日程与政策材料，不制造数值调查预期。

## 5. 实际值及首发的严格关联

provider Actual文档通常指最新公布值，不自动意味着首发。worker首次捕获也是系统首次看到，不是官方首发证明。当前upsertMacroObservations捕获版本明确isInitialRelease=false，保持这一语义。

数据发布分项实际值优先引用具备首发证据的canonical vintage；原始指数和公布增速需按明确变换查询，不能把CPI指数水平与0.2%环比预期比较。非农首发用同一首发版本下本月与上月水平之差，前期修订单列，不能对两期独立最新版相减。

若官方报告直接发布的某个首发口径在已有底座中没有准确表达，先扩展该来源现有adapter及统一版本writer，不用TE值默默覆盖官方事实。未满足首发证据时显示“已发布、首发待核实”，不进入严格预期差回测。

## 6. 接入前的最小验证

优先检验已有FMP，减少新增成本；若estimate的来源、覆盖或延迟不合格，再评估TE。需要：

- 一个真实未来窗口：覆盖美国事件目录、预期非空率、时区、单位和事件身份。
- 一次真实发布过程：发布前多次快照、首次actual、之后修订，与官方对照。
- 少量历史样本：验证所谓历史/PIT是否保留首发与发布前预期，而非最新投影。
- 明确本项目存储、公开/会员展示、派生评分及历史保留授权和报价。

来源确认后再新增schema/migration、统一预期writer、scheduler任务和API投影，并验证没有平行实际值库。这一步的实时自动采集依赖合格数据源；本轮未启用。
