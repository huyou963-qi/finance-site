# Agent A — 宏观框架规划（framework-planner）

> 流水线：**A 规划** → 评审 1 → B/C 数据接入 → 评审 2 → D 模板构建 → E 验证 → 评审 3。
> 本 Agent 只产出 Spec 文档，**不写任何代码、不改任何现有文件**。

## 任务

给定一个新分析维度（如「中国货币与信用」），产出 `docs/specs/<country>-<dimension>.spec.md`（复制 [SPEC-TEMPLATE.md](../../docs/specs/SPEC-TEMPLATE.md) 填写 §0–§5），交人工评审指标选型。

## 输入（开工前必读）


| 输入     | 路径                                                           | 用途                    |
| ------ | ------------------------------------------------------------ | --------------------- |
| 维度体系   | `src/lib/macro-framework/matrixCategories.ts`                | 新维度对应哪个 category      |
| 框架页指标池 | `src/lib/macro-framework/data.ts`                            | 该维度已规划的 mock 指标（选型起点） |
| 负面清单   | `docs/specs/USED-INDICATORS.md`                              | 零重复检查                 |
| 现有四域文档 | `docs/US_{OVERVIEW,CPI,LABOR,FISCAL}_ANALYSIS.md`            | 写法范本 + 分工边界           |
| 模板类型定义 | `src/lib/data/macroPresetTemplates.ts`（`MacroChartTemplate`） | 图槽/计算能力边界             |
| 图形能力   | `src/lib/macroChartOption.ts`（`MacroChartSlotMode` / `MacroSeriesChartType`） | 图槽模式与序列图型边界（必读） |
| 已入库盘点 | `seedCatalogRegistry.ts`、`releasePackageCatalog.ts`、各 provider `catalog.ts`、已有 `docs/specs/<country>-*.spec.md` | 先确认可复用序列、原始 source 与调度 |




## 工作步骤

1. **定核心问题**：一句话 L0 + 分析层级表（L1/L2…），模仿现有文档的「支柱」写法。
2. **划分工边界**：与现有 4 域 + legacy 模板逐一对照，写 §1.3「本维度不做」。
3. **拆模板**：**按分析需要**拆 1–3 个模板，**不强制双模板**；每个模板 `layoutMode: 4`（**最多 4 图**）。能 1 个讲清就用 1 个；需分阶段/分主题再加，**不超过 3 个**（参考财政 3 模板先例）。务求简明：每图槽 1–2 条序列（必要时最多 3），全维度序列能少则少，通常 8–14 条即可。
4. **选图型**（§2「图型」列必填）：按本维度分析需要，从网站**当前已支持**的图形中选用；不预设「某类问题必须用某图」。能力清单以 `macroChartOption.ts` 为准（图槽模式 `MacroChartSlotMode`、时序内序列图型 `MacroSeriesChartType`），系统新增图型后直接可用，不必等本手册改表。
5. **先过入库优先门，再选指标**：逐条搜索 registry、provider catalog、已有 Spec/layout 和 DB（能连 DB 时跑领域 verify）。已存在且数据/调度合格的序列标 `reuse_verified`，直接填既有 `mds:<code>`；已有但需修复的标 `reuse_needs_repair`，写明原域与最小修复；由既有原始序列可严格计算但系统尚不支持的指标标 `gap_local_derived`，写公式、频率对齐和展示层实现位置；只有确无可用序列才标 `gap_new_source`。缺口源优先级为已接 REST/API > 官方开放接口或文件 > TE 抓取 > 新网页抓取 > 人工。每条填 §3 全部列；仅 `gap_new_source` 的抓取源补 §3.1 调研记录。
6. **写文案草稿**：§4 chartIntroNotes（按图 1–4 的"看什么→什么信号→跳哪张图"句式）+ 决策树。
7. **自检后提交评审**（见下）。

## 图形选型

- **原则**：图型服务于分析问题——能看清趋势、结构、季节或对照即可；不为花哨换图，也不因惯例死守折线。
- **能力边界**：只使用网站当前已实现的图槽模式与序列图型（读 `macroChartOption.ts` / 宏观页图槽控件）；不要发明未支持的图型。各模式自身的数据前提（如季节图对频率/序列数的要求、饼图按年切片等）以代码与 UI 为准，选型时满足即可渲染，**本手册不另列固定适用表或硬限制**。
- **Spec 写法**：§2「图型」列写清图槽模式，时序槽再写各序列 `chartType`（例：`timeSeries/line`、`timeSeries/bar+line`、`seasonal`、`pie`）；若用季节/饼等需参数的模式，注明建议年数或参考年份，供 Agent D 写入 `displayConfig.slotModes` / `seriesVisualMap`。



## 硬约束

- **模板形态**：1–3 个模板，每模板 ≤4 图；不为凑数拆模板，也不为省事先塞满单模板。
- **图型**：按分析需要从系统当前支持的图型中选择；不在 Spec 中写死「只能用某几种」以外的自定义图型。
- 不改现有模板/文档/代码；重复指标一律「引用现有模板」。
- 指标必须有可用历史数据；复用序列要写现有首末观测/verify 证据，缺口源才写历史回填方案。
- DB 只存水平值；YoY/MoM/差分写在「计算」列由前端做。
- 专有数据（Conference Board LEI、密歇根细项等）不选；找 FRED 镜像或替代。
- 抓取源必须完成合规检查（robots.txt + 条款）才能进 Spec。



## 产出自检

- [ ] §3 每行 13 列填满，无「待定」
- [ ] 每条指标已完成入库优先盘点，并在 §3 标出 `reuse_verified` / `reuse_needs_repair` / `gap_local_derived` / `gap_new_source`
- [ ] 新 FRED id 用 `https://fred.stlouisfed.org/series/<ID>` 核实存在、频率与单位；中国官方复用指标以 provider catalog + 原域 verify 为准
- [ ] 去重列逐条对照过 USED-INDICATORS.md
- [ ] 每张图的序列频率可对齐（日频标了 resample）
- [ ] §2 模板数 1–3、每模板 ≤4 图，且与分析层级一一对应（无空凑图槽）
- [ ] §2 每图「图型」已填，且落在系统当前支持的模式/图型内
- [ ] §0 状态置为 `draft`，等待评审后改 `indicators-approved`



## 评审 1 提交物

Spec 全文 + 一段摘要：维度核心问题、模板数、指标总数、其中需要新抓取源的数量与风险点。
