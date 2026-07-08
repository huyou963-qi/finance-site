# 美国增长动能与衰退风险分析框架

本文档与宏观页内置模板、`cycleRiskAnalysisLayout.ts`、`.cursor/prompts/us-cycle-risk-analysis-framework.md` 保持一致。
Spec 与接入记录见 [specs/us-cycle-risk.spec.md](./specs/us-cycle-risk.spec.md)。

## 核心问题（L0）

> 经济周期当前处于扩张、见顶还是收缩？衰退概率多高、哪种探测法先亮灯？增长动能（硬数据）在加速还是熄火？——为宏观投资策略提供**周期定位**与**衰退择时**的顶层判断。

## 分析层级

| 层级 | 问题 | 主要指标 | 默认模板 |
|------|------|----------|----------|
| L1 模型概率 | 曲线/因子模型的衰退概率？ | NY Fed 衰退概率、平滑衰退概率 | ① 图 1 |
| L2 劳动规则 | Sahm 规则触发了吗？ | Sahm 规则实时值 | ① 图 2 |
| L3 活动综合 | 85 指标合成的景气？ | CFNAI | ① 图 3 |
| L4 校准参照 | 历史衰退期对照 | NBER 衰退标记 | ① 图 4 |
| L5 收入动能 | 实体收入在扩张？ | 实际个人收入(除转移)、可支配收入 | ② 图 1、图 3 |
| L6 销售动能 | 制造与贸易销售？ | 实际制造与贸易销售 | ② 图 2 |
| L7 最终需求 | 剔除库存的真实需求？ | 实际最终销售 | ② 图 4 |

## 两模板链条（宏观页 → 美国增长动能与衰退风险）

内置 **2 个** 四图模板（`layoutMode: 4`），文件夹 `folder-builtin-us-cycle-risk`。

| 顺序 | 模板 ID | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-cycle-risk-signals` | 衰退风险 · 概率与规则 | **默认第一步**：多方法衰退信号对照 |
| ② | `builtin-us-cycle-risk-momentum` | 增长动能 · 硬数据确认 | 信号亮灯后：NBER 同步硬数据证实/证伪 |

### 模板 ① — 衰退风险 · 概率与规则

| 图 | slotTitle | 序列（显示名） |
|----|-----------|----------------|
| 1 | L1 模型概率：NY Fed vs 平滑 | NY Fed 衰退概率（12月前瞻）、平滑衰退概率（Chauvet-Piger） |
| 2 | L2 Sahm 规则（≥0.5 触发） | Sahm 规则实时值 |
| 3 | L3 活动综合：CFNAI（<-0.7 衰退） | 芝加哥联储全国活动指数 |
| 4 | L4 校准：NBER 衰退期 | NBER 衰退标记（0/1，柱） |

**分析顺序**：NY Fed（曲线模型，领先）先升预警 → 平滑概率（因子模型，同步）确认已入衰退；Sahm 规则逼近 0.5 = 劳动转弱；CFNAI <-0.7 = 广谱走弱；NBER 作历史校准基准。几种共振时衰退确认度高。

### 模板 ② — 增长动能 · 硬数据确认

| 图 | slotTitle | 序列（显示名） |
|----|-----------|----------------|
| 1 | L5 实际个人收入(除转移) | 实际个人收入(除转移支付) 同比 |
| 2 | L6 实际制造与贸易销售 | 实际制造与贸易销售 同比 |
| 3 | L5 实际可支配收入 | 实际可支配个人收入 同比 |
| 4 | L7 实际最终销售 | 实际最终销售 同比 |

**分析顺序**：这四条是 NBER 定衰退的同步硬数据（就业/IP 在其他域）。同比转负是衰退实质确认；实际最终销售剔除库存，比 GDP 更干净地反映动能。

## 与其他模板分工

| 主题 | 归属 | 本框架 |
|------|------|--------|
| 期限利差 10Y-3M / 10Y-2Y | 货币域 ①、经济 Overview ① | 收益率曲线衰退信号**引用货币域**，本框架用概率/规则/活动指数 |
| 非农就业、工业生产、初请失业金 | 就业域、经济 Overview | NBER 同步四指标里就业/IP 归各域；本框架补实际收入、实际销售两条 |
| 实际 GDP 环比年化 | 经济 Overview ① | 本框架用实际最终销售看剔除库存的需求，口径互补 |

## 决策树

| 观察 | 对照图位 | 典型结论 |
|------|----------|----------|
| NY Fed 概率高 + Sahm 逼近 0.5 | ①1 + ①2 | 衰退风险显著上升，缩减风险敞口 |
| CFNAI 深负 + 实际销售转负 | ①3 + ②2 | 广谱走弱 + 需求确认，衰退进行中 |
| 信号未亮 + 实际收入/最终销售仍正增 | ①全 + ②1/④ | 扩张延续，动能尚可 |
| Sahm 触发 + 实际可支配收入转负 | ①2 + ②3 | 劳动+收入双弱，消费拖累临近 |
| NY Fed 概率回落 + 最终销售回升 | ①1 + ②4 | 衰退风险缓解，周期或触底 |

## 变动率与时间轴

- DB 存**水平值**；变换由 `seriesCalcConfigMap` 计算。
- 概率类（NY Fed、平滑）、Sahm、CFNAI、USREC：`op: "none"`。
- **RECPROUSM156N（平滑概率）源为分数（0.54）**，用 `unit: "x100"` 转百分比，与已存百分比的 NY Fed 概率同图对齐。
- 收入/销售动能（W875RX1/CMRMTSPL/DSPIC96）：`op: "yoy"`, `frequency: "month"`。
- 实际最终销售 FINSLC1（季）：`op: "yoy"`, `frequency: "quarter"`。

## 数据源与更新

| 发布包 | 成员 | 调度 |
|--------|------|------|
| us.stlouisfed.recession_prob | RECPROUSM156N | probe 168h |
| us.stlouisfed.sahm | SAHMREALTIME | probe 168h |
| us.chicagofed.cfnai | CFNAI（phase2 复用） | probe 72h |
| us.nber.recession | USREC（phase2 复用） | probe 168h |
| us.bea.personal_income（新建日历包） | W875RX1、DSPIC96 | 经济日历 |
| us.census.mfg_trade_sales | CMRMTSPL | probe 72h |
| us.bea.gdp（现有，追加成员） | FINSLC1 | 经济日历 |
| （Agent C 抓取） | NY Fed 衰退概率（mds:nyfed_us_recession_prob） | probe 168h |

**NY Fed 衰退概率**由 Agent C 从官方 Excel 抓取（见 nyFedRecession 模块），本框架直接复用。

自检：`npm run data:verify-cycle-risk -- --db`。

## 每期 checklist

**模板 ①（每月，就业报告后）**：NY Fed / 平滑概率 → Sahm 实时值 → CFNAI → 对照 NBER。
**模板 ②（月度个人收入 / 季度 GDP 后）**：实际个人收入 → 实际销售 → 可支配收入 → 最终销售同比。

## 站内入口

| 入口 | 说明 |
|------|------|
| 宏观页 → 模板文件夹「美国增长动能与衰退风险」 | 模板 ① ② |
| `/admin/data-catalog` → 领先与深度 / 国内贸易与消费 | 序列更新状态 |
