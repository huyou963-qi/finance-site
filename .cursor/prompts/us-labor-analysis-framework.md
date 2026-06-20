# Prompt：美国就业市场分析框架 — FRED 入库、指标树、调度与宏观模板

---

## 任务目标

以 **美国专业宏观劳动力市场分析师** 视角，在本仓库 **finance-site** 内落地一套可复用的 **美国就业市场分析框架**。框架须 **简单清晰**：先回答「劳动力松紧与新增就业」，再按需追「岗位流动与领先指标」，并能与 CPI 框架中的工资/失业面板 **叙事衔接**（但不重复建两套相同曲线）。

1. **分析方法论**：从 **失业率 / 广义失业（U-6）** 与 **非农就业动能** 出发，判断劳动力市场 **偏紧还是偏松**；再用 **参与率**、**工资**、**JOLTS 流动**、**初请失业金** 定位主因
2. **数据管道**：先检查指标是否已在数据库中；若无则从 FRED 拉取，写入 PostgreSQL（`mds` schema），接入现有 **data-scheduler**
3. **指标有效性**：**在写入种子 / 模板 / 目录之前**，逐条验证 FRED 序列 **仍在更新、有近年的观测值**；无效或 **ID 与分析角色不符** 的序列 **不得** 进入框架
4. **指标树**：在 `fredCatalog.ts` 中将 **已通过有效性检查** 的指标挂到 **美国 → 就业与工资**（及必要子类）
5. **更新机制**：在 `/admin/data-catalog` 展示 **下次更新时间、发布规则、拉取状态**；补充 `docs/DATA_SCHEDULER_LABOR.md`（可仿 CPI 运维文档）
6. **宏观模板**：内置 **2 个** 四图模板（`layoutMode: 4`），**跨模板指标不重复**；方法论写在 **按图** 的 `chartIntroNotes`；其余序列留在目录供自选

**禁止**只写分析文字而不改代码；**禁止**要求用户在 UI 手工录入 FRED 数据；**禁止**把 `FRED_API_KEY` 写入代码或种子 JSON；**禁止**未经有效性检查就把 FRED ID 写入种子、目录或模板。

---

## 第〇部分：指标有效性门禁（确定框架清单前 **必须先做**）

§1.1 / §3.2 中的序列是 **分析角色占位**（Headline 失业、U-6、非农增势等），**不是** 可直接写死的 FRED ID 列表。BLS / FRED 存在 **同名易混 ID**（例：`LNS14000006` 是 **黑人失业率**，不是 U-6）。Agent **必须先验证、再入库、再写模板**。

### 0.1 什么叫「有效」

| 检查项 | 月频（失业、非农、参与率、JOLTS、时薪、工时） | 周频（初请 / 续请失业金） |
| --- | --- | --- |
| **FRED 可拉取** | `GET /series/observations?limit=1&sort_order=desc` 返回 HTTP 200 且有数值 | 同上 |
| **最近观测** | 最新 `obsDate` 不早于 **当前月 − 3 个自然月**（例：2026-06 执行时 ≥ 2026-03-01） | 最新 `obsDate` 不早于 **当前日 − 7 个自然日** |
| **未明显停更** | FRED `observation_end`（若有）满足上述窗口；或 DB `MacroObservation` 最大日期满足窗口 | 同上 |
| **分析可用** | 宏观页 **提取数据** 后，近 12 个月非空点 ≥ 6（变动率序列按变换后计） | 近 8 周非空点 ≥ 6 |

**JOLTS 特例**：相对 **非农（CES）** 通常 **滞后约 1 个月** 发布；2026-06 验证时 JOLTS 最新 obs 为 **2026-04** 仍视为 **有效**，勿与 CES 最新月强行对齐判失败。

任一不满足 → 标记为 **无效**，**不得** 进入 `laborFredSeedCatalog.ts`、`fredCatalog.ts`、四图模板。

### 0.2 验证顺序（Agent 必须执行）

```
1. 列出 §3.2 候选 fredId + 分析角色（L0–L4）
2. 对每条调用 FRED API（或 npm run data:probe-sources）取最新 obs 与 series 标题（核对口径）
3. 无效 / 错配项：搜索同主题替代 ID，记录「原 ID → 新 ID → 原因」
4. 更新 laborFredSeedCatalog / fredCatalog / laborAnalysisLayout / 模板 — 仅含 **有效 ID**
5. npm run data:seed-labor && npm run data:worker && npm run data:verify-labor -- --db
6. 汇报附 **有效序列表**（显示名、fredId、最新 obs、是否替换）
```

**推荐命令**（需 `.env.local` 中 `FRED_API_KEY`）：

```bash
curl "https://api.stlouisfed.org/fred/series/observations?series_id=UNRATE&sort_order=desc&limit=1&api_key=$FRED_API_KEY&file_type=json"

npm run data:seed-labor          # 待实现
npm run data:worker
npm run data:verify-labor -- --db # 待实现，须含 §0.1 近期 obs 检查
```

### 0.3 无效时的处理原则

| 情况 | 动作 |
| --- | --- |
| 同主题有 **现行 BLS / FRED 主序列** | 替换 `fredId`，更新 `catalogKey`、virtualKey、日历映射 |
| 仅 **聚合替代**（如细分停更但总非农仍可用） | 改用上一级有效序列，并在 `docs/US_LABOR_ANALYSIS.md` 与模板介绍 **注明口径** |
| **无合适替代** | 从四图模板 **剔除** 该 panel 序列 |
| 角色仍需要但 ID 变更 | **中文 displayName / 分析角色** 不变，只换 `fredId` |

**禁止**：明知停更仍写入种子；禁止 UI 展示「有名字无数据」的指标。

### 0.4 常见失效模式（排查时对照）

| 原候选 / 误区 | FRED 实际含义 | 定稿处理 |
| --- | --- | --- |
| ~~`LNS14000006`~~ | **黑人或非洲裔** 失业率，不是 U-6 | 用 **`U6RATE`**（U-6 广义失业率） |
| ~~`LNS13000000`~~ 等 | 无效 ID（400） | 勿用 |
| `fredCatalog` 中 **`AHETPI` 标为「同比 %」** | 实为 **生产与非监督岗位** 平均时薪 **美元/小时** 水平值 | 框架默认工资用 **`CES0500000003` + YoY**；`AHETPI` 仅目录自选并 **修正 label** |
| **`PAYEMS` 水平** 直接算 YoY | 可行但 **发布月更常看环比动能** | 模板 ① 图 2 用 **`pctChange`（环比 %）** |
| **JOLTS 水平 vs 比率混用** | `JTSJOL`（千人）与 `JTSJOR`（%）量纲不同 | 默认模板用 **比率**（`JTSJOR` / `JTSQUR` / `JTSHIR`）；`JTSJOL` 留目录 |
| **初请失业金单周尖刺** | 节假日 / 罢工扰动 | 图 3 看 **月内均值或 4 周均线**（resample `avg`），勿过度解读单点 |
| 仅写 Prompt、从未 worker 拉过 | DB 无观测 | 须先 `data:worker` 再判定 |

---

## 第一部分：就业市场分析框架（须在 `docs/US_LABOR_ANALYSIS.md` 与模板介绍中体现）

### 1.1 分析层级（自上而下）

图表、表格、模板介绍、已选指标列表中 **一律显示中文指标名**（来自 `fredCatalog.ts` 的 `label` 或 `laborAnalysisLayout.ts` 的 `displayName`）。FRED ID 仅出现在代码、`catalogKey`、种子与运维日志中。

| 层级 | 问题 | 主要指标（显示名） | 默认模板 |
| --- | --- | --- | --- |
| **L0 松紧** | 劳动力市场偏紧还是偏松？狭义 vs 广义失业差多大？ | 失业率（U-3）、U-6 广义失业率 | ① 图 1 |
| **L1 增势** | 新增就业加速还是放缓？ | 非农就业人数（环比 %） | ① 图 2 |
| **L2 供给** | 劳动参与是否回升？ prime-age 是否仍低于疫情前？ | 劳动参与率、25–54 岁参与率 | ① 图 3 |
| **L3 成本** | 工资与工时是否仍偏强？ | 平均时薪（全体私营）同比、平均周工时 | ① 图 4；② 图 4（工时） |
| **L4 流动** | 岗位空缺与离职是否仍高？雇佣是否跟上？ | 岗位空缺率、离职率、雇佣率 | ② 图 1–2 |
| **L5 领先** | 裁员压力是否上升？失业者停留多久？ | 初请失业金（周）、平均失业周数 | ② 图 3–4 |
| **L6 结构**（**不进默认模板**，目录自选） | 私营 vs 政府？制造业？ | 私营非农、制造业就业、就业人口比 | 目录 |

### 1.2 指标元数据（目录与模板介绍须可核对）

| 属性 | 就业系列典型值 |
| --- | --- |
| **显示名** | 见 §3.2 |
| **国家** | `US` / 美国 |
| **单位** | 失业率 / 参与率 / JOLTS 率：**Percent**；非农：**Thousands of Persons**；时薪：**USD/Hour**；工时：**Hours**；初请：**Number** |
| **频率** | 月（CES / CPS / JOLTS）；周（UI claims） |
| **来源** | **BLS**（CES、CPS、JOLTS）；**DOL**（初请，经 FRED） |
| **更新时间** | **非农 + 失业 + 时薪**：每月第一个周五 **8:30 ET**（就业报告）；**JOLTS**：约滞后 1 个月；**初请**：每周四 8:30 ET |

**实现检查点**：

- `fredCatalog.ts` 每条含 `label`（中文）、`frequency`
- `laborFredSeedCatalog.ts` / Instrument `metadata` 含 `countryCode: US`、`unit`、`source`
- `/admin/data-catalog` 展示 `nextRunAt`、`releaseRuleSummary`
- 修正 `AHETPI` 等 **错误 catalog label**（若仍保留该 ID）

### 1.3 变动率计算规则（与宏观页 `seriesCalcConfigMap` 一致）

FRED 入库 **原始水平**；图表层变换，**不在 DB 预存 YoY / 环比**。

| 序列类型 | `seriesCalcConfigMap` 推荐 | 说明 |
| --- | --- | --- |
| **已是 % 的序列**（`UNRATE`、`U6RATE`、`CIVPART`、`LNS11300060`、`JTSJOR`、`JTSQUR`、`JTSHIR`） | `op: "none"` | 勿再 yoy |
| **非农 `PAYEMS`（千人）** | `op: "pctChange"`, `frequency: "month"`, `resampleMethod: "end"` | 发布月看 **环比 %** 动能 |
| **时薪 `CES0500000003`（美元/小时）** | `op: "yoy"`, `frequency: "month"` | 工资同比 |
| **周频 `ICSA` / `CCSA`** | `op: "none"`, `frequency: "month"`, `resampleMethod: "avg"` | 与月频序列并表对齐 |
| **周工时 `AWHNONAG`、周数 `UEMPMEAN`** | `op: "none"` | 水平解读 |

**时间轴 canonical 键**：与 CPI 框架相同，见 `src/lib/macroPeriodLabel.ts`（月频 `YYYY-MM-01`，表格展示 `YYYY-MM`）。

### 1.4 两模板分析链条（总览）

**原则**：80% 场景只加载 **模板 ①**；需要解释「岗位流动 / 领先裁员 / 失业久期」时再加载 **模板 ②**。与 **CPI 驱动模板** 的关系：CPI 模板 ② 图 3 仅保留 **失业 + 时薪** 服务通胀视角；本框架 **展开** 劳动力全貌，**不** 在就业模板中重复 CPI / PCE。

```
模板 ① 就业诊断 · 总览（必看）
    图1  U-3 vs U-6 失业率          → 松紧与广义 slack
    图2  非农就业 环比 %            → 新增就业动能（发布月核心）
    图3  参与率 vs  prime-age 参与率 → 供给端是否释放
    图4  平均时薪 同比              → 工资压力
    → 能写 1–2 条主因 → 停止
    → 仍要追空缺/离职/初请 → 模板 ②

模板 ② 就业驱动 · 流动与领先（按需）
    图1  岗位空缺率 vs 离职率        → 市场偏紧 vs 工人议价
    图2  雇佣率 vs 离职率          → 流动是否健康
    图3  初请失业金（月均）          → 领先裁员压力
    图4  平均失业周数 vs 周工时      → 深度 slack / 工时周期
    → 与模板 ① 合并成最终叙事
```

**三问决策树**（写在模板 ① `chartIntroNotes` 即可）：

| 观察 | 指向 |
| --- | --- |
| U-3 低、U-6−U-3 差扩大 | 兼职/边缘附着增加 → 图 1；必要时图 4 工资是否跟涨 |
| 非农环比走弱、失业率仍低 | 供给增加或需求放缓 → 图 3 参与率；模板 ② 图 1 空缺是否回落 |
| 时薪 YoY 仍高、工时下降 | 成本粘性 + 劳动力 hoarding → 图 4；对照 CPI 驱动模板 |
| 空缺率降、初请升 | 招聘冷却 / 裁员抬头 → 模板 ② 图 1 + 图 3 |
| 离职率降、雇佣率降 | 流动冻结（不确定性）→ 模板 ② 图 2 |
| 平均失业周数升 | 再就业变难 → 模板 ② 图 4，即使 U-3 不高 |

---

## 第二部分：本仓库现状（实现时必须对齐）

| 模块 | 路径 | 现状 |
| --- | --- | --- |
| 统一指标目录 | `src/lib/data/fredCatalog.ts` | 已有 `UNRATE`、`PAYEMS`、`AHETPI`（**label 待修正**）；**缺 U-6、JOLTS、初请等** |
| P0 种子 | `p0SeedCatalog.ts` | 已 seed **`UNRATE`、`PAYEMS`** |
| CPI 框架交叉 | `cpiAnalysisLayout.ts` | CPI 驱动模板含 **`UNRATE` + `CES0500000003` YoY** — 就业框架 **不重复** 这两条于模板 ② |
| 宏观模板 | `macroPresetTemplates.ts` | **待新增** `laborAnalysisLayout.ts` + 2 内置模板 |
| 模板介绍 | `MacroTemplateIntroPanel` + `chartIntroNotes` | 按图 1–4，不逐指标 |
| 日历映射 | `investingEventMap.ts` | 已有 **`UNRATE`、`PAYEMS`**；须扩展 JOLTS / 初请关键词 |
| 运维文档 | `docs/DATA_SCHEDULER_LABOR.md` | **待写**（可仿 `DATA_SCHEDULER_CPI.md`） |
| 分析文档 | `docs/US_LABOR_ANALYSIS.md` | **待写**（与 §1.4 一致） |

**Instrument 约定**：`code`: `sched_fred_{FRED_ID}`，`catalogKey`: `fred:{FRED_ID}`，`kind`: `MACRO_SERIES`。

---

## 第三部分：FRED 指标清单（**2026-06-19 验证定稿**）

> **重要**：§3.2 为 **定稿 fredId**（FRED API 拉取最新 obs + **标题口径核对**）。实现代码须与下表一致。

### 3.1 指标树分类

| category | 用途 |
| --- | --- |
| `就业与工资` | 失业、参与率、非农、时薪、工时 |
| `劳动力流动` | JOLTS 空缺 / 雇佣 / 离职 |
| `领先与深度` | 初请 / 续请、失业周数 |
| `就业结构`（目录自选） | 私营 / 政府 / 制造业就业、就业人口比 |

### 3.2 序列明细（显示名 + 元数据 — **2026-06-19 验证定稿**）

> **验证说明**（2026-06-19，FRED API）：月频阈值 = 最新 obs ≥ **2026-03-01**；周频阈值 = 最新 obs ≥ **2026-06-12**。JOLTS 允许最新 obs = **2026-04-01**（发布滞后正常）。

#### A. 默认两模板（12 条，跨模板不重复）

| FRED ID | 显示名（目录/UI） | category | 单位 | 频率 | 模板 | 最新 obs | 时效 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **UNRATE** | 失业率（U-3，季调） | 就业与工资 | Percent | 月 | ① 图 1 | 2026-05-01 | ✓ |
| **U6RATE** | U-6 广义失业率 | 就业与工资 | Percent | 月 | ① 图 1 | 2026-05-01 | ✓ |
| **PAYEMS** | 非农就业人数 | 就业与工资 | Thousands | 月 | ① 图 2 | 2026-05-01 | ✓ |
| **CIVPART** | 劳动参与率 | 就业与工资 | Percent | 月 | ① 图 3 | 2026-05-01 | ✓ |
| **LNS11300060** | 25–54 岁劳动参与率 | 就业与工资 | Percent | 月 | ① 图 3 | 2026-05-01 | ✓ |
| **CES0500000003** | 平均时薪（全体私营） | 就业与工资 | USD/Hour | 月 | ① 图 4 | 2026-05-01 | ✓ |
| **JTSJOR** | 岗位空缺率（非农） | 劳动力流动 | Percent | 月 | ② 图 1 | 2026-04-01 | ✓ |
| **JTSQUR** | 离职率（非农） | 劳动力流动 | Percent | 月 | ② 图 1–2 | 2026-04-01 | ✓ |
| **JTSHIR** | 雇佣率（非农） | 劳动力流动 | Percent | 月 | ② 图 2 | 2026-04-01 | ✓ |
| **ICSA** | 初请失业金人数 | 领先与深度 | Number | 周 | ② 图 3 | 2026-06-13 | ✓ |
| **UEMPMEAN** | 平均失业周数 | 领先与深度 | Weeks | 月 | ② 图 4 | 2026-05-01 | ✓ |
| **AWHNONAG** | 平均周工时（生产与非监督） | 就业与工资 | Hours | 月 | ② 图 4 | 2026-05-01 | ✓ |

#### B. 目录自选扩展（已验证有效，**不进默认两模板**）

| FRED ID | 显示名 | 最新 obs | 用途 |
| --- | --- | --- | --- |
| **JTSJOL** | 岗位空缺人数（千人） | 2026-04-01 ✓ | 与 `UNEMPLOY` 算空缺/失业比；默认模板用 **空缺率** 即可 |
| **UNEMPLOY** | 失业人数（千人） | 2026-05-01 ✓ | 算术核对 U-3；Beveridge 分子分母 |
| **EMRATIO** | 就业人口比 | 2026-05-01 ✓ | 与参与率对照 |
| **CCSA** | 续请失业金人数 | 2026-06-06 ✓ | 领先深度 slack |
| **USPRIV** | 私营部门非农就业 | 2026-05-01 ✓ | 结构：私营增势 |
| **USGOVT** | 政府部门就业 | 2026-05-01 ✓ | 结构：政府增势 |
| **MANEMP** | 制造业就业 | 2026-05-01 ✓ | 结构：制造业周期 |
| **AHETPI** | 生产与非监督岗位平均时薪 | 2026-05-01 ✓ | 覆盖口径小于 `CES0500000003`；**修正 catalog 误标「同比 %」** |

#### C. 已剔除 / 勿用

| 原候选 ID | 原因 |
| --- | --- |
| `LNS14000006` | 黑人失业率，**不是 U-6** → 用 `U6RATE` |
| `LNS13000000`、`LNS13327709` | FRED 400 无效 |
| `JTS000000000000000JOL` | 无效 ID |
| 将 `AHETPI` 当作「全体私营时薪 YoY %」 | 口径与单位均不符 → 用 `CES0500000003` + YoY |

### 3.3 有效性验证记录（2026-06-19）

执行方式：FRED API `series` + `series/observations?sort_order=desc&limit=1`；阈值见 §0.1。

| FRED ID | 分析角色 | 频率 | 最新 obs | 时效 | 定稿结论 |
| --- | --- | --- | --- | --- | --- |
| UNRATE | U-3 失业率 | M | 2026-05-01 | ✓ | 保留（P0 已有） |
| U6RATE | U-6 广义失业 | M | 2026-05-01 | ✓ | **新增** |
| PAYEMS | 非农水平 | M | 2026-05-01 | ✓ | 保留（P0 已有）；模板用环比 % |
| CIVPART | 劳动参与率 | M | 2026-05-01 | ✓ | 新增 |
| LNS11300060 | prime-age 参与率 | M | 2026-05-01 | ✓ | 新增 |
| CES0500000003 | 全体私营时薪 | M | 2026-05-01 | ✓ | 新增（CPI 驱动模板已用 YoY） |
| JTSJOR | 岗位空缺率 | M | 2026-04-01 | ✓ | 新增 |
| JTSQUR | 离职率 | M | 2026-04-01 | ✓ | 新增 |
| JTSHIR | 雇佣率 | M | 2026-04-01 | ✓ | 新增 |
| ICSA | 初请失业金 | W | 2026-06-13 | ✓ | 新增 |
| UEMPMEAN | 平均失业周数 | M | 2026-05-01 | ✓ | 新增 |
| AWHNONAG | 平均周工时 | M | 2026-05-01 | ✓ | 新增 |
| JTSJOL / UNEMPLOY / EMRATIO / CCSA / USPRIV / USGOVT / MANEMP / AHETPI | 目录扩展 | — | 见 §3.2B | ✓ | 种子可选入库 |

**框架结论**：**12 条默认模板序列 + 8 条目录扩展** 全部满足 §0.1；**2 条**（`UNRATE`、`PAYEMS`）已在 P0 seed，实现时 **幂等 upsert** 即可。

---

## 第四部分：必须执行的工程步骤

### 4.1 种子与目录（**有效性检查通过之后**）

**顺序不可颠倒**：§0 验证定稿 → 再改代码。

- 新增 `laborFredSeedCatalog.ts`、`seed-labor.ts`、`verify-labor.ts`（含 §0.1 近期 obs；JOLTS 滞后容忍）
- 扩展 `fredCatalog.ts`（中文 label + frequency + category）— **仅有效 fredId**；**修正 `AHETPI` label**
- `investingEventMap.ts`：`U6RATE` 跟 CPS 就业报告；`JTSJOR` 等 JOLTS 关键词；`ICSA` 初请关键词
- `package.json` 增加 `data:seed-labor`、`data:verify-labor`

### 4.2 宏观模板布局规范（硬性）

| 规则 | 要求 |
| --- | --- |
| **图数上限** | 每模板 `layoutMode: 4` |
| **拆分原则** | **2 个模板**（总览 + 流动/领先）；跨模板 **指标不重复** |
| **显示名** | `laborAnalysisLayout.ts` 的 `displayName` 中文；legend 不用 FRED ID |
| **键格式** | `fred:{ID}` 或 `fred:{ID}::{variant}`（如 `::yoy`、`::mom`） |
| **slotTitles** | 每 panel 中文标题 |

### 4.3 内置模板（2 个四图组）

注册到 `HARDCODED_BUILTIN_TEMPLATE_IDS`，`layoutMode: 4`，`folderId: folder-builtin-us-labor`。

**指标去重**：`UNRATE`、`U6RATE`、`PAYEMS`、`CIVPART`、`LNS11300060`、`CES0500000003` **仅模板 ①**；`JTSJOR`、`JTSQUR`、`JTSHIR`、`ICSA`、`UEMPMEAN`、`AWHNONAG` **仅模板 ②**。

#### 模板 ① `builtin-us-labor-overview` — 「就业诊断 · 总览」

| Panel | slotTitle | 序列（显示名） | 变换 |
| ----- | --------- | -------------- | ---- |
| 1 | 松紧：U-3 vs U-6 | 失业率、U-6 广义失业率 | 水平 % |
| 2 | 动能：非农环比 | 非农就业人数 | **环比 %** |
| 3 | 供给：参与率 | 劳动参与率、25–54 岁参与率 | 水平 % |
| 4 | 工资：时薪同比 | 平均时薪（全体私营） | **同比 %** |

**`description`（≤3 句）**：

> 【第一步 · 通常够用】按图 1→4 回答：劳动力偏紧还是偏松？新增就业强不强？参与率是否释放供给？工资压力多大？就业报告月写清 1–2 条即可停；若要看空缺/离职/初请 → 加载「就业驱动 · 流动与领先」。

**`chartIntroNotes`（键 `"0"`–`"3"`，每图 2–4 句）**：

| 键 | 内容要点 |
| --- | --- |
| `"0"` | U-3 vs U-6：看谁更高、差是否扩大。U-6 明显更高 → 广义 slack 大，勿只看 U-3。 |
| `"1"` | 非农 **环比 %**：发布月核心。连续走弱而 U-3 仍低 → 看图 3 供给或加载模板 ② 看空缺。 |
| `"2"` | 总参与率 vs prime-age：prime-age 升而总参与 flat → 人口结构；两者同升 → 供给增加、工资压力或缓和。 |
| `"3"` | 时薪 YoY：与 CPI 驱动模板衔接。仍 >4% 且图 1 紧 → 政策敏感；环比弱而 YoY 高 → 基数效应。 |

#### 模板 ② `builtin-us-labor-drivers` — 「就业驱动 · 流动与领先」

| Panel | slotTitle | 序列（显示名） | 变换 |
| ----- | --------- | -------------- | ---- |
| 1 | 紧张度：空缺 vs 离职 | 岗位空缺率、离职率 | 水平 %（右轴离职） |
| 2 | 流动：雇佣 vs 离职 | 雇佣率、离职率 | 水平 % |
| 3 | 领先：初请失业金 | 初请失业金人数 | 周频 → **月均** |
| 4 | 深度：久期 vs 工时 | 平均失业周数、平均周工时 | 水平 |

**`description`（≤3 句）**：

> 【第二步 · 按需】不重复 U-3/非农/参与率/时薪。图 1–2 看 JOLTS 紧张与流动，图 3 初请领先，图 4 失业久期与工时。与模板 ① 合并成劳动力叙事；对接 CPI 时仅引用 ① 图 1 + 图 4 即可。

**`chartIntroNotes` 要点**：

| 键 | 内容要点 |
| --- | --- |
| `"0"` | 空缺率 vs 离职率：双高 → 偏紧；空缺降、离职降 → 冷却且工人不敢跳。 |
| `"1"` | 雇佣率 vs 离职率：雇佣跟上离职 → 健康流动；两者同降 → 冻结。 |
| `"2"` | 初请月均：领先裁员。升而 U-3 未反应 → 关注下月就业报告；对照 ① 图 2 非农环比。 |
| `"3"` | 失业周数升 + 工时降 → 深度 slack；工时单独降或为 hoarding。 |

### 4.4 模板介绍写作规范

与 CPI 框架相同：

- **`description`**：≤3 句，只写本模板图 1→4 + 何时加载另一模板  
- **`chartIntroNotes`**：每图 2–4 句，**不**逐指标展开  
- **禁止**跨模板重复同一 FRED 序列；禁止裸 FRED ID 作主标题  

### 4.5 数据目录页与文档

- `docs/DATA_SCHEDULER_LABOR.md`：BLS 就业报告 / JOLTS / 初请发布规律、cron  
- `docs/US_LABOR_ANALYSIS.md`：与 §1.4 一致的用户向分析文档  
- `DataCatalogAdminClient.tsx`：就业类 badge / 机制卡片（可选）

---

## 第五部分：图表与 UX 规范

- **颜色建议**：U-3 `#ef6461`，U-6 `#d89b4e`，非农动能 `#5f76b8`，参与率 `#6ccad1`，时薪 `#f4b165`，JOLTS 空缺 `#3e4d83`，离职 `#c9a227`，初请 `#8f9bab`
- **Y 轴**：比率类（%、率）可同轴；**非农环比 %** 与 **时薪 YoY %** 不要与 **初请人数（万）** 同轴
- **右轴**：模板 ② 图 1–2 双「率」可左雇佣/空缺、右离职；图 4 周数 vs 工时 **必须双轴**
- **发布对齐**：就业报告月优先看模板 ①；JOLTS 月看模板 ② 图 1–2（注意 **滞后 1 个月**）

---

## 第六部分：验证清单（Agent 完成时必须逐项勾选）

- [ ] **§0 指标有效性**：每条序列有最新 obs 记录且在 §0.1 窗口内；错配 ID 已替换（附 §3.3 表）
- [ ] `npm run data:verify-labor -- --db` 通过
- [ ] 目录与 UI **显示中文指标名**；`AHETPI` 等 label 已修正
- [ ] metadata 含 **国家、单位、频率、来源**；catalog 可查 **nextRunAt**
- [ ] **2 个** 内置四图模板（§4.3），**跨模板 12 指标不重复**，文件夹 **美国就业市场**
- [ ] 每个模板 `description` ≤3 句；`chartIntroNotes` 每图 2–4 句
- [ ] `npm run data:seed-labor` / `worker` / `verify-labor` 通过
- [ ] `/admin/data-catalog` 就业类指标可见下次更新
- [ ] 宏观页 **模板介绍** Tab 可编辑且自动保存
- [ ] 未提交 `.env.local` / API Key

---

## 第七部分：禁止事项

- **不要** 跳过 §0 有效性检查直接写种子 / 模板
- **不要** 使用 **已停更、无效 ID、或口径错配** 的 FRED 序列（如 `LNS14000006` 冒充 U-6）
- **不要** 用 **4 个模板** 重复 U-3 / 非农 / 时薪
- **不要** 在 DB 预存 YoY / 环比
- **不要** 将 `AHETPI` 当作「全体私营时薪同比 %」默认线
- **不要** 写超过 3 句的模板总述或超过 4 句的单图介绍

---

## 第八部分：技术参考

| 项目 | 路径 |
| --- | --- |
| 本 Prompt | `.cursor/prompts/us-labor-analysis-framework.md` |
| CPI 框架（对照样式） | `.cursor/prompts/us-cpi-analysis-framework.md` |
| 布局与默认介绍（待建） | `src/lib/data/laborAnalysisLayout.ts` |
| 内置模板（待建） | `src/lib/data/macroPresetTemplates.ts` |
| 模板介绍 UI | `src/components/macro/MacroTemplateIntroPanel.tsx` |
| 时间轴对齐 | `src/lib/macroPeriodLabel.ts` |
| 分析文档（待建） | `docs/US_LABOR_ANALYSIS.md` |
| 运维文档（待建） | `docs/DATA_SCHEDULER_LABOR.md` |
| 验证脚本（待建） | `scripts/data-worker/verify-labor.ts` |
| 已有 P0 序列 | `src/lib/data/scheduler/p0SeedCatalog.ts`（`UNRATE`、`PAYEMS`） |

---

## 使用说明

将 **本 Prompt 全文** 交给 Agent 执行。Agent 须完成：

**§0 逐条验证 FRED 有效性 → 2 模板 + 按图介绍 → catalog/scheduler → seed/sync/verify → 汇报**

全程无需人工录入 FRED 数据。若某分析角色 **找不到有效序列**，须在汇报中说明 **已剔除的面板 / 替代口径**，不得静默保留空数据指标。

与 **CPI 框架** 联用时：CPI「驱动·外生与政策」保留 **失业 + 时薪** 的通胀视角；本框架提供 **完整劳动力市场** 诊断，二者 narrative 合并即可，**勿** 在就业模板 ② 再画 `UNRATE` / `CES0500000003`。
