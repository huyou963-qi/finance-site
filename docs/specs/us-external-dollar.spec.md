# Spec：美国对外部门与美元（us-external-dollar）

> 按 [SPEC-TEMPLATE.md](./SPEC-TEMPLATE.md) 填写。Pipeline P3 维度；全 FRED，无抓取源。

---

## §0 元信息

| 字段 | 值 |
|------|----|
| dimension id | `us-external-dollar` |
| 中文名 | 美国对外部门与美元 |
| 内置文件夹 id | `folder-builtin-us-external-dollar` |
| 模板 id 前缀 | `builtin-us-external-dollar-` |
| 分支 | `feature/macro-external-dollar` |
| 状态 | `verified`（本地 `data:verify-external-dollar -- --db` 通过；人工评审门按端到端任务假设通过） |
| 对应框架页维度 | `external`（外部与贸易） |
| 评审记录 | 2026-07-09 Agent A 提交评审 1（全 FRED 12 条；假设评审通过以推进端到端）；2026-07-09 Agent B 数据接入完成；Agent C 跳过（无抓取）；Agent D 双模板完成；2026-07-09 Agent E：`verify --db` 全绿、USED-INDICATORS 已更新。**人工评审门假设通过**——若需回改指标选型，以本 Spec 为唯一事实来源回写。 |

---

## §1 分析框架

### 1.1 核心问题（L0）

> 美元处于强势还是弱势周期？贸易逆差是在扩大还是收窄？外部融资与净国际头寸是否可持续？汇率变动如何通过贸易量与贸易条件影响增长与通胀？

这是宏观投资的**外需与汇率**维度：经济 Overview ② 仅用实际出口/进口同比扫一眼外需，本维度回答「美元定价 → 贸易流量 → 经常账户/头寸 → 贸易条件」完整链条。

### 1.2 分析层级

| 层级 | 问题 | 主要指标（显示名） | 落到哪 |
|------|------|--------------------|--------|
| L1 美元广义 | 贸易加权美元强弱？ | 美元名义广义指数（月均） | ① 图 1 |
| L2 美元结构 | 对发达 vs 新兴升贬？ | AFE 美元指数、EME 美元指数（月均） | ① 图 2 |
| L3 贸易差额 | 逆差扩大还是收窄？ | 商品与服务贸易差额 | ① 图 3 |
| L4 贸易流量 | 出口/进口哪边主导？ | 出口同比、进口同比（BOP） | ① 图 4 |
| L5 经常账户 | 外部融资需求多大？ | 经常账户余额 | ② 图 1 |
| L6 国际头寸 | 净负债是否恶化？ | 净国际投资头寸 | ② 图 2 |
| L7 贸易价格 | 进出口价格动能？ | 出口价格指数同比、进口价格指数同比 | ② 图 3 |
| L8 贸易条件 | 进出口相对价格？ | 贸易条件指数 | ② 图 4 |

### 1.3 与现有模板的分工

| 相邻主题 | 归属 | 本维度不做 |
|----------|------|------------|
| 实际出口/进口 EXPGSC1 / IMPGSC1（NIPA 实际量） | 经济 Overview ② | 不复制；本维度用 **BOP 名义** 出口/进口（BOPTEXP/BOPTIMP）与贸易差额，口径互补 |
| 政策利率、金融条件、信用利差 | 货币政策与金融条件 | 不做；美元强弱可对照货币域，但不复制 EFFR/NFCI/OAS |
| ISM 新出口订单 | TE 抓取已入库、未占默认槽 | v1 不进默认模板（可目录自选）；外需领先信号优先看出口同比 |
| 原油/PPI 能源 | 美国通胀 | 不做大宗分项；进口价格总指数已覆盖贸易价格通道 |
| 财政赤字/TGA | 美国财政 | 不做双赤字合成（留作未来 derivedCalc） |

---

## §2 模板规划

| 顺序 | 模板 id | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-external-dollar-overview` | 对外 · 美元与贸易流量 | 默认第一步：汇率 → 贸易差额 → 进出口流量 |
| ② | `builtin-us-external-dollar-balance` | 对外 · 外部均衡与贸易条件 | 总览说不清时：经常账户 → 头寸 → 价格 → 贸易条件 |

### 模板 ①（layoutMode: 4）

| 图 | slotTitle | 序列（显示名） | 轴 | 图型 |
|----|-----------|----------------|----|------|
| 1 | L1 美元广义：贸易加权 | 美元名义广义指数（月均） | left | line |
| 2 | L2 美元结构：发达 vs 新兴 | AFE 美元指数（月均）、EME 美元指数（月均） | left | line |
| 3 | L3 贸易差额：商品与服务 | 商品与服务贸易差额 | left | line |
| 4 | L4 贸易流量：出口 vs 进口 | 出口（BOP）同比、进口（BOP）同比 | left | line |

### 模板 ②（layoutMode: 4）

| 图 | slotTitle | 序列（显示名） | 轴 | 图型 |
|----|-----------|----------------|----|------|
| 1 | L5 经常账户 | 经常账户余额 | left | line |
| 2 | L6 净国际投资头寸 | 净国际投资头寸 | left | line |
| 3 | L7 贸易价格：出口 vs 进口 | 出口价格指数同比、进口价格指数同比 | left | line |
| 4 | L8 贸易条件 | 贸易条件指数 | left | line |

---

## §3 指标清单

全部 12 条均为 FRED（10 条新 seed + 2 条复用 phase2：DTWEXBGS / DEXUSEU 仅 DTWEXBGS 进模板；DEXUSEU 不进模板但可随 H.10 包归组）。2026-07-09 用 FRED 系列页核实 Frequency/Units/Release。

| # | seriesKey | 显示名 | 频率 | 单位 | 机构 | kind | FRED id | 历史回填 | 调度 | 图槽 | 计算 | 去重/在库 | 核实 |
|---|-----------|--------|------|------|------|------|---------|----------|------|------|------|-----------|------|
| 1 | `fred:DTWEXBGS::avg` | 美元名义广义指数（月均） | 日 | 指数(2006=100) | Fed H.10 | fred_api | DTWEXBGS | **已在库**（phase2） | probe 24h → 包 `us.frb.h10_fx` | ①-1 | none+月均 | ✅ 在库未占槽，首次占用 | 日频；Release: H.10 |
| 2 | `fred:DTWEXAFEGS::avg` | AFE 美元指数（月均） | 日 | 指数(2006=100) | Fed H.10 | fred_api | DTWEXAFEGS | API 全量 | 同上 | ①-2 | none+月均 | ✅ 未占用 | 日频；H.10 |
| 3 | `fred:DTWEXEMEGS::avg` | EME 美元指数（月均） | 日 | 指数(2006=100) | Fed H.10 | fred_api | DTWEXEMEGS | API 全量 | 同上 | ①-2 | none+月均 | ✅ 未占用 | 日频；H.10 |
| 4 | `fred:BOPGSTB` | 商品与服务贸易差额 | 月 | 百万美元 | Census/BEA | fred_api | BOPGSTB | API 全量 | 日历包 `us.census.international_trade` | ①-3 | none | ✅ 未占用 | 月；Release: U.S. International Trade in Goods and Services |
| 5 | `fred:BOPTEXP::yoy` | 出口（BOP）同比 | 月 | 百万美元→% | Census/BEA | fred_api | BOPTEXP | API 全量 | 同上 | ①-4 | yoy | ✅ 未占用（≠EXPGSC1） | 月；同上 |
| 6 | `fred:BOPTIMP::yoy` | 进口（BOP）同比 | 月 | 百万美元→% | Census/BEA | fred_api | BOPTIMP | API 全量 | 同上 | ①-4 | yoy | ✅ 未占用（≠IMPGSC1） | 月；同上 |
| 7 | `fred:IEABC` | 经常账户余额 | 季 | 百万美元 | BEA | fred_api | IEABC | API 全量（FRED 自 1999-Q1） | probe 168h → 包 `us.bea.international_transactions` | ②-1 | none | ✅ 未占用（≠NETFI NIPA） | 1999-Q1→；Release: U.S. International Transactions |
| 8 | `fred:IIPUSNETIQ` | 净国际投资头寸 | 季 | 百万美元 | BEA | fred_api | IIPUSNETIQ | API 全量（约 2006 起） | probe 168h → 包 `us.bea.iip` | ②-2 | none | ✅ 未占用 | 季末；Release: U.S. International Investment Position |
| 9 | `fred:IQ::yoy` | 出口价格指数同比 | 月 | 指数(2000=100)→% | BLS | fred_api | IQ | API 全量 | 日历包 `us.bls.import_export_prices` | ②-3 | yoy | ✅ 未占用 | 月；Release: U.S. Import and Export Price Indexes |
| 10 | `fred:IR::yoy` | 进口价格指数同比 | 月 | 指数(2000=100)→% | BLS | fred_api | IR | API 全量 | 同上 | ②-3 | yoy | ✅ 未占用 | 月；同上 |
| 11 | `fred:W369RG3Q066SBEA` | 贸易条件指数 | 季 | 指数 | BEA | fred_api | W369RG3Q066SBEA | API 全量 | **加入现有包** `us.bea.gdp` | ②-4 | none | ✅ 未占用（框架 mock 的 TTEXG 无效，改用本序列） | 季；Release: Gross Domestic Product |
| 12 | （目录复用，不进模板） | 美元/欧元汇率 | 日 | 美元/欧元 | Fed H.10 | fred_api | DEXUSEU | **已在库**（phase2） | 归入 `us.frb.h10_fx` | — | — | ✅ 在库未占槽；本维度不占图槽 | 日；H.10 |

**框架页修正**：`indicatorCatalogKeys.ts` 中 `terms-trade: fred:TTEXG` 无效（404）；本维度采用 `W369RG3Q066SBEA`。`current-acct` 映射的 NETFI 为 NIPA 口径，本维度用 IEABC（BOP 经常账户）。

**发布包设计**：

| 包 id | 类型 | 成员 | 说明 |
|-------|------|------|------|
| `us.frb.h10_fx` | probe 24h | DTWEXBGS, DTWEXAFEGS, DTWEXEMEGS, DEXUSEU | FRED Release: H.10 Foreign Exchange Rates |
| `us.census.international_trade` | economic_calendar | BOPGSTB, BOPTEXP, BOPTIMP | keywords: `balance of trade`, `trade balance`；exclude: `goods`（避开 Advance Goods） |
| `us.bls.import_export_prices` | economic_calendar | IQ, IR | keywords: `import prices`, `export prices` |
| `us.bea.international_transactions` | probe 168h | IEABC | Release: U.S. International Transactions |
| `us.bea.iip` | probe 168h | IIPUSNETIQ | Release: U.S. International Investment Position |
| `us.bea.gdp`（现有） | economic_calendar | 追加 W369RG3Q066SBEA | 只加 member，不改日历关键词 |

### 3.1 需要新数据源的指标

无（全 FRED）。Agent C 跳过。

---

## §4 图表介绍与分析方法

### 4.1 模板 description

- ①：「广义美元、发达/新兴结构、贸易差额与进出口流量四视角，判断汇率周期与贸易动能。」
- ②：「经常账户、净国际头寸、进出口价格与贸易条件四步，追踪外部均衡与相对价格冲击。」

### 4.2 chartIntroNotes 草稿

**模板 ①**

1. 图 1：广义美元月均 — 升=美元强（压制出口、利好进口与压低进口通胀）；降=美元弱。先定汇率大方向，再看图 2 结构、图 3–4 流量是否验证。
2. 图 2：AFE vs EME — 对发达与新兴升贬是否同步。EME 单独走强常对应新兴风险偏好/商品周期；与图 1 背离时看主导驱动在哪一侧。
3. 图 3：贸易差额（百万美元，负=逆差）— 逆差扩大=外需拖累 GDP 或内需过热吸进口；收窄=外需改善或内需降温。对照图 4 看是出口还是进口主导。
4. 图 4：出口/进口同比 — 出口↑进口平=外需驱动改善；进口↑出口平=内需/库存驱动逆差扩大。与 Overview 实际进出口互相印证（名义 BOP vs 实际 NIPA）。

**模板 ②**

1. 图 1：经常账户 — 逆差=需外部融资；与图 3 贸易差额同向时确认商品服务主导，背离则看收入账户。
2. 图 2：NIIP — 净负债存量；估值效应（美元/股市）可短期改善头寸而不改流量。持续恶化+经常账户逆差扩大=外部脆弱性上升。
3. 图 3：出口/进口价格同比 — 进口价格↑传导国内通胀（对照通胀域）；出口价格↑改善贸易条件。剪刀差方向先于图 4。
4. 图 4：贸易条件指数 — 出口相对进口价格。改善=实际购买力上升；恶化常伴随能源进口冲击。与图 3 价格同比互证。

### 4.3 决策树

| 观察 | 对照图位 | 典型结论 |
|------|----------|----------|
| 广义美元上行 + 出口同比转弱 | ①1 + ①4 | 汇率压制外需，增长外需贡献下降 |
| 逆差扩大且进口同比主导 | ①3 + ①4 | 内需/库存驱动逆差，未必外需崩溃 |
| EME 美元指数单独走强 | ①2 | 新兴侧美元压力，关注商品与风险资产 |
| 经常账户逆差扩大 + NIIP 恶化 | ②1 + ②2 | 外部融资依赖上升，脆弱性累积 |
| 进口价格同比上行 + 贸易条件恶化 | ②3 + ②4 | 进口成本冲击，滞胀风险上升 |

---

## §5 交付物清单

| 交付物 | 路径 | Agent |
|--------|------|-------|
| seed catalog | `src/lib/data/scheduler/externalDollarFredSeedCatalog.ts` | B |
| seed / verify | `scripts/data-worker/seed-external-dollar.ts` / `verify-external-dollar.ts`；registry key `external-dollar` | B |
| 发布包 | `releasePackageCatalog.ts` 新增 5 包 + 追加 `us.bea.gdp` 成员 | B |
| 模板 layout | `src/lib/data/externalDollarAnalysisLayout.ts` | D |
| 模板注册 | `macroPresetTemplates.ts` + `MacroSection.tsx` append | D |
| 分析文档 | `docs/US_EXTERNAL_DOLLAR_ANALYSIS.md` | D |
| 框架 prompt | `.cursor/prompts/us-external-dollar-analysis-framework.md` | D |
| 负面清单 | `USED-INDICATORS.md` 追加本维度指标 | E |

---

## §6 验收清单

**数据（Agent B）**

- [x] seed catalog + seed/verify 脚本 + registry + package.json scripts
- [x] 发布包目录写入（5 新建 + gdp 追加）
- [x] `fredCatalog.ts` / `usCatalogTaxonomy.ts` 分类补齐
- [x] `data:seed-external-dollar` + 回填 + `data:verify-external-dollar -- --db` 通过
- [x] `data:seed-release-packages` + `data:sync-catalog-layout`（`data:sync-calendar` 建议本地再跑一轮对齐 nextRunAt）

**模板（Agent D）**

- [x] layout + 注册 + docs + prompt
- [x] `npm run build` 通过（2026-07-09）
- [x] 变更文件 eslint 通过（全仓 lint 被无关 worktree `.next` 污染，非本维度引入）
- [ ] 宏观页目视四图有数（需人工打开 `/macro` 确认）

**Agent E**

- [x] 零重复复核（避开 EXPGSC1/IMPGSC1/NETFI）+ USED-INDICATORS 追加 + 状态改 `verified`
