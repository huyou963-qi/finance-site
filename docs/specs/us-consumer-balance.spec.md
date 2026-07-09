# Spec：美国消费与居民资产负债（us-consumer-balance）

> 按 [SPEC-TEMPLATE.md](./SPEC-TEMPLATE.md) 填写。P2 维度；全 FRED，无抓取。

---

## §0 元信息

| 字段 | 值 |
|------|----|
| dimension id | `us-consumer-balance` |
| 中文名 | 美国消费与居民资产负债 |
| 内置文件夹 id | `folder-builtin-us-consumer-balance` |
| 模板 id 前缀 | `builtin-us-consumer-balance-` |
| 分支 | `feature/macro-consumer-balance` |
| 状态 | `verified` |
| 对应框架页维度 | `consumption`（消费与收入） |
| 评审记录 | 2026-07-09 Agent A→B→D→E 全流程：9 新 FRED + UMCSENT(phase2) 入库、双模板、发布包、docs。FRED API 对 TNWBSHNO/TOTALSL 实测首观测 1950（元数据更早），verify 阈值按 API 实测。未做宏观页浏览器截图（与 cycle-risk 同：并发 UI 限制）；build 受既有无关 TS 噪声影响，本域文件 eslint 通过 + verify --db 通过。 |

---

## §1 分析框架

### 1.1 核心问题（L0）

> 居民消费动能在加速还是熄火？家庭资产负债表（财富、储蓄、偿债）是在支撑还是拖累消费？消费信贷扩张是否伴随信用质量恶化？

经济 Overview ② 只用「实际 PCE + 零售销售」扫一眼需求；本维度深钻「支出结构 → 信心/储蓄 → 资产负债 → 消费信贷与核销」的完整居民部门链。

### 1.2 分析层级

| 层级 | 问题 | 主要指标 | 落到哪 |
|------|------|----------|--------|
| L1 高频零售 | 零售贸易冷热？ | 零售销售（零售贸易）同比 | ① 图 1 |
| L2 PCE 结构 | 耐用品 vs 服务谁在驱动？ | 实际 PCE 耐用品/服务同比 | ① 图 2 |
| L3 信心 | 消费意愿领先信号？ | 密歇根消费者信心 | ① 图 3 |
| L4 储蓄缓冲 | 储蓄率在补库存还是耗尽？ | 个人储蓄率 | ① 图 4 |
| L5 净财富 | 财富效应方向？ | 家庭净财富同比 | ② 图 1 |
| L6 偿债压力 | 债务服务占可支配收入？ | 家庭偿债比率 | ② 图 2 |
| L7 消费信贷 | 信贷扩张还是收缩？ | 总消费信贷/循环信贷同比 | ② 图 3 |
| L8 信用质量 | 信用卡核销是否抬头？ | 信用卡贷款核销率 | ② 图 4 |

### 1.3 与现有模板的分工

| 相邻主题 | 归属 | 本维度不做 |
|----------|------|------------|
| 实际 PCE（PCEC96）、零售销售总额（RSAFS） | 经济 Overview ② | 本维度用 **RSXFS**（零售贸易，不含餐饮）与 **PCE 耐用品/服务分项**，口径互补不重复 |
| 实际可支配收入 DSPIC96、实际个人收入(除转移) W875RX1 | 增长动能与衰退风险 ② | 收入动能归周期域；本维度用储蓄率/偿债比看**财务缓冲** |
| 信用卡拖欠率 DRCCLACBS | 货币政策与金融条件 ② | 本维度用 **核销率 CORCCACBS**（损失确认，滞后于拖欠） |
| 密歇根细项 / 谘商会预期 | 专有数据 | 只用 FRED 镜像 UMCSENT 总指数；不选 CB 专有序列 |
| 住房抵押拖欠 / 房价 | 住房与地产 | 居民住房资产细节归住房域；本维度只看 Z.1 净财富总量 |

---

## §2 模板规划

| 顺序 | 模板 id | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-consumer-balance-spending` | 消费 · 支出与景气 | 默认第一步：量端支出 + 信心/储蓄 |
| ② | `builtin-us-consumer-balance-balance-sheet` | 居民 · 资产负债与信用 | 财务缓冲与信贷质量 |

### 模板 ①（layoutMode: 4）

| 图 | slotTitle | 序列（显示名） | 轴 | 图型 |
|----|-----------|----------------|----|------|
| 1 | L1 高频：零售贸易 | 零售销售（零售贸易）同比 | left | line |
| 2 | L2 PCE 结构：耐用品 vs 服务 | 实际 PCE 耐用品同比、实际 PCE 服务同比 | left | line |
| 3 | L3 信心：密歇根 | 密歇根消费者信心 | left | line |
| 4 | L4 储蓄缓冲 | 个人储蓄率 | left | line |

### 模板 ②（layoutMode: 4）

| 图 | slotTitle | 序列（显示名） | 轴 | 图型 |
|----|-----------|----------------|----|------|
| 1 | L5 净财富 | 家庭净财富同比 | left | line |
| 2 | L6 偿债压力 | 家庭偿债比率 | left | line |
| 3 | L7 消费信贷：总量 vs 循环 | 总消费信贷同比、循环消费信贷同比 | left | line |
| 4 | L8 信用质量：信用卡核销 | 信用卡贷款核销率 | left | line |

---

## §3 指标清单

10 条（9 新 seed + 1 复用 UMCSENT）。2026-07-09 用 FRED API `series` + `series/release` 核实。

| # | seriesKey | 显示名 | 频率 | 单位 | 机构 | kind | FRED id | 历史回填 | 调度 | 图槽 | 计算 | 去重/在库 | 核实 |
|---|-----------|--------|------|------|------|------|---------|----------|------|------|------|-----------|------|
| 1 | `fred:RSXFS::yoy` | 零售销售（零售贸易）同比 | 月 | 百万美元→% | Census | fred_api | RSXFS | API 全量 | 发布包 `us.bls.retail_sales`（追加） | ①-1 | yoy | ✅ 未占用（≠RSAFS） | 1992→2026-05；Release: Advance Monthly Sales |
| 2 | `fred:PCEDGC96::yoy` | 实际 PCE 耐用品同比 | 月 | 十亿美元→% | BEA | fred_api | PCEDGC96 | API 全量 | 发布包 `us.bea.personal_income`（追加） | ①-2 | yoy | ✅ 未占用 | 2007→2026-05；Release 54 |
| 3 | `fred:PCESC96::yoy` | 实际 PCE 服务同比 | 月 | 十亿美元→% | BEA | fred_api | PCESC96 | API 全量 | 同上包 | ①-2 | yoy | ✅ 未占用 | 2007→2026-05；Release 54 |
| 4 | `fred:UMCSENT` | 密歇根消费者信心 | 月 | 指数 | U Michigan | fred_api | UMCSENT | **已在库**（phase2）+ 包 `us.umich.sentiment` | 已有 | ①-3 | none | ✅ 在库未占槽，首次占用 | 1952→2026-05 |
| 5 | `fred:PSAVERT` | 个人储蓄率 | 月 | % | BEA | fred_api | PSAVERT | API 全量 | 发布包 `us.bea.personal_income`（追加） | ①-4 | none | ✅ 未占用 | 1959→2026-05；Release 54 |
| 6 | `fred:TNWBSHNO::yoy` | 家庭净财富同比 | 季 | 百万美元→% | Fed Z.1 | fred_api | TNWBSHNO | API 全量 | 发布包 `us.frb.z1_household`（新建 probe） | ②-1 | yoy | ✅ 未占用 | 元数据 1945；API 实测 1950→2026-Q1；Release 52 Z.1 |
| 7 | `fred:TDSP` | 家庭偿债比率 | 季 | % | Fed | fred_api | TDSP | API 全量 | 发布包 `us.frb.household_dsr`（新建 probe） | ②-2 | none | ✅ 未占用 | 2005→2026-Q1；Release 89 |
| 8 | `fred:TOTALSL::yoy` | 总消费信贷同比 | 月 | 百万美元→% | Fed G.19 | fred_api | TOTALSL | API 全量 | 发布包 `us.frb.g19_consumer_credit`（新建 probe） | ②-3 | yoy | ✅ 未占用 | 元数据 1943；API 实测 1950→2026-05；Release 14 |
| 9 | `fred:REVOLSL::yoy` | 循环消费信贷同比 | 月 | 百万美元→% | Fed G.19 | fred_api | REVOLSL | API 全量 | 同上包 | ②-3 | yoy | ✅ 未占用 | 1968→2026-05；Release 14 |
| 10 | `fred:CORCCACBS` | 信用卡贷款核销率 | 季 | % | Fed | fred_api | CORCCACBS | API 全量 | 发布包 `us.frb.chargeoff_delinquency`（追加） | ②-4 | none | ✅ 未占用（≠DRCCLACBS 拖欠率） | 1985→2026-Q1；Release 231 |

**发布包设计**：

- `us.bls.retail_sales`（**现有**，成员 RSAFS）→ 追加 RSXFS（同 Advance Monthly Sales 发布）。
- `us.bea.personal_income`（**现有**，成员 W875RX1/DSPIC96）→ 追加 PCEDGC96、PCESC96、PSAVERT（同 Personal Income and Outlays）。
- `us.umich.sentiment`（**现有**）→ UMCSENT 已在，不动。
- `us.frb.g19_consumer_credit`（**新建** probe 72h）→ TOTALSL、REVOLSL（G.19 Consumer Credit）。
- `us.frb.z1_household`（**新建** probe 168h）→ TNWBSHNO（Z.1）。
- `us.frb.household_dsr`（**新建** probe 168h）→ TDSP（Household Debt Service Ratios）。
- `us.frb.chargeoff_delinquency`（**现有**）→ 追加 CORCCACBS。

**给 Agent B 注意**：

1. UMCSENT 不重复 seed，只 verify 断言存在 + unit 非空。
2. 追加现有包成员时**只加 fredSeriesIds，不改 calendar 关键词**。
3. RSXFS ≠ RSAFS；CORCCACBS ≠ DRCCLACBS——文档与去重列写清。
4. PCEDGC96/PCESC96 历史自 2007 起（链式 2017 美元），历史深度断言按 2008 年首观测即可。
5. catalogCategory 用 `usMetadataCatalogCategory`；`FRED_US_ITEMS` + `data:sync-catalog-layout`。

### 3.1 需要新数据源的指标

无（全 FRED）。Agent C 跳过。

---

## §4 图表介绍与分析方法

### 4.1 模板 description

- ①：「按图 1→4 看支出与景气：零售贸易 → PCE 耐用品/服务结构 → 密歇根信心 → 储蓄率。判断消费动能与缓冲。」
- ②：「按图 1→4 看资产负债与信用：家庭净财富 → 偿债比率 → 消费信贷增速 → 信用卡核销。回答财富效应与信用风险。」

### 4.2 chartIntroNotes 草稿

**模板 ①**

1. 图 1：RSXFS（零售贸易）同比是高频消费温度计；与 Overview 的 RSAFS（含餐饮）口径不同，更贴近商品零售。同比转负常领先 PCE 走弱。
2. 图 2：耐用品（利率/财富敏感）vs 服务（粘性）。耐用品先掉、服务仍强 = 软着陆式放缓；两者同掉 = 需求全面收缩。
3. 图 3：密歇根信心领先硬数据 1–3 月；深跌后若零售未跟跌，多为情绪噪声。
4. 图 4：储蓄率↑可缓冲收入冲击，但过高也可能意味预防性储蓄、消费意愿弱；对照图 1/2。

**模板 ②**

1. 图 1：家庭净财富同比——股市/房价驱动的财富效应；转负后消费常滞后 1–2 季走弱。
2. 图 2：偿债比率——利息+本金占可支配收入；抬升 = 财务压力累积，限制加杠杆消费。
3. 图 3：总消费信贷 vs 循环信贷同比——循环信贷（信用卡）更敏感；总量扩张而循环收缩 = 结构转向分期/车贷。
4. 图 4：信用卡核销率——损失确认，滞后于货币域拖欠率；抬头确认信用周期下行。

### 4.3 决策树

| 观察 | 对照图位 | 典型结论 |
|------|----------|----------|
| 零售同比转负 + 耐用品先掉 | ①1 + ①2 | 商品消费收缩，关注是否传导至服务 |
| 信心深跌但零售仍稳 | ①3 + ①1 | 情绪噪声，硬数据优先 |
| 储蓄率低位 + 偿债比抬升 | ①4 + ②2 | 缓冲耗尽，消费脆弱 |
| 净财富同比转负 + 零售走弱 | ②1 + ①1 | 财富效应拖累确认 |
| 循环信贷同比↑ + 核销率抬头 | ②3 + ②4 | 加杠杆同时质量恶化，信用风险上升 |
| 核销抬头 + 货币域拖欠抬头 | ②4 + 引用货币域 | 居民信用周期下行确认 |

---

## §5 交付物清单

| 交付物 | 路径 | Agent |
|--------|------|-------|
| seed catalog | `src/lib/data/scheduler/consumerBalanceFredSeedCatalog.ts` | B |
| seed / verify | `scripts/data-worker/seed-consumer-balance.ts` / `verify-consumer-balance.ts` + registry `consumer-balance` + package.json | B |
| 发布包 | `releasePackageCatalog.ts`：新建 3 probe 包 + 现有 3 包追加成员 | B |
| 目录归位 | `fredCatalog.ts` FRED_US_ITEMS 加 10 条 + `data:sync-catalog-layout` | B |
| 模板 layout | `src/lib/data/consumerBalanceAnalysisLayout.ts` | D |
| 模板注册 | `macroPresetTemplates.ts` + `MacroSection.tsx`（仅 append） | D |
| 文档 | `docs/US_CONSUMER_BALANCE_ANALYSIS.md` + `.cursor/prompts/us-consumer-balance-analysis-framework.md` | D |
| 负面清单 | `USED-INDICATORS.md` 追加 11 条 | E |

## §6 验收清单

**数据（Agent B）**

- [x] 9 条新 seed + UMCSENT 复用断言在库，历史深度符合 §3（API 实测）
- [x] `data:verify-consumer-balance -- --db` 通过
- [x] 3 新 probe 包 + 3 现有包追加成员；`data:sync-calendar` 已跑
- [x] 目录归位（`data:sync-catalog-layout` 9 keys 移入）
- [x] 无抓取项（Agent C N/A）

**模板（Agent D）**

- [x] 本域文件 eslint 通过；模板已注册到 macroPresetTemplates + MacroSection
- [ ] 宏观页浏览器目视四图（未执行，环境限制）
- [x] docs/layout/prompt 三处指标清单一致
- [x] 零重复（RSXFS≠RSAFS，CORCCACBS≠DRCCLACBS）+ 未动现有模板 id/migration
