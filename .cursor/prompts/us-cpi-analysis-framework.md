# Prompt：美国 CPI 通胀分析框架 — FRED 入库、指标树、调度与宏观模板

---

## 任务目标

以 **美国专业宏观通胀分析师** 视角，在本仓库 **finance-site** 内落地一套可复用的 **美国 CPI 分析框架**，框架简单清晰，能快速定位出什么因素主导的通胀变化，包含：

1. **分析方法论**：如何从 Headline / Core CPI 出发，分解分项并识别当期通胀 **主要驱动因素**
2. **数据管道**：先检查指标是否已在数据库中，如果没有，则从 FRED 拉取所需序列，并确定指标的其他属性，写入 PostgreSQL（`mds` schema），接入现有 **data-scheduler**
3. **指标有效性**：**在写入种子 / 模板 / 目录之前**，逐条验证候选 FRED 序列是否 **仍在更新、有近年的观测值**；无效序列 **不得** 进入框架（须替换或剔除）
4. **指标树**：在统一宏观目录（`fredCatalog.ts`）中，将 **已通过有效性检查** 的指标挂到 **美国 → 合适分类** 下
5. **更新机制**：在 **数据目录管理页**（`/admin/data-catalog`）清晰展示 CPI 相关指标的 **下次更新时间、发布规则、拉取状态**；补充运维文档
6. **宏观模板**：内置 **2 个** 四图模板（`layoutMode: 4`），指标 **尽量不重复**；方法论写在精简的「模板介绍」；目录中其余序列供用户自行扩展

**禁止**只写分析文字而不改代码；**禁止**要求用户在 UI 手工录入 FRED 数据；**禁止**把 `FRED_API_KEY` 写入代码或种子 JSON；**禁止**未经有效性检查就把 FRED ID 写入种子、目录或模板。

---

## 第〇部分：指标有效性门禁（确定框架清单前 **必须先做**）

§1.1 / §3.2 中的序列是 **分析角色占位**（Headline、OER、二手车等），**不是** 可直接写死的 FRED ID 列表。BLS 会调整分项编码，部分旧 `CUSR0000`* 在 FRED 上 **已停更或仅有远古数据**。Agent **必须先验证、再入库、再写模板**。

### 0.1 什么叫「有效」

对每条候选 `fredId`，同时满足以下条件才视为 **有效**：


| 检查项          | 月频（CPI / PPI / PCE / 时薪 / 失业）                                         | 日频（WTI / 盈亏平衡通胀）                  |
| ------------ | --------------------------------------------------------------------- | --------------------------------- |
| **FRED 可拉取** | `GET /series/observations?limit=1&sort_order=desc` 返回 HTTP 200 且有数值   | 同上                                |
| **最近观测**     | 最新 `obsDate` 不早于 **当前月 − 3 个自然月**（例：2026-06 执行时 ≥ 2026-03）            | 最新 `obsDate` 不早于 **当前日 − 7 个自然日** |
| **未明显停更**    | FRED `observation_end`（若有）距今天 ≤ 上述窗口；或 DB `MacroObservation` 最大日期满足窗口 | 同上                                |
| **分析可用**     | 宏观页对该键 **提取数据** 后，近 12 个月非空点 ≥ 6（YoY 计算后）                             | 近 30 个自然日非空点 ≥ 15（月均后）            |


任一不满足 → 标记为 **无效**，**不得** 进入 `cpiFredSeedCatalog.ts`、`fredCatalog.ts`、四图模板。

### 0.2 验证顺序（Agent 必须执行）

```
1. 列出 §3.2 候选 fredId + 分析角色（L0–L4 各需要哪些「角色」）
2. 对每条候选调用 FRED API（或 npm run data:probe-sources）取最新观测日期与 observation_end
3. 无效项：在 FRED 站内搜索同主题替代 series_id（优先 BLS 现行编码），记录「原 ID → 新 ID → 原因」
4. 更新 cpiFredSeedCatalog / fredCatalog / cpiAnalysisLayout / 模板 — 仅含 **有效 ID**
5. npm run data:seed-cpi && npm run data:worker && npm run data:verify-cpi -- --db
6. 在汇报中附 **有效序列表**（显示名、fredId、最新 obs 日期、是否替换过）
```

**推荐命令**（需 `.env.local` 中 `FRED_API_KEY`）：

```bash
# 单条快速看最新观测（示例）
curl "https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&sort_order=desc&limit=1&api_key=$FRED_API_KEY&file_type=json"

# 批量探测（含 sched_fred_*）
npm run data:probe-sources -- --scope=overview

# 种子 + DB 元数据 + 订阅
npm run data:seed-cpi
npm run data:worker
npm run data:verify-cpi -- --db
```

`verify-cpi.ts` **须扩展**：除 metadata 外，对 `CPI_FRED_SERIES` 每条检查 DB 最新 `MacroObservation` 是否落在 §0.1 窗口内；不通过则 **exit 1** 并打印 `fredId`、最新日期、阈值。

### 0.3 无效时的处理原则


| 情况                                  | 动作                                                      |
| ----------------------------------- | ------------------------------------------------------- |
| 同主题有 **现行 BLS 编码**                  | 替换 `fredId`，更新 `catalogKey`、模板 virtualKey、日历映射          |
| 仅 **聚合替代**（如某细分停更但 Core goods 仍可分析） | 改用上一级有效分项，并在 `docs/US_CPI_ANALYSIS.md` 与模板介绍 **注明口径变化** |
| **无合适替代**                           | 从四图模板 **剔除** 该 panel 序列；不保留空壳 FRED ID                   |
| 角色仍需要但 ID 变更                        | 保留 **中文 displayName / 分析角色** 不变，只换底层 `fredId`           |


**禁止**：明知停更仍写入种子；禁止在 UI 展示「有名字无数据」的指标。

### 0.4 常见失效模式（排查时对照）

- `CUSR0000`* **旧版编码**：BLS 改版后 FRED 仍保留历史序列但 **observation_end 停在数年前**
- **ID 与分析角色错配**（仍按月更新，但 **不能** 用于框架）：例 — `CUSR0000SETB01` 是 **汽油** 非新车；`CUSR0000SAC` / `SAS` 是 **全商品/全服务** 非 Core goods/services → 分别用 `SETA01`、`SACL1E`、`SASLE`
- **重复/废弃 aggregate**：与现行 Headline/Core 分项 **不同基期或已合并**
- **PPI / 时薪 / PCE 子系列**：应用 **现行 FRED 主序列**（如 PPI 最终需求、CES 平均时薪），勿用已下线的实验性 ID
- **仅写在 Prompt / 文档、从未 worker 拉过**：DB 无观测 → 视为 **未验证**，须先 `data:worker` 再判定

---

## 第一部分：通胀分析框架（须在 `docs/US_CPI_ANALYSIS.md` 与模板介绍中体现）

### 1.1 分析层级（自上而下）

图表、表格、模板介绍、已选指标列表中 **一律显示中文指标名**（来自 `fredCatalog.ts` 的 `label` 或 `cpiAnalysisLayout.ts` 的 `displayName`）。FRED ID 仅出现在代码、`catalogKey`、种子脚本与运维日志中，**不要**作为用户可见主标题。


| 层级      | 问题                              | 主要指标（显示名）                                                  |
| ------- | ------------------------------- | ---------------------------------------------------------- |
| L0 综合   | 通胀总水平与趋势？Headline vs Core 是否背离？ | CPI（全部城市消费者）、核心 CPI（剔除食物与能源）                               |
| L1 三分法  | 能源、食品、核心各贡献多少？                  | CPI 能源、CPI 食品与饮料、核心 CPI                                    |
| L2 核心拆分 | 粘性来自 **住房** 还是 **核心商品/服务**？     | CPI 住房（Shelter）、业主等价租金（OER）、主要住所租金、CPI 核心商品（`SACL1E`）、CPI 核心服务（`SASLE`） |
| L3 热点分项 | 哪些离散分项异常？（**不进默认模板**，目录自选） | 二手车、新车、医疗等 |
| L4 驱动因子 | 供给冲击 vs 需求 vs 工资 vs 预期          | WTI 原油、PPI 最终需求、平均时薪、5Y 盈亏平衡通胀、PCE、失业率                     |


### 1.2 指标元数据（必须在目录、宏观页与模板介绍中可核对）

实现时为每条 CPI 相关序列在 `fredCatalog.ts` / Instrument `metadata` 中明确以下属性；宏观页 **已选指标** 与 **模板介绍** 面板应能读到（或链接到）这些信息，**不要**只展示 FRED ID。


| 属性       | 说明       | CPI 系列典型值                                                                                                                                   |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **显示名**  | 用户可见中文名  | 见第三节「序列明细」                                                                                                                                  |
| **国家**   | ISO / 中文 | `US` / 美国                                                                                                                                   |
| **单位**   | 原始入库单位   | CPI 指数：**Index**（BLS 1982–84=100 或 FRED 标注）；失业率：**Percent**；WTI：**USD/Barrel**；盈亏平衡通胀：**Percent**                                           |
| **频率**   | 原始发布频度   | 月（CPI 分项）；日（WTI、T5YIE，图表层可月均对齐）                                                                                                             |
| **来源**   | 官方机构     | **BLS**（CPI 分项）/ **FRED**（聚合与转发）                                                                                                            |
| **范围**   | 历史起止     | 宏观页/API 返回实际 obs 区间；目录 metadata 可写 `1947-01 ~ 最新`（以拉取结果为准）                                                                                  |
| **更新时间** | 何时出新数据   | **BLS CPI**：每月中旬 **8:30 ET** 公布 **上月** 数据（Investing 关键词 `consumer price index` / `cpi m/m`）；**PPI**：略早于 CPI；**时薪**：就业报告；**WTI/T5YIE**：交易日日更 |


**实现检查点**：

- `fredCatalog.ts` 每条含 `label`（中文）、`frequency`
- `cpiFredSeedCatalog.ts` / Instrument `metadata` 含 `countryCode: US`、`unit`、`source: BLS|FRED`
- `/admin/data-catalog` 展示 `nextRunAt`、`releaseRuleSummary`（更新事件）
- 模板 `displayName` 与 catalog `label` 一致或更短（如「Headline CPI YoY」可接受，但禁止仅写 `CPIAUCSL`）

### 1.3 变动率计算规则（与宏观页 `seriesCalcConfigMap` 一致）

FRED 入库 **原始水平值（Index level）**；图表层做变换，**不要在 DB 预存 YoY**。


| 序列类型                     | `seriesCalcConfigMap` 推荐                          | 说明          |
| ------------------------ | ------------------------------------------------- | ----------- |
| CPI / PCE **指数**         | `op: "yoy"` 或 `"pctChange"`, `frequency: "month"` | 同比 % / 环比 % |
| **已是 % 的序列**（失业率、盈亏平衡通胀） | `op: "none"`                                      | 勿再 yoy      |
| **日频**（WTI、T5YIE）        | `frequency: "month"`, `resampleMethod: "avg"`     | 与月频 CPI 对齐  |

**时间轴 canonical 键**（合并/排序/表格对齐，见 `src/lib/macroPeriodLabel.ts`）：

| 频度 | 对齐键 | 表格展示 |
| --- | --- | --- |
| 日 | `YYYY-MM-DD` | 同左 |
| 月 | `YYYY-MM-01` | `YYYY-MM` |
| 季 | `YYYY-Qn` | 同左 |
| 年 | `YYYY` | 同左 |

DB `MacroObservation.obsDate` 存完整 `Date`（FRED 月频多为每月 1 日）；**不是库内格式不一致**，而是图表层 resample 曾输出 `YYYY-MM` 导致与 FRED 的 `YYYY-MM-01` 并表时拆成两行。合并时用 `macroAlignPeriodKey` 统一为月初锚点。


### 1.4 两模板分析链条（总览）

**原则**：80% 场景只加载 **模板 ①**；只有总览仍说不清「为什么」时再加载 **模板 ②**。同一 FRED 序列 **不在两个模板里重复出现**（Headline/Core 只在模板 ①）。

```
模板 ① CPI 诊断 · 总览（必看）
    图1  Headline vs Core 同比     → 总水平多高？
    图2  能源 vs 食品 同比          → 差在边缘分项吗？
    图3  OER vs 核心商品 vs 服务    → 粘性在哪一侧？
    图4  Headline vs Core 环比      → 发布月动能
    → 能写 1–2 条主因 → 停止
    → 仍要追外因/政策锚 → 模板 ②

模板 ② CPI 驱动 · 外生与政策（按需）
    图1  WTI 油价                   → 供给前瞻（对照模板①图2能源）
    图2  PPI 最终需求               → 上游成本
    图3  失业率 + 时薪              → 劳动力
    图4  5Y 盈亏平衡 vs 核心 PCE    → 预期 vs Fed 锚
    → 与模板 ① 结论合并成最终叙事
```

**三问决策树**（写在模板 ① 介绍里即可，不必四模板重复）：

| 观察 | 指向 |
| --- | --- |
| Headline 明显高于 Core | 模板 ① 图 2 能源/食品；仍不够 → 模板 ② 图 1 油价 |
| Core 仍高、Headline 已降 | 模板 ① 图 3：OER 还是服务更高？ |
| 商品反弹 + PPI 走强 | 模板 ② 图 2 成本传导 |
| 服务顽固 + 低失业 + 高时薪 | 模板 ② 图 3 劳动力 |
| Core PCE 降而 T5YIE 升 | 模板 ② 图 4 预期风险 |

---

## 第二部分：本仓库现状（实现时必须对齐）


| 模块      | 路径                                                 | 现状                              |
| ------- | -------------------------------------------------- | ------------------------------- |
| 统一指标目录  | `src/lib/data/fredCatalog.ts`                      | 已扩展 CPI 分类与中文 label             |
| 宏观模板    | `macroPresetTemplates.ts` + `cpiAnalysisLayout.ts` | **2 个** 内置四图模板，指标去重 |
| 模板介绍    | `MacroTemplateIntroPanel` + `chartIntroNotes`（按图 1–4） | 用户/内置默认解读文本                     |
| 数据目录 UI | `DataCatalogAdminClient.tsx`                       | 展示 nextRunAt、releaseRuleSummary |
| 调度文档    | `docs/DATA_SCHEDULER_CPI.md`                       | CPI 发布与 cron                    |


**Instrument 约定**：`code`: `sched_fred_{FRED_ID}`，`catalogKey`: `fred:{FRED_ID}`，`kind`: `MACRO_SERIES`。

---

## 第三部分：FRED 指标清单（**2026-06-19 验证定稿**）

> **重要**：§3.2 为 **定稿 fredId**（已通过 §0.1 时效 + FRED 标题口径核对）。实现代码时须与下表一致；若 BLS 再次改版，按 §0.2 重验并更新本节。

### 3.1 指标树分类


| category   | 用途                        |
| ---------- | ------------------------- |
| `CPI 综合`   | Headline / Core / 能源 / 食品 |
| `CPI 住房`   | Shelter、Rent、OER          |
| `CPI 核心商品` | 剔除食品能源的商品                 |
| `CPI 核心服务` | 剔除能源的服务                   |
| `CPI 分项`   | 二手车、新车、医疗等                |
| `通胀驱动因子`   | 油价、PPI、工资、盈亏平衡、PCE 对照     |


### 3.2 序列明细（显示名 + 元数据 — **2026-06-19 验证定稿**）

> **验证说明**（2026-06-19，FRED API）：月频阈值 = 最新 obs ≥ **2026-03-01**；日频阈值 = 最新 obs ≥ **2026-06-12**。下表为 **定稿 fredId**；§3.3 附逐条验证结果与替换记录。
>
> **口径修正（非停更，而是 ID 与分析角色不符）**：
> - ~~`CUSR0000SAC`~~ → **`CUSR0000SACL1E`**：前者为「全部商品」，含食品/能源商品，**不能**代表 Core goods
> - ~~`CUSR0000SAS`~~ → **`CUSR0000SASLE`**：前者为「全部服务」，含能源服务，**不能**代表 Core services
> - ~~`CUSR0000SETB01`~~ → **`CUSR0000SETA01`**：前者 FRED 标题为 **Gasoline（汽油）**，非新车；新车用 `SETA01`

| FRED ID（定稿） | 显示名（目录/UI） | category | 国家 | 单位 | 频率 | 来源 | 更新时间 | 最新 obs（验证日） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CPIAUCSL | CPI（全部城市消费者） | CPI 综合 | 美国 | Index | 月 | BLS/FRED | BLS CPI 月报 | 2026-05 ✓ |
| CPILFESL | 核心 CPI（剔除食物与能源） | CPI 综合 | 美国 | Index | 月 | BLS/FRED | 同上 | 2026-05 ✓ |
| CPIENGSL | CPI 能源 | CPI 综合 | 美国 | Index | 月 | BLS/FRED | 同上 | 2026-05 ✓ |
| CPIFABSL | CPI 食品与饮料 | CPI 综合 | 美国 | Index | 月 | BLS/FRED | 同上 | 2026-05 ✓ |
| CUSR0000SAH1 | CPI 住房（Shelter） | CPI 住房 | 美国 | Index | 月 | BLS/FRED | 同上 | 2026-05 ✓ |
| CUSR0000SEHA | CPI 主要住所租金 | CPI 住房 | 美国 | Index | 月 | BLS/FRED | 同上 | 2026-05 ✓ |
| CUSR0000SEHC | CPI 业主等价租金（OER） | CPI 住房 | 美国 | Index | 月 | BLS/FRED | 同上 | 2026-05 ✓ |
| **CUSR0000SACL1E** | CPI 核心商品（除食品能源） | CPI 核心商品 | 美国 | Index | 月 | BLS/FRED | 同上 | 2026-05 ✓（替 `SAC`） |
| **CUSR0000SASLE** | CPI 核心服务（除能源服务） | CPI 核心服务 | 美国 | Index | 月 | BLS/FRED | 同上 | 2026-05 ✓（替 `SAS`） |
| CUSR0000SETA02 | CPI 二手车与卡车 | CPI 分项 | 美国 | Index | 月 | BLS/FRED | 同上 | 2026-05 ✓ |
| **CUSR0000SETA01** | CPI 新车 | CPI 分项 | 美国 | Index | 月 | BLS/FRED | 同上 | 2026-05 ✓（替 `SETB01`） |
| CPIMEDSL | CPI 医疗（聚合） | CPI 分项 | 美国 | Index | 月 | BLS/FRED | 同上 | 2026-05 ✓ |
| DCOILWTICO | WTI 原油现货 | 通胀驱动因子 | 美国 | USD/Barrel | 日 | EIA/FRED | 交易日 | 2026-06-15 ✓ |
| PPIFIS | PPI 最终需求 | 通胀驱动因子 | 美国 | Index | 月 | BLS/FRED | BLS PPI 月报 | 2026-05 ✓ |
| CES0500000003 | 平均时薪（私营部门） | 通胀驱动因子 | 美国 | USD/Hour | 月 | BLS/FRED | 就业报告 | 2026-05 ✓ |
| T5YIE | 5Y 盈亏平衡通胀 | 通胀驱动因子 | 美国 | Percent | 日 | FRED | 交易日 | 2026-06-18 ✓ |
| PCEPI | PCE 价格指数 | 通胀驱动因子 | 美国 | Index | 月 | BEA/FRED | PCE 月报 | 2026-04 ✓（BEA 滞后 1 月，仍满足窗口） |
| UNRATE | 失业率 | 通胀驱动因子 | 美国 | Percent | 月 | BLS/FRED | 就业报告 | 2026-05 ✓ |

**模板 ④ 可选扩展**（已验证有效，**不进默认两模板**；留在目录/种子供用户自选）：

| FRED ID | 显示名 | 最新 obs | 用途 |
| --- | --- | --- | --- |
| T10YIE | 10Y 盈亏平衡通胀 | 2026-06-18 ✓ | 目录自选；默认模板用 T5YIE 即可 |
| PCEPI | PCE 价格指数 | 2026-04 ✓ | 目录自选；Fed 锚默认用 PCEPILFE |
| CUSR0000SAH1 / SEHA | Shelter / Rent | 2026-05 ✓ | 目录自选；默认模板只保留 OER |
| SETA02 / SETA01 / CPIMEDSL | 二手车 / 新车 / 医疗 | 2026-05 ✓ | 热点分项，目录自选 |

**已剔除 / 勿用**（验证时发现 ID 与分析角色不符，即使仍在更新）：

| 原候选 ID | FRED 实际含义 | 处理 |
| --- | --- | --- |
| CUSR0000SAC | 全部 Commodities（含食品能源商品） | 替换为 `CUSR0000SACL1E` |
| CUSR0000SAS | 全部 Services（含能源服务） | 替换为 `CUSR0000SASLE` |
| CUSR0000SETB01 | Gasoline 汽油 | 替换为 `CUSR0000SETA01`（新车）；汽油已由 `CPIENGSL` / WTI 覆盖 |

**定稿清单**（实现交付物之一）：同步写入 `docs/US_CPI_ANALYSIS.md` 附录，列 **最终 fredId、最新 obs 日期、验证日期、是否替换原候选 ID**。

**范围**：不在种子中写死；以验证通过后的 `MacroObservation` 最早/最晚日期为准，宏观页提取后展示。

### 3.3 有效性验证记录（2026-06-19）

执行方式：FRED API `series` + `series/observations?sort_order=desc&limit=1`；阈值见 §0.1（月频 ≥ 2026-03-01，日频 ≥ 2026-06-12）。

| FRED ID | 分析角色 | 频率 | 最新 obs | 时效 | 定稿结论 |
| --- | --- | --- | --- | --- | --- |
| CPIAUCSL | Headline CPI | M | 2026-05-01 | ✓ | 保留 |
| CPILFESL | Core CPI | M | 2026-05-01 | ✓ | 保留 |
| CPIENGSL | CPI 能源 | M | 2026-05-01 | ✓ | 保留 |
| CPIFABSL | CPI 食品与饮料 | M | 2026-05-01 | ✓ | 保留 |
| CUSR0000SAH1 | Shelter | M | 2026-05-01 | ✓ | 保留 |
| CUSR0000SEHA | Primary Rent | M | 2026-05-01 | ✓ | 保留 |
| CUSR0000SEHC | OER | M | 2026-05-01 | ✓ | 保留 |
| CUSR0000SACL1E | 核心商品 | M | 2026-05-01 | ✓ | **替** `CUSR0000SAC` |
| CUSR0000SASLE | 核心服务 | M | 2026-05-01 | ✓ | **替** `CUSR0000SAS` |
| CUSR0000SETA02 | 二手车 | M | 2026-05-01 | ✓ | 保留 |
| CUSR0000SETA01 | 新车 | M | 2026-05-01 | ✓ | **替** `CUSR0000SETB01` |
| CPIMEDSL | 医疗 | M | 2026-05-01 | ✓ | 保留 |
| DCOILWTICO | WTI | D | 2026-06-15 | ✓ | 保留 |
| PPIFIS | PPI 最终需求 | M | 2026-05-01 | ✓ | 保留 |
| CES0500000003 | 平均时薪 | M | 2026-05-01 | ✓ | 保留 |
| T5YIE | 5Y 盈亏平衡 | D | 2026-06-18 | ✓ | 保留 |
| PCEPI | PCE | M | 2026-04-01 | ✓ | 保留（BEA 通常滞后 CPI 约 1 月） |
| UNRATE | 失业率 | M | 2026-05-01 | ✓ | 保留 |
| T10YIE | 10Y 盈亏平衡 | D | 2026-06-18 | ✓ | 保留（目录自选） |
| PCEPILFE | 核心 PCE | M | 2026-04-01 | ✓ | 保留（模板 ② 图 4 Fed 锚） |

**模板 ② 专项复核**（2026-06-19）：`DCOILWTICO`、`PPIFIS`、`CES0500000003`、`T5YIE`、`PCEPILFE` 均 **未停更**。PCE 比 CPI **晚约 1 月** 发布，属正常。

**框架结论**：20 条定稿序列（18 主序列 + 模板 ④ 扩展 `T10YIE` / `PCEPILFE`）**全部满足 §0.1 时效**；无需因停更而删减层级（L0–L4 结构不变）。3 处 **ID 与分析角色错配** 已在代码与模板中修正（见 §3.2 口径修正）。

---

## 第四部分：必须执行的工程步骤

### 4.1 种子与目录（**有效性检查通过之后**）

**顺序不可颠倒**：§0 验证定稿 → 再改代码。

- `cpiFredSeedCatalog.ts`、`seed-cpi.ts`、`verify-cpi.ts`（`verify-cpi` **含 §0.1 近期观测检查**）
- 扩展 `fredCatalog.ts`（中文 label + frequency + category）— **仅有效 fredId**
- `investingEventMap.ts` 日历映射 — 对 **最终** fredId 生效
- 无效候选从种子中 **删除或注释并说明替代 ID**，勿留死链

### 4.2 宏观模板布局规范（硬性）


| 规则             | 要求                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------- |
| **图数上限**       | 每个模板 `**layoutMode: 4`**（四宫格），禁止 5/6 图单模板                                                     |
| **拆分原则**       | **默认 2 个模板**（总览 + 驱动）；同一指标不跨模板重复；细分序列留在目录自选 |
| **显示名**        | `cpiAnalysisLayout.ts` 的 `displayName` 用中文或中英对照；图表 legend/endLabel 用 `displayName`，不用 FRED ID |
| **键格式**        | 内部仍用 `fred:{ID}` 或 `fred:{ID}::{variant}`；用户界面不暴露 ID                                          |
| **slotTitles** | 每个 panel 中文标题（如「Headline vs Core 同比」）                                                         |


### 4.3 内置模板（2 个四图组）

注册到 `HARDCODED_BUILTIN_TEMPLATE_IDS`，均 `layoutMode: 4`，`folderId: folder-builtin-us-cpi`。

**指标去重规则**：Headline / Core / 能源 / OER / 商品 / 服务 **仅出现在模板 ①**；WTI / PPI / 时薪 / 失业 / T5YIE / 核心 PCE **仅出现在模板 ②**。

#### 模板 ① `builtin-us-cpi-overview` — 「CPI 诊断 · 总览」

| Panel | slotTitle | 序列（显示名） |
| ----- | --------- | -------------- |
| 1 | 总水平：Headline vs Core | CPI YoY、核心 CPI YoY |
| 2 | 边缘冲击：能源 vs 食品 | CPI 能源 YoY、CPI 食品 YoY |
| 3 | 结构：OER vs 商品 vs 服务 | OER YoY、核心商品 YoY、核心服务 YoY |
| 4 | 发布月动能：环比 | CPI MoM、核心 CPI MoM |

**`description`（≤3 句）**：

> 【第一步 · 通常够用】按图 1→4 回答：总通胀多高？差在能源/食品还是核心？粘性在 OER、商品还是服务？发布月看环比。能写清 1–2 条主因即可停；仍要追油价/PPI/工资/预期 → 加载「CPI 驱动 · 外生与政策」。

#### 模板 ② `builtin-us-cpi-drivers` — 「CPI 驱动 · 外生与政策」

| Panel | slotTitle | 序列（显示名） |
| ----- | --------- | -------------- |
| 1 | 供给：WTI 油价 | WTI 原油（月均） |
| 2 | 上游：PPI 最终需求 | PPI 最终需求 YoY |
| 3 | 劳动力：失业 vs 时薪 | 失业率、平均时薪 YoY（右轴） |
| 4 | 政策锚：预期 vs 核心 PCE | 5Y 盈亏平衡通胀（月均）、核心 PCE YoY（右轴） |

**`description`（≤3 句）**：

> 【第二步 · 按需】不重复 Headline/Core。图 1 油价前瞻（对照总览图 2 能源）→ 图 2 PPI → 图 3 劳动力 → 图 4 市场隐含通胀 vs Fed 核心 PCE。与总览结论合并成最终叙事即可。

**已废弃的四模板 ID**（`level0` / `structure` / `cost-push` / `expectations`）：不再注册；用户若本地仍缓存旧 ID，需重新选模板 ① 或 ②。

### 4.4 模板介绍写作规范

**模板级 `description`**：≤3 句话，只写 **本模板图 1→4 顺序** + **何时加载另一模板**；不重复 §1.4 全文。

**`chartIntroNotes`**（键 `"0"`–`"3"`，与 `displayConfig.slotTitles` 对应）：每图 **2–4 句**（本图分析什么 + 如何看 + 与下一图/另一模板的衔接）；**不**逐指标展开。范例见 `cpiAnalysisLayout.ts` 中 `CPI_OVERVIEW_CHART_INTRO` / `CPI_DRIVERS_CHART_INTRO`。

**禁止**：同一指标在模板 ①② 重复出现；模板介绍写「链条 ①/④」等编号；只写 FRED ID。

### 4.5 数据目录页与文档

- `docs/DATA_SCHEDULER_CPI.md`：BLS 发布规律、cron、403 回退
- `DataCatalogAdminClient.tsx`：CPI 机制卡片 + category badge
- `docs/US_CPI_ANALYSIS.md`：与 §1.4 链条一致，用 **显示名** 重写表格

---

## 第五部分：图表与 UX 规范

- **Legend / endLabel / 模板介绍标题**：中文 **displayName**，禁止裸 FRED ID
- **颜色**：Headline `#ef6461`，Core `#5f76b8`，Shelter `#d89b4e`，Energy `#8f9bab`，OER `#6ccad1`
- **Y 轴**：YoY / MoM 面板统一 %；指数水平不与 YoY 同 panel
- **右轴**：量纲明确双指标（如 WTI 价格 vs CPI 能源 YoY）时使用
- **四图布局**：每 panel 建议 1–3 条线，避免 overcrowding

---

## 第六部分：验证清单（Agent 完成时必须逐项勾选）

- [ ] **§0 指标有效性**：每条入库序列有 **最新 obs 日期** 记录，且落在 §0.1 窗口内；无效项已 **替换或剔除**（附对照表）
- [ ] `npm run data:verify-cpi -- --db` 通过（含 **近期观测** 检查）
- [ ] 目录与 UI **显示中文指标名**，FRED ID 仅开发可见
- [ ] 每条 ★ 序列 metadata 含 **国家、单位、频率、来源**；catalog 可查 **更新事件**（nextRunAt）
- [ ] **2 个** 内置四图模板（§4.3），指标 **跨模板不重复**，文件夹 **美国通胀分析**
- [ ] 每个模板 `description` ≤3 句；`chartIntroNotes` 每图 2–4 句
- [ ] `npm run data:seed-cpi` / `sync-calendar` / `worker` / `verify-cpi` 通过
- [ ] `/admin/data-catalog` CPI 分类可见下次更新
- [ ] 宏观页 **模板介绍** Tab 可编辑且自动保存
- [ ] 未提交 `.env.local` / API Key

---

## 第七部分：禁止事项

- **不要** 跳过 §0 有效性检查直接写种子 / 模板
- **不要** 使用 **已停更或无近年观测** 的 FRED ID（即使用户 Prompt 或旧文档里写过）
- 不要用 **4 个模板** 重复同一 Headline/Core 曲线
- 不要在用户界面 **以 FRED ID 作为主标签**
- 不要在 DB 预存 YoY；不要硬编码 BLS 日期
- 不要写 **超过 3 句** 的模板总述或 **超过 4 句** 的单图介绍

---

## 第八部分：技术参考


| 项目       | 路径                                                          |
| -------- | ----------------------------------------------------------- |
| 本 Prompt | `.cursor/prompts/us-cpi-analysis-framework.md`              |
| 布局与默认介绍  | `src/lib/data/cpiAnalysisLayout.ts`                         |
| 内置模板     | `src/lib/data/macroPresetTemplates.ts`                      |
| 模板介绍 UI  | `src/components/macro/MacroTemplateIntroPanel.tsx`          |
| 偏好持久化    | `src/lib/data/macroChartPrefs.ts`（`templateIndicatorNotes`） |
| 分析文档     | `docs/US_CPI_ANALYSIS.md`                                   |
| 运维文档     | `docs/DATA_SCHEDULER_CPI.md`                                |
| 验证脚本     | `scripts/data-worker/verify-cpi.ts`（须含 §0 近期 obs 检查）        |


---

## 使用说明

将 **本 Prompt 全文** 交给 Agent 执行。Agent 须完成：

**§0 逐条验证 FRED 有效性 → 2 模板 + 精简介绍 → catalog/scheduler → seed/sync/verify → 汇报**

全程无需人工录入 FRED 数据。若 calendar 403，汇报回退状态及 `docs/INVESTING_CALENDAR_COOKIE.md` 修复步骤。若某分析角色 **找不到有效序列**，须在汇报中说明 **已剔除的面板/替代口径**，不得静默保留空数据指标。