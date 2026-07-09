# Spec：美国制造业与库存周期（us-industry-inventory）

> 按 [SPEC-TEMPLATE.md](./SPEC-TEMPLATE.md) 填写。P2 维度。ISM 制造业 PMI 已入库未占槽，本维度首次占用默认图槽。

---

## §0 元信息

| 字段 | 值 |
|------|----|
| dimension id | `us-industry-inventory` |
| 中文名 | 美国制造业与库存周期 |
| 内置文件夹 id | `folder-builtin-us-industry-inventory` |
| 模板 id 前缀 | `builtin-us-industry-inventory-` |
| 分支 | `feature/macro-industry-inventory` |
| 状态 | `verified`（Agent E：`data:verify-industry-inventory -- --db` 通过；USED-INDICATORS 已更新；模板已挂 MacroSection） |
| 对应框架页维度 | `activity`（生产与景气：订单、库存、产能） |
| 评审记录 | 2026-07-08 Agent A：指标与 FRED 页面逐条核实；框架页 `ADEXUS` 映射错误，正确 id=`ADXTNO`；产能用制造口径 `MCUMFN` 而非总量 `TCU`。Agent B：10 FRED seed + 3 ISM 复用 + 3 新发布包 + IPMAN 并入工业生产包。Agent C 跳过。Agent D：双模板 + docs。 |

---

## §1 分析框架

### 1.1 核心问题（L0）

> 制造业景气是在扩张还是收缩？新订单/积压是否足以支撑产出？库存周期处于主动补库、被动积压，还是主动去库？产能利用率是否接近过热或深度闲置？

经济 Overview ① 只用**总工业生产 INDPRO**扫一眼周期；本维度深钻**制造部门**：调查领先（ISM）→ 硬订单（M3）→ 制造产出/库存/库销比/产能（G.17 + MTIS），判断库存周期阶段与制造动能。

### 1.2 分析层级

| 层级 | 问题 | 主要指标 | 落到哪 |
|------|------|----------|--------|
| L1 软景气 | ISM 制造扩张/收缩？ | ISM 制造业 PMI、新订单 | ① 图 1 |
| L2 硬订单 | Census M3 订单是否确认？ | 耐用品订单、耐用品(除运输) | ① 图 2 |
| L3 资本品 | 设备投资前瞻？ | 核心资本品新订单(ex-aircraft) | ① 图 3 |
| L4 积压 | 订单积压在积还是消？ | 耐用品未完成订单、ISM 库存分项 | ① 图 4 |
| L5 产出 | 制造产出动能？ | 工业生产·制造业(NAICS) | ② 图 1 |
| L6 库存水平 | 库存在堆积还是消化？ | 总商业库存、制造业库存 | ② 图 2 |
| L7 库销比 | 相对销售的库存压力？ | 总业务库销比、制造业库销比 | ② 图 3 |
| L8 产能 | 利用率过热/闲置？ | 制造业产能利用率(NAICS) | ② 图 4 |

### 1.3 与现有模板的分工

| 相邻主题 | 归属 | 本维度不做 |
|----------|------|------------|
| 总工业生产 INDPRO | 经济 Overview ① | 用 **IPMAN**（制造业 NAICS），≠ INDPRO |
| 实际制造与贸易销售 CMRMTSPL | 增长动能与衰退风险 ② | 引用 cycle-risk；本维度看库存/库销比而非销售量 |
| 制造业就业 MANEMP | 美国就业 | 不做就业端，只做产出/订单/库存 |
| ISM 服务业 | Overview L2S 自选 / 未占槽 | 本维度聚焦制造业；不占服务业 PMI |
| PPI / 原油成本 | 美国通胀 | 不做价格端（ISM Prices 分项也不进默认槽） |
| TCU 总量产能利用率 | 框架页 mock 键 `cap-util`→fred:TCU | 本维度用制造口径 **MCUMFN**（与 IPMAN 同属 G.17 制造），TCU 不占用 |

---

## §2 模板规划

| 顺序 | 模板 id | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-industry-inventory-orders` | 制造业 · 景气与订单 | 默认第一步：软硬订单与积压 |
| ② | `builtin-us-industry-inventory-cycle` | 制造业 · 产出库存与产能 | 确认库存周期与产能位置 |

### 模板 ①（layoutMode: 4）

| 图 | slotTitle | 序列（显示名） | 轴 | 图型 |
|----|-----------|----------------|----|------|
| 1 | L1 软景气：ISM PMI vs 新订单 | ISM 制造业 PMI、ISM 新订单 | left | line |
| 2 | L2 硬订单：耐用品 vs 除运输 | 耐用品新订单 同比、耐用品(除运输) 同比 | left | line |
| 3 | L3 资本品：核心资本品新订单 | 非国防资本品(除飞机)新订单 同比 | left | line |
| 4 | L4 积压：未完成订单 vs ISM 库存 | 耐用品未完成订单 同比、ISM 库存分项 | left / right | line |

### 模板 ②（layoutMode: 4）

| 图 | slotTitle | 序列（显示名） | 轴 | 图型 |
|----|-----------|----------------|----|------|
| 1 | L5 产出：制造业工业生产 | 工业生产·制造业 同比 | left | line |
| 2 | L6 库存：总商业 vs 制造业 | 总商业库存 同比、制造业库存 同比 | left | line |
| 3 | L7 库销比：总量 vs 制造业 | 总业务库销比、制造业库销比 | left | line |
| 4 | L8 产能：制造业产能利用率 | 制造业产能利用率（%） | left | line |

---

## §3 指标清单

12 条（3 条复用已入库 ISM + 9 条新 FRED）。2026-07-08 用 FRED 系列页逐条核实。

| # | seriesKey | 显示名 | 频率 | 单位 | 机构 | kind | id | 历史回填 | 调度 | 图槽 | 计算 | 去重/在库 | 核实 |
|---|-----------|--------|------|------|------|------|----|----------|------|------|------|-----------|------|
| 1 | `mds:ism_us_ism_headline` | ISM 制造业 PMI | 月 | 指数 | ISM/TE | te_scrape（已接） | ism_us_ism_headline | 已有 | 发布包 `us.ism.manufacturing` | ①-1 | none | ✅ 已入库未占槽，**首次占用** | — |
| 2 | `mds:ism_us_ism_new_orders` | ISM 新订单 | 月 | 指数 | ISM/TE | te_scrape（已接） | ism_us_ism_new_orders | 已有 | 同上 | ①-1 | none | ✅ 同上首次占用 | — |
| 3 | `mds:ism_us_ism_inventories` | ISM 库存分项 | 月 | 指数 | ISM/TE | te_scrape（已接） | ism_us_ism_inventories | 已有 | 同上 | ①-4 | none | ✅ 同上首次占用 | — |
| 4 | `fred:DGORDER::yoy` | 耐用品新订单 同比 | 月 | 百万美元→% | Census | fred_api | DGORDER | API 全量 | 发布包 `us.census.m3` | ①-2 | yoy | ✅ 未占用 | 1992-02→2026-05 |
| 5 | `fred:ADXTNO::yoy` | 耐用品(除运输)新订单 同比 | 月 | 百万美元→% | Census | fred_api | ADXTNO | API 全量 | 同上 | ①-2 | yoy | ✅ 未占用（框架页误写 ADEXUS，以本 id 为准） | 1992-02→2026-05 |
| 6 | `fred:NEWORDER::yoy` | 非国防资本品(除飞机)新订单 同比 | 月 | 百万美元→% | Census | fred_api | NEWORDER | API 全量 | 同上 | ①-3 | yoy | ✅ 未占用 | 1992-02→2026-05 |
| 7 | `fred:AMDMUO::yoy` | 耐用品未完成订单 同比 | 月 | 百万美元→% | Census | fred_api | AMDMUO | API 全量 | 同上 | ①-4 | yoy | ✅ 未占用 | 1992-01→2026-05 |
| 8 | `fred:IPMAN::yoy` | 工业生产·制造业 同比 | 月 | 指数→% | Fed | fred_api | IPMAN | API 全量 | **加入现有包** `us.bls.industrial_production` | ②-1 | yoy | ✅ 未占用（≠INDPRO） | 1972-01→2026-05 |
| 9 | `fred:BUSINV::yoy` | 总商业库存 同比 | 月 | 百万美元→% | Census | fred_api | BUSINV | API 全量 | 发布包 `us.census.mtis` | ②-2 | yoy | ✅ 未占用 | 1992-01→2026-04 |
| 10 | `fred:AMTMTI::yoy` | 制造业库存 同比 | 月 | 百万美元→% | Census | fred_api | AMTMTI | API 全量 | 发布包 `us.census.m3`（M3 库存） | ②-2 | yoy | ✅ 未占用 | 1992-01→2026-05 |
| 11 | `fred:ISRATIO` | 总业务库销比 | 月 | 比率 | Census | fred_api | ISRATIO | API 全量 | 发布包 `us.census.mtis` | ②-3 | none | ✅ 未占用 | 1992-01→2026-04 |
| 12 | `fred:MNFCTRIRSA` | 制造业库销比 | 月 | 比率 | Census | fred_api | MNFCTRIRSA | API 全量 | 同上 | ②-3 | none | ✅ 未占用 | 1992-01→2026-04 |
| 13 | `fred:MCUMFN` | 制造业产能利用率 | 月 | % | Fed | fred_api | MCUMFN | API 全量 | 发布包 `us.frb.g17_capacity` | ②-4 | none | ✅ 未占用（≠TCU） | 1972-01→2026-05 |

**修正说明**：上表实际为 **13 序列**（3 ISM + 10 FRED）。§2 模板合计 ≤16 条，合规。

**发布包设计**：

- `us.ism.manufacturing`（**现有包**）→ 成员已含 `ism_us_ism_*`；本维度只**占用图槽**，不改包。
- `us.census.m3`（新建，economic_calendar，keywords `durable goods` / `factory orders`，exclude `wholesale`）→ DGORDER、ADXTNO、NEWORDER、AMDMUO、AMTMTI。
- `us.census.mtis`（新建，economic_calendar，keywords `business inventories` / `inventory sales`）→ BUSINV、ISRATIO、MNFCTRIRSA。
- `us.bls.industrial_production`（**现有包**，仅 INDPRO）→ 追加 **IPMAN**（只加 member，不改日历关键词；IPMAN 与 INDPRO 同属 G.17）。
- `us.frb.g17_capacity`（新建，economic_calendar，keywords `capacity utilization`；或 probe 72h 若日历难匹配）→ MCUMFN。现有工业生产包 `excludeKeywords: ["capacity"]`，故产能**不得**并入该包。

**给 Agent B 的注意**：

1. ISM 三条：不重复 seed；verify 断言 code 存在 + 观测条数；模板用 `mds:` 键。
2. ADXTNO 取代框架页错误的 ADEXUS；可顺手在 `indicatorCatalogKeys.ts` 把 `durables-ex-trans` 改到 ADXTNO（可选小修，不改现有模板）。
3. AMTMTI 属 M3、MNFCTRIMSA 属 MTIS；本 Spec 选 AMTMTI（与 M3 同发布，历史到 2026-05）而非 MNFCTRIMSA，避免两套口径。
4. IPMAN 追加到现有工业生产包时**只加 fredSeriesIds 成员**。
5. catalogCategory 用 `usMetadataCatalogCategory`；`fredCatalog.ts` FRED_US_ITEMS + `data:sync-catalog-layout`。
6. 库销比 ISRATIO / MNFCTRIRSA 存水平值，前端 `calc: none`。

### 3.1 需要新数据源的指标

无。ISM 已由既有 TE 抓取接入；其余全 FRED。Agent C 本维度跳过。

---

## §4 图表介绍与分析方法

### 4.1 模板 description

- ①：「按图 1→4 走订单链：ISM 软景气 → Census 硬订单 → 核心资本品 → 积压/ISM 库存。判断制造需求是领先扩张还是假信号。」
- ②：「按图 1→4 走库存周期：制造产出 → 库存水平 → 库销比 → 产能利用率。定位补库/去库与过热风险。」

### 4.2 chartIntroNotes 草稿

**模板 ①（景气与订单）**

1. 图 1：ISM PMI / 新订单 >50 扩张、<50 收缩。新订单领先产出约 1–3 月；与硬订单同向才确认周期转折。
2. 图 2：DGORDER 含运输（飞机等）噪音大；ADXTNO 除运输更稳。硬订单同比转正且与 ISM 共振 → 制造需求实扩张。
3. 图 3：NEWORDER 是设备投资领先指标，对利率敏感。持续同比扩张通常对应企业 capex 上行。
4. 图 4：AMDMUO 同比↑ = 积压加深（景气延续或供应链约束）；ISM 库存↑ + 新订单↓ = 被动积压、去库将至。

**模板 ②（产出库存与产能）**

1. 图 1：IPMAN 同比——制造硬产出。领先/滞后对照 ① 的订单；订单先拐、产出后确认。
2. 图 2：BUSINV / AMTMTI 同比——库存堆积 vs 消化。销售弱 + 库存同比↑ = 被动积压。
3. 图 3：ISRATIO / MNFCTRIRSA——相对销售压力。库销比上行多标志去库压力加大；下行多标志库存偏紧、补库空间。
4. 图 4：MCUMFN——制造产能松紧。长期 >80% 偏紧（通胀/投资压力）；深度下滑配合去库 = 制造衰退。

### 4.3 决策树

| 观察 | 对照图位 | 典型结论 |
|------|----------|----------|
| ISM 新订单<50 + 硬订单同比转负 | ①1 + ①2 | 制造需求收缩，库存周期易转去库 |
| 新订单回升 + 未完成订单同比↑ | ①1 + ①4 | 主动补库/积压加深，景气延续 |
| 订单弱 + 库销比上行 + IPMAN↓ | ①2 + ②3 + ②1 | 被动积压→主动去库，制造衰退风险 |
| 库销比下行 + 产能利用率回升 | ②3 + ②4 | 去库尾声或补库启动 |
| 核心资本品订单持续扩张 | ①3 | 设备投资前景改善（对照货币域利率） |

---

## §5 交付物清单

| 交付物 | 路径 | Agent |
|--------|------|-------|
| seed catalog | `src/lib/data/scheduler/industryInventoryFredSeedCatalog.ts` | B |
| seed / verify | `scripts/data-worker/seed-industry-inventory.ts` / `verify-industry-inventory.ts` + registry + package.json | B |
| 发布包 | `releasePackageCatalog.ts`：新建 `us.census.m3` / `us.census.mtis` / `us.frb.g17_capacity`；现有工业生产包追加 IPMAN | B |
| 目录归位 | `fredCatalog.ts` FRED_US_ITEMS + `data:sync-catalog-layout` | B |
| 模板 layout | `src/lib/data/industryInventoryAnalysisLayout.ts` | D |
| 模板注册 | `macroPresetTemplates.ts`（+ MacroSection 若需文件夹入口） | D |
| 文档 | `docs/US_INDUSTRY_INVENTORY_ANALYSIS.md` + `.cursor/prompts/us-industry-inventory-analysis-framework.md` | D |
| 负面清单 | `USED-INDICATORS.md` 追加本维度；ISM 三行改为「占用」 | E |

## §6 验收清单

**数据（Agent B）**

- [x] 10 条新 FRED seed + 3 条 ISM 断言在库，历史深度符合 §3
- [x] `data:verify -- --catalog=industry-inventory -- --db` 通过
- [x] 3 新包 + 1 现有包追加成员；日历型包尽量 matched
- [x] 目录归位（无「未分配」）
- [x] Agent C：本维度跳过

**模板（Agent D）**

- [x] 模板注册 + MacroSection 双 base 数组挂载；layout/docs/prompt 三处一致（全量 `npm run build` 建议 PR 前本地停 dev 后跑；本机 tsc 另有无关 ibkr 预存错误）
- [x] ISM 用 mds: 键；FRED yoy 由 seriesCalcConfigMap
- [x] 介绍 Tab：description + chartIntroNotes 已写
- [x] 零重复（IPMAN≠INDPRO，MCUMFN≠TCU）+ 未动现有模板/migration
