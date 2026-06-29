# 美国经济 Overview 分析框架

本文档与宏观页内置模板、`overviewAnalysisLayout.ts`、`.cursor/prompts/us-overview-analysis-framework.md` 保持一致。

## 核心问题（L0 文字判断）

> 美国经济处于扩张、放缓、还是衰退风险上升？通胀是否仍偏离 2%？劳动力是否仍偏紧？货币政策对实体经济是支撑还是制约？

用 **总量支柱（L1/L3/L4/L5）+ 支出法支柱（L2C/I/G/X）+ 可选调查（L2S）** 回答；**不含** 股指、VIX、原油、黄金、Net Liquidity 等市场/流动性交易指标。

| 支柱 | 回答什么 | 默认模板 |
|------|----------|----------|
| L1 产出与周期 | GDP、工业生产 | ① 图 1 |
| L2C 消费 | 实际 PCE、零售 | ② 图 1 |
| L2I 投资 | 私人固定投资、新屋开工 | ② 图 2 |
| L2X 外部 | 出口、进口 | ② 图 3 |
| L2G 政府 | 联邦赤字/GDP、政府消费 | ② 图 4 |
| L2S 调查 | ISM 制造/非制造 PMI | **目录自选**（不进默认 8 槽） |
| L3 劳动力 | 失业、非农 | ① 图 2 |
| L4 价格与目标 | CPI、核心 PCE | ① 图 3 |
| L5 政策与传导 | 联邦基金目标、10Y-2Y | ① 图 4 |

**双模板 16 个 roleId 零重复**：模板 ① 覆盖总量与政策；模板 ② 按 GDP 支出法拆分 C/I/G/X。

## 两模板链条（宏观页 → 美国经济 Overview）

内置 **2 个** 四图模板（`layoutMode: 4`），文件夹 `folder-builtin-us-economy`。

| 顺序 | 模板 ID | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-econ-overview` | 经济 Overview · 总量与政策 | **默认第一步** |
| ② | `builtin-us-econ-demand` | 经济 Overview · 支出法结构 | 需拆分消费/投资/政府/进出口时 |

### 模板 ① — 总量与政策

| 图 | slotTitle | 序列 |
|----|-----------|------|
| 1 | L1 增长：GDP vs 工业 | 实际 GDP 环比折年率、工业生产 YoY |
| 2 | L3 就业：失业 vs 非农 | 失业率、新增非农（PAYEMS 差分柱） |
| 3 | L4 通胀锚：CPI vs 核心 PCE | CPI YoY、核心 PCE YoY |
| 4 | L5 政策：目标利率 vs 曲线 | 联邦基金目标利率、10Y-2Y 利差（右轴） |

### 模板 ② — 支出法结构

| 图 | slotTitle | 序列 |
|----|-----------|------|
| 1 | L2C 消费：PCE vs 零售 | 实际 PCE YoY、零售 YoY |
| 2 | L2I 投资：私人固投 vs 新屋开工 | 实际私人固定投资 YoY、新屋开工（右轴） |
| 3 | L2X 外部：出口 vs 进口 | 实际出口 YoY、实际进口 YoY |
| 4 | L2G 政府：赤字/GDP vs 政府消费 | 联邦赤字/GDP %、实际政府消费 YoY（右轴） |

**ISM 调查（L2S，可选）**

| 显示名 | 仪器 code | 更新方式 |
|--------|-----------|----------|
| ISM 制造业 PMI | `ism_us_ism_headline` | Excel 历史 + TE `sync-ism-te` |
| ISM 非制造业 PMI | `ism_svc_us_svc_headline` | Excel 历史 + TE `sync-ism-svc-te` |

从宏观目录自选加入图表；**不占** 默认 8 图槽，避免与 FRED 支出法序列重复占位。

## 与其他模板分工

| 主题 | 使用模板 |
|------|----------|
| CPI 分项、OER、能源结构 | 美国通胀分析（CPI） |
| JOLTS、初请、U-6、时薪 | 美国就业市场 |
| 股指、VIX、WTI、PE | **不** 在本框架；用原 `US_Overview` xlsx 模板或行情页 |

## 变动率规则

| 序列 | calc |
|------|------|
| GDP SAAR、失业、Fed 目标、赤字/GDP、新屋开工 | `none` |
| CPI / PCE / 零售 / 实际 PCE / 固投 / 进出口 / 政府消费 | `yoy` |
| PAYEMS | `diff`（非农增量，**非水平**） |
| 10Y-2Y、DFEDTARU | `none` + 月均对齐月频图 |

## 站内入口

| 入口 | 说明 |
|------|------|
| 宏观模板 | 宏观页 → **美国经济 Overview** 文件夹 |
| 布局源码 | `src/lib/data/overviewAnalysisLayout.ts` |
| 源台账 | `src/lib/data/overviewSourceRegistry.ts` |
| FRED 种子 | `npm run data:seed-overview` |
| 自检 | `npm run data:verify-overview -- --db` |
| ISM TE | `npm run data:seed-ism-te` · `data:seed-ism-svc-te` |
| 调度说明 | `docs/DATA_SCHEDULER_OVERVIEW.md` |

## 定稿数据源

§3.1 共 **18** 条经济角色：**16** 条进默认双模板 + **2** 条 ISM 可选。默认模板 FRED **16** 条（无 TBD）。

运行 `npm run data:seed-overview` 后 `npm run data:worker` 拉取新序列，再 `npm run data:verify-overview -- --db` 检查观测。
