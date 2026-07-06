# Spec：美国住房与地产（us-housing）

> 按 [SPEC-TEMPLATE.md](./SPEC-TEMPLATE.md) 填写。Phase 2 第一维度。

---

## §0 元信息

| 字段 | 值 |
|------|----|
| dimension id | `us-housing` |
| 中文名 | 美国住房与地产 |
| 内置文件夹 id | `folder-builtin-us-housing` |
| 模板 id 前缀 | `builtin-us-housing-` |
| 分支 | `feature/macro-housing` |
| 状态 | `verified`（Phase 2 首维度闭环完成） |
| 对应框架页维度 | `investment`（投资与住房） |
| 评审记录 | 2026-07-05 Agent A 评审 1；用户批准继续；Agent B 数据接入（11 序列入库、6 发布包=2 现有追加+4 新建）；Agent D 双模板；Agent E 验收通过（build/lint/双模板渲染 verified）。成屋销售 EXHOSLUSM495S 因 NAR 许可仅约 1 年，按降级预案入库累积但暂不进模板。 |

---

## §1 分析框架

### 1.1 核心问题（L0）

> 房地产周期处于扩张、见顶还是收缩？利率对购房需求的压制走到哪一步？供给（开工/库存）与价格是否已背离？作为利率最敏感、领先整体经济的部门，住房当前是拖累还是支撑？

住房是货币政策传导的**最敏感前哨**：抵押利率↑ → 需求↓ → 销售/开工↓（领先 GDP 2–4 季度）→ 价格↓。经济 Overview ② 只用 1 张图（新屋开工）扫一眼，本维度深钻"量→价→融资→信用"的完整地产链。

### 1.2 分析层级

| 层级 | 问题 | 主要指标 | 落到哪 |
|------|------|----------|--------|
| L1 领先信号 | 许可/开工的周期拐点？ | 建筑许可、单户开工 | ① 图 1 |
| L2 销售 | 新屋/成屋成交冷热？ | 新屋销售、成屋销售 | ① 图 2 |
| L3 库存 | 供给过剩还是短缺？ | 新屋可售月数 | ① 图 3 |
| L4 完工 | 在建产能释放？ | 住房完工 | ① 图 4 |
| L5 价格 | 房价动能？ | Case-Shiller 全国 | ② 图 1 |
| L6 融资成本 | 抵押利率压制多强？ | 30Y/15Y 抵押利率 | ② 图 2 |
| L7 自有率 | 结构性需求？ | 自有住房率 | ② 图 3 |
| L8 信用质量 | 违约风险抬头？ | 单户抵押贷款拖欠率 | ② 图 4 |

### 1.3 与现有模板的分工

| 相邻主题 | 归属 | 本维度不做 |
|----------|------|------------|
| 总开工 HOUST | 经济 Overview ② 图 2 | 本维度用**单户开工 HOUST1F**（区别于总开工），口径互补不重复 |
| CPI 住房分项 OER（CUSR0000SEHC）、租金 | 美国通胀分析 | 不做 CPI 口径的居住成本，只看房价指数与融资 |
| 10Y 收益率、政策利率 | 货币政策与金融条件 | 只用抵押利率（Freddie Mac），不复制国债/政策利率 |

---

## §2 模板规划

| 顺序 | 模板 id | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-housing-activity` | 住房 · 供需与景气 | 默认第一步：量端（许可→销售→库存→完工） |
| ② | `builtin-us-housing-price-finance` | 住房 · 价格与融资 | 价端：房价→利率→自有率→信用 |

### 模板 ①（layoutMode: 4）

| 图 | slotTitle | 序列（显示名） | 轴 | 图型 |
|----|-----------|----------------|----|------|
| 1 | L1 领先：许可 vs 单户开工 | 建筑许可 同比、单户新屋开工 同比 | left | line |
| 2 | L2 销售：新屋 vs 成屋 | 新屋销售 同比、成屋销售 同比 | left | line |
| 3 | L3 库存：新屋可售月数 | 新屋可售月数（月，供给紧俏<4 过剩>6） | left | line |
| 4 | L4 完工：住房完工 | 住房完工 同比 | left | line |

### 模板 ②（layoutMode: 4）

| 图 | slotTitle | 序列（显示名） | 轴 | 图型 |
|----|-----------|----------------|----|------|
| 1 | L5 房价：Case-Shiller | Case-Shiller 全国房价 同比 | left | line |
| 2 | L6 融资：30Y vs 15Y 抵押利率 | 30Y 抵押利率（月均）、15Y 抵押利率（月均） | left | line |
| 3 | L7 自有率 | 自有住房率（%，季） | left | line |
| 4 | L8 信用：单户抵押贷款拖欠率 | 单户住宅抵押贷款拖欠率（%，季） | left | line |

---

## §3 指标清单

11 条全 FRED（10 条新 seed + 1 条复用 CSUSHPINSA）。2026-07-05 用 `fredgraph.csv` 逐条核实。

| # | seriesKey | 显示名 | 频率 | 单位 | 机构 | kind | FRED id | 历史回填 | 调度 | 图槽 | 计算 | 去重/在库 | 核实 |
|---|-----------|--------|------|------|------|------|---------|----------|------|------|------|-----------|------|
| 1 | `fred:PERMIT::yoy` | 建筑许可 同比 | 月 | 千套(SAAR) | Census | fred_api | PERMIT | API 全量 | 发布包 `us.bls.housing_starts` | ①-1 | yoy | ✅ 未占用 | 1960→2026-05 |
| 2 | `fred:HOUST1F::yoy` | 单户新屋开工 同比 | 月 | 千套 | Census | fred_api | HOUST1F | API 全量 | 同上包 | ①-1 | yoy | ✅ 未占用（≠HOUST） | 1959→2026-05 |
| 3 | `fred:HSN1F::yoy` | 新屋销售 同比 | 月 | 千套 | Census | fred_api | HSN1F | API 全量 | 发布包 `us.census.new_home_sales` | ①-2 | yoy | ✅ 未占用 | 1963→2026-05 |
| 4 | `fred:EXHOSLUSM495S::yoy` | 成屋销售 同比 | 月 | 套 | NAR | fred_api | EXHOSLUSM495S | API（⚠ 公开 CSV 仅回 2025-05，NAR 许可，历史深度待 Agent B 验证） | 发布包 `us.nar.existing_home_sales` | ①-2 | yoy | ✅ 未占用 | (CSV)2025-05→2026-05 |
| 5 | `fred:MSACSR` | 新屋可售月数 | 月 | 月 | Census | fred_api | MSACSR | API 全量 | 发布包 `us.census.new_home_sales` | ①-3 | none | ✅ 未占用 | 1963→2026-05 |
| 6 | `fred:COMPUTSA::yoy` | 住房完工 同比 | 月 | 千套(SAAR) | Census | fred_api | COMPUTSA | API 全量 | 发布包 `us.bls.housing_starts` | ①-4 | yoy | ✅ 未占用 | 1968→2026-05 |
| 7 | `fred:CSUSHPINSA::yoy` | Case-Shiller 全国房价 同比 | 月 | 指数 | S&P/CoreLogic | fred_api | CSUSHPINSA | **已在库**（phase2）+ 已在包 `us.case_shiller` | 已有 | ②-1 | yoy | ✅ 在库未占槽，首次占用 | 1987→2026-04 |
| 8 | `fred:MORTGAGE30US::avg` | 30Y 抵押利率（月均） | 周 | % | Freddie Mac | fred_api | MORTGAGE30US | API 全量 | 发布包 `us.freddiemac.pmms`（probe 周） | ②-2 | none+月均 | ✅ 未占用 | 1971→2026-07-02 |
| 9 | `fred:MORTGAGE15US::avg` | 15Y 抵押利率（月均） | 周 | % | Freddie Mac | fred_api | MORTGAGE15US | API 全量 | 同上包 | ②-2 | none+月均 | ✅ 未占用 | 1991→2026-07-02 |
| 10 | `fred:RHORUSQ156N` | 自有住房率 | 季 | % | Census | fred_api | RHORUSQ156N | API 全量 | 发布包 `us.census.homeownership`（probe 季） | ②-3 | none | ✅ 未占用 | 1965→2026-Q1 |
| 11 | `fred:DRSFRMACBS` | 单户住宅抵押贷款拖欠率 | 季 | % | Fed | fred_api | DRSFRMACBS | API 全量 | **加入现有包** `us.frb.chargeoff_delinquency`（与 DRCCLACBS/DRBLACBS 同发布） | ②-4 | none | ✅ 未占用 | 1991→2026-Q1 |

**发布包设计（本维度验证「日历型包」路径，货币域全 probe 未覆盖）**：

- `us.bls.housing_starts`（**现有包**，成员现仅 HOUST）→ 追加 PERMIT/HOUST1F/COMPUTSA（Census 新建住宅一次发布，同日历事件"Building Permits/Housing Starts"）。
- `us.census.new_home_sales`（新建，economic_calendar，keywords `new home sales`）→ HSN1F + MSACSR（Census 新屋销售报告同时发布可售月数）。
- `us.nar.existing_home_sales`（新建，economic_calendar，keywords `existing home sales`）→ EXHOSLUSM495S。
- `us.freddiemac.pmms`（新建，probe 168h）→ MORTGAGE30US/15US（周度 PMMS，无 TE 日历事件）。
- `us.census.homeownership`（新建，probe 168h）→ RHORUSQ156N。
- `us.frb.chargeoff_delinquency`（**现有包**）→ 追加 DRSFRMACBS。
- CSUSHPINSA 已在 `us.case_shiller`，不动。

**给 Agent B 的注意**：
1. EXHOSLUSM495S 历史深度用 API 确认；若确仅 1 年（NAR 许可），接受"短史+累积"并在 §3 回写，或降级为可选（模板 ①-2 仅留新屋销售）。
2. 追加成员到现有包（housing_starts、chargeoff_delinquency）时**只加 member，不改 calendar 关键词/releaseRule**。
3. CSUSHPINSA 不重复 seed，只断言存在。

### 3.1 需要新数据源的指标

无（全 FRED）。C 类抓取路径留待后续含专有网页数据的维度。

---

## §4 图表介绍与分析方法

### 4.1 模板 description

- ①：「按图 1→4 走量端地产链：许可/开工（领先）→ 新屋/成屋销售 → 库存月数 → 完工。判断周期在扩张/见顶/收缩哪一段。」
- ②：「按图 1→4 走价与融资：Case-Shiller 房价 → 抵押利率 → 自有率 → 拖欠率。回答利率压制与信用风险。」

### 4.2 chartIntroNotes 草稿

**模板 ①（供需与景气）**

1. 图 1：建筑许可领先开工约 1–2 月、领先房价与 GDP 2–4 季度。许可同比转负 = 周期见顶最早信号；与开工背离时以许可为准。
2. 图 2：新屋（Census，领先）vs 成屋（NAR，占成交 ~85%，滞后）。新屋销售先反弹/先转弱；两者同向确认周期方向。
3. 图 3：新屋可售月数——<4 供不应求（支撑房价/新开工），>6 过剩（压价、去库存）。库存跳升常先于开工下滑。
4. 图 4：完工滞后开工约 6–12 月，反映在建产能释放。完工高位而销售转弱 → 短期供给压力、利空房价。

**模板 ②（价格与融资）**

1. 图 1：Case-Shiller 全国房价同比——地产财富效应与 CPI 住房（滞后 12–18 月）的领先量。同比转负历史上少见，是深度衰退信号。
2. 图 2：30Y/15Y 抵押利率（月均）——购房月供的核心。利率↑压制需求（对照图 1 销售）；30Y-10Y 利差走阔反映抵押市场压力。
3. 图 3：自有住房率——结构性需求/可负担性。利率高企 + 房价高 → 自有率见顶回落，租房需求上升。
4. 图 4：单户抵押贷款拖欠率——信用质量、周期最后确认。与货币域信用卡/工商拖欠对照，拖欠率抬头 = 地产信用周期下行。

### 4.3 决策树

| 观察 | 对照图位 | 典型结论 |
|------|----------|----------|
| 许可同比转负 + 库存月数跳升 | ①1 + ①3 | 周期见顶，未来开工/价格承压 |
| 抵押利率高位 + 新屋销售走弱 | ②2 + ①2 | 利率压制生效，需求端收缩 |
| 房价同比放缓 + 完工高位 | ②1 + ①4 | 供给释放叠加需求弱，房价下行风险 |
| 拖欠率抬头 + 自有率回落 | ②4 + ②3 | 地产信用周期下行，警惕连锁 |
| 许可回升 + 利率见顶回落 | ①1 + ②2 | 周期触底，地产先于经济复苏 |

---

## §5 交付物清单

| 交付物 | 路径 | Agent |
|--------|------|-------|
| seed catalog | `src/lib/data/scheduler/housingFredSeedCatalog.ts` | B |
| seed / verify | `scripts/data-worker/seed-housing.ts` / `verify-housing.ts` + registry key `housing` + package.json | B |
| 发布包 | `releasePackageCatalog.ts`：新建 3 包 + 现有 2 包追加成员 | B |
| 目录归位 | `fredCatalog.ts` FRED_US_ITEMS 加 10 条（分类「固定资产与地产」/「利率与债券」）+ `data:sync-catalog-layout` | B |
| 模板 layout | `src/lib/data/housingAnalysisLayout.ts` | D |
| 模板注册 | `macroPresetTemplates.ts` + `MacroSection.tsx` | D |
| 文档 | `docs/US_HOUSING_ANALYSIS.md` + `.cursor/prompts/us-housing-analysis-framework.md` | D |
| 负面清单 | `USED-INDICATORS.md` 追加 11 条 | E |

## §6 验收清单

**数据（Agent B）**
- [ ] 10 条新 seed + CSUSHPINSA 复用断言在库，历史深度符合 §3
- [ ] `data:verify -- --catalog=housing -- --db` 通过
- [ ] 3 新包 + 2 现有包追加成员，`data:sync-calendar` 后日历型包 matched
- [ ] 目录归位（无「未分配」），`/admin/data-catalog` 三列齐全
- [ ] EXHOSLUSM495S 历史深度结论回写 §3

**模板（Agent D）**
- [ ] build + lint 通过；宏观页新文件夹 2 模板四图有数
- [ ] 抽 1 条 yoy 与 FRED 手算一致；周频月均对齐
- [ ] 介绍 Tab 完整；docs/layout/prompt 三处一致
- [ ] 零重复（HOUST1F≠HOUST）+ 未动现有模板/migration
