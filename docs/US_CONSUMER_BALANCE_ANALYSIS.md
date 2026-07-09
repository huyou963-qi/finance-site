# 美国消费与居民资产负债分析框架

本文档与宏观页内置模板、`consumerBalanceAnalysisLayout.ts`、`.cursor/prompts/us-consumer-balance-analysis-framework.md` 保持一致。
Spec 与接入记录见 [specs/us-consumer-balance.spec.md](./specs/us-consumer-balance.spec.md)。

## 核心问题（L0 文字判断）

> 居民消费动能在加速还是熄火？家庭资产负债表（财富、储蓄、偿债）是在支撑还是拖累消费？消费信贷扩张是否伴随信用质量恶化？

## 分析层级

| 层级 | 问题 | 主要指标（显示名） | 默认模板 |
|------|------|-------------------|----------|
| L1 高频零售 | 零售贸易冷热？ | 零售销售（零售贸易）同比 | ① 图 1 |
| L2 PCE 结构 | 耐用品 vs 服务谁在驱动？ | 实际 PCE 耐用品/服务同比 | ① 图 2 |
| L3 信心 | 消费意愿领先信号？ | 密歇根消费者信心 | ① 图 3 |
| L4 储蓄缓冲 | 储蓄率在补库存还是耗尽？ | 个人储蓄率 | ① 图 4 |
| L5 净财富 | 财富效应方向？ | 家庭净财富同比 | ② 图 1 |
| L6 偿债压力 | 债务服务占可支配收入？ | 家庭偿债比率 | ② 图 2 |
| L7 消费信贷 | 信贷扩张还是收缩？ | 总消费信贷/循环信贷同比 | ② 图 3 |
| L8 信用质量 | 信用卡核销是否抬头？ | 信用卡贷款核销率 | ② 图 4 |

## 两模板链条（宏观页 → 美国消费与居民资产负债）

内置 **2 个** 四图模板（`layoutMode: 4`），文件夹 `folder-builtin-us-consumer-balance`。模板介绍 Tab 按 **图 1–4** 展示分析思路（`chartIntroNotes`），**不**逐指标展开。

| 顺序 | 模板 ID | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-consumer-balance-spending` | 消费 · 支出与景气 | **默认第一步**：支出冷热与缓冲 |
| ② | `builtin-us-consumer-balance-balance-sheet` | 居民 · 资产负债与信用 | 财富效应与信用风险 |

### 模板 ① — 消费 · 支出与景气

| 图 | slotTitle | 序列（显示名） |
|----|-----------|----------------|
| 1 | L1 高频：零售贸易 | 零售销售（零售贸易）同比 |
| 2 | L2 PCE 结构：耐用品 vs 服务 | 实际 PCE 耐用品同比、实际 PCE 服务同比 |
| 3 | L3 信心：密歇根 | 密歇根消费者信心 |
| 4 | L4 储蓄缓冲 | 个人储蓄率 |

**分析顺序（`chartIntroNotes` 摘要）**：

1. 图 1：RSXFS（零售贸易）同比 — 高频温度计；与 Overview 的 RSAFS（含餐饮）口径互补
2. 图 2：耐用品先掉、服务仍强 = 软着陆式放缓；两者同掉 = 需求全面收缩
3. 图 3：密歇根信心领先硬数据 1–3 月；深跌而零售未跟 = 情绪噪声
4. 图 4：储蓄率↑可缓冲冲击，过高也可能是预防性储蓄

### 模板 ② — 居民 · 资产负债与信用

| 图 | slotTitle | 序列（显示名） |
|----|-----------|----------------|
| 1 | L5 净财富 | 家庭净财富同比 |
| 2 | L6 偿债压力 | 家庭偿债比率 |
| 3 | L7 消费信贷：总量 vs 循环 | 总消费信贷同比、循环消费信贷同比 |
| 4 | L8 信用质量：信用卡核销 | 信用卡贷款核销率 |

**分析顺序（`chartIntroNotes` 摘要）**：

1. 图 1：净财富同比转负后消费常滞后 1–2 季走弱
2. 图 2：偿债比率抬升 = 财务压力，限制加杠杆
3. 图 3：循环信贷更敏感；总量↑而循环↓ = 结构转向分期/车贷
4. 图 4：核销率滞后于货币域拖欠率；抬头确认信用周期下行

## 与其他模板分工

| 主题 | 归属 | 本框架不做 |
|------|------|------------|
| 实际 PCE（PCEC96）、零售销售总额（RSAFS） | 经济 Overview ② | 用 RSXFS + PCE 耐用品/服务分项 |
| 实际可支配收入 DSPIC96、实际个人收入(除转移) | 增长动能与衰退风险 ② | 收入动能归周期域；本框架看储蓄/偿债缓冲 |
| 信用卡拖欠率 DRCCLACBS | 货币政策与金融条件 ② | 用核销率 CORCCACBS（损失确认） |
| 住房抵押拖欠 / 房价 | 住房与地产 | 只看 Z.1 净财富总量 |

## 决策树（两模板完成后）

| 观察 | 对照图位 | 典型结论 |
|------|----------|----------|
| 零售同比转负 + 耐用品先掉 | ① 图 1 + 图 2 | 商品消费收缩，关注是否传导至服务 |
| 信心深跌但零售仍稳 | ① 图 3 + 图 1 | 情绪噪声，硬数据优先 |
| 储蓄率低位 + 偿债比抬升 | ① 图 4 + ② 图 2 | 缓冲耗尽，消费脆弱 |
| 净财富同比转负 + 零售走弱 | ② 图 1 + ① 图 1 | 财富效应拖累确认 |
| 循环信贷同比↑ + 核销率抬头 | ② 图 3 + 图 4 | 加杠杆同时质量恶化 |

## 变动率与时间轴

- DB 存**水平值**；变换由宏观页 `seriesCalcConfigMap` 计算。
- 月频 yoy（RSXFS/PCEDGC96/PCESC96/TOTALSL/REVOLSL）：`op: "yoy"`，`frequency: "month"` + `resampleMethod: "end"`。
- 季频 yoy（TNWBSHNO）：同上（前端按月对齐季末）。
- 水平值（UMCSENT/PSAVERT/TDSP/CORCCACBS）：`op: "none"`、`frequency: "keep"`。

## 数据源与更新（全 FRED，无抓取）

| 发布包 | 成员 | 调度 |
|--------|------|------|
| us.bls.retail_sales | RSAFS（既有）+ RSXFS | 经济日历 |
| us.bea.personal_income | W875RX1/DSPIC96（既有）+ PCEDGC96/PCESC96/PSAVERT | 经济日历 |
| us.umich.sentiment | UMCSENT（复用） | 经济日历 |
| us.frb.g19_consumer_credit | TOTALSL、REVOLSL | probe 72h |
| us.frb.z1_household | TNWBSHNO | probe 168h |
| us.frb.household_dsr | TDSP | probe 168h |
| us.frb.chargeoff_delinquency | … + CORCCACBS | probe 168h |

自检：`npm run data:verify-consumer-balance -- --db`（或 `npm run data:verify -- --catalog=consumer-balance -- --db`）。
