# Spec：美国货币政策与金融条件（us-monetary-financial）

> 按 [SPEC-TEMPLATE.md](./SPEC-TEMPLATE.md) 填写。Phase 1 试点维度。

---

## §0 元信息

| 字段 | 值 |
|------|----|
| dimension id | `us-monetary-financial` |
| 中文名 | 美国货币政策与金融条件 |
| 内置文件夹 id | `folder-builtin-us-monetary` |
| 模板 id 前缀 | `builtin-us-monetary-` |
| 分支 | `feature/macro-monetary-financial` |
| 状态 | `verified`（Phase 1 试点闭环完成） |
| 对应框架页维度 | `policy`（政策立场）+ `financial`（金融与信贷） |
| 评审记录 | 2026-07-04 Agent A 提交评审 1；2026-07-04 评审 1 通过（指标选型与图槽设计确认）；2026-07-04 Agent B 完成数据接入提交评审 2（后按用户反馈补属性核实/目录归类/发布包归组）；2026-07-04 Agent D 完成双模板提交评审 3；2026-07-04 Agent E 端到端验收通过，状态置 verified |

---

## §1 分析框架

### 1.1 核心问题（L0）

> 货币政策当前是限制性、中性还是宽松？政策通过利率→金融条件→信贷的传导走到了哪一步？金融体系是在放大还是缓冲政策效果？

这是宏观投资策略的**政策传导链**维度：现有「经济 Overview」只用 1 张图（目标利率 + 10Y-2Y）回答"政策是什么"，本维度回答"政策如何传导、传导到位了没有"。

### 1.2 分析层级

| 层级 | 问题 | 主要指标（显示名） | 落到哪 |
|------|------|--------------------|--------|
| L1 政策立场 | 实际政策利率多高？市场定价的路径？ | 有效联邦基金利率、2Y 国债收益率 | ① 图 1 |
| L2 实际利率与预期 | 紧缩来自实际利率还是通胀预期？ | 10Y TIPS 实际收益率、10Y 盈亏平衡通胀 | ① 图 2 |
| L3 量的工具 | QT/QE 进展？体系冗余流动性还剩多少？ | 联储总资产、ON RRP 余额 | ① 图 3 |
| L4 期限结构 | 曲线定价的增长/衰退预期？ | 10Y 收益率、10Y-3M 利差 | ① 图 4 |
| L5 金融条件 | 综合条件偏紧还是偏松？ | Chicago Fed NFCI | ② 图 1 |
| L6 信用定价 | 风险溢价在扩张还是压缩？ | 高收益债 OAS、投资级 OAS | ② 图 2 |
| L7 银行信贷 | 银行在收紧还是放贷？量价如何？ | SLOOS 收紧净比例、工商业贷款 | ② 图 3 |
| L8 信用质量 | 紧缩的滞后损伤显现了吗？ | 信用卡拖欠率、工商贷款拖欠率 | ② 图 4 |

### 1.3 与现有模板的分工

| 相邻主题 | 归属 | 本维度不做 |
|----------|------|------------|
| 联邦基金**目标**利率 DFEDTARU、10Y-**2Y** 利差 T10Y2Y | 经济 Overview ① 图 4 | 不复制；本维度用 EFFR（有效利率）与 10Y-**3M**（NY Fed 衰退模型口径），口径互补不重复 |
| 5Y 盈亏平衡 T5YIE、核心 PCE | 美国通胀 ② 图 4 | 通胀预期锚定归通胀域；本维度只看 10Y 期限的实际/预期**分解** |
| TGA 余额、财政净现金流 | 美国财政 ·高频 | 财政流动性归财政域；本维度只看联储侧（WALCL、RRP）。净流动性合成指标（WALCL−TGA−RRP）留作未来 derivedCalc，不进 v1 |
| 失业/就业对政策的输入 | 美国就业 | 不做 |
| 股指、VIX | 不在任何框架模板（行情页） | 不做 |

---

## §2 模板规划

| 顺序 | 模板 id | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-monetary-overview` | 货币政策 · 立场与流动性 | 默认第一步：政策松紧与量价工具全景 |
| ② | `builtin-us-monetary-conditions` | 金融条件 · 信贷与压力 | 判断传导：政策是否已收紧金融条件、伤及信贷 |

### 模板 ①（layoutMode: 4）

| 图 | slotTitle | 序列（显示名） | 轴 | 图型 |
|----|-----------|----------------|----|------|
| 1 | L1 政策利率：有效 vs 市场定价 | 有效联邦基金利率（月均）、2Y 国债收益率（月均） | left | line |
| 2 | L2 实际利率分解：TIPS vs 预期 | 10Y TIPS 实际收益率（月均）、10Y 盈亏平衡通胀（月均） | left | line |
| 3 | L3 量的工具：联储资产 vs RRP | 联储总资产（左）、ON RRP 余额（右） | left/right | line |
| 4 | L4 期限结构：10Y vs 10Y-3M | 10Y 国债收益率（左）、10Y-3M 利差（右，0 线） | left/right | line |

### 模板 ②（layoutMode: 4）

| 图 | slotTitle | 序列（显示名） | 轴 | 图型 |
|----|-----------|----------------|----|------|
| 1 | L5 金融条件：NFCI | Chicago Fed 全国金融条件指数（0 线=历史均值） | left | line |
| 2 | L6 信用利差：HY vs IG | 高收益债 OAS（左）、投资级 OAS（左） | left | line |
| 3 | L7 银行信贷：SLOOS vs 贷款增速 | SLOOS 工商贷款收紧净比例（左）、工商业贷款同比（右） | left/right | line |
| 4 | L8 信用质量：拖欠率 | 信用卡拖欠率、工商业贷款拖欠率 | left | line |

---

## §3 指标清单

全部 15 条均为 FRED，**无新增网页抓取源**（试点刻意选全 API 维度，抓取流程在后续维度验证）。
已于 2026-07-04 用 `fredgraph.csv` 逐条核实存在性与最新观测（见「核实」列）。

| # | seriesKey | 显示名 | 频率 | 单位 | 机构 | kind | FRED id | 历史回填 | 调度 | 图槽 | 计算 | 去重/在库 | 核实（首→末） |
|---|-----------|--------|------|------|------|------|---------|----------|------|------|------|-----------|----------------|
| 1 | `fred:EFFR::avg` | 有效联邦基金利率（月均） | 日 | % | NY Fed | fred_api | EFFR | API 全量（2000-07 起） | probe 24h | ①-1 | none+月均 | ✅ 未占用（usov composite 输入，无独立 sched 仪器，需新 seed） | 2000-07→2026-07-02 |
| 2 | `fred:DGS2::avg` | 2Y 国债收益率（月均） | 日 | % | Treasury/H.15 | fred_api | DGS2 | API 全量（1976 起） | probe 24h | ①-1 | none+月均 | ✅ 未占用 | 1976-06→2026-07-01 |
| 3 | `fred:DFII10::avg` | 10Y TIPS 实际收益率（月均） | 日 | % | Treasury/H.15 | fred_api | DFII10 | API 全量（2003 起） | probe 24h | ①-2 | none+月均 | ✅ 未占用 | 2003-01→2026-07-01 |
| 4 | `fred:T10YIE::avg` | 10Y 盈亏平衡通胀（月均） | 日 | % | FRED | fred_api | T10YIE | **已在库**（CPI seed `sched_fred_T10YIE`） | 已有 | ①-2 | none+月均 | ✅ 在库未被图槽占用，首次占用 | 2003-01→2026-07-02 |
| 5 | `fred:WALCL::avg` | 联储总资产（月均） | 周 | 百万美元 | Fed H.4.1 | fred_api | WALCL | **已在库**（phase2 `sched_fred_WALCL`） | 已有（周） | ①-3 | none+月均 | ✅ 在库未被图槽占用，首次占用 | 2002-12→2026-07-01 |
| 6 | `fred:RRPONTSYD::avg` | ON RRP 余额（月均） | 日 | 十亿美元 | NY Fed | fred_api | RRPONTSYD | API 全量（2003 起） | probe 24h | ①-3 | none+月均 | ✅ 未占用 | 2003-02→2026-07-02 |
| 7 | `fred:DGS10::avg` | 10Y 国债收益率（月均） | 日 | % | Treasury/H.15 | fred_api | DGS10 | API 全量（1962 起） | probe 24h | ①-4 | none+月均 | ✅ 未占用 | 1962-01→2026-07-01 |
| 8 | `fred:T10Y3M::avg` | 10Y-3M 利差（月均） | 日 | % | FRED | fred_api | T10Y3M | API 全量（1982 起） | probe 24h | ①-4 | none+月均 | ✅ 未占用（T10Y**2Y** 属经济 Overview，口径不同） | 1982-01→2026-07-02 |
| 9 | `fred:NFCI::avg` | Chicago Fed 金融条件指数（月均） | 周 | σ | Chicago Fed | fred_api | NFCI | API 全量（1971 起） | probe 168h | ②-1 | none+月均 | ✅ 未占用 | 1971-01→2026-06-26 |
| 10 | `fred:BAMLH0A0HYM2::avg` | 高收益债 OAS（月均） | 日 | % | ICE BofA | fred_api | BAMLH0A0HYM2 | **已在库**（phase2）；⚠ 公开 CSV 仅近 3 年，API 历史深度待 Agent B 验证 | 已有 | ②-2 | none+月均 | ✅ 在库未被图槽占用，首次占用 | (CSV)2023-07→2026-07-02 |
| 11 | `fred:BAMLC0A0CM::avg` | 投资级公司债 OAS（月均） | 日 | % | ICE BofA | fred_api | BAMLC0A0CM | API（同上 ⚠ 许可限制待验证） | probe 24h | ②-2 | none+月均 | ✅ 未占用 | (CSV)2023-07→2026-07-02 |
| 12 | `fred:DRTSCILM` | SLOOS 大中企业工商贷款收紧净比例 | 季 | % | Fed SLOOS | fred_api | DRTSCILM | API 全量（1990 起） | probe 168h | ②-3 | none | ✅ 未占用 | 1990-Q2→2026-Q2 |
| 13 | `fred:BUSLOANS::yoy` | 工商业贷款同比 | 月 | 十亿美元→% | Fed H.8 | fred_api | BUSLOANS | API 全量（1947 起） | probe 72h | ②-3 | yoy | ✅ 未占用 | 1947-01→2026-05 |
| 14 | `fred:DRCCLACBS` | 信用卡拖欠率 | 季 | % | Fed | fred_api | DRCCLACBS | API 全量（1991 起） | probe 168h | ②-4 | none | ✅ 未占用 | 1991-Q1→2026-Q1 |
| 15 | `fred:DRBLACBS` | 工商业贷款拖欠率 | 季 | % | Fed | fred_api | DRBLACBS | API 全量（1987 起） | probe 168h | ②-4 | none | ✅ 未占用 | 1987-Q1→2026-Q1 |

**调度说明**：全部为无固定发布日历的日/周/季频序列（SLOOS、拖欠率随 Fed 季度节奏但无 TE 日历事件），统一走 `probe_interval`（日 24h / 月 72h / 周·季 168h，对齐 `phase4SeedCatalog` 粒度映射），**不新建发布包、不改日历关键词**。

**实现注意（给 Agent B）**：

1. WALCL 单位为百万美元（当前值 ~6.7e6），入库沿用 phase2 现状；图轴大数显示先看 usov 模板对 WALCL 的处理方式，如有 `fredTransform` 缩放先例则跟随，否则保持原值靠 ECharts 轴缩写。
2. 两条 ICE BofA OAS：用 FRED API（带 Key）拉一次确认历史深度；若同样限近 3 年，接受「3 年 + 持续累积」并在 metadata `sourceUpdateNote` 注明。
   **验证结论（2026-07-04）**：API 同样受限 —— BAMLC0A0CM 首观测 2023-07-04（786 条）、BAMLH0A0HYM2 首观测 2023-06-12（803 条），确认 ICE 许可仅提供近 3 年，按预案接受持续累积。
3. 已在库的 3 条（T10YIE / WALCL / BAMLH0A0HYM2）**不重复 seed**，只在 verify 脚本中断言存在。
4. **回填下限（执行中发现）**：管线全量回填统一下限 1950-01-01（`upsertObservations.observationWindowForFetch`），BUSLOANS（FRED 起点 1947）实际从 1950-01 开始，符合管线约定。
5. **循环依赖修复（执行中发现）**：`p0SeedCatalog → investingEventMap → teEventMap → releasePackageCatalog → cpi/laborFredSeedCatalog → p0` 存在模块环，当前 Node/tsx 下所有 seed/verify 入口均崩溃（含既有 verify-cpi）。已将 `PROBE_ONLY_FRED_SERIES` 抽至零依赖模块 `probeOnlySeries.ts` 根治，`teEventMap` re-export 保持 API 不变。
6. **管理页频率显示 bug（评审 2 后用户发现，已修复）**：`adminCatalog.ts` 的 `syntheticCatalogItem()` 对所有「仅数据库（未在 FMP 统一目录）」指标**硬编码 `frequency: "月"`**，与 `Instrument.freqLabel` 无关——这是影响全项目、非本维度独有的既有 bug（凡是走该分类展示的指标，无论真实频率都显示"月"）。已改为优先读 `Instrument.freqLabel`，回退 `metadata.freqLabel`，最后才兜底"月"。**核实结论：本维度 seed 的 12 条 + 复用的 3 条频率/单位与 FRED 官方系列页逐条比对（Frequency/Units 字段）全部一致**，问题完全在显示层，不在入库数据。
7a. **管理页分类归位（评审 2 后用户发现，已修复）**：12 条新指标最初显示在「仅数据库（未在 FMP 统一目录）」下（21 项），根因是两处都没做：① `fredCatalog.ts` 的 `FRED_US_ITEMS` 里没有这些 FRED id 的分类定义；② 即便加了，还需要把 key 写进管理员持久化的自定义布局（`MacroCatalogLayout`），否则布局覆盖优先，未登记的 key 恒显示"未分配"。已补齐 `FRED_US_ITEMS` 分类（8 条→利率与债券、7 条→银行与货币）并用新写的通用脚本 `data:sync-catalog-layout` 写入持久化布局；修复后 US 分类下"未分配"清零。此步骤已固化进 Agent B 手册 §0.5，后续维度必做。
7b. **发布包归属（用户要求补充，已完成）**：15 条序列按 FRED 官方系列页「Release:」字段分组，挂入 9 个新建的 probe_interval 型发布包（`us.frb.h15_rates` 3 条、`us.frb.interest_rate_spreads` 2 条、`us.ice.bofa_indices` 2 条、`us.frb.chargeoff_delinquency` 2 条、`us.nyfed.effr`/`us.nyfed.rrp`/`us.chicagofed.nfci`/`us.frb.sloos`/`us.frb.h8_bank_assets` 各 1 条）。WALCL 已在既有真实日历包 `us.fed.h41` 中（早于本次工作，验证其 TE 日历匹配正常，未改动）。

架构层面：`ReleasePackage` 机制原本硬限定只支持 `economic_calendar` 类型，为此放宽了 `releasePackageTypes.ts` 的 `release` 字段类型（`ReleaseRule` 而非仅 `economic_calendar`），并在 `releasePackageCatalog.ts` 新增 `probePkg()` builder。`releasePackageStore.ts` 的 `parsePackageReleaseTemplate()` **刻意保持不变**（仍只识别 economic_calendar）——已验证这使 probe 型包只影响管理端分组展示与「立即同步发布包」批量拉取，每个成员的 `effectiveReleaseRule` 仍解析回自身原有 `probe_interval` 规则，互不覆盖。回归测试：现有 5 个日历包（CPI/就业/JOLTS/PCE/H.4.1）种子前后成员数、`releaseTemplate`、`nextRunAt` 逐字节一致；12 条新指标 `effectiveReleaseRule` 全部确认仍为各自原始 `probe_interval`；实测 `syncReleasePackage()` 批量同步（H.15 包 3 条一次成功）。此模式已固化进 Agent B 手册 §3.2，后续维度的非日历型指标必须归包，不能留孤立订阅。

7. **WALCL 单位缺失（评审 2 后发现，已在域内补漏）**：`phase2SeedCatalog.ts` 的 `PHASE2_FRED_EXTRA` 未定义 `unit` 字段，导致其入库的全部 Instrument（不止 WALCL）`unit` 恒为 `null`。范围内修复：在 `MONETARY_FRED_REUSED` 加 `unitIfMissing`，`seed-monetary.ts` 对复用序列做"仅当为空才回填"的 upsert，不改动 `phase2SeedCatalog.ts` 源文件（避免影响其归属域）。WALCL 已补 `unit=百万美元`，BAMLH0A0HYM2/T10YIE 顺带补齐（原本非空，无变化）。**遗留问题（超出本维度授权，未处理）**：`PHASE2_FRED_EXTRA` 其余 ~17 条序列（GDP、CPILFESL、PCEPI、DTWEXBGS 等）大概率同样 `unit=null`，建议后续单独立项修复 phase2 seed 源头。

### 3.1 需要新数据源的指标

无（本维度全 FRED）。

---

## §4 图表介绍与分析方法

### 4.1 模板 description

- ①：「政策利率、实际利率、资产负债表与收益率曲线四视角，判断货币政策立场松紧与市场定价。」
- ②：「NFCI、信用利差、银行信贷、拖欠率四步，追踪政策向金融条件与实体信贷的传导进度。」

### 4.2 chartIntroNotes 草稿

**模板 ①（立场与流动性）**

1. 图 1：EFFR vs 2Y — 2Y 是市场对未来 ~2 年政策路径的定价：2Y 低于 EFFR → 市场定价降息（政策偏紧尾声）；2Y 高于 EFFR → 定价加息。剪刀差方向先于政策转向。
2. 图 2：10Y 实际利率 vs 盈亏平衡 — 名义 10Y ≈ 两者之和。紧缩若来自实际利率上行（TIPS↑）→ 真金白银压制估值与地产；若来自预期（盈亏平衡↑）→ 看通胀域模板找原因。实际利率 >2% 属历史限制区。
3. 图 3：WALCL vs RRP — QT 中总资产下行；RRP 是体系"缓冲垫"，RRP 接近 0 后继续 QT 将直接抽准备金，流动性风险上升 → 对照 ② 图 1 NFCI 是否同步收紧。
4. 图 4：10Y vs 10Y-3M — 利差倒挂（<0）是 NY Fed 衰退模型核心输入；**解除倒挂的方式**决定含义：短端下行解除=降息将至，长端上行解除=再通胀/期限溢价。与经济 Overview 的 10Y-2Y 互相印证。

**模板 ②（信贷与压力）**

1. 图 1：NFCI — 0 = 历史平均条件，>0 偏紧。政策加息后 NFCI 若不升（如股市走强对冲），说明传导被金融市场抵消，紧缩"不解渴" → Fed 可能更鹰。
2. 图 2：HY vs IG OAS — 风险定价的温度计。HY 单独走阔 = 尾部信用担忧；HY/IG 同步走阔 = 系统性避险，对照图 1 是否确认。利差极低时警惕自满（对政策冲击最脆弱）。
3. 图 3：SLOOS vs 工商贷款同比 — SLOOS 领先贷款增速约 2–4 个季度：收紧比例冲高预告未来信贷收缩；贷款同比转负历史上多伴随衰退。量价互证：SLOOS 紧 + OAS 阔 = 传导到位。
4. 图 4：拖欠率 — 紧缩的滞后损伤，最后确认。信用卡先于工商贷款恶化（居民先受伤）；两者同升且图 3 贷款收缩 → 信用周期下行确认，政策转向压力最大。

### 4.3 决策树

| 观察 | 对照图位 | 典型结论 |
|------|----------|----------|
| 2Y < EFFR 且 10Y-3M 倒挂 | ① 图 1 + 图 4 | 市场定价宽松将至；关注 Fed 是否验证 |
| 实际利率高位 + NFCI 却偏松 | ① 图 2 + ② 图 1 | 传导被市场抵消，警惕政策更紧更久 |
| RRP 归零 + QT 继续 | ① 图 3 | 准备金稀缺风险，流动性事件概率上升 |
| SLOOS 收紧 + HY OAS 走阔 | ② 图 3 + 图 2 | 传导进入信贷收缩阶段，周期下行前兆 |
| 拖欠率加速 + 贷款同比转负 | ② 图 4 + 图 3 | 信用周期下行确认，政策转向临近 |

---

## §5 交付物清单

| 交付物 | 路径 | Agent |
|--------|------|-------|
| seed catalog | `src/lib/data/scheduler/monetaryFredSeedCatalog.ts` | B |
| seed / verify 脚本 | `scripts/data-worker/seed-monetary.ts` / `verify-monetary.ts`；registry key `monetary` | B |
| 发布包 | 无需（全 probe_interval） | — |
| 模板 layout | `src/lib/data/monetaryAnalysisLayout.ts` | D |
| 模板注册 | `macroPresetTemplates.ts`：`folder-builtin-us-monetary` + 2 模板 id | D |
| 分析文档 | `docs/US_MONETARY_ANALYSIS.md` | D |
| 框架 prompt | `.cursor/prompts/us-monetary-analysis-framework.md` | D |
| 负面清单更新 | 追加 15 条 + T10YIE/WALCL/BAMLH0A0HYM2 状态翻转为「占用」 | E |

## §6 验收清单

**数据（Agent B，2026-07-04 完成）**

- [x] 12 条新 seed + 3 条复用断言全部在库，历史深度符合 §3「核实」列（BUSLOANS 受管线 1950 下限约束，见注意 4）
- [x] `data:verify-monetary -- --db` 通过（订阅/metadata/近期观测/历史深度 4 段全绿）
- [x] 获取方式全部 `known`、订阅 enabled、`nextRunAt` 均在未来（日频 7-05、周频 7-10、季频 7-11）；管理端页面目视留给 Agent E
- [x] OAS 历史深度验证结论已回写 §3 注意 2（API 亦限 3 年，接受累积）

**模板（Agent D，2026-07-04 完成）**

- [x] build + lint 通过；宏观页 2 模板四图有数（预览实测截图核验）
- [x] 末值逐图核对与 FRED 一致：①EFFR 3.63/DGS2 4.17/T10YIE 2.23/WALCL 6.72M/DGS10 4.48/T10Y3M 0.65；②NFCI -0.504/HY 2.75/IG 0.755/拖欠 2.92 与 1.34
- [x] BUSLOANS yoy 手算核对：图上 4.83% = 先季度重采样（季末月）再同比（2885.87 / 2752.9 Q2'25），语义正确；直接月度同比为 7.95%，两者差异源于与季频 SLOOS 对齐的设计
- [x] 介绍 Tab description + chartIntroNotes 完整；docs/layout/prompt 三处一致
- [x] 零重复复核（避开 DFEDTARU/T10Y2Y/T5YIE）+ 未动现有模板 id/migration
- [x] 文件夹归类服务端验证（`loadSystemMacroChartPrefs` merge 后 monetary 文件夹与 2 模板映射齐全；匿名预览会话不加载 system prefs 属预期行为）

**执行发现（评审 3 讨论项）**：

8. **模板 `fred:` 序列「读库优先」改造（用户要求，已实施）**：原先 `unifiedMacro.ts` 对 `fred:` key 一律实时拉 FRED（预览中模板 ② 首载曾因 FRED 偶发 502 失败）。已新增 [`fredDbFirst.ts`](../../src/lib/data/fredDbFirst.ts)：每条 FRED 序列先查本地 `mds.MacroObservation`，库中有观测则**完全不请求 FRED**，缺失才实时回退；`unifiedMacro` 的 fred 分支按开关 `MACRO_FRED_DB_FIRST`（默认开，=0 回退纯实时）择路。

   - **正确性基础**：入库时 `fredAdapter` 以 `Date.UTC` 保存 FRED 原始日期，`obsDate.toISOString().slice(0,10)` 与实时 `fetchFredObservationsMap` 的日期串逐字节一致，故两路径对同一序列产出等价 `Map<dateStr,value>`，虚拟键展开 / categories 对齐 / 前端重采样均无需改动。
   - **回归结果**：全部内置模板 53 条 FRED 序列中 **44 条走库、9 条（未 seed）正确回退实时**；抽样逐值比对，重叠区间完全一致，唯二差异（`A191RL1Q225SBEA` GDP 环比、`CES0500000003` 时薪）源于 **BEA/BLS 数据修订** 而库中为 worker 上次拉取（6-21）的旧值——属调度新鲜度，非改造缺陷，`revisionLookback=3` 会在下次 worker 运行时自动追平。monetary 域 15 条（利率/利差/OAS，基本不修订）**0 值差异**。
   - **渲染验证**：db-first 下 monetary ①（4 图，X 轴回溯 1962 全库历史）与既有 CPI 总览（4 canvas）均正常渲染、无 console error、无「暂无序列/fetch failed」。
   - **收益**：入库序列不再受 FRED 可用性/限频影响，取数走本地 PG（更快更稳）；这正是数据管线闭环的价值兑现。**遗留**：`unifiedMacro` 仍用硬编码 attribution 覆盖了 db-first payload 的「本地库 N 条」标注（不影响功能），可后续优化让前端展示数据来源占比。
