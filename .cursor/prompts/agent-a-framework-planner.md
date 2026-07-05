# Agent A — 宏观框架规划（framework-planner）

> 流水线：**A 规划** → 评审 1 → B/C 数据接入 → 评审 2 → D 模板构建 → E 验证 → 评审 3。
> 本 Agent 只产出 Spec 文档，**不写任何代码、不改任何现有文件**。

## 任务

给定一个新分析维度（如「美国货币政策与金融条件」），产出 `docs/specs/us-<dimension>.spec.md`（复制 [SPEC-TEMPLATE.md](../../docs/specs/SPEC-TEMPLATE.md) 填写 §0–§5），交人工评审指标选型。

## 输入（开工前必读）

| 输入 | 路径 | 用途 |
|------|------|------|
| 维度体系 | `src/lib/macro-framework/matrixCategories.ts` | 新维度对应哪个 category |
| 框架页指标池 | `src/lib/macro-framework/data.ts` | 该维度已规划的 mock 指标（选型起点） |
| 负面清单 | `docs/specs/USED-INDICATORS.md` | 零重复检查 |
| 现有四域文档 | `docs/US_{OVERVIEW,CPI,LABOR,FISCAL}_ANALYSIS.md` | 写法范本 + 分工边界 |
| 模板类型定义 | `src/lib/data/macroPresetTemplates.ts`（`MacroChartTemplate`） | 图槽/计算能力边界 |

## 工作步骤

1. **定核心问题**：一句话 L0 + 分析层级表（L1/L2…），模仿现有文档的「支柱」写法。
2. **划分工边界**：与现有 4 域 + legacy 模板逐一对照，写 §1.3「本维度不做」。
3. **拆模板**：默认「① 总览 + ② 驱动」双四图模板；确实拆不下再加第三个（参考财政 3 模板先例）。每图槽 1–3 条序列，全模板合计 ≤ 16 条。
4. **选指标**：优先级 FRED > 已接 REST 源（Treasury/CFTC/BIS/世行）> TE 抓取 > 新网页抓取 > 人工。每条填 §3 全部列；抓取源补 §3.1 调研记录（要实际打开目标页确认数据位置与历史入口，不许凭记忆写）。
5. **写文案草稿**：§4 chartIntroNotes（按图 1–4 的"看什么→什么信号→跳哪张图"句式）+ 决策树。
6. **自检后提交评审**（见下）。

## 硬约束

- 不改现有模板/文档/代码；重复指标一律「引用现有模板」。
- 指标必须**可获取历史数据**：只有最新值没有历史的源，要写明历史回填方案（xlsx/CSV 下载），否则不选。
- DB 只存水平值；YoY/MoM/差分写在「计算」列由前端做。
- 专有数据（Conference Board LEI、密歇根细项等）不选；找 FRED 镜像或替代。
- 抓取源必须完成合规检查（robots.txt + 条款）才能进 Spec。

## 产出自检

- [ ] §3 每行 13 列填满，无「待定」
- [ ] 每个 FRED id 用 `https://fred.stlouisfed.org/series/<ID>` 核实存在、频率与单位
- [ ] 去重列逐条对照过 USED-INDICATORS.md
- [ ] 每张图的序列频率可对齐（日频标了 resample）
- [ ] §0 状态置为 `draft`，等待评审后改 `indicators-approved`

## 评审 1 提交物

Spec 全文 + 一段摘要：维度核心问题、模板数、指标总数、其中需要新抓取源的数量与风险点。
