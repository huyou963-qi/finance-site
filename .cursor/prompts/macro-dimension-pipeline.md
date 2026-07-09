# 宏观维度接入流水线（总览 / 编排入口）

> 目标：把「拆维度 → 定指标 → 数据入库与持续更新 → 建模板画图写介绍」固化为可重复流水线（仅美国）。
> 每个维度一个 Spec、一个分支 `feature/macro-<dimension>`、三个人工评审门。

## 流程

```
Agent A 框架规划 ──> docs/specs/us-<dim>.spec.md          【评审 1：指标选型】
      │                                    状态: draft → indicators-approved
      ▼
Agent B API 接入（FRED/世行/Treasury/CFTC/BIS/xlsx）┐
Agent C 网页抓取接入（TE 页 / 新站点 parser）        ┴──>  【评审 2：数据质量】
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

## 维度排期（规划于 2026-07，随评审调整）

| 优先级 | dimension id | 中文名 | 主要新数据源 |
|--------|--------------|--------|--------------|
| P0 试点 | `us-monetary-financial` | 美国货币政策与金融条件 | 全 FRED |
| P1 | `us-housing` | 美国住房与地产 | 全 FRED |
| P1 | `us-cycle-risk` | 美国增长动能与衰退风险 | FRED + NY Fed 概率（抓取） |
| P2 | `us-industry-inventory` | 美国制造业与库存周期 | FRED + ISM（已入库） |
| P2 | `us-consumer-balance` | 美国消费与居民资产负债 | 全 FRED |
| P3 | `us-external-dollar` | 美国对外部门与美元 | 全 FRED（2026-07 落地，见 `docs/specs/us-external-dollar.spec.md`） |

## 全局纪律（各手册硬约束的汇总）

1. 只新增不修改：现有模板 id、layout、migration、`MacroSection.tsx`、既有 seed/发布包成员一律不动。
2. 指标零重复：以 `docs/specs/USED-INDICATORS.md` 为准，重复即打回。
3. DB 只存水平值，YoY/MoM 由前端 `seriesCalcConfigMap` 计算。
4. 抓取三禁令：不入库付费 Key；不跳过 fixture 写 parser；未 `fetchAcquisition.known` 不参与调度。
5. 评审门之间 Agent 不得抢跑（数据没 `data-ready` 不建模板）。
6. 每阶段完成回写 Spec（状态 + §6 勾选），Spec 是唯一事实来源。
