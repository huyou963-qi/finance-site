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

## 非 FRED 序列

| instrument code / key | 显示名 | 来源 | 占用模板 |
|-----------------------|--------|------|----------|
| `treasury_mts_m01_*`（deficit/outlays/receipts） | MTS 月度赤字/支出/收入 | Treasury FiscalData | 美国财政 |
| `treasury_mts_m09_*`（rcpt_individual/payroll/corporate、outlay_interest、mandatory/discretionary_proxy） | MTS 收支结构 | Treasury FiscalData | 美国财政 ·结构 |
| `treasury_dts_*`（tga_balance、daily_net_cash）、`treasury_debt_penny_net_weekly` | DTS 高频财政 | Treasury FiscalData | 美国财政 ·高频 |
| `fiscal_primary_deficit_gdp`、`fiscal_fgcec1_yoy` | 财政合成序列 | FRED composite | 美国财政 |
| `ism_us_ism_*`（8 条） | ISM 制造业 PMI 及分项 | TE 抓取 | 未进默认模板（目录自选，Overview L2S） |
| `ism_svc_us_svc_*` | ISM 非制造业 PMI 及分项 | TE 抓取 | 同上 |
| `debtcap_*` | 四国杠杆/偿债比 | BIS | 四国偿债能力（legacy） |
| `goldov_*` | 黄金分析序列 | xlsx | 黄金分析（legacy） |
| `usov_* / chov_* / jpov_*` | 三国 Overview xlsx 序列 | xlsx/FRED composite | US/China/Japan_Overview（legacy） |

## 特别说明

- **ISM 两包已入库但未占用默认图槽**：新维度（如制造业与库存周期）可以把 `ism_us_ism_headline` / `ism_svc_us_svc_headline` 纳入默认模板，不算重复占用 —— 首次占用时把本表状态改为「占用」。
- legacy xlsx 模板（US/China/Japan_Overview、黄金、偿债）的序列不受零重复原则约束，但新模板应优先用 FRED 标准序列而非 `usov_*` 合成序列。
