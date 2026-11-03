# 美股行业：ETF 历史财务观察

## 入口与复用

- 新页 `/equity/industries` 名称为「美股行业」，功能权限 `equity-industries`。
- 原 `/equity/sectors` 改名「美股历史」，保留路径、子页面与原权限 `equity-sectors`，不改写已有用户策略。
- 新页面与 API 皆按新功能权限判定，桌面导航与手机抽屉共用同一目录。
- 个股链接 `/equity/stocks/:symbol?tab=fundamentals` 直接打开既有财务基本面分页。
- 复用 `GICS_SECTOR_DEFS` 中的11只 Select Sector SPDR ETF、`sector_etf_holding`、`equity_security`、`equity_fundamental_snapshot` 和 `equity_disclosure_batch`；TTM 调用既有 `computeTtm`。
- 页面不新增 schema、migration、事实表或后台服务；复用既有财报 adapter/writer。历史补充使用下文显式离线命令，页面不做懒回补。

## API 与口径

`GET /api/equity/industry-financials?etf=XLK&quarters=20&membership=current&period=2026Q3`

- ETF 仅接受目录中的11个代码；quarters 仅12/20/40；period 必须位于返回区间。
- 同时返回 Q / TTM 汇总历史，只返回选中报告期的公司明细。财务期截止最新已完成自然季度，不混入当前未完成季度。
- `current`：指定最新真实 ETF 持仓回溯公司历史，明确标注「当前 ETF 成分回溯」。各期仍独立标注指标覆盖率，不称固定完整样本或历史指数财务。
- `historical`：使用每季末之前7个自然日内最近归档。缺归档留空，不使用未来持仓、陈旧快照或当前 GICS 主档替代。此模式的财务仍为最新重述值，不是 PIT 回测。
- 同一 CIK 的多股类合并，权重相加，金额只计一次。以持仓 symbol 或 CUSIP 对应证券，允许同 CIK 财务代码补充；未识别股票仍保留在覆盖分母，现金不参与公司财务合计。
- 营收、净利润分别按有效值合计；净利率仅用营收与净利均有效、营收为正的配对样本重算。同比仅用本期和去年同期都有营收的同样本，去年基数须为正。
- OCF / CapEx / FCF 三线使用相同子样本，保证 FCF = OCF - CapEx。负利润、零现金流保留，缺失不按零计算。
- TTM 需要目标季及此前连续三季，复用个股实际财季末连续性检查。同比还需上年同期连续四季，不使用旧季冒充目标季。
- 每指标返回样本家数、分母公司数、占该持仓股票部分的权重覆盖率。低于80%以独立空心点提示，不连入完整样本趋势线，避免把披露未齐误读为行业崩塌；图表提示同步显示覆盖情况。
- 金额基于既有 SEC 美元标准化字段，前端统一十亿美元。金融/房地产现金流可比性有限，不作跨行业优劣排名。
- 公司只展示营收同比、净利率、自由现金流；保持公司实际财季末可见。

## 更新与容量预算

- DB-only、只读。日批入库后，下次读取最多约5分钟使用旧进程缓存；已打开的页面可切期或刷新读取，不新增后台轮询。
- 进程缓存最多11项、JSON序列化体积合计16 MiB、TTL 5分钟，同键请求合并，跨键加载串行。内存对象真实占用高于JSON体积；上线观察 RSS，不能把16 MiB当作总内存硬上限。
- 单 ETF 最多600个持仓条目/快照，合并历史证券最多1000条；超界报错，不静默截断。
- 历史最多40个展示季度，额外7季供TTM与同样本同比。事实按40个代码一批串行查询，每批至多1880行；使用现有 symbol/periodType 索引及唯一季度键，无全市场扫描。
- 最多查询4000个持仓归档日期，仅读取选定的至多41个快照；不把多年日持仓全部载入内存。
- 同时仅一个财务加载流程占用共享连接池，新增常驻连接数为0；不配置独立池，不增加SQL并行。数据库语句超时沿用现有运行配置。
- 无新增数据库磁盘增长、索引、WAL或周期重计算。前端每页最多1000家，实际行业通常远低于该上限；历史响应不重复携带所有季度公司列表。
- 当前首版在线派生是有界的小范围计算。若观察到查询/聚合持续超预算，再把同一派生函数放到既有日批完成后执行并持久化可重建缓存，不复制财务事实。

## 验证

### 近十年现金流覆盖核查（2026-11-02）

- 检查当前持仓回溯的全部40个展示季度（2016Q4–2026Q3），Q/TTM、7项指标；将尚在披露的2026年单列，完整年份2016Q4–2025Q4共37季单独统计。历史持仓归档缺失仍不回填为当前成分。
- 上轮仅回填2019–2024，本轮扩至2015Q1–2026Q3（2015用于最早TTM/同比基线），48季提取、每批40只、只补空值、写前审计；单任务串行，384 MiB heap，单批10分钟、总30分钟上限，与日批互斥。无新表/索引/抓取器/常驻任务。
- `cashSourceCoverage` 独立返回OCF和CapEx有效数据的覆盖率；三条曲线仍沿用共同样本，不改变原有金额或FCF恒等式。公司明细 `missingFields` 指明缺哪个字段，两端均显示。新增字段只基于已有内存数据计算，无额外查询，仍受11项/16 MiB缓存上限保护。
- 发行人专属科目证据：
  - Verizon（732712）：2019起 `PaymentsToAcquireOtherProductiveAssets` 对应 Capital expenditures including capitalized software，[2024 10-K](https://www.sec.gov/Archives/edgar/data/732712/000073271225000006/vz-20241231.htm)为17,090m；2019前三季与旧总额标签相同。**2019前同名标签是其他投资，必须排除**，不得污染旧季度。
  - Lilly（59478）：`PaymentsForProceedsFromProductiveAssets` 仅用于截至2019-06-30的旧购置记录，与后续标签重叠验证；[2016 10-K](https://www.sec.gov/Archives/edgar/data/59478/000005947817000098/lly-20161231x10xk.htm)将PPE购置1,037.0m与处置收入73.4m分别列示，不推广成其他公司的净额回退。
  - EOG（821189）：2015起将油气及其他PPE additions两项同期值相加，缺任一项留空。[2024 10-K](https://www.sec.gov/Archives/edgar/data/821189/000082118925000011/eog-20241231.htm)两项分别5,353m和1,019m。沿用现金流表列示金额，不作营运资本调整、不声称等于公司调整后FCF；不加购并、不把未付资本开支当现金。
- 剩余主要缺口须区分：结构化接口缺发行人自定义科目、科目换代缺同口径重叠、未上市/拆分前无独立季度、尚未披露的新季。不能用投资现金流总额、折旧、资本开支应付款或净资产购置代替总现金资本开支。
- 对剩余大权重公司的申报原文核查：
  - [NVIDIA FY2020 10-K](https://www.sec.gov/Archives/edgar/data/1045810/000104581020000010/nvda-2020x10k.htm) 使用 `nvda:PurchasesOfPropertyAndEquipmentAndIntangibleAssets`；标准companyfacts缺此自定义事实，年度缺口会令后续四个TTM均缺失。本轮通过下文逐申报补充，不将全年值平均摊成季度。
  - [NextEra 2024 10-K](https://www.sec.gov/Archives/edgar/data/753308/000075330825000011/nee-20241231.htm) 同时有FPL、其他资本开支与核燃料等自定义科目，须核查主体/维度与总额，不能把子公司与集团重复相加。
  - [Phillips 66 2024 10-K](https://www.sec.gov/Archives/edgar/data/1534701/000153470125000074/psx-20241231.htm) 的 `CapitalExpendituresAndInvestments` 包含投资，不直接当纯PPE资本开支。
  - [JPMorgan 2024 10-K](https://www.sec.gov/Archives/edgar/data/19617/000001961725000270/jpm-20241231.htm) 本次未找到独立可比的资本开支现金事实；PPE与使用权资产的余额不能充当现金资本开支。银行自由现金流本身也不适合作跨行业比较。

### 2020–2024 历史覆盖修复与有界回填

- 复用 SEC companyfacts adapter、季度解析器、`upsertQuarterlyFundamentals` 和原快照表，不新增事实源、抓取器或表。
- 修复同科目更换 tag 导致的中间缺季；原始累计区间至少两个非零同值重叠才跨 tag 差分，不缩放补入金额。季度缺口也要求邻近重叠一致，手续费子集不充当银行总营收。
- 12/12/12/16–17 周零售财年长第四季须由全年和同起点九个月累计确认，不能把任意 120 天区间当季度。
- Lilly（CIK 59478）的 OtherPPE 经[2024 10-K 现金流表](https://www.sec.gov/Archives/edgar/data/59478/000005947825000067/lly-20241231.htm)核实为总 PPE 购置，仅该发行人启用；不把所有公司的 Other 子项当总额。
- Exxon 2026-07-01 迁册后新 CIK 2115436 仅包含近期事实。根据[继任注册人 8-K12B](https://www.sec.gov/Archives/edgar/data/2115436/000119312526291990/d71068d8k12b.htm)，共享 adapter 串行读取前身 34088，仅补生效日前同合并集团事实，保留原 accn/filed；不扩展到拆分与收购公司。
- 原命令增加季度 `--dry-run`、`--from-period`、`--through-period`、`--fill-missing`、`--audit-file`。只补空值模式必须显式名单、范围和审计文件；保存写前快照与提议，旧非空财务金额按实际季末保留，不同实际季末的冲突行跳过；季度错标迁移见下文。

```bash
npm run equity:sync-fundamentals -- --period-type=Q --quarters=40 \
  --symbols=GOOGL,TSLA,COST,LLY,XOM --from-period=2019Q1 --through-period=2024Q4 \
  --fill-missing --audit-file=.data/industry-coverage/audit.jsonl --dry-run
# 核对审计后去掉 --dry-run；生产使用已有 daily-disclosures flock，避免与日批/部署重叠。
```

- 运维预算：后台单进程串行抓取与写入，每批不超过40只、执行上限10分钟、Node heap 384 MiB、nice 10，批次间核验 API 与可用内存；不在部署 SSH 或页面请求中回填。沿用 SEC transport 限速；单公司新旧 CIK 最多两个请求，无新常驻进程。
- 2019 年用于 2020 TTM/同比基线；覆盖分母、80% 提示阈值不变，未上市/拆分前独立财报和缺少可核实现金流科目的公司仍缺失。银行及房地产现金流可比性限制仍适用。

- 确定性测试覆盖多股类、权重合并、同样本增长、金额加权利润率、TTM缺季、负利润/零现金流、现金流同样本、未映射持仓、历史归档缺失与日期边界。
- 权限测试验证新版与「美股历史」独立过滤，保留旧 feature ID。
- 本地只读实库抽查（2026-11-01）：XLK 最近持仓为2026-08-11，Q3单季/TTM营收分别仅4/2家；页面必须显示持仓滞后及低覆盖，不能补造数据。5年当前成分视图20点、73家，单响应约59 KiB；历史季末模式当前无可用归档，正确留空。单次本机加载约446ms/146ms，仅为开发样本，非生产容量承诺。
- 11只ETF三年窗口均完成只读联调，20–84家公司/ETF，响应约28–48 KiB。独立验证进程中首个加载约2.8秒，其余26–402毫秒，加载全部11项后RSS较首次调用前增加约45 MiB；包含Prisma运行时和缓存分配，不等同于持久内存预算，也不能推断生产并发容量。
- 上线先检查ETF持仓任务、每日披露批次的新鲜度；以缓存命中/未命中耗时、API字节数、Node RSS、数据库连接和任务重叠情况验证资源预算。
- 桌面使用双列图表及紧凑公司列表，手机单列图表与带标签的三指标公司卡片；控件及基本面链接在两端均可操作。

### 财季归属与原始申报补充（2026-11-02 第二轮）

- 实际财季在自然季后首7天结束时归到上一季，兼容52/53周财年（例如 NUE 2025-07-05）；不改变真实截止日。TTM还要求每个相邻季末相距70–125天，避免重复季和中间缺季蒙混通过。
- KR等16周首季须有10-Q的Q1标识，且同起点完整财年或紧邻前一年年末作证；不是把所有四个月区间当季度。
- 公用事业总营收增加标准 `RegulatedAndUnregulatedOperatingRevenue`，不拿受监管子项代总额。EQR仅补缺失的租赁收入日期：新 `OperatingLeaseLeaseIncome` 限2021年起，旧租赁标签经重叠一致验证连接2020年；保留2019年已知总营收，排除新标签在2019年的较小子集。
- 季度writer以实际截止日识别财季。可证明由旧首3天规则错标的记录迁到新键，迁移、补空与删除废弃键在同一Serializable事务内完成；日期不明、迁移碰撞、同日副本金额冲突均拒绝写入。财务金额随原实际日期保留；派生的财季编号与EPS同比重算。日常更新也不会用解析空值擦掉历史补充金额。
- 单次writer最多80条输入，时间跨度最多100季，读取范围两端各加1季、最多102行，事务超时30秒。不新增索引、连接池或常驻进程；旧键删除只在真实数据已迁移后进行，并核对日期。
- `--supplement-cash-flow` 只允许显式名单、季度与审计文件；目前仅NVDA（CIK1045810）启用。复用SEC传输和申报发现，最多8份申报/8个历史索引文件，按官方目录找实例XML，单文件上限32 MiB。仅接收该发行人、无维度、USD、合法累计期间、非负金额；decimals是精度，不是缩放倍率。同区间冲突拒绝，跨标签差分仍须至少两个一致重叠区间。
- 离线试读的5份有效原始实例：2017/2018/2021年10-K以及2023年第一、第二季10-Q。提取后恢复2015年以来10个缺失CapEx季度；来源URL与accession写入审计。原始自定义科目保持nvda命名空间，不伪装成SEC标准标签。

```bash
npm run equity:sync-fundamentals -- --period-type=Q --quarters=48 \
  --symbols=NUE,KR,XEL,DTE,EQR,NVDA --from-period=2015Q1 --through-period=2026Q3 \
  --fill-missing --supplement-cash-flow --audit-file=.data/industry-coverage/pilot.jsonl --dry-run
```

先核对审计再去掉dry-run；生产仍按每批40只、384 MiB heap、10分钟上限、nice10与日批互斥。补充不会在页面或日常任务中触发额外申报读取。缺少来源的企业保留空值；未上市时期、ETF历史成分归档及尚未披露季不造数。

### 第三轮现金资本开支补充（2026-11-02）

- 普通companyfacts解析增加发行人限定映射：ADP（8670）的OtherPPE为现金流表Capital expenditures；DLR（1297996）的DevelopRealEstate为现金流表Improvements to investments in real estate，收购另列。不得把这些标签推广到其他公司的子项。
- WEC（783325）仅2023年起的季报PPE与年报OtherPPE均为同一合并现金流表Capital expenditures。逐表核对后建立发行人专属同口径流，允许全年减九个月累计；同申报同期冲突则拒绝。**这是有原表证据的限定例外**，普通跨tag差分仍须两个同值重叠，不放宽全局规则。2024现金支出2,781.1m，2024前三季1,934.7m，差额846.4m；排除现金流表单列的项目/企业收购。2022年及更早PPE标签有包含收购的不同总额，不与OtherPPE混接；保留这些时期的原有数据，未据此补造现金购置。
- 显式离线XBRL补充目录增加：Dominion（715957）的现金PPE建设及核燃料；PSA（1393311）的维护、改造、能源效率、开发扩建四项现金支出之和；ED（1047862）的公用与非公用建设两项之和；CMS（811156）的现金PPE。全部组成项必须同申报、同累计区间、USD且齐全；不把缺项当零，不加入收购、应付款、融资租赁资产余额或资产处置收入。
- CMS现金流表将现金购置标为唯一 `us-gaap:PropertyPlantAndEquipmentByTypeAxis = cms:OngoingCapitalExpendituresMember`。仅此发行人接受这一项维度；再有ConsumersEnergyCompany等主体维度或融资租赁维度立即排除，防止叠加子公司或混入非现金购置。
- 保留现有每公司每次最多8份申报、8个历史索引、单XML32 MiB、串行384 MiB heap限制。历史补充按两年区间分批，8份不足覆盖全部时再细分区间；不扩大单请求预算，不在页面或常规日批触发原文抓取。标准映射随原有日批持续生效，原文补充仍需显式有界命令；writer保留已有非空历史补充。
- 试读验证D、PSA、CMS在2023–2025的12季现金资本开支；ED部分季非公用分项缺失，继续留空。NEE的总额含独立电力及其他投资、DTE的总额含企业收购、ABNB仅有Other investing activities，均不拿混合总额充当资本开支。

原表证据：
- [ADP FY2024现金流表](https://www.sec.gov/Archives/edgar/data/8670/000000867024000024/adp-20240630.htm)
- [WEC 2024年报](https://www.sec.gov/Archives/edgar/data/783325/000010781525000103/wec-20241231.htm)、[2025Q3季报含2024比较期](https://www.sec.gov/Archives/edgar/data/783325/000078332525000060/wec-20250930.htm)
- [DLR 2024现金流表](https://www.sec.gov/Archives/edgar/data/1297996/000155837025001424/dlr-20241231x10k.htm)
- [Dominion 2024现金流表](https://www.sec.gov/Archives/edgar/data/715957/000095017025028387/d-20241231.htm)
- [PSA 2024现金流表及非现金附表](https://www.sec.gov/Archives/edgar/data/1393311/000139331125000036/psa-20241231.htm)
- [CMS 2024集团及子公司现金流表](https://www.sec.gov/Archives/edgar/data/811156/000081115625000036/cms-20241231.htm)
- [ED 2024集团现金流表](https://www.sec.gov/Archives/edgar/data/1047862/000104786225000011/ed-20241231.htm)

### 营收与净利润双轴同比

两张规模图同时显示金额（左轴十亿美元）和同比（右轴百分比，橙色虚线），单季/TTM和报告期选择同步。同比使用本期和去年同期都有数据的同样本，并独立返回覆盖率；不直接相除两个不同样本的行业总额。净利润同比为（本期合计−上年合计）/上年合计绝对值，保留亏损与扭亏，上年合计为零留空。低覆盖同比同样只显示空心点、不连接趋势线。tooltip分别显示每条线单位、公司数和权重覆盖；手机版双轴保留独立边距和滚动图例。仅增加已有内存事实的聚合，无外部请求、额外数据库查询或新表，仍受既有40季/11项/16MiB缓存预算限制。

### 旧版总营收与早期季度骨架（2026-11-03）

Valero（1035002）旧 `RefiningAndMarketingRevenue`、Prologis（1045609）和 Extra Space Storage（1289490）旧 `RealEstateRevenueNet`、Newmont（1164727）旧 `RevenueMineralSales` 只在对应发行人补接早期营收。逐个缺季用原主序列最近四个重叠季验证，至少两个非零重叠且全部金额偏差不超过2%；不通过则保留缺失。仅补早于主序列首季的原始金额，不缩放、不改变主候选、不覆盖已有季，也不让新补值参与后续自证。其他公司同名标签可能是业务子项，不启用。

营收是季度提取骨架，恢复旧季度后可同步读取同期已披露的净利润、OCF和CapEx；现金流没有事实时继续为空。沿用 fill-missing writer 和实际财季审计，生产仅针对四家公司回填2015–2017，单任务并发1、heap384MiB、10分钟超时、已有披露锁；无新表/索引/cron/在线请求，快照增量不超过48行。一次性70家公司缺口诊断原始facts缓存约252MiB，完整前后审计约21MiB，不新增日常重复归档任务。

核对来源：[Valero 2017年报](https://www.sec.gov/Archives/edgar/data/1035002/000103500218000010/R43.htm)、[Prologis 2016年报](https://ir.prologis.com/financials/sec-filings/content/0001564590-17-001559/pld-10k_20161231.htm)、[EXR 2017年报季度数据](https://www.sec.gov/Archives/edgar/data/1289490/000162828018002649/R112.htm)、[Newmont官方companyfacts（含原accn/filed）](https://data.sec.gov/api/xbrl/companyfacts/CIK0001164727.json)。EXR旧科目含租金、保险与管理费合计，不以租金单项代替总额；PM旧含消费税营收及其他重组/会计口径差异本轮未拼接。
