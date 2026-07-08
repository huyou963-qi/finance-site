# Spec：美国增长动能与衰退风险（us-cycle-risk）

> 按 [SPEC-TEMPLATE.md](./SPEC-TEMPLATE.md) 填写。Phase 2 维度。含首个网页抓取指标（NY Fed 衰退概率，Agent C 已入库）。

---

## §0 元信息

| 字段 | 值 |
|------|----|
| dimension id | `us-cycle-risk` |
| 中文名 | 美国增长动能与衰退风险 |
| 内置文件夹 id | `folder-builtin-us-cycle-risk` |
| 模板 id 前缀 | `builtin-us-cycle-risk-` |
| 分支 | `feature/macro-cycle-risk` |
| 状态 | `verified`（框架完成；实时浏览器渲染因 Cursor 并发改动的「提取数据」新 UI 无法自动化切模板库 tab，未现场截图——build/tsx 构造/API/verify 四重验证均通过） |
| 对应框架页维度 | `activity`（生产与景气）综合 / 顶栏周期定位 |
| 评审记录 | 2026-07-05 Agent A→B→D→E 全流程：6 新 FRED + CFNAI/USREC(phase2) + NY Fed 概率(Agent C mds) 入库、双模板、发布包、docs。含首个网页抓取指标复用。修复：Agent C 遗漏的 loadMdsCatalog `nyfed_` 前缀（否则 mds:nyfed 被 allowlist 过滤）；顺带修复 Cursor 提交的 usCatalogTaxonomy.ts 重复键（破坏 build）。 |

---

## §1 分析框架

### 1.1 核心问题（L0）

> 经济周期当前处于扩张、见顶还是收缩？衰退概率有多高、哪种探测法先亮灯？增长动能（硬数据）在加速还是熄火？——为宏观投资策略提供**周期定位**与**衰退择时**的顶层判断。

这是框架页顶栏「周期阶段 / 衰退概率」的落地维度：不重复各部门细节，而是**综合多方法衰退信号 + NBER 同步硬数据**给出一个可执行的周期结论。

### 1.2 分析层级

| 层级 | 问题 | 主要指标 | 落到哪 |
|------|------|----------|--------|
| L1 模型概率 | 曲线/因子模型给的衰退概率？ | NY Fed 衰退概率、平滑衰退概率 | ① 图 1 |
| L2 劳动规则 | Sahm 规则触发了吗？ | Sahm 规则实时值 | ① 图 2 |
| L3 活动综合 | 85 指标合成的景气？ | CFNAI | ① 图 3 |
| L4 校准参照 | 历史衰退期对照 | NBER 衰退标记 | ① 图 4 |
| L5 收入动能 | 实体收入在扩张？ | 实际个人收入(除转移)、实际可支配收入 | ② 图 1、图 3 |
| L6 销售动能 | 制造与贸易销售？ | 实际制造与贸易销售 | ② 图 2 |
| L7 最终需求 | 剔除库存的真实需求？ | 实际最终销售 | ② 图 4 |

### 1.3 与现有模板的分工

| 相邻主题 | 归属 | 本维度不做 |
|----------|------|------------|
| 期限利差 10Y-3M / 10Y-2Y | 货币域 ①、经济 Overview ① | 收益率曲线衰退信号**引用货币域**，本维度用概率模型/规则/活动指数，不重复画利差 |
| 非农就业、工业生产、初请失业金 | 就业域、经济 Overview | NBER 同步四指标里就业/IP 归各域；本维度只补**实际收入、实际销售**两条未占用的同步硬数据 |
| 实际 GDP 环比年化 A191RL1Q225SBEA | 经济 Overview ① | 本维度用实际最终销售(FINSLC1)看剔除库存的需求，口径互补 |

---

## §2 模板规划

| 顺序 | 模板 id | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-cycle-risk-signals` | 衰退风险 · 概率与规则 | 默认第一步：多方法衰退信号对照 |
| ② | `builtin-us-cycle-risk-momentum` | 增长动能 · 硬数据确认 | 信号亮灯后：用 NBER 同步硬数据证实/证伪 |

### 模板 ①（layoutMode: 4）

| 图 | slotTitle | 序列（显示名） | 轴 | 图型 |
|----|-----------|----------------|----|------|
| 1 | L1 模型概率：NY Fed vs 平滑 | NY Fed 衰退概率、平滑衰退概率（Chauvet-Piger） | left | line |
| 2 | L2 Sahm 规则（≥0.5 触发） | Sahm 规则实时值 | left | line |
| 3 | L3 活动综合：CFNAI（<-0.7 衰退） | 芝加哥联储全国活动指数 | left | line |
| 4 | L4 校准：NBER 衰退期 | NBER 衰退标记（0/1） | left | bar |

### 模板 ②（layoutMode: 4）

| 图 | slotTitle | 序列（显示名） | 轴 | 图型 |
|----|-----------|----------------|----|------|
| 1 | L5 实际个人收入(除转移) | 实际个人收入(除转移支付) 同比 | left | line |
| 2 | L6 实际制造与贸易销售 | 实际制造与贸易销售 同比 | left | line |
| 3 | L5 实际可支配收入 | 实际可支配个人收入 同比 | left | line |
| 4 | L7 实际最终销售 | 实际最终销售 同比 | left | line |

---

## §3 指标清单

9 条（6 新 seed + 3 复用）。2026-07-05 用 `fredgraph.csv` 逐条核实。

| # | seriesKey | 显示名 | 频率 | 单位 | 机构 | kind | id | 历史回填 | 调度 | 图槽 | 计算 | 去重/在库 | 核实 |
|---|-----------|--------|------|------|------|------|----|----------|------|------|------|-----------|------|
| 1 | `mds:nyfed_us_recession_prob` | NY Fed 衰退概率（12月前瞻） | 月 | % | NY Fed | web_scrape（已接） | nyfed_us_recession_prob | 已有（Agent C，809 点） | probe 168h | ①-1 | none | ✅ 复用（Agent C 已入库） | — |
| 2 | `fred:RECPROUSM156N::x100` | 平滑衰退概率（Chauvet-Piger） | 月 | %（源为分数） | FRED/圣路易斯联储 | fred_api | RECPROUSM156N | API 全量 | probe 168h | ①-1 | none | ✅ 未占用 | 1967→2026-05 |
| 3 | `fred:SAHMREALTIME` | Sahm 规则实时值 | 月 | pp | FRED | fred_api | SAHMREALTIME | API 全量 | probe 168h | ①-2 | none | ✅ 未占用 | 1959→2026-06 |
| 4 | `fred:CFNAI` | 芝加哥联储全国活动指数 | 月 | 指数 | Chicago Fed | fred_api | CFNAI | **已在库**（phase2） | 已有 | ①-3 | none | ✅ 复用未占槽，首次占用 | 1967→2026-05 |
| 5 | `fred:USREC` | NBER 衰退标记 | 月 | 0/1 | NBER/FRED | fred_api | USREC | **已在库**（phase2） | 已有 | ①-4 | none | ✅ 复用未占槽，首次占用 | 1854→2026-06 |
| 6 | `fred:W875RX1::yoy` | 实际个人收入(除转移支付) 同比 | 月 | 十亿美元→% | BEA | fred_api | W875RX1 | API 全量 | 发布包 `us.bea.personal_income` | ②-1 | yoy | ✅ 未占用 | 1959→2026-05 |
| 7 | `fred:CMRMTSPL::yoy` | 实际制造与贸易销售 同比 | 月 | 百万美元→% | Census/BEA | fred_api | CMRMTSPL | API 全量 | probe 72h | ②-2 | yoy | ✅ 未占用 | 1967→2026-04 |
| 8 | `fred:DSPIC96::yoy` | 实际可支配个人收入 同比 | 月 | 十亿美元→% | BEA | fred_api | DSPIC96 | API 全量 | 发布包 `us.bea.personal_income` | ②-3 | yoy | ✅ 未占用 | 1959→2026-05 |
| 9 | `fred:FINSLC1::yoy` | 实际最终销售 同比 | 季 | 十亿美元→% | BEA | fred_api | FINSLC1 | API 全量 | 发布包 `us.bea.gdp` | ②-4 | yoy | ✅ 未占用 | 1947→2026-01 |

**发布包**：
- RECPROUSM156N / SAHMREALTIME → 各建 probe 包（`us.stlouisfed.recession_prob` / `us.stlouisfed.sahm`，probe 168h；无 TE 日历事件）。
- CMRMTSPL → probe 包 `us.census.mfg_trade_sales`（72h）。
- W875RX1 / DSPIC96 → 新建日历包 `us.bea.personal_income`（keywords `personal income`；BEA 月度个人收入报告同时发布）。
- FINSLC1 → 并入现有 `us.bea.gdp`（季度 GDP 报告同时发布最终销售）。
- CFNAI → probe 包 `us.chicagofed.cfnai`（月，若 phase2 未挂包则新建）。
- USREC → probe 包 `us.nber.recession`（几乎不更新）。
- nyfed_us_recession_prob → 已有 probe 调度（Agent C），可选新建 `us.nyfed.recession_prob` 包归组。

**给 Agent B 注意**：
1. RECPROUSM156N 源为分数（0.54=54%），parser/calc 需 ×100 存百分比（用 seriesCalcConfig `unit: "x100"` 或在显示层）——与 NY Fed 概率(已×100)同图对齐。**关键**：确认两条概率同图单位一致（都 %）。
2. CFNAI/USREC 已在库（phase2），不重复 seed，只 verify 断言存在。
3. **catalogCategory 用新 `usMetadataCatalogCategory({code,fredId,label,legacyCategory})`**（Cursor 引入的分类法，housing seed 已改用），不要再硬编码 legacy 分类字符串。
4. nyfed 概率是 `mds:` 键（无 fredId），模板中用 `mds:nyfed_us_recession_prob`。

### 3.1 需要新数据源的指标

nyfed_us_recession_prob 已由 Agent C 接入（NY Fed Excel 抓取），本维度直接复用。其余全 FRED。

---

## §4 图表介绍与分析方法

### 4.1 模板 description

- ①：「四种衰退探测法对照：模型概率 → Sahm 劳动规则 → CFNAI 活动综合 → NBER 历史校准。看谁先亮灯、几种共振。」
- ②：「NBER 同步硬数据看增长动能：实际收入 → 实际销售 → 可支配收入 → 最终需求。信号亮灯后用硬数据证实/证伪衰退。」

### 4.2 chartIntroNotes 草稿

**模板 ①（概率与规则）**

1. 图 1：NY Fed（收益率曲线模型，12 月前瞻，领先）vs 平滑概率（Chauvet-Piger 动态因子，同步）。前者先升预警、后者确认已入衰退。两者 >50% 是强信号。
2. 图 2：Sahm 规则——3 月均失业率较前 12 月低点上升 ≥0.5pp 触发。实时值逼近 0.5 = 劳动市场转弱、衰退临近。它极少假阳性。
3. 图 3：CFNAI（85 指标合成，0=趋势增长）。3 月均值 <-0.7 历史上标志衰退开始。负值渐深 = 广谱走弱。
4. 图 4：NBER 衰退期（0/1）作校准基准——看上面三种信号历史上领先/滞后 NBER 定义多少。当前 NBER 未标衰退 + 信号未亮 = 扩张延续。

**模板 ②（增长动能硬数据）**

1. 图 1：实际个人收入(除转移支付) 同比——NBER 定衰退的四大同步指标之一，剔除政府补贴后的真实收入动能。转负是硬确认。
2. 图 2：实际制造与贸易销售 同比——NBER 四指标之一，需求端的实际成交。领先库存调整。
3. 图 3：实际可支配个人收入 同比——居民购买力，支撑消费（占 GDP ~68%）。放缓预示消费走弱。
4. 图 4：实际最终销售 同比——GDP 剔除库存变动的真实终端需求。比 GDP 更干净地反映动能；转负是衰退实质。

### 4.3 决策树

| 观察 | 对照图位 | 典型结论 |
|------|----------|----------|
| NY Fed 概率高 + Sahm 逼近 0.5 | ①1 + ①2 | 衰退风险显著上升，缩减风险敞口 |
| CFNAI 深负 + 实际销售转负 | ①3 + ②2 | 广谱走弱 + 需求确认，衰退进行中 |
| 信号未亮 + 实际收入/最终销售仍正增 | ①全 + ②1/④ | 扩张延续，动能尚可 |
| Sahm 触发 + 实际可支配收入转负 | ①2 + ②3 | 劳动+收入双弱，消费拖累临近 |
| NY Fed 概率回落 + 最终销售回升 | ①1 + ②4 | 衰退风险缓解，周期或触底 |

---

## §5 交付物清单

| 交付物 | 路径 | Agent |
|--------|------|-------|
| seed catalog | `src/lib/data/scheduler/cycleRiskFredSeedCatalog.ts` | B |
| seed / verify | `scripts/data-worker/seed-cycle-risk.ts` / `verify-cycle-risk.ts` + registry `cycle-risk` + package.json | B |
| 发布包 | `releasePackageCatalog.ts`：新建 personal_income 日历包 + 若干 probe 包 + FINSLC1 并入 gdp | B |
| 目录归位 | `fredCatalog.ts` FRED_US_ITEMS 加 6 条 + `data:sync-catalog-layout` | B |
| 模板 layout | `src/lib/data/cycleRiskAnalysisLayout.ts` | D |
| 模板注册 | `macroPresetTemplates.ts` + `MacroSection.tsx` | D |
| 文档 | `docs/US_CYCLE_RISK_ANALYSIS.md` + `.cursor/prompts/us-cycle-risk-analysis-framework.md` | D |
| 负面清单 | `USED-INDICATORS.md` 追加 | E |

## §6 验收清单

**数据（Agent B）**
- [ ] 6 新 seed + 3 复用（CFNAI/USREC/nyfed）断言在库，历史深度符合 §3
- [ ] `data:verify -- --catalog=cycle-risk -- --db` 通过
- [ ] RECPROUSM156N ×100 与 NY Fed 概率同单位（%），同图对齐
- [ ] 发布包 + 目录归位（无「未分配」），`/admin/data-catalog` 三列齐全

**模板（Agent D）**
- [ ] build + lint；宏观页新文件夹 2 模板四图有数
- [ ] 模板 ① 混用 `mds:`（nyfed）+ `fred:` 序列渲染正常
- [ ] 抽 1 条 yoy 与 FRED 手算一致
- [ ] 介绍 Tab 完整；docs/layout/prompt 三处一致
- [ ] 零重复（避开利差/就业/IP，用概率/规则/收入销售）+ 未动现有模板/migration
