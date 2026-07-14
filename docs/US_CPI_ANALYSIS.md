# 美国 CPI 通胀分析框架

本文档与宏观页内置模板、`cpiAnalysisLayout.ts`、`.cursor/prompts/us-cpi-analysis-framework.md` 保持一致。

## 分析层级

| 层级 | 问题 | 主要指标（显示名） | 默认模板 |
|------|------|-------------------|----------|
| L0 综合 | Headline vs Core 是否背离？ | CPI（全部城市消费者）、核心 CPI | 模板 ① 图 1 |
| L1 三分法 | 能源、食品、核心各贡献？ | CPI 能源、CPI 食品与饮料 | 模板 ① 图 2 |
| L2 核心拆分 | 粘性来自 OER、商品还是服务？ | OER、CPI 核心商品、CPI 核心服务 | 模板 ① 图 3 |
| L3 热点分项 | 二手车、新车、医疗等异常？ | 二手车与卡车、新车、医疗等 | **目录自选**，不进默认模板 |
| L4 驱动因子 | 供给、工资、预期、政策锚 | WTI、PPI、时薪、失业、T5YIE、核心 PCE | 模板 ② |

## 两模板链条（宏观页 → 美国通胀分析）

内置 **2 个** 四图模板（`layoutMode: 4`），文件夹 `folder-builtin-us-cpi`。模板介绍 Tab 按 **图 1–4** 展示分析思路（`chartIntroNotes`），**不**逐指标展开。

| 顺序 | 模板 ID | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-cpi-overview` | CPI 诊断 · 总览 | **默认第一步**；80% 场景够用 |
| ② | `builtin-us-cpi-drivers` | CPI 驱动 · 外生与政策 | 总览仍说不清外因/政策锚时再加载 |

**已废弃**：旧四模板 ID（`level0` / `structure` / `cost-push` / `expectations`）不再注册；本地若仍缓存旧 ID，请重新选 ① 或 ②。

### 模板 ① — CPI 诊断 · 总览

| 图 | slotTitle | 序列（显示名） |
|----|-----------|----------------|
| 1 | 总水平：Headline vs Core | CPI 同比、核心 CPI 同比 |
| 2 | 边缘冲击：能源 vs 食品 | CPI 能源同比、CPI 食品与饮料同比 |
| 3 | 结构：OER vs 商品 vs 服务 | OER 同比、核心商品同比、核心服务同比 |
| 4 | 发布月动能：环比 | CPI 环比、核心 CPI 环比（柱） |

**分析顺序（`chartIntroNotes` 摘要）**：

1. 图 1：Headline vs Core YoY — 剪刀差扩大 → 图 2；接近 → 图 3  
2. 图 2：能源/食品 — 解释 Headline−Core 差；回落而图 1 仍高 → 图 3  
3. 图 3：OER / 核心商品 / 核心服务 — 定位粘性；服务顽固 → 模板 ② 图 3  
4. 图 4：Headline/Core MoM — 发布月动能；Core 连续 >0.3% 暗示去通胀放缓  

### 模板 ② — CPI 驱动 · 外生与政策

| 图 | slotTitle | 序列（显示名） |
|----|-----------|----------------|
| 1 | 供给：WTI 油价 | WTI 原油现货（月均） |
| 2 | 上游：PPI 最终需求 | PPI 最终需求同比 |
| 3 | 劳动力：失业 vs 时薪 | 失业率（左）、平均时薪同比（右） |
| 4 | 政策锚：预期 vs 核心 PCE | 5Y 盈亏平衡通胀月均（左）、核心 PCE 同比（右） |

**分析顺序（`chartIntroNotes` 摘要）**：

1. 图 1：WTI 领先 CPI 能源 1–2 月 — 对照模板 ① 图 2  
2. 图 2：PPI 领先核心商品 1–3 月 — 对照模板 ① 图 3 商品端  
3. 图 3：低失业 + 高时薪 → 服务通胀支撑 — 对照模板 ① 图 3 服务  
4. 图 4：T5YIE vs 核心 PCE — 预期是否锚定在 Fed 2%  

**指标去重**：Headline / Core / 能源 / OER / 商品 / 服务 **仅** 在模板 ①；WTI / PPI / 时薪 / 失业 / T5YIE / 核心 PCE **仅** 在模板 ②。

## 决策树（两模板完成后）

用 **1–2 条** 主因归纳（示例句式见下）：

| 观察 | 对照图位 | 典型结论 |
|------|----------|----------|
| Headline ↑、Core 平稳 | ① 图 1 + 图 2 | 能源/食品一次性 |
| Core ↑、OER 领先 | ① 图 3 | 住房粘性 |
| 核心商品反弹、PPI ↑ | ① 图 3 + ② 图 2 | 上游成本传导 |
| 核心服务偏强、时薪 ↑ | ① 图 3 + ② 图 3 | 劳动力成本 |
| T5YIE 高、核心 PCE 已降 | ② 图 4 | 预期未锚定 |

示例：「OER 粘性 + 时薪偏强」或「能源一次性 + PPI 尚未传导」。

## 变动率与时间轴

- 数据库存 **指数水平**；YoY / MoM 由宏观页 `seriesCalcConfigMap` 计算，**不在 DB 预存 YoY**。
- CPI / PCE 指数：`op: "yoy"` 或 `"pctChange"`，`frequency: "month"`。
- 已是 % 的序列（失业率、盈亏平衡通胀）：`op: "none"`；UNRATE 在模板 ② 另设 `resampleToMonth: true` 与月频对齐。
- 日频（WTI、T5YIE）：`frequency: "month"`，`resampleMethod: "avg"`。

**多频度并表**（`src/lib/macroPeriodLabel.ts`）：

| 频度 | 合并键 | 表格展示 |
|------|--------|----------|
| 日 | `YYYY-MM-DD` | 同左 |
| 月 | `YYYY-MM-01` | `YYYY-MM` |
| 季 | `YYYY-Qn` | 同左 |
| 年 | `YYYY` | 同左 |

`MacroObservation.obsDate` 存完整日期（月频多为每月 1 日）；提取数据合并时用 `macroAlignPeriodKey` 统一，避免 `2026-01` 与 `2026-01-01` 拆行。

## 每期 checklist

**模板 ① 发布月（必做）**

1. CPI YoY vs 核心 CPI YoY — 总水平与剪刀差  
2. CPI 能源 / 食品 YoY — 边缘冲击  
3. OER vs 核心商品 vs 核心服务 YoY — 粘性结构  
4. CPI / 核心 CPI MoM — 当月动能  

**需深挖时（模板 ② + 目录自选）**

5. WTI 月均 vs CPI 能源 YoY — 供给前瞻  
6. PPI 最终需求 YoY — 上游传导（约 1–3 月滞后）  
7. 失业率 + 平均时薪 YoY — 劳动力  
8. 5Y 盈亏平衡通胀 vs 核心 PCE — 政策锚  
9. （自选）Shelter、Primary Rent、二手车、新车、医疗 — L3 热点  

## 站内入口

| 入口 | 路径 / 说明 |
|------|-------------|
| 宏观模板 | 宏观页 → **美国通胀分析** 文件夹 → 2 个内置模板 |
| 模板介绍 | 图表侧栏 **模板介绍** Tab；`chartIntroNotes` 按图 1–4，用户编辑自动保存 |
| 指标树 | **美国 → CPI 综合 / 住房 / 分项 / 通胀驱动因子**（`fredCatalog.ts`） |
| 数据目录 | `/admin/data-catalog` → `docs/DATA_SCHEDULER_CPI.md` |
| 布局与默认文案 | `src/lib/data/cpiAnalysisLayout.ts` |
| 种子 / 校验 | `npm run data:seed-cpi` · `npm run data:verify-cpi -- --db` |

## 定稿 FRED 序列（2026-06-19 验证）

`npm run data:verify-cpi -- --db` 对 **20** 条序列检查 DB 最新观测与 metadata。

| FRED ID | 显示名 | 最新 obs | 默认模板 | 替换说明 |
|---------|--------|----------|----------|----------|
| CPIAUCSL | CPI（全部城市消费者） | 2026-05 | ① | — |
| CPILFESL | 核心 CPI | 2026-05 | ① | — |
| CPIENGSL | CPI 能源 | 2026-05 | ① | — |
| CPIFABSL | CPI 食品与饮料 | 2026-05 | ① | — |
| CUSR0000SEHC | OER | 2026-05 | ① | — |
| CUSR0000SACL1E | 核心商品 | 2026-05 | ① | 替 `CUSR0000SAC` |
| CUSR0000SASLE | 核心服务 | 2026-05 | ① | 替 `CUSR0000SAS` |
| DCOILWTICO | WTI 原油 | 2026-06 | ② | 图表月均 |
| PPIFIS | PPI 最终需求 | 2026-05 | ② | — |
| UNRATE | 失业率 | 2026-05 | ② | 水平 %，勿再 yoy |
| CES0500000003 | 平均时薪 | 2026-05 | ② | YoY |
| T5YIE | 5Y 盈亏平衡通胀 | 2026-06 | ② | 图表月均 |
| PCEPILFE | 核心 PCE | 2026-04 | ② | BEA 滞后约 1 月 |
| CUSR0000SAH1 | CPI 住房（Shelter） | 2026-05 | 目录 | — |
| CUSR0000SEHA | 主要住所租金 | 2026-05 | 目录 | — |
| CUSR0000SETA02 | 二手车与卡车 | 2026-05 | 目录 | — |
| CUSR0000SETA01 | 新车 | 2026-05 | 目录 | 替 `CUSR0000SETB01`（汽油） |
| CPIMEDSL | 医疗（聚合） | 2026-05 | 目录 | — |
| PCEPI | PCE | 2026-04 | 目录 | — |
| T10YIE | 10Y 盈亏平衡通胀 | 2026-06 | 目录 | — |

**勿用**：`CUSR0000SAC` / `SAS`（全商品/全服务）、`CUSR0000SETB01`（汽油非新车）— 已自框架与种子剔除。

---

## 附：CPI 分项季调环比表（BLS Table A 复刻 + 权重列）

路由 `/macro/cpi-subitems`（顶栏「CPI分项」），复刻 BLS「Table A. Percent changes in CPI-U」：
**分项作行、最近 N 个月的季调环比（MoM %）作列、末列为各分项权重**。用于一眼定位当月通胀由哪些分项驱动。

- **组件**：`src/components/macro/CpiMomMatrixTable.tsx`（客户端，走 `/api/data/macro?source=unified`）
- **行定义**：`src/lib/data/cpi/cpiMomMatrixCatalog.ts`（`CPI_MOM_MATRIX_ROWS`，含缩进层级与英文行名）
- **权重快照**：`src/lib/data/cpi/cpi-relative-importance-2025.json`
  = BLS *Relative importance …, December 2025*（2024 权重，CPI-U，占全部项目 %）。**每年 BLS 更新权重时手动 refresh 此 JSON**。
- **环比口径**：DB 只存 SA 指数水平，环比在前端由相邻月比值算出（与 `seriesCalcConfigMap` 一致，不预存 MoM）。
- **上色**：正值（通胀走热）红、负值绿、约 0 灰。

### 新增分项序列（2026-07-14 FRED 校验，最新 obs 2026-06）

| FRED ID（SA） | 行（Table A） | 权重 CPI-U % |
| --- | --- | --- |
| CPIUFDSL | Food 食品 | 13.698 |
| CUSR0000SAF11 | Food at home 家庭食品 | 8.325 |
| CUSR0000SEFV | Food away from home 外出就餐 | 5.373 |
| CUSR0000SACE | Energy commodities 能源商品 | 3.120 |
| CUSR0000SETB01 | Gasoline 汽油（全部类型） | 2.895 |
| CUSR0000SEHE | Fuel oil 燃油及其他燃料* | 0.140 |
| CUSR0000SEHF | Energy services 能源服务 | 3.262 |
| CUSR0000SEHF01 | Electricity 电力 | 2.489 |
| CUSR0000SEHF02 | Utility (piped) gas 管道燃气服务 | 0.773 |
| CPIAPPSL | Apparel 服装 | 2.368 |
| CUSR0000SAM1 | Medical care commodities 医疗护理商品 | 1.489 |
| CUSR0000SAS4 | Transportation services 交通运输服务 | 6.315 |
| CUSR0000SAM2 | Medical care services 医疗护理服务 | 6.935 |

\* FRED 无单独「Fuel oil（季调）」序列，采用「Fuel oil and other fuels（SA）」`CUSR0000SEHE`，权重口径随之为 0.140。

其余行（All items / 核心 CPI / 能源 / 核心商品·服务 / 新车 / 二手车 / Shelter）复用已在库序列。
