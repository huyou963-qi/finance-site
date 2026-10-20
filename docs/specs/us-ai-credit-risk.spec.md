# 美国 AI 产业链信用风险：Oracle CDS 与 CoreWeave 债券

核验日期：2026-10-08（Asia/Shanghai）  
状态：`blocked_source_license`；目录与口径方案已确定，未入库、未启用订阅。  
用户已确认：目前没有 CDS／公司债数据授权。

## 1. 范围与准入结论

本批目标为 Oracle 5 年 CDS 和 CoreWeave 普通债券相对评级基准利差。遵守 AGENTS.md 的宏观数据库约束：只存合规来源持续公布的基础数据，项目自行计算的相对利差不入库。

- Oracle CDS：只有授权供应商直接提供的固定口径市场报价可作为基础数据。债券隐含 CDS、新闻中的偶发报价和股票模型估算不能替代。
- CoreWeave：授权供应商直接提供的单券 OAS 可作为源端发布的基础数据；单券 OAS 减评级基准 OAS 只能作为模板 `derivedCalcs`。
- 若供应商只提供债券价格／收益率，不能把自算 OAS 或 Z-spread 写成宏观基础序列。价格、收益率的数据接入须另行确定可用字段与口径；完整现金流／赎回估值也不能冒充模板中的简单减法。
- 本次没有创建空 Instrument、占位观测、停用空订阅或推测的 API adapter。没有进行数据库写入或生产部署。

## 2. 来源核验

| 候选来源 | 已核实事实 | 本项目结论 |
|---|---|---|
| [ICE CDS Settlement Prices](https://www.ice.com/cds-settlement-prices) | 公开部分 5 年单名 CDS 每日结算价；完整历史需要许可协议 | 免费查看不等于网站再分发授权；Oracle 覆盖及字段尚未核验 |
| [Markit ICE 专用使用条款](https://www.ice.com/publicdocs/Markit_ICE_Settlement_Pricing_Terms_of_Use.pdf) | §1.1–1.3 限制第三方提供、衍生作品、服务及复制／发布 | 不将公开结算页面作为本网站自动入库源 |
| [FINRA Fixed Income Data User Agreement](https://www.finra.org/finra-data/fixed-income/user-agreement) | 仅个人非商业用途，禁止自动或手工监控／复制及分发数据 | 不抓取免费查询页，不调用其内部查询接口作接入源 |
| [FINRA Fixed Income Data](https://www.finra.org/finra-data/fixed-income) | TRACE 数据含成交信息，另有正式订阅渠道 | 成交数据不等于直接发布的 OAS；正式订阅还须核实本网站展示许可 |
| [S&P CDS Pricing](https://www.marketplace.spglobal.com/en/datasets/cds-pricing-%28251%29) | 提供单名 CDS、流动性指标及历史数据交付 | 可作为采购／授权核验候选，未确认 Oracle 合约覆盖与网站展示权限 |

仓库的 adapter、seed registry 和 `.env.example` 搜索未发现 Oracle／CoreWeave／Markit CDS 或授权单券 OAS 接入；已有 FINRA Margin Statistics adapter 只处理融资余额 Excel，与 TRACE 的协议和许可不同，不能复用为债券行情抓取器。未进行 DB 盘点，不宣称库内绝无人工登记数据。FRED 定向公开搜索未找到这两条准确序列，不能用整体 HY／评级 OAS 替代企业报价。

## 3. 指标口径与目录

确定目录：**美国 → 利率与信用市场 → AI产业链信用风险（日频）**。国家 `US`，`catalogCategory=利率与信用市场`，日频，非季调，利差单位 `bp`。

授权到位后，在 `globalCatalogTaxonomy.ts` 增加显式代码映射，交由目录重建生成叶节点；不靠管理端拖拽。此时没有有效指标，故尚未修改运行时 taxonomy。

| 对象 | 计划显示名 | 入库／展示方式 | 身份与口径约束 |
|---|---|---|---|
| Oracle | Oracle 5年CDS利差 | 授权供应商直接报价入库 | Oracle 法律实体、USD、5Y 恒定期限、债务优先级、重组条款、文档版本、报价类型必须固定 |
| CoreWeave 单券 | CoreWeave 9.25% 2030年到期普通债 OAS | 授权供应商直接发布的单券 OAS 入库 | 候选券来自公司年报；CUSIP／ISIN、赎回条款、担保／优先级及连续行情覆盖须从授权源确认 |
| 评级基准 | 同评级／相近期限基准 OAS | 优先复用已有准确匹配的基础序列，缺失再核验授权源 | 同币种、同估值日、同 OAS 口径；评级和期限匹配规则明确 |
| 研究图表 | CoreWeave 相对评级基准利差 | `derivedCalcs`: 单券 OAS − 基准 OAS，不入库 | 两侧观测必须同日有效，缺任一侧则 N/A；不跨日静默前填 |

候选券身份依据：[CoreWeave 2025 年报](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm)。9.25% 是票息，不是当前收益率或利差。可转债不纳入此指标。

精确匹配基准不可得时，宽口径评级指数只能标为“评级指数对照”，不能标为“已消除评级／期限影响”。评级变更需保留断点说明，不能把今天评级回填整个历史。换券另建序列，禁止无说明拼接。

Instrument code、sourceSeriesKey、供应商实体 ID 和 releasePackage ID 待真实交付协议确认后锁定；不将公司股票 ticker 当成债券或 CDS 合约标识。

## 4. 持续更新方案（授权后实施）

- 复用 `Instrument`、`MacroObservation`、`MacroObservationVintage`、`DataSource`、`DataSubscription`、FetchRun、统一 writer 与现有 worker。
- 采用日频收盘报价，建议 `releaseRule={type:"probe_interval",intervalHours:24}`；无宏观发布日历，不挂 TE 经济日历。
- 按实际供应商的同源同批交付建立 `probePkg` 发布包；CDS 和单券 OAS 若不同源／不同批次则分包，不能仅因 AI 主题合包。
- 首次回填供应商实际授权的历史区间，不虚构起点；之后根据源端修订政策重读窗口。观测日期使用源端市场日期，不以抓取日或 UTC 跨日重标。
- 周末／节假日无新报价不补零、不前填；成功取到合法响应但源未更新，与网络失败分别记录。带上流动性／陈旧报价标记，连续过期触发既有调度告警。
- `fetchAcquisition.status=known` 只能在真实接口、许可、身份、fixture 与 live 核验通过后写入。
- 同次 latest 与 vintage 写入经统一服务、同一事务；无源端历史可见版本时只记录真实抓取时点，不声称历史 PIT。
- 只入库报价；相对基准差、月度变化和滚动分位数在指标运算层计算。

## 5. 复用项与实施边界

复用 `seedCatalogRegistry.ts`、`releasePackageCatalog.ts` / `probePkg`、`releaseRule.ts`、统一 fetch 分发、`upsertMacroObservations`、`appendMacroObservationVintages`、目录 taxonomy 与 `derivedCalcs`。获得供应商接口文档后仅增加该来源的一份 adapter 及解析器，不另建事实表或平行 writer。既有 FRED 基准由原 adapter／订阅更新，不重复 seed。

不修改系统模板镜像冒充线上编辑；后续若建图，遵守唯一生产系统模板及桌面／移动端入口规则。

## 6. 启用验收清单

- [x] 指标语义、目录与源端／项目派生边界确定。
- [x] 公开候选来源使用条款核验；确认目前没有数据授权。
- [ ] 确认许可覆盖自动获取、历史存储、网站展示及派生展示。
- [ ] 拿到实际接口／交付文档，确认 Oracle 合约与 CoreWeave 单券覆盖、起点、单位及质量标记。
- [ ] DB 复用核验：现有 Instrument／订阅／观测及评级基准，无重复。
- [ ] fixture 解析测试覆盖实体／合约错配、bp／% 规整、缺值、重复日期、未来日期及源结构变化；不将缺报价写为零。
- [ ] adapter、seed、registry、发布包、taxonomy 与 verify 实施完成。
- [ ] live 拉取并交叉核验；历史回填完成，DB 单位／频率／首末日期与数量符合实际源。
- [ ] worker 连续更新与失败重试验证，订阅、包成员和目录重建验收通过。
- [ ] CoreWeave 相对利差仅在指标运算中，库内无对应派生观测或复合订阅。

当前结论：在授权源到位前，本批不能标记 `data-ready`，不能声称已入库或可自动更新。
