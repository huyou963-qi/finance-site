# 已占用指标负面清单（美国内置模板）

> Agent A 规划新维度时**必查**：下表指标已被现有内置模板占用，新模板不得复制（分析上需要时在 Spec §1.3 写「引用现有模板」）。
> 新维度 `verified` 后由 Agent E 把该维度指标**追加到本文件**。
>
> 再生成基线（FRED 部分）：
> `grep -o 'fredId: "[A-Z0-9_]*"' src/lib/data/*AnalysisLayout.ts | sort -u`

生成日期：2026-07-04（基于当前 main 分支）；2026-07-04 追加「美国货币政策与金融条件」域 15 条（Phase 1 试点，Agent E 验收后更新）

## FRED 序列

| FRED id | 显示名 | 占用模板 |
|---------|--------|----------|
| CPIAUCSL | CPI（全部城市消费者） | 美国通胀 ①、美国经济 Overview ① |
| CPILFESL | 核心 CPI | 美国通胀 ① |
| CPIENGSL | CPI 能源 | 美国通胀 ① |
| CPIFABSL | CPI 食品与饮料 | 美国通胀 ① |
| CUSR0000SEHC | OER 业主等价租金 | 美国通胀 ① |
| CUSR0000SACL1E | CPI 核心商品 | 美国通胀 ① |
| CUSR0000SASLE | CPI 核心服务 | 美国通胀 ① |
| DCOILWTICO | WTI 原油现货 | 美国通胀 ② |
| PPIFIS | PPI 最终需求 | 美国通胀 ② |
| T5YIE | 5Y 盈亏平衡通胀 | 美国通胀 ② |
| PCEPILFE | 核心 PCE | 美国通胀 ②、美国经济 Overview ① |
| CES0500000003 | 平均时薪 | 美国通胀 ②、美国就业 |
| UNRATE | 失业率 | 美国通胀 ②、美国就业、美国经济 Overview ① |
| PAYEMS | 非农就业 | 美国就业、美国经济 Overview ① |
| ICSA | 初请失业金 | 美国就业 ② |
| JTSJOR / JTSHIR / JTSQUR | JOLTS 职位空缺/雇佣/离职率 | 美国就业 ② |
| U6RATE | U-6 失业率 | 美国就业 |
| CIVPART / LNS11300060 | 劳动参与率（总体/25-54） | 美国就业 |
| UEMPMEAN | 平均失业周期 | 美国就业 |
| AWHNONAG | 周工时 | 美国就业 |
| A191RL1Q225SBEA | 实际 GDP 环比折年率 | 美国经济 Overview ① |
| INDPRO | 工业生产 | 美国经济 Overview ① |
| DFEDTARU | 联邦基金目标利率（上限） | 美国经济 Overview ① |
| T10Y2Y | 10Y-2Y 利差 | 美国经济 Overview ① |
| PCEC96 | 实际 PCE | 美国经济 Overview ② |
| RSAFS | 零售销售 | 美国经济 Overview ② |
| PNFIC1 | 实际私人固定投资 | 美国经济 Overview ② |
| HOUST | 新屋开工 | 美国经济 Overview ② |
| EXPGSC1 / IMPGSC1 | 实际出口/进口 | 美国经济 Overview ② |
| GCEC1 | 实际政府消费 | 美国经济 Overview ②、美国财政 |
| FYFSGDA188S | 联邦赤字/GDP | 美国经济 Overview ②、美国财政 |
| FYOIGDA188S | 利息支出/GDP | 美国财政 |
| GFDEBTN / GFDEGDQ188S | 联邦债务（总额 / /GDP） | 美国财政 |
| EFFR | 有效联邦基金利率 | 美国货币政策与金融条件 ① |
| DGS2 / DGS10 / DFII10 | 2Y/10Y 国债收益率、10Y TIPS 实际收益率 | 美国货币政策与金融条件 ① |
| T10YIE | 10Y 盈亏平衡通胀 | 美国货币政策与金融条件 ①（原 CPI seed 入库未占槽，2026-07 首次占用） |
| WALCL | 联储总资产 | 美国货币政策与金融条件 ①（原 phase2 入库未占槽，2026-07 首次占用） |
| RRPONTSYD | ON RRP 隔夜逆回购余额 | 美国货币政策与金融条件 ① |
| T10Y3M | 10Y-3M 国债利差 | 美国货币政策与金融条件 ① |
| NFCI | Chicago Fed 金融条件指数 | 美国货币政策与金融条件 ② |
| BAMLH0A0HYM2 | 高收益债 OAS | 美国货币政策与金融条件 ②（原 phase2 入库未占槽，2026-07 首次占用） |
| BAMLC0A0CM | 投资级公司债 OAS | 美国货币政策与金融条件 ② |
| DRTSCILM | SLOOS 工商贷款收紧净比例 | 美国货币政策与金融条件 ② |
| BUSLOANS | 工商业贷款存量 | 美国货币政策与金融条件 ② |
| DRCCLACBS / DRBLACBS | 信用卡/工商贷款拖欠率 | 美国货币政策与金融条件 ② |
| PERMIT / HOUST1F | 建筑许可 / 单户新屋开工 | 美国住房与地产 ①（HOUST1F≠总开工 HOUST） |
| HSN1F / MSACSR | 新屋销售 / 新屋可售月数 | 美国住房与地产 ① |
| COMPUTSA | 住房完工 | 美国住房与地产 ① |
| CSUSHPINSA | Case-Shiller 全国房价 | 美国住房与地产 ②（原 phase2 入库未占槽，2026-07 首次占用） |
| MORTGAGE30US / MORTGAGE15US | 30Y / 15Y 抵押利率 | 美国住房与地产 ② |
| RHORUSQ156N | 自有住房率 | 美国住房与地产 ② |
| DRSFRMACBS | 单户住宅抵押贷款拖欠率 | 美国住房与地产 ② |
| EXHOSLUSM495S | 成屋销售 | 美国住房与地产（已入库，NAR 许可仅约 1 年，暂不进模板、持续累积） |
| RECPROUSM156N | 平滑衰退概率（Chauvet-Piger） | 美国增长动能与衰退风险 ① |
| SAHMREALTIME | Sahm 规则实时值 | 美国增长动能与衰退风险 ① |
| CFNAI | 芝加哥联储全国活动指数 | 美国增长动能与衰退风险 ①（原 phase2 入库未占槽，2026-07 首次占用） |
| USREC | NBER 衰退标记 | 美国增长动能与衰退风险 ①（原 phase2 入库未占槽，2026-07 首次占用） |
| W875RX1 / DSPIC96 | 实际个人收入(除转移) / 实际可支配收入 | 美国增长动能与衰退风险 ② |
| CMRMTSPL | 实际制造与贸易销售 | 美国增长动能与衰退风险 ② |
| FINSLC1 | 实际最终销售 | 美国增长动能与衰退风险 ② |
| RSXFS | 零售销售（零售贸易） | 美国消费与居民资产负债 ①（≠RSAFS 含餐饮总额） |
| PCEDGC96 / PCESC96 | 实际 PCE 耐用品 / 服务 | 美国消费与居民资产负债 ① |
| UMCSENT | 密歇根消费者信心 | 美国消费与居民资产负债 ①（原 phase2 入库未占槽，2026-07 首次占用） |
| PSAVERT | 个人储蓄率 | 美国消费与居民资产负债 ① |
| TNWBSHNO | 家庭净财富 | 美国消费与居民资产负债 ② |
| TDSP | 家庭偿债比率 | 美国消费与居民资产负债 ② |
| TOTALSL / REVOLSL | 总消费信贷 / 循环消费信贷 | 美国消费与居民资产负债 ② |
| CORCCACBS | 信用卡贷款核销率 | 美国消费与居民资产负债 ②（≠DRCCLACBS 拖欠率） |
| DTWEXBGS | 美元名义广义指数 | 美国对外部门与美元 ①（原 phase2 入库未占槽，2026-07 首次占用） |
| DTWEXAFEGS / DTWEXEMEGS | AFE / EME 美元指数 | 美国对外部门与美元 ① |
| BOPGSTB | 商品与服务贸易差额 | 美国对外部门与美元 ① |
| BOPTEXP / BOPTIMP | 出口/进口（BOP） | 美国对外部门与美元 ①（≠ Overview 的 EXPGSC1/IMPGSC1） |
| IEABC | 经常账户余额（BOP） | 美国对外部门与美元 ②（≠ NETFI NIPA） |
| IIPUSNETIQ | 净国际投资头寸 | 美国对外部门与美元 ② |
| IQ / IR | 出口/进口价格指数 | 美国对外部门与美元 ② |
| W369RG3Q066SBEA | 贸易条件指数 | 美国对外部门与美元 ② |
| DGORDER / ADXTNO | 耐用品新订单 / 耐用品(除运输) | 美国制造业与库存周期 ① |
| NEWORDER / AMDMUO | 核心资本品新订单 / 耐用品未完成订单 | 美国制造业与库存周期 ① |
| IPMAN | 工业生产·制造业(NAICS) | 美国制造业与库存周期 ②（≠INDPRO） |
| BUSINV / AMTMTI | 总商业库存 / 制造业库存 | 美国制造业与库存周期 ② |
| ISRATIO / MNFCTRIRSA | 总业务库销比 / 制造业库销比 | 美国制造业与库存周期 ② |
| MCUMFN | 制造业产能利用率(NAICS) | 美国制造业与库存周期 ②（≠TCU） |

## 非 FRED 序列

| instrument code / key | 显示名 | 来源 | 占用模板 |
|-----------------------|--------|------|----------|
| `treasury_mts_m01_*`（deficit/outlays/receipts） | MTS 月度赤字/支出/收入 | Treasury FiscalData | 美国财政 |
| `treasury_mts_m09_*`（rcpt_individual/payroll/corporate、outlay_interest、mandatory/discretionary_proxy） | MTS 收支结构 | Treasury FiscalData | 美国财政 ·结构 |
| `treasury_dts_*`（tga_balance、daily_net_cash）、`treasury_debt_penny_net_weekly` | DTS 高频财政 | Treasury FiscalData | 美国财政 ·高频 |
| `fiscal_primary_deficit_gdp`、`fiscal_fgcec1_yoy` | 财政合成序列 | FRED composite | 美国财政 |
| `ism_us_ism_*`（8 条） | ISM 制造业 PMI 及分项 | TE 抓取 | headline/new_orders/inventories：**美国制造业与库存周期 ①**（首次占槽）；其余分项仍目录自选 |
| `ism_svc_us_svc_*` | ISM 非制造业 PMI 及分项 | TE 抓取 | 未进默认模板（目录自选，Overview L2S） |
| `nyfed_us_recession_prob` | NY Fed 衰退概率（12月前瞻） | NY Fed Excel 抓取（Agent C） | 美国增长动能与衰退风险 ① |
| `debtcap_*` | 四国杠杆/偿债比 | BIS | 四国偿债能力（legacy） |
| `goldov_*` | 黄金分析序列 | xlsx | 黄金分析（legacy） |
| `usov_* / chov_* / jpov_*` | 三国 Overview xlsx 序列 | xlsx/FRED composite | US/China/Japan_Overview（legacy） |

## 特别说明

- **ISM 服务业仍未占默认图槽**；制造业 PMI 的 headline / new_orders / inventories 已于 2026-07 由「美国制造业与库存周期」首次占用默认图槽。
- legacy xlsx 模板（US/China/Japan_Overview、黄金、偿债）的序列不受零重复原则约束，但新模板应优先用 FRED 标准序列而非 `usov_*` 合成序列。
