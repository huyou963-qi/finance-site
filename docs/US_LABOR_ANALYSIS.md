# 美国就业市场分析框架

与宏观页内置模板、`laborAnalysisLayout.ts`、`.cursor/prompts/us-labor-analysis-framework.md` 保持一致。

## 两模板链条

| 顺序 | 模板 ID | 名称 |
|------|---------|------|
| ① | `builtin-us-labor-overview` | 就业诊断 · 总览 |
| ② | `builtin-us-labor-drivers` | 就业驱动 · 流动与领先 |

### 模板 ① — 就业诊断 · 总览

| 图 | 标题 | 序列 | 变换 |
|----|------|------|------|
| 1 | 松紧：U-3 vs U-6 | 失业率、U-6 广义失业率 | 水平 % |
| 2 | 动能：非农环比 | 非农就业人数 | 环比 % |
| 3 | 供给：参与率 | 劳动参与率、25–54 岁参与率 | 水平 % |
| 4 | 工资：时薪同比 | 平均时薪（全体私营） | 同比 % |

### 模板 ② — 就业驱动 · 流动与领先

| 图 | 标题 | 序列 | 变换 |
|----|------|------|------|
| 1 | 紧张度：空缺 vs 离职 | 岗位空缺率、离职率 | 水平 % |
| 2 | 流动：雇佣 vs 离职 | 雇佣率、离职率 | 水平 % |
| 3 | 领先：初请失业金 | 初请失业金 | 周频 → 月均 |
| 4 | 深度：久期 vs 工时 | 平均失业周数、平均周工时 | 双轴水平 |

**跨模板不重复**：12 条 FRED 序列各出现一次（离职率在模板 ② 用两个 virtualKey 展示于图 1、2）。

## 决策树（简要）

| 观察 | 对照 |
|------|------|
| U-6 − U-3 差扩大 | 图 1 广义 slack |
| 非农环比走弱、U-3 仍低 | 图 3 参与率；模板 ② 空缺 |
| 时薪 YoY 高、工时降 | 图 4 + CPI 驱动模板 |
| 空缺降、初请升 | 模板 ② 图 1 + 图 3 |

## 定稿 FRED 序列（20 条）

运行 `npm run data:verify-labor -- --db` 校验订阅与近期观测。

**默认模板（12）**：`UNRATE`、`U6RATE`、`PAYEMS`、`CIVPART`、`LNS11300060`、`CES0500000003`、`JTSJOR`、`JTSQUR`、`JTSHIR`、`ICSA`、`UEMPMEAN`、`AWHNONAG`

**目录自选（8）**：`JTSJOL`、`UNEMPLOY`、`EMRATIO`、`CCSA`、`USPRIV`、`USGOVT`、`MANEMP`、`AHETPI`

## 站内入口

- 宏观页 → **美国就业市场** 文件夹
- 模板介绍 Tab → 按图 1–4（`chartIntroNotes`）
- 运维：`docs/DATA_SCHEDULER_LABOR.md`
