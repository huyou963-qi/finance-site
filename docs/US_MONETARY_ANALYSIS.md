# 美国货币政策与金融条件分析框架

本文档与宏观页内置模板、`monetaryAnalysisLayout.ts`、`.cursor/prompts/us-monetary-analysis-framework.md` 保持一致。
Spec 与接入记录见 [specs/us-monetary-financial.spec.md](./specs/us-monetary-financial.spec.md)。

## 核心问题（L0 文字判断）

> 货币政策当前是限制性、中性还是宽松？政策通过「利率 → 金融条件 → 银行信贷 → 信用质量」的传导链走到了哪一步？金融体系在放大还是缓冲政策效果？

## 分析层级

| 层级 | 问题 | 主要指标（显示名） | 默认模板 |
|------|------|-------------------|----------|
| L1 政策立场 | 实际政策多紧？市场定价的路径？ | 有效联邦基金利率、2Y 国债收益率 | ① 图 1 |
| L2 实际利率 | 紧缩来自实际利率还是通胀预期？ | 10Y TIPS 实际收益率、10Y 盈亏平衡通胀 | ① 图 2 |
| L3 量的工具 | QT 进展？冗余流动性还剩多少？ | 联储总资产、ON RRP 余额 | ① 图 3 |
| L4 期限结构 | 曲线定价的增长/衰退预期？ | 10Y 收益率、10Y-3M 利差 | ① 图 4 |
| L5 金融条件 | 综合条件偏紧还是偏松？ | Chicago Fed NFCI | ② 图 1 |
| L6 信用定价 | 风险溢价在扩张还是压缩？ | 高收益债 OAS、投资级 OAS | ② 图 2 |
| L7 银行信贷 | 银行在收紧还是放贷？量价如何？ | SLOOS 收紧净比例、工商业贷款同比 | ② 图 3 |
| L8 信用质量 | 紧缩的滞后损伤显现了吗？ | 信用卡拖欠率、工商贷款拖欠率 | ② 图 4 |

## 两模板链条（宏观页 → 美国货币政策与金融条件）

内置 **2 个** 四图模板（`layoutMode: 4`），文件夹 `folder-builtin-us-monetary`。模板介绍 Tab 按 **图 1–4** 展示分析思路（`chartIntroNotes`），**不**逐指标展开。

| 顺序 | 模板 ID | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-monetary-overview` | 货币政策 · 立场与流动性 | **默认第一步**：政策松紧与量价工具全景 |
| ② | `builtin-us-monetary-conditions` | 金融条件 · 信贷与压力 | 判断传导：政策是否已收紧条件、伤及信贷 |

### 模板 ① — 货币政策 · 立场与流动性

| 图 | slotTitle | 序列（显示名） |
|----|-----------|----------------|
| 1 | L1 政策利率：有效 vs 市场定价 | 有效联邦基金利率（月均）、2Y 国债收益率（月均） |
| 2 | L2 实际利率分解：TIPS vs 预期 | 10Y TIPS 实际收益率（月均）、10Y 盈亏平衡通胀（月均） |
| 3 | L3 量的工具：联储资产 vs RRP | 联储总资产（左，百万美元）、ON RRP 余额（右，十亿美元） |
| 4 | L4 期限结构：10Y vs 10Y-3M | 10Y 国债收益率（左）、10Y-3M 利差（右，0 线以下为倒挂） |

**分析顺序（`chartIntroNotes` 摘要）**：

1. 图 1：EFFR vs 2Y — 2Y 低于 EFFR = 市场定价降息（紧缩尾声）；剪刀差方向先于政策转向
2. 图 2：10Y 名义 ≈ TIPS 实际 + 盈亏平衡 — 实际利率驱动的紧缩压估值/地产；预期驱动 → 回通胀域找原因；实际利率 >2% 属历史限制区
3. 图 3：WALCL vs RRP — RRP 是流动性"缓冲垫"，趋零后继续 QT 直接抽准备金 → 对照 ② 图 1
4. 图 4：10Y-3M 是 NY Fed 衰退模型输入 — 注意解除倒挂的方式：短端下行=降息将至，长端上行=再通胀/期限溢价

### 模板 ② — 金融条件 · 信贷与压力

| 图 | slotTitle | 序列（显示名） |
|----|-----------|----------------|
| 1 | L5 金融条件：NFCI | NFCI 金融条件指数（月均，0=历史均值，>0 偏紧） |
| 2 | L6 信用利差：HY vs IG | 高收益债 OAS（月均）、投资级公司债 OAS（月均） |
| 3 | L7 银行信贷：SLOOS vs 贷款增速 | SLOOS 工商贷款收紧净比例（柱）、工商业贷款同比（右，季末对齐） |
| 4 | L8 信用质量：拖欠率 | 信用卡拖欠率、工商业贷款拖欠率 |

**分析顺序（`chartIntroNotes` 摘要）**：

1. 图 1：NFCI — 加息后 NFCI 不升 = 传导被市场抵消，Fed 倾向更鹰
2. 图 2：HY 单独走阔 = 尾部信用担忧；HY/IG 同步走阔 = 系统性避险；利差极低时最脆弱
3. 图 3：SLOOS 领先贷款增速 2–4 个季度；贷款同比转负历史多伴随衰退；量价互证
4. 图 4：信用卡先于工商贷款恶化；两者同升 + 图 3 收缩 = 信用周期下行确认

**指标去重**：EFFR/DGS2/DFII10/T10YIE/WALCL/RRPONTSYD/DGS10/T10Y3M **仅**在模板 ①；NFCI/HY OAS/IG OAS/SLOOS/BUSLOANS/拖欠率 **仅**在模板 ②。

## 与其他模板分工

| 主题 | 归属 | 本框架不做 |
|------|------|------------|
| 联邦基金**目标**利率 DFEDTARU、10Y-**2Y** T10Y2Y | 经济 Overview ① 图 4 | 本框架用 EFFR（有效）与 10Y-3M（NY Fed 口径），互补不重复 |
| 5Y 盈亏平衡 T5YIE、核心 PCE | 美国通胀分析 ② | 通胀预期锚定归通胀域 |
| TGA 余额、财政净现金流 | 美国财政 · 高频 | 净流动性合成（WALCL−TGA−RRP）留作未来 derivedCalc |
| 股指、VIX | 行情页 | 不做 |

## 决策树（两模板完成后）

| 观察 | 对照图位 | 典型结论 |
|------|----------|----------|
| 2Y < EFFR 且 10Y-3M 倒挂 | ① 图 1 + 图 4 | 市场定价宽松将至，关注 Fed 验证 |
| 实际利率高位 + NFCI 偏松 | ① 图 2 + ② 图 1 | 传导被市场抵消，警惕更紧更久 |
| RRP 归零 + QT 继续 | ① 图 3 | 准备金稀缺风险，流动性事件概率上升 |
| SLOOS 收紧 + HY OAS 走阔 | ② 图 3 + 图 2 | 传导进入信贷收缩，周期下行前兆 |
| 拖欠率加速 + 贷款同比转负 | ② 图 4 + 图 3 | 信用周期下行确认，政策转向临近 |

示例句式：「实际利率限制区 + 传导未到位（NFCI 平）」或「SLOOS 收紧 + 拖欠抬头 = 转向临近」。

## 变动率与时间轴

- DB 存**水平值**；变换由宏观页 `seriesCalcConfigMap` 计算，不在 DB 预存。
- 日频（EFFR/DGS2/DFII10/T10YIE/RRPONTSYD/DGS10/T10Y3M/两条 OAS）：`op: "none"`，`frequency: "month"` + `resampleMethod: "avg"` 月均对齐。
- 周频（WALCL/NFCI）：同上月均。
- 季频（DRTSCILM/DRCCLACBS/DRBLACBS）：`op: "none"`、`frequency: "keep"`。
- BUSLOANS（月频）：`op: "yoy"` + `frequency: "quarter"` + `resampleMethod: "end"` —— 季末对齐，与同图的季频 SLOOS 并表不拆行。
- WALCL 单位为百万美元（约 6.7e6），与右轴 RRP（十亿美元）分轴展示，轴标签由 ECharts 自动缩写。

## 数据源与更新（全 FRED，无抓取）

| 发布包 | 成员 | 调度 |
|--------|------|------|
| us.frb.h15_rates | DGS2、DFII10、DGS10 | probe 24h |
| us.frb.interest_rate_spreads | T10YIE、T10Y3M | probe 24h |
| us.ice.bofa_indices | HY OAS（BAMLH0A0HYM2）、IG OAS（BAMLC0A0CM）（⚠ ICE 许可仅近 3 年历史，持续累积） | probe 24h |
| us.nyfed.effr / us.nyfed.rrp | EFFR / RRPONTSYD | probe 24h |
| us.chicagofed.nfci | NFCI | probe 24h |
| us.frb.sloos / us.frb.chargeoff_delinquency | DRTSCILM / 两条拖欠率 | probe 168h |
| us.frb.h8_bank_assets | BUSLOANS | probe 72h |
| us.fed.h41（既有日历包） | WALCL | TE 日历 |

自检：`npm run data:verify-monetary -- --db`。

## 每期 checklist

**模板 ①（每月初，或 FOMC 前后）**

1. EFFR vs 2Y — 市场定价与政策的差
2. TIPS 实际利率水平 — 是否仍在限制区
3. WALCL 斜率 + RRP 余量 — QT 可持续性
4. 10Y-3M — 倒挂深度/解除方式

**模板 ②（每月中，SLOOS 季度更新后必看图 3/4）**

1. NFCI 相对 0 的位置与方向
2. HY/IG 利差水平 + 是否同步走阔
3. SLOOS 最新季度值 vs 贷款同比
4. 两条拖欠率的斜率

## 站内入口

| 入口 | 说明 |
|------|------|
| 宏观页 → 模板文件夹「美国货币政策与金融条件」 | 模板 ① ② |
| `/admin/data-catalog` → 利率与债券 / 银行与货币 | 15 条序列更新状态 |
