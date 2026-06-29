# Prompt：美国财政分析框架 — 多源入库、指标树、调度与宏观模板

---

## 任务目标

以 **美国财政部分析师（Treasury / Fiscal Policy Analyst）** 视角，设计并落地一套 **联邦财政** 分析框架：让 **初学者** 也能按固定阅读顺序，看懂「财政处在什么位置、钱从哪来/到哪去、近期现金流是否在恶化」——**不** 把货币政策、股市、主权评级交易或政治评论当作本框架主轴。

1. **分析方法论（§1）**：按 **存量—流量—结构—高频** 四层独立设计；不以 Excel 列顺序或「凑满 N 张图」为主轴。
2. **多源数据（§0）**：角色已映射至 Treasury Fiscal Data API / FRED / BEA NIPA；§3.1 **OK** 序列已入库调度；剩余扩展见 **TBD**（§3.4）。
3. **指标有效性**：§3.1 标注 **OK** 者已通过 `data:verify-fiscal -- --db`；**TBD 不调度、不画空壳线**。
4. **宏观视图**：内置 **3 个逻辑视图**（总览 / 结构 / 高频），**不规定** 每视图必须几张图、`layoutMode` 几格；按 **roleId 分组** 与 **零重复** 约束组织序列，图数由内容决定（通常 2–5 张/视图）。

**禁止**因缺序列而 **删减 §1 分析块**；**禁止**用 SPX、Fed 资产负债表、政治口号替代财政流量/结构；**禁止**把州/地方财政与联邦混在同一「联邦赤字」图里不标注口径。

---

## 第〇部分：多源有效性门禁

（与 Overview / CPI 框架同构：§0.1–0.4 有效性定义、探测顺序、数据源优先级。）

### 0.1 什么叫「有效」

| 检查项 | 月频 / 季频（MTS、NIPA、OMB） | 日频（DTS、TGA、拍卖） |
| --- | --- | --- |
| **可拉取** | API/FRED 返回 HTTP 200 且有数值 | 同上 |
| **最近观测** | 最新 `obsDate` 不早于 **当前月 − 4 个自然月**（季频可 −2 季） | 不早于 **当前日 − 5 个交易日** |
| **口径一致** | 文档标明 **联邦 / 广义政府 / 财年 FY** | 与 Treasury 字段定义一致 |
| **分析可用** | 近 12 个月（或 4 季）非空点 ≥ 6 | 近 20 个交易日非空点 ≥ 12 |

### 0.2 数据源优先级（P1–P6）

| 优先级 | 来源 | 典型用途 | 备注 |
| --- | --- | --- | --- |
| **P1** | [Treasury Fiscal Data API](https://fiscaldata.treasury.gov/api-documentation/) | MTS 月收支、DTS 日现金、债务发行 | 高频跟踪首选 |
| **P2** | FRED（BEA NIPA / OMB 表） | 赤字/GDP、债务/GDP、NIPA 政府收支 | 与宏观 Overview 可交叉引用 |
| **P3** | CBO / OMB 官方发布 | 十年基线、结构性赤字叙事 | 多为 PDF/表，入库需 ETL |
| **P4** | BEA API | 政府消费、投资、转移支付结构 | 降 NIPA 发布延迟 |
| **P5** | 世行 / IMF WEO | 跨国广义政府对比 | **不进** 默认联邦视图 |
| **P6** | 第三方（TE、Bloomberg） | 预期、拍卖结果补充 | 须标注 provider |

### 0.3 验证命令（已落地）

```bash
npm run data:seed-fiscal          # Treasury + FRED 种子 + 强制 sync
npm run data:sync-fiscal          # 仅 sync（--sync-only）
npm run data:verify-fiscal -- --db
npm run data:probe-sources        # 通用探测；fiscal 专用 scope 待扩展
```

**当前入库规模（2026-06）**：12 条 Treasury + 5 条 FRED 直拉 + 1 条 FRED YoY 衍生 + 1 条 FRED 复合 = **19 instrument**（含 Overview 共享键不重复 seed 的 `FYFSGDA188S`、`GCEC1`）。

---

## 第一部分：分析框架（财政分析师独立设计）

### 1.0 初学者概念地图（读任何图之前）

| 概念 | 一句话 | 常见误区 |
| --- | --- | --- |
| **联邦 vs 州/地方** | 本框架默认 **美国联邦**；州债、州税是另一套账户 | 把「美国赤字」当成全政府 |
| **流量 vs 存量** | **赤字** = 本期花多少减收多少；**债务** = 累积欠多少 | 只看债务不看赤字（或反之） |
| **财年 FY** | 美国联邦 **10/1–9/30**（FY2025 = 2024-10 至 2025-09） | 与日历年混读 MTS 表 |
| **现金制 vs 权责制** | Treasury **MTS/DTS = 现金**；BEA/OMB **NIPA = 权责** | 同一月份两口径数值不一致 |
| **强制性 vs 裁量性** | **Mandatory**（社保、医保等法定支出）vs **Discretionary**（国会年度拨款） | 以为「砍拨款」就能快速减赤字；**本框架 MTS 代理 ≠ CBO 法定口径**（§3.1 脚注） |
| **初级赤字 vs 总赤字** | **Primary** = 扣除 **净利息** 后的赤字 | 高利率环境下利息本身成「第二财政」 |
| **TGA** | 财政部在联储的 **支票账户**；发钱减少 TGA，发债/收税增加 | 把 TGA 当成「国家现金余额=财政健康」 |

**阅读顺序（初学者）**：§1.0 → **视图 A 总览** → **视图 B 结构** → **视图 C 高频** → §1.4 五问自检。

### 1.1 核心问题

> **联邦财政是在改善还是恶化？**  
> 恶化主要来自 **收入不足、支出刚性、还是利息账单**？  
> **结构性**（经济周期调整后）与 **周期性** 各贡献多少？  
> **近月现金流** 是否与 **年度/GDP 比率** 叙事一致？

**L0 合成（文字，≤150 字）**：给出「改善 / 大致平衡 / 恶化 / 高风险（债务上限/关门）」+ 1–2 条主因（如「收入随经济放缓、强制性支出刚性、利息 YoY +30%」）。

### 1.2 六条支柱（F0–F5）

| 支柱 | 回答什么 | 子块 | 必备指标（displayName） |
| --- | --- | --- | --- |
| **F0 口径与日历** | 读数不踩坑 | — | （文字）FY 日历；现金 vs 权责；联邦范围 |
| **F1 存量与负担** | 「欠多少、利息多重」 | **F1a 债务** | 联邦公共债务总额；公共债务/GDP % |
| | | **F1b 利息** | 净利息支出（水平或/GDP）；有效平均利率（衍生） |
| **F2 流量与周期** | 「本期赤字多大、是否周期敏感」 | **F2a 总量** | 联邦赤字/GDP %；现金月赤字（MTS） |
| | | **F2b 初级** | 初级赤字/GDP %（或 总赤字 − 净利息） |
| **F3 收入结构** | 「钱从哪来、哪类税在变」 | **F3a 总量** | 联邦现金收入（MTS 月累计或 12m 和） |
| | | **F3b 分项** | 个人所得税；企业所得税；社保/医保税（payroll）；其他 |
| **F4 支出结构** | 「钱花在哪、哪块刚性」 | **F4a 总量** | 联邦现金支出（MTS 月累计或 12m 和） |
| | | **F4b 功能** | 强制性（社保、Medicare/Medicaid、其他 mandatory）；裁量性；净利息 |
| | | **F4c 经济含义** | 实际政府消费 YoY（Overview `GCEC1`）；联邦消费+总投资 YoY（`FGCEC1`→yoy，见 §3.1 脚注³） |
| **F5 高频与融资** | 「这个月/这周现金流与融资」 | **F5a 脉冲** | MTS 单月经赤字；MTS 收入/支出 YoY（或 3m 年化） |
| | | **F5b 现金** | TGA 余额（Treasury DTS）；DTS 日净现金流（Deposits−Withdrawals 汇总） |
| | | **F5c 融资** | 净发债额；拍卖 bid-to-cover；平均到期（可选） |

**与 Overview 分工**：Overview **L2G** 仅放「赤字/GDP + 政府消费 YoY」两根 **经济侧** 代理；**本框架** 展开 **Treasury 现金、分项收支、债务与利息**。

### 1.3 刻意排除

| 类别 | 示例 | 原因 |
| --- | --- | --- |
| 货币政策 | Fed 资产、RRP、准备金 | 属货币框架 |
| 金融市场交易 | SPX、HY OAS、VIX | 非财政流量 |
| 政治/选举 | 民调、法案投票计数 | 除非落地为 **支出/收入** 可量化 |
| 州/地方默认视图 | 州债、物业税 | 可 §3.4 扩展，不进默认联邦三视图 |
| 主权评级 | Moody's/S&P | 结果变量，非高频跟踪 |

### 1.4 五问决策树（初学者自检）

| 问 | 看哪里 | 若异常 → |
| --- | --- | --- |
| ① 债务负担是否上升？ | F1 视图 | 看 F2 赤字 + F5 融资；是否 **利息螺旋** |
| ② 赤字恶化来自收入还是支出？ | F3 vs F4 视图 | 收入弱 → 看个税/企业税分项；支出强 → 看 mandatory vs 利息 |
| ③ 是周期还是结构？ | F2 初级赤字 + CBO 基线（§3.4） | 初级仍宽 → 结构性；初级窄、总赤字宽 → **利息** |
| ④ 年度叙事与近月一致？ | F2 赤字/GDP vs F5 MTS | 近月 MTS 恶化而年度仍「好看」→ 警惕 **基数/退税季** |
| ⑤ 有无 **流动性/政治** 尾部？ | F5 TGA + 债务上限事件 | TGA 快速下降 + 上限博弈 → 关门/X-date 风险 |

**80% 场景**：视图 A 写 **1 段 L0**；要解释「为什么赤字变」→ 视图 B；要盯 **发布月/拍卖周** → 视图 C。

### 1.5 变动率与口径规则

| 序列类型 | calc / 展示 | 备注 |
| --- | --- | --- |
| 债务/GDP、赤字/GDP、初级赤字/GDP | `none` | 季/年频 keep；Y 轴 % |
| 债务总额、利息、MTS 收入/支出水平 | `none` 或 `yoy` | 水平看 **占 GDP** 或 **12m 累计** 更易读 |
| MTS 月赤字 | `none`（柱）+ **12m 滚动和**（线） | 单月噪声大，初学者必看 rolling |
| MTS/DTS 收入、支出 | `yoy` 或 `3m annualized` | 标注 **FYTD** 时 x 轴用 FY 月 |
| TGA、DTS 日净现金流 | `none` | 日频；TGA 单位 **百万美元**；DTS 净流 = Table II 汇总 Deposits−Withdrawals |
| NIPA 政府消费（广义） | `yoy` | Overview `GCEC1`（全体政府） |
| NIPA 联邦消费+总投资 | `yoy` | `fiscal_fgcec1_yoy`（`FGCEC1` 水平值 worker 内 YoY） |
| 拍卖 bid-to-cover | `none` | 按事件/周聚合 |

**财年对齐**：MTS/DTS 视图默认 x 轴标注 **FY 月份**（Oct=1 … Sep=12）；与日历混用时必须在 `chartIntroNotes` 写明。

### 1.6 三层视图链条（**不固定图数**）

视图是 **逻辑分组**，不是「必须 4 图模板」。实现时 `layoutMode ∈ {1,2,4,6}` 按 **该视图 roleId 数量** 选取；同一 `roleId` **仅属于一个默认视图**。

```
视图 A  财政总览 · 存量与流量（建议 2–3 图，初学者入口）
    · F1a  公共债务/GDP %  +  债务总额（右轴，可选）
    · F2a  联邦赤字/GDP %  +  初级赤字/GDP %（或 净利息/GDP）
    · F1b  净利息支出/GDP（`FYOIGDA188S`）+  10Y 国债收益率（右轴，解释利息渠道，可选）

视图 B  财政结构 · 收支拆解（建议 3–5 图，解释「为什么」）
    · F3b  收入：个税 / 企业税 / payroll / 其他（堆叠面积或占比）
    · F4b  支出：mandatory 代理 / discretionary 代理 / 净利息（MTS Table 9；标注代理口径）
    · F3a  MTS 现金收入 12m 滚动  +  YoY
    · F4a  MTS 现金支出 12m 滚动  +  YoY
    · F4c  实际政府消费 YoY（`GCEC1`，Overview）+  联邦消费+总投资 YoY（`fiscal_fgcec1_yoy`）

视图 C  高频跟踪 · 现金流与融资（建议 2–4 图，发布月/周更）
    · F5a  MTS 月赤字（柱）+  12m 滚动赤字（线）
    · F5a  MTS 月收入 vs 支出 YoY（双轴或同轴）
    · F5b  TGA 余额（日）
    · F5b  DTS 日净现金流（Deposits−Withdrawals；可 30 日滚动求和）
    · F5c  周净发债（Debt to the Penny 周差分）；拍卖 bid-to-cover（**TBD**）

目录自选（不占默认三视图）：
    · 州/地方财政（Census SF-133）
    · CBO 十年基线 vs 实际
    · 债务上限/X-date 事件线（`market_events` 叠加）
    · 关门期间联邦雇员 furlough 代理
```

**跨视图约束**：`us-federal-debt-gdp`、`us-federal-deficit-gdp` 等 **仅** 出现在 A 或 B 或 C 之一；**禁止** 三视图重复同一 `roleId` 凑图。

**与 Overview 交叉引用**：`us-federal-deficit-gdp`（`FYFSGDA188S`）、`us-gov-consumption-yoy`（`GCEC1`）已在 Overview 台账；fiscal seed **跳过重复 seed**（`FISCAL_FRED_ALREADY_IN_OVERVIEW`），模板 **引用同一 catalogKey**，不 duplicate instrument。

---

## 第二部分：与本仓库代码的关系

| 模块 | 路径 | 状态 |
| --- | --- | --- |
| Treasury 种子台账 | `src/lib/data/scheduler/treasuryFiscalSeedCatalog.ts` | **已建**（12 序列） |
| FRED 种子台账 | `src/lib/data/scheduler/fiscalFredSeedCatalog.ts` | **已建**（5 直拉 + 1 YoY） |
| FRED 复合 | `src/lib/data/scheduler/fiscalCompositeFred.ts` | **已建**（初级赤字 spread） |
| Treasury 短键/spec | `src/lib/data/scheduler/treasuryFiscalData/types.ts` | **已建** |
| Treasury 客户端 | `src/lib/data/scheduler/treasuryFiscalData/client.ts` | **已建** |
| Treasury 适配器 | `src/lib/data/scheduler/adapters/treasuryFiscalDataAdapter.ts` | **已建** |
| Worker 路由 | `src/lib/data/scheduler/runSubscription.ts` | **已建**（`treasury-fiscal-data` + `fiscalCompositeSpec`） |
| 种子脚本 | `scripts/data-worker/seed-fiscal.ts` | **已建** |
| 验证脚本 | `scripts/data-worker/verify-fiscal.ts` | **已建** |
| 宏观目录 | `src/lib/data/fredCatalog.ts` | **已建**（`treasury_*` / `fiscal_*` → MDS 目录） |
| 布局 + 三视图 | `fiscalAnalysisLayout.ts` | **待建** |
| 角色注册表 | `fiscalSourceRegistry.ts` | **待建**（可选；台账见 §3.1） |
| 文档 | `docs/US_FISCAL_ANALYSIS.md` | **待建** |
| 宏观文件夹 | `macroPresetTemplates.ts` → `folder-builtin-us-fiscal` | **待建** |

**模板形态**：3 个内置视图对应 3 个 `MacroChartTemplate`，`layoutMode` **按序列数动态设置**（不统一 4）；`chartIntroNotes` 写 **五问** 与 **FY 口径**，非逐指标堆砌。数据层已就绪，UI/模板层待接。

---

## 第三部分：经济指标台账

### 3.1 角色清单（§1 必备 + 已实现映射）

| 经济角色 ID | displayName | 支柱 | instrumentCode | 数据源 / 序列 | 默认视图 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `us-federal-debt-gdp` | 联邦公共债务/GDP % | F1a | `sched_fred_GFDEGDQ188S` | FRED `GFDEGDQ188S` | A | **OK** |
| `us-federal-debt-total` | 联邦公共债务总额 | F1a | `sched_fred_GFDEBTN` | FRED `GFDEBTN` | A | **OK** |
| `us-net-interest-gdp` | 联邦利息支出/GDP % | F1b | `sched_fred_FYOIGDA188S` | FRED `FYOIGDA188S`（OMB FYOINT/GDPA） | A | **OK** |
| `us-federal-deficit-gdp` | 联邦赤字/GDP % | F2a | Overview 既有 | FRED `FYFSGDA188S` | A | **OK**¹ |
| `us-primary-deficit-gdp` | 初级赤字/GDP % | F2b | `fiscal_primary_deficit_gdp` | FRED 复合：`FYFSGDA188S − FYOIGDA188S` | A/B | **OK** |
| `us-mts-receipts` | MTS 联邦现金收入（月） | F3a | `treasury_mts_m01_receipts` | Treasury MTS **Table 1** `mts1:receipts` | C | **OK** |
| `us-mts-outlays` | MTS 联邦现金支出（月） | F4a | `treasury_mts_m01_outlays` | Treasury MTS **Table 1** `mts1:outlays` | C | **OK** |
| `us-mts-deficit` | MTS 联邦月赤字 | F2a/F5a | `treasury_mts_m01_deficit` | Treasury MTS **Table 1** `mts1:deficit` | C | **OK** |
| `us-receipts-individual-tax` | 个人所得税（现金，月） | F3b | `treasury_mts_m09_rcpt_individual` | MTS **Table 9** `Individual Income Taxes` | B | **OK**² |
| `us-receipts-corporate-tax` | 企业所得税（现金，月） | F3b | `treasury_mts_m09_rcpt_corporate` | MTS **Table 9** `Corporation Income Taxes` | B | **OK**² |
| `us-receipts-payroll-tax` | 社保/退休税（现金，月） | F3b | `treasury_mts_m09_rcpt_payroll` | MTS **Table 9** `Employment and General Retirement` | B | **OK**² |
| `us-outlays-mandatory` | 强制性支出（MTS 代理） | F4b | `treasury_mts_m09_mandatory_proxy` | MTS **Table 9** 功能分类求和³ | B | **OK**³ |
| `us-outlays-discretionary` | 可自由裁量支出（MTS 代理） | F4b | `treasury_mts_m09_discretionary_proxy` | MTS **Table 9** 功能分类求和⁴ | B | **OK**³ |
| `us-outlays-net-interest` | 净利息支出（现金，月） | F4b | `treasury_mts_m09_outlay_interest` | MTS **Table 9** `Net Interest` | B | **OK** |
| `us-outlays-net-interest-nipa` | 联邦利息支出（NIPA，季调年化） | F4b | `sched_fred_A091RC1Q027SBEA` | FRED `A091RC1Q027SBEA`（权责制） | B | **OK**⁵ |
| `us-gov-consumption-yoy` | 实际政府消费 YoY（广义政府） | F4c | Overview 既有 | FRED `GCEC1`→yoy | B | **OK**¹ |
| `us-gov-investment-yoy` | 联邦消费+总投资 YoY | F4c | `fiscal_fgcec1_yoy` | FRED `FGCEC1`→worker YoY | B | **OK**⁶ |
| `us-gov-investment-level` | 联邦消费+总投资（水平） | F4c | `sched_fred_FGCEC1` | FRED `FGCEC1`（辅助序列） | — | **OK**⁶ |
| `us-tga-balance` | TGA 余额（日） | F5b | `treasury_dts_tga_balance` | DTS `operating_cash_balance` TGA Closing | C | **OK** |
| `us-dts-daily-deficit` | DTS 日净现金流 | F5b | `treasury_dts_daily_net_cash` | DTS Table II 汇总：Deposits−Withdrawals | C | **OK**⁷ |
| `us-net-issuance-weekly` | 公共债务周净增发 | F5c | `treasury_debt_penny_net_weekly` | `v2/accounting/od/debt_to_penny` 周差分 | C | **OK** |

**脚注**

1. **Overview 共享**：`FYFSGDA188S`、`GCEC1` 由 Overview seed 维护；`data:seed-fiscal` **不重复**创建订阅。模板引用 `fred:FYFSGDA188S`、`fred:GCEC1`（或 `mds:` 对应 code）。
2. **Table 9 非 Table 2**：Treasury API 收入分项在 **MTS Table 9**（`classification_desc` + `record_type_cd=RSG`），非旧文档中的 Table 2。
3. **Mandatory/Discretionary 代理**（非 CBO 法定口径）：Table 9 功能支出（`record_type_cd=F`）求和。  
   - **Mandatory 代理**：Social Security、Medicare、Health、Income Security、Veterans Benefits and Services。  
   - **Discretionary 代理**：National Defense、Education/Training/Employment/Social Services、Transportation、International Affairs、Energy、Natural Resources and Environment、General Science/Space/Technology、Commerce and Housing Credit、Community and Regional Development、Administration of Justice、General Government、Agriculture。  
   图表 **必须** 标注「MTS 功能分类代理，≠ CBO mandatory/discretionary」。
4. Discretionary 求和列表见 `treasuryFiscalData/types.ts` → `MTS9_DISCRETIONARY_PROXY_CLASSES`。
5. NIPA 利息与 MTS 现金利息 **不可同图不加标注**；GDP 占比用 `FYOIGDA188S`，现金月频用 `treasury_mts_m09_outlay_interest`。
6. **`us-gov-investment-yoy` 命名历史**：入库序列为 **联邦** Real Consumption Expenditures **and** Gross Investment（`FGCEC1`），**非** 单独「投资」分项；单独联邦 Gross Investment 子序列 **未入库**（§3.4）。
7. DTS「日赤字」= **日净现金流代理**（百万美元），非 BEA 权责赤字；勿与 MTS 月赤字直接数值对比。

**目录自选（未入库）**：`us-state-local-balance`、`us-cbo-baseline-deficit`、`us-debt-ceiling-events`、`us-shutdown-proxy`、`us-auction-bid-to-cover`。

### 3.2 FRED 已验证序列

| 分析角色 | fredId / 计算 | instrumentCode | 频率 | 备注 |
| --- | --- | --- | --- | --- |
| 债务/GDP | `GFDEGDQ188S` | `sched_fred_GFDEGDQ188S` | 季 | 公共债务占名义 GDP |
| 债务总额 | `GFDEBTN` | `sched_fred_GFDEBTN` | 季 | 百万美元 |
| 赤字/GDP | `FYFSGDA188S` | Overview | 季/年 | 与 Overview 共用 |
| 利息/GDP | `FYOIGDA188S` | `sched_fred_FYOIGDA188S` | 年 | **非** `FYONET`；OMB 表 |
| 初级赤字/GDP | `FYFSGDA188S − FYOIGDA188S` | `fiscal_primary_deficit_gdp` | 年 | spread 复合 |
| NIPA 联邦利息 | `A091RC1Q027SBEA` | `sched_fred_A091RC1Q027SBEA` | 季 | 十亿美元，权责 |
| 政府消费 YoY | `GCEC1`→yoy | Overview | 季 | 广义政府；Overview |
| 联邦消费+投资 YoY | `FGCEC1`→yoy | `fiscal_fgcec1_yoy` | 季 | worker `fredTransform` |
| 联邦消费+投资水平 | `FGCEC1` | `sched_fred_FGCEC1` | 季 | 2017 链价十亿 |

**已证伪 / 弃用候选**：`FYONET`（角色改 `FYOIGDA188S`）；`FGI`、`A822RC1`（FRED 不存在）；`A821RL1Q225SBEA`（404）；`A823RL1Q225SBEA`（QoQ 非 YoY）；`WTREGEN`（TGA 改 Treasury DTS 直拉）。

**解释用（可选，Overview/FRED 已有）**：`GS10`（10Y，利息渠道叙事，非财政流量）。

### 3.3 Treasury Fiscal Data API（已验证 endpoint）

| 角色 | 短键 | endpoint | rowSelector / 字段 |
| --- | --- | --- | --- |
| MTS 月收/支/赤字 | `mts1:receipts/outlays/deficit` | `v1/accounting/mts/mts_table_1` | `mts1_fy_month`；FY 月对齐 `record_date` |
| MTS 收入分项 | `mts9:individual_income` 等 | `v1/accounting/mts/mts_table_9` | `classification_desc` + `RSG` |
| MTS 净利息 | `mts9:net_interest` | 同上 | `Net Interest` + `F` |
| MTS mandatory/discretionary 代理 | `mts9:mandatory_proxy` / `discretionary_proxy` | 同上 | `mts9_sum` 多分类求和 |
| TGA 收盘 | `dts:tga_close` | `v1/accounting/dts/operating_cash_balance` | `Treasury General Account (TGA) Closing Balance` |
| DTS 日净现金流 | `dts:daily_net_cash` | 同上 | `Total TGA Deposits` − `Total TGA Withdrawals` |
| 债务周净增发 | `debt:penny_net_weekly` | **`v2/accounting/od/debt_to_penny`** | 日频 `tot_pub_debt_out_amt` → ISO 周差分 |

**已证伪**：`v1/debt/debt_to_penny`（404）；`v1/accounting/dts/dts_table_*`（404）；`deposits_withdrawals_operating_cash` 逐行求和（低效，改用 `operating_cash_balance` 汇总行）。

**数据源 ID**：`treasury-fiscal-data`；`instrumentCode` 前缀 `treasury_*`；catalogKey `treasury:{code}`。

### 3.4 TBD Backlog（数据层剩余）

| 优先级 | 角色 / 能力 | 候选源 | 备注 |
| --- | --- | --- | --- |
| **P1** | CBO 法定 mandatory/discretionary | CBO Monthly Budget Review CSV | 替代/补充 MTS Table 9 代理 |
| **P1** | 联邦 Gross Investment **单独** YoY | BEA NIPA 子表 / FRED 细分 | 与 `FGCEC1`（消费+投资合计）区分 |
| **P2** | CBO 十年基线对比 | CBO API / 手工 CSV | 结构叙事 |
| **P2** | 州/地方 | Census SF-133 | 扩展视图 D |
| **P3** | 拍卖 bid-to-cover | Treasury `v1/debt/auctions/...` | F5c |
| **P3** | 债务上限事件线 | 已有 `market_events` | 图表 annotation |
| **P3** | MTS 收入「其他」分项 | Table 9 余项或 Table 3 | 视图 B 堆叠补全 |
| **P3** | `data:probe-sources --scope=fiscal` | 探测脚本扩展 | 运维 |

**已完成（原 P0/P1，勿重复排期）**：MTS Table 1 月收支/赤字；Table 9 收入分项 + 利息；TGA + DTS 日净流；初级赤字/GDP 复合；Debt to the Penny 周净增发；MTS mandatory/discretionary **代理**。

### 3.5 默认视图绑定（roleId 分组，**非固定 8+8**）

**视图 A（约 5–6 序列，均可调度）**：debt-gdp, debt-total, deficit-gdp, primary-deficit-gdp, net-interest-gdp, （可选 GS10 解释）

**视图 B（约 10–14 序列）**：receipts 分项 ×3、outlays mandatory/discretionary/interest ×3、gov-consumption-yoy, gov-investment-yoy, mts-receipts/outlays 12m 滚动, （可选 NIPA 利息 `us-outlays-net-interest-nipa`）

**视图 C（约 6–8 序列）**：mts-deficit, mts-receipts, mts-outlays, tga-balance, dts-daily-net-cash, net-issuance-weekly

**不在默认视图**：state-local, cbo-baseline, debt-ceiling-events, gov-investment-level（水平辅助）, net-interest-nipa（与 cash 利息二选一或分 panel）

---

## 第四部分：工程步骤

| 交付 | 路径 | 说明 |
| --- | --- | --- |
| 布局 + 三视图 | `fiscalAnalysisLayout.ts` | `layoutMode` 随视图序列数；**禁止**硬编码 4 |
| 台账 | §3.1（或 `fiscalSourceRegistry.ts`） | 跨视图 disjoint 断言 |
| FRED/Treasury 种子 | `fiscalFredSeedCatalog.ts` + `treasuryFiscalSeedCatalog.ts` | **已完成** |
| Treasury 适配器 | `treasuryFiscalDataAdapter.ts` | **已完成** |
| 验证 | `verify-fiscal.ts` | **已完成**；§3.1 全部 **OK** 应 pass |
| 文档 | `docs/US_FISCAL_ANALYSIS.md` | 初学者 §1.0 同步 |
| 宏观入口 | `macroPresetTemplates.ts` | 文件夹「美国财政分析」 |

### 4.1 视图规范

- 每个视图 **独立** `MacroChartTemplate`；`selectedKeys` 仅含 **OK** 角色
- `chartIntroNotes` 按 **视图** 写 §1.4 五问引导，并注明 **FY / 现金制**
- Overview 已用 virtualKey **复用**，不 duplicate instrument
- 堆叠图（分项占比）优先 **视图 B**；柱+线（月赤字+12m）优先 **视图 C**

### 4.2 npm scripts（已写入 package.json）

```json
"data:seed-fiscal": "dotenv -e .env.local -- tsx scripts/data-worker/seed-fiscal.ts",
"data:sync-fiscal": "dotenv -e .env.local -- tsx scripts/data-worker/seed-fiscal.ts -- --sync-only",
"data:verify-fiscal": "dotenv -e .env.local -- tsx scripts/data-worker/verify-fiscal.ts"
```

---

## 第五部分：图表 UX

| 类别 | 建议色 | 备注 |
| --- | --- | --- |
| 债务/GDP、债务总额 | `#6f84c0` / `#5f76b8` | 存量冷色 |
| 赤字、月赤字柱 | `#ef6461`（赤字）/ `#9ea68b`（盈余） | 柱图正负分色 |
| 收入、个税 | `#56b6c2` | |
| 企业税 | `#7fc8c5` | |
| payroll 税 | `#d89b4e` | |
| mandatory 支出 | `#c97b84` | 刚性 |
| discretionary | `#f4b165` | |
| 净利息 | `#d75a68` | 强调 |
| TGA | `#6ccad1` | 高频 |
| 12m 滚动线 | 同系列加深或 `#333` 虚线 | 初学者必配 |

---

## 第六部分：验证清单

- [ ] §1.6 三视图 **roleId 零重复**
- [ ] §1.0 初学者概念写入 `docs/US_FISCAL_ANALYSIS.md` 与视图 A 介绍
- [ ] F1/F2 **存量+流量** 在视图 A 可 5 分钟读懂
- [ ] F3/F4 **分项** 在视图 B 可回答「收入还是支出」
- [ ] F5 **MTS/DTS** 在视图 C 可跟踪发布月
- [x] Overview 共享键不重复 seed（`FYFSGDA188S`、`GCEC1`）
- [x] `npm run data:verify-fiscal -- --db` 通过（§3.1 默认角色均已 OK）
- [ ] 宏观模板 `fiscalAnalysisLayout` + 内置文件夹接好 catalogKey
- [ ] 视图 B mandatory/discretionary 图注明 **MTS 代理口径**
- [ ] 与 Overview L2G、CPI、就业模板分工明确

---

## 第七部分：禁止事项

- **不要** 规定「必须 2 个四图模板」或凑满固定 panel 数
- **不要** 在三视图重复同一 `roleId`（尤其赤字/GDP、债务/GDP）
- **不要** 混用 **现金 MTS** 与 **权责 NIPA** 于同一图而不标注
- **不要** 用 **Fed 扩表** 替代 **财政赤字** 解释政府融资
- **不要** 因 Treasury API 未接好就删除 §3.1 角色（标 TBD）
- **不要** 把 **债务上限政治** 当唯一「财政分析」；流量与结构仍是主体

---

## 使用说明

**Agent**：§3.1 台账（数据层 **已完成**）→ `fiscalAnalysisLayout` + 宏观模板 → verify 模板 selectedKeys → `docs/US_FISCAL_ANALYSIS.md`。

**研究员（初学者）**：

1. 读 §1.0 概念图  
2. 打开 **视图 A**，写 L0 一段话（债务+赤字+利息）  
3. 若问「为什么」→ **视图 B**（谁多收/少收、谁多花）  
4. 发布月/拍卖周 → **视图 C**（MTS 月表、TGA、DTS）  
5. 用 §1.4 五问自检；深度结构 → CBO/OMB；事件 → `market_events` 债务上限/关门

**与 Overview 衔接**：Overview 模板 ② 图 4 仅 **2 根** 政府代理；完整财政 → 本框架 **视图 A–C**。
