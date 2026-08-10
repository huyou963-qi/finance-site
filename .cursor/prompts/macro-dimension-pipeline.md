# 宏观维度接入流水线（总览 / 编排入口）

> 目标：把「拆维度 → 定指标 → 复用已入库数据或补齐缺口 → 建模板画图写介绍」固化为可重复流水线（美国、中国及后续国家）。**数据接入不是默认步骤**：先盘点仓库和 DB，已入库且可用的指标只复用，不重新从外网抓取、不重复 seed、不新建发布包。
> 每个维度一个 Spec、一个分支 `feature/macro-<dimension>`、三个人工评审门。

## 流程

```
Agent A 框架规划 ──> docs/specs/<country>-<dim>.spec.md   【评审 1：指标选型】
      │                                    状态: draft → indicators-approved
      ▼
Agent B 复用核验 / API 接入（仅缺口）                 ┐
Agent C 复用核验 / 网页抓取接入（仅缺口）             ┴──>  【评审 2：数据质量】
      │                                    状态: → data-ready
      ▼
Agent D 模板构建（layout + 注册 + 介绍文案 + docs）
      │
      ▼
Agent E 端到端验证 ──> 验收报告                        【评审 3：图表与文案】
                                           状态: → template-ready → verified
```

## 手册索引

| Agent | 手册 | 产物 |
|-------|------|------|
| A 框架规划 | [agent-a-framework-planner.md](./agent-a-framework-planner.md) | Spec §1–§5 |
| B API 数据接入 | [agent-b-data-onboarding.md](./agent-b-data-onboarding.md) | seed catalog + 订阅 + 发布包 + verify |
| C 网页抓取接入 | [agent-c-web-scrape-onboarding.md](./agent-c-web-scrape-onboarding.md) | parser + adapter + 抓取调度 |
| D 模板构建 | [agent-d-template-builder.md](./agent-d-template-builder.md) | `<dim>AnalysisLayout.ts` + docs 双件套 |
| E 验证 | [agent-e-qa-verifier.md](./agent-e-qa-verifier.md) | 验收报告 + 负面清单更新 |

共享资产：[SPEC 模板](../../docs/specs/SPEC-TEMPLATE.md) · [已占用指标负面清单](../../docs/specs/USED-INDICATORS.md) · [六步接入清单](../../docs/DATA_SCHEDULER_ONBOARD.md) · [TE 抓取范本](./te-indicator-scrape.md)

## 已完成美国维度（规划于 2026-07，随评审调整）

| 优先级 | dimension id | 中文名 | 主要新数据源 |
|--------|--------------|--------|--------------|
| P0 试点 | `us-monetary-financial` | 美国货币政策与金融条件 | 全 FRED |
| P1 | `us-housing` | 美国住房与地产 | 全 FRED |
| P1 | `us-cycle-risk` | 美国增长动能与衰退风险 | FRED + NY Fed 概率（抓取） |
| P2 | `us-industry-inventory` | 美国制造业与库存周期 | FRED + ISM（已入库） |
| P2 | `us-consumer-balance` | 美国消费与居民资产负债 | 全 FRED |
| P3 | `us-external-dollar` | 美国对外部门与美元 | 全 FRED（2026-07 落地，见 `docs/specs/us-external-dollar.spec.md`） |

## 中国模板启动清单（先复用，后补缺）

中国维度的第一轮模板设计，应优先从已登记的官方数据域中选取：PMI、CPI、PPI、规模以上工业增加值、GDP、固定资产投资、房地产与 70 城房价、社会消费品零售、财政收支、货币与信用、外汇与国际收支、货物贸易。权威盘点入口是 `src/lib/data/scheduler/seedCatalogRegistry.ts`、各 `<provider>/catalog.ts`、`releasePackageCatalog.ts` 和对应的 `docs/specs/cn-*.spec.md`，而不是搜索引擎。

建议按九大目录主题组织为：国民经济（GDP、工业、消费、投资、PMI）、通胀与价格（CPI、PPI）、货币政策与流动性（货币信用）、财政与公共债务（财政）、地产与建筑（地产）、对外与汇率（贸易、SAFE）。每一维度开工先执行“入库优先门”：

1. 搜索 registry、catalog、已有 Spec、layout 与 `docs/specs/USED-INDICATORS.md`，列出候选 `mds:<instrumentCode>`；
2. 运行相应 `npm run data:verify -- --catalog=<catalog> -- --db`；DB 不可用时明确写为“待 DB 核验”，不得据此重复接入；
3. 将每条指标标为 `reuse_verified`、`reuse_needs_repair`、`gap_local_derived` 或 `gap_new_source`；只有最后一类才转 Agent B/C 做外网接入。`gap_local_derived` 只能复用已入库的原始水平值，在服务端/前端计算层生成，不能借机新抓源或把派生值伪装为原始观测。

## 全局纪律（各手册硬约束的汇总）

1. **入库优先**：先复用现有 `Instrument`、订阅、发布包和解析器；不得因新模板重复抓取、重复 seed 或新增平行数据源。既有数据有字段/调度缺陷时，修复既有域并在 Spec 记录，不另造序列。
2. 只新增不修改：现有模板 id、layout、migration、`MacroSection.tsx`、既有 seed/发布包成员一律不动；上述“修复既有数据缺陷”是唯一例外，须最小化且通过原域 verify。
3. 指标零重复：以 `docs/specs/USED-INDICATORS.md` 为准，**同一国家的新内置模板**重复即打回；跨国家同名指标不视为重复。
4. DB 只存水平值，YoY/MoM 由前端 `seriesCalcConfigMap` 计算。
5. 抓取三禁令：不入库付费 Key；不跳过 fixture 写 parser；未 `fetchAcquisition.known` 不参与调度。
6. 评审门之间 Agent 不得抢跑；但全量 `reuse_verified` 的维度可在评审 1 后直接由 Agent D 建模板，评审 2 只核验现有数据质量。
7. 每阶段完成回写 Spec（状态 + §6 勾选），Spec 是唯一事实来源。
