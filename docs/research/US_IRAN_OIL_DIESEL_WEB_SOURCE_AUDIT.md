# “美伊油价与柴油短缺监测”网页指标源审计（Agent C）

审计日期：2026-10-04。范围仅含网页、AIS/航运情报和运输协会数据；FRED、EIA API 等结构化序列另由 Agent B 审计。

## 结论

| 监测数字 | 决策 | 原因 / 可替代底座 |
|---|---|---|
| 霍尔木兹“可见船数” | 暂不入库 | IMF PortWatch 有公开的**每日过境船次**，但不等于某时点“可见船数”；项目为商业产品，而 IMF 条款要求潜在商业复用先联系 `copyright@imf.org`，并禁止未经许可的自动化批量下载。取得书面许可后可单独接入 PortWatch `chokepoint6`。 |
| AIS-dark crossing | 不入库 | “dark activity/crossing”是 Kpler/MarineTraffic/Windward 等商业 AIS 情报产品的算法识别结果，没有公开、稳定、获许可的基础时间序列；不能从新闻数字回填。 |
| 海湾实际原油出口（mb/d） | 不入库该高频口径 | Vortexa/Kpler 的实时出口流量是商业产品。EIA 会在专题/STEO 中发布基于 Vortexa 的季度霍尔木兹流量，但它不是海湾国家“实际出口”同一口径，且当前页面仅短历史、非稳定数据接口，不能静默替代。 |
| Sohar/Fujairah STS 转运量 | 不入库 | STS 链/体量属于 Kpler、Vortexa、S&P Commodities at Sea 等商业航运分析；公开网页只有营销或不定期研究摘录，没有可持续基础序列。 |
| LNG 船数 | 不入库 | 免费官方源只给流量/占比的低频估计；逐船计数依赖商业 AIS。IMF PortWatch 也只分 tanker/container/dry bulk/general cargo/ro-ro，不区分 LNG 船。 |
| 安全事件 | 留在新闻监测 | UKMTO/JMIC/IMO 发布逐事件公告；把公告聚合成日/周“事件数”是二次计算。IMO 的 2026 中东热点页虽发布阶段性确认总数，但属于危机专题、无稳定历史接口/发布制度，不是长期宏观序列。 |
| AAR 周度铁路 | 不恢复 | 仓库已于 2026-09-21 退役：机房访问触发 403 challenge，且 AAR 官网明确详细数据需购买并要求联系授权。继续使用已入库的 BTS/FRED 月度替代 `RAILFRTCARLOADSD11`、`RAILFRTINTERMODALD11`。 |
| ATA Truck Tonnage | 不写网页抓取器；转 Agent B | BTS/FRED 已有 `TRUCKD11`（月度、季调、2015=100、2000 年起），官方说明其基于 ATA Monthly Truck Tonnage Report。ATA 完整月报是订阅服务，免费新闻稿只适合校验最新值。 |
| EIA WPSR 柴油/炼厂/SPR 基础水平 | **接入** | EIA Petroleum Navigator 公开每条序列的完整历史 XLS；robots 允许 `/dnav/`，EIA 版权页确认美国政府数据为公有领域并允许使用/分发（需注明来源）。 |

## 合规与来源证据

### IMF PortWatch

- 首页将 PortWatch 定义为开放平台，并提供 2019 年以来日度港口/关键航道数据：<https://portwatch.imf.org/>。
- 官方 ArcGIS 服务 `Daily_Chokepoints_Data` 的 `chokepoint6` 是 Strait of Hormuz；字段包括 `n_total`、`n_tanker` 和估计载重体量：<https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0>。
- `Transit Calls` 的官方定义是船舶穿越边界时计一次，跨多日仍只计一次，48 小时内同船不重复计；因此它不是“当前可见船数”。
- robots：`Crawl-delay: 60`，未禁止上述数据路径；但数据项许可证指向 IMF Copyright and Usage：<https://www.imf.org/en/About/copyright-and-terms.>。条款允许带署名复用 IMF Data，同时要求潜在商业复用先联系许可，并禁止未经许可的自动化批量下载。当前没有项目方书面许可，所以不实现 adapter。

如取得许可，候选基础序列只能是 PortWatch 原样发布的 `n_total` / `n_tanker` / `capacity_tanker`；移动均值、相对基线和异常分数仍必须在模板层计算。

### 商业 AIS / 货流

- Kpler AIS、Cargo Analytics 明确以“Request demo / Get started”提供实时与历史船位、暗活动、STS 和货物流：<https://www.kpler.com/product/maritime/kplerais>、<https://www.kpler.com/product/commodities/cargo-analytics>。
- Vortexa Energy Flows/Inventory 通过 Web、Excel、API/Python SDK 商业交付，页面要求 demo：<https://www.vortexa.com/category-energy-inventories>。
- Windward 将 dark activity 定义为 AIS 停播期并作为风险情报能力；公开文章中的阶段性数字不是稳定下载数据集：<https://windward.ai/blog/what-is-dark-activity-and-why-is-it-surging-in-2026/>。
- S&P Global Commodities at Sea 将实时海运货流、浮仓和 STS 作为商业产品：<https://www.spglobal.com/commodityinsights/en/commodities/shipping>。

因此不得把新闻/研报中的单次数值抓入 `mds.Instrument`，也不得绕过登录、demo 或商业 API 授权。

### 官方安全事件

- UKMTO 公开逐事件告警：<https://www.ukmto.org/recent-incidents>。
- IMO 中东专题汇总已确认事件并链接 UKMTO/JMIC：<https://www.imo.org/en/mediacentre/hottopics/pages/middle-east-highlighted-incidents.aspx>。

这些来源适合定时新闻监测和事件卡片；若未来项目建立 canonical event store，可保存原始事件事实。当前宏观库只有数值序列，把事件公告计数后落库违反“二次指标不入库”。

### AAR / ATA

- AAR 数据中心说明周报每周三发布，但详细统计对非会员出售，并要求联系 `publications@aar.org` 获取授权：<https://www.aar.org/data-center/>。仓库既有 403 challenge 记录继续有效，不恢复 scraper。
- BTS 方法说明 ATA 完整 Monthly Truck Tonnage Report 是 subscription service：<https://www.bts.gov/learn-about-bts-and-our-work/statistical-methods-and-policies/technical-note-tsi-documentation>。
- BTS/FRED 标准序列 `TRUCKD11` 提供完整月度历史：<https://fred.stlouisfed.org/series/TRUCKD11>。应由 Agent B 走现有 FRED adapter。

## 本次接入：EIA WPSR 官方 XLS

数据页/历史 XLS：

| code | EIA Sourcekey | 基础事实 | 单位 | fixture 历史 |
|---|---|---|---|---|
| `eia_wpsr_wdistus1` | `WDISTUS1` | 美国馏分油周末库存 | 千桶 | 1982-08-20 起，2296 点 |
| `eia_wpsr_wd0st_nus_1` | `WD0ST_NUS_1` | 美国 0–15 ppm 超低硫馏分油周末库存 | 千桶 | 2004-04-09 起，1172 点 |
| `eia_wpsr_wdiupus2` | `WDIUPUS2` | 美国馏分油 Product Supplied | 千桶/日 | 1991-02-08 起，1854 点 |
| `eia_wpsr_wpuleus3` | `WPULEUS3` | 美国炼厂可运营产能利用率 | % | 1990-11-02 起，1860 点 |
| `eia_wpsr_wcsstus1` | `WCSSTUS1` | 美国 SPR 周末库存 | 千桶 | 1982-08-20 起，2296 点 |

统一 XLS URL：`https://www.eia.gov/dnav/pet/hist_xls/<Sourcekey>w.xls`。2026-10-04 fixture 的 workbook 均为 OLE/BIFF（magic `D0CF11E0A1B11AE1`），固定 `Contents` + `Data 1`；`Data 1` 内含 `Sourcekey` 锚点、Excel 日期序列和值。parser 会校验 sheet/锚点/sourcekey、周五日期、严格递增、合理值域，以及 `Contents.Latest Data for` 与末行一致。

- 合规：<https://www.eia.gov/robots.txt> 对 `/dnav/` 未 Disallow；<https://www.eia.gov/about/copyrights_reuse.php> 说明 EIA 数据、文件和数据库为美国政府公有领域，可使用/分发，复用时应注明来源。
- 更新：周度、12 小时低频 probe；WPSR 发布后读取完整工作簿，利用统一 upsert 捕捉最近值和历史修订。发布包 `us.eia.weekly_petroleum_status` 将五条一起分组。
- 目录：美国 → 通胀与价格 → 通胀预期与能源；目录 key 使用 `mds:<code>`。
- 不入库：周变动、4 周均值、同比、季节偏离、库存覆盖天数等全部模板派生。
