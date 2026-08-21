# Spec：美国国际收支（us-balance-of-payments）

> 按 [SPEC-TEMPLATE.md](./SPEC-TEMPLATE.md) 填写。Agent A→B→D→E 流程已完成；四图模板的12条原始指标及BOP完整标准科目的补充入库、更新调度与验收证据均已落地。

---

## §0 元信息

| 字段 | 值 |
|------|----|
| dimension id | `us-balance-of-payments` |
| 中文名 | 美国国际收支 |
| 内置文件夹 id | `folder-builtin-us-balance-of-payments` |
| 模板 id 前缀 | `builtin-us-balance-of-payments-` |
| 分支 | `feature/macro-us-balance-of-payments` |
| 状态 | `verified`（2026-08-12模板验收；2026-08-21完整BOP科目补充验收） |
| 对应框架页维度 | `external`（外部与贸易） |
| 评审记录 | 2026-08-12：Agent A 提交设计并经人工评审通过；Agent B 完成12条模板指标入库；Agent C 因复用 FRED API 跳过；Agent D/E 完成模板与验收。2026-08-21：Agent B复用同一FRED适配器、调度器、事实表和writer，补齐98条目录指标并完成历史、调度与幂等验收。 |

---

## §1 分析框架

### 1.1 核心问题（L0）

> 美国经常账户赤字除货物贸易外由哪些项目缓冲或拖累，赤字通过什么类型的跨境资本流入融资，融资结构是否稳定，以及持续融资最终沉淀为怎样的外部负债结构？

本维度不是重复展示“经常账户赤字有多大”或“净国际投资头寸有多负”，而是对既有总量结论做结构性下钻：

`非货物经常项目 → 跨境资产与负债流量 → 外部融资工具结构 → 外部负债存量结构`

### 1.2 分析层级

| 层级 | 问题 | 主要指标（显示名） | 落到哪个模板/图 |
|------|------|--------------------|-----------------|
| L0 外部融资约束 | 美国对外净借款依赖是否加深，融资是否可持续？ | 引用既有经常账户余额、净国际投资头寸，不在本维度复制 | 与“美国对外部门与美元”联读 |
| L1 经常账户非货物分解 | 服务顺差、初次收入和二次收入分别在缓冲还是扩大外部失衡？ | 服务差额、初次收入差额、二次收入差额 | ①-1 |
| L2 跨境资金两端 | 美国居民对外取得资产与非居民增持美国负债，哪一端主导季度资金流？ | 美国取得对外金融资产、美国发生对外金融负债、金融账户净借贷 | ①-2 |
| L3 融资质量 | 对外融资更多依赖相对稳定的直接投资，还是更易逆转的证券和其他投资？ | 直接投资负债流量、证券投资负债流量、其他投资负债流量 | ①-3 |
| L4 存量脆弱性 | 历史融资沉淀在哪类外部负债，市场价格和流动性冲击主要暴露在哪一层？ | 直接投资负债存量、证券投资负债存量、其他投资负债存量 | ①-4 |

### 1.3 与现有模板的分工（必填）

| 相邻主题 | 归属 | 本维度不做 |
|----------|------|------------|
| 美元指数、贸易差额、进出口、经常账户总差额、净国际投资头寸、贸易价格与贸易条件 | `us-external-dollar`（美国对外部门与美元） | 不复制 `DTWEXBGS`、`DTWEXAFEGS`、`DTWEXEMEGS`、`BOPGSTB`、`BOPTEXP`、`BOPTIMP`、`IEABC`、`IIPUSNETIQ`、`IQ`、`IR`、`W369RG3Q066SBEA`；本维度只做 BOP 与 IIP 的结构下钻 |
| 实际进出口对 GDP 增长的拉动 | 美国经济 Overview | 不复制 NIPA 实际进出口及净出口增长贡献 |
| 政策利率、美元流动性、NFCI、信用利差 | 美国货币政策与金融条件 | 不用金融价格解释每个季度资本流；需要时跨模板联读 |
| 财政赤字与利息负担 | 美国财政 | 不制作“双赤字”合成图，不把国际收支各分项机械除以 GDP |
| 美股、债券和美元的市场价格 | 市场与资产配置页面 | 本维度只展示 BEA 账户流量和期末头寸，不复制行情指标 |
| 资本账户、金融衍生品与统计误差 | BEA 国际交易账户的调节项 | 资本账户对美国总量较小且事件驱动，衍生品净交易和统计误差波动大；默认四图不单列，但图 2 采用的官方金融账户净借贷已包含衍生品净交易，账目核对时回到 BEA 完整表 |

---

## §2 模板规划

单一四图模板即可形成完整分析链，不再拆成多个松散模板。

| 顺序 | 模板 id | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-balance-of-payments-overview` | 国际收支 · 经常账户结构与外部融资 | 默认加载；与既有“美国对外部门与美元”总量模板联读 |

### 模板 ①（layoutMode: 4）

| 图 | slotTitle | 序列（显示名） | 轴 | 图型 |
|----|-----------|----------------|----|------|
| 1 | 经常账户非货物项：服务、初次收入与二次收入 | 服务差额；初次收入差额；二次收入差额 | left（百万美元） | `timeSeries/bar+bar+bar`（零轴；不堆叠） |
| 2 | 跨境资金两端：资产取得、负债发生与净借贷 | 美国取得对外金融资产（正值=金融流出）；美国发生对外金融负债（正值=金融流入）；金融账户净借贷（正=净贷出，负=净借入） | left（百万美元） | `timeSeries/bar+bar+line`（零轴；净借贷线加粗） |
| 3 | 外部融资流量结构：直接、证券与其他投资 | 直接投资负债流量；证券投资负债流量；其他投资负债流量 | left（百万美元） | `timeSeries/stackBar`（同一 stackGroup；保留负值） |
| 4 | 外部负债存量结构：直接、证券与其他投资 | 直接投资负债存量；证券投资负债存量；其他投资负债存量 | left（百万美元） | `timeSeries/stackArea`（同一 stackGroup；季度期末值） |

设计约束：

- 图 1 只展示经常账户的非货物项目；完整经常账户总差额和贸易总差额引用现有 `us-external-dollar`，避免重复。
- 图 2、图 3 均采用 BEA 的符号约定。资产增加为金融流出正值，负债增加为金融流入正值；官方金融账户净借贷正值表示净贷出、负值表示净借入，不得把三条序列的正负方向混为一谈。
- 图 4 是期末存量，不与图 3 的季度交易流量做机械加总。IIP 存量变化还包含价格、汇率和其他数量调整。
- 各图均为同图同频同单位；季调交易流与未季调期末存量分图展示，不做跨口径算术。

---

## §3 指标清单（核心表，每行一个序列）

2026-08-12 Agent A 盘点时，以下 12 条 FRED 原始序列尚未注册，因此表内保留当时的 `gap_new_source` 发现状态。Agent B 已在同日全部接入既有 `fred_api`，最终状态为 `reuse_verified`；完成证据见 §3.3。未启动 Agent C。

| # | seriesKey | 显示名 | 频率 | 单位 | 发布机构 | 获取状态 | 获取方式 kind | 源标识 | 历史/核验依据 | 调度方式 | 模板/图槽 | 计算 | 去重 |
|---|-----------|--------|------|------|----------|----------|---------------|--------|---------------|----------|-----------|------|------|
| 1 | `fred:IEABCS` | 服务差额 | 季 | 百万美元，季调 | BEA | `gap_new_source` | `fred_api` | [IEABCS](https://fred.stlouisfed.org/series/IEABCS) | FRED 官方页核对 Frequency/Units/Release；公开 CSV 1999-Q1→2026-Q1，共 109 期 | 加入既有发布包 `us.bea.international_transactions`，跟随发布日历 | ①-1 | none | ✅ 未被美国其他内置模板占用；≠ `BOPGSTB` |
| 2 | `fred:IEABCPI` | 初次收入差额 | 季 | 百万美元，季调 | BEA | `gap_new_source` | `fred_api` | [IEABCPI](https://fred.stlouisfed.org/series/IEABCPI) | 同上；1999-Q1→2026-Q1，共 109 期 | 同上 | ①-1 | none | ✅ 未占用；≠ 经常账户总差额 `IEABC` |
| 3 | `fred:IEABCSI` | 二次收入差额 | 季 | 百万美元，季调 | BEA | `gap_new_source` | `fred_api` | [IEABCSI](https://fred.stlouisfed.org/series/IEABCSI) | 同上；1999-Q1→2026-Q1，共 109 期 | 同上 | ①-1 | none | ✅ 未占用；≠ 经常账户总差额 `IEABC` |
| 4 | `fred:IEAA` | 美国取得对外金融资产（不含衍生品） | 季 | 百万美元，季调 | BEA | `gap_new_source` | `fred_api` | [IEAA](https://fred.stlouisfed.org/series/IEAA) | FRED 官方页核对：资产净增加/金融流出为正；1999-Q1→2026-Q1，共 109 期 | 同上 | ①-2 | none | ✅ 未占用 |
| 5 | `fred:IEAI` | 美国发生对外金融负债（不含衍生品） | 季 | 百万美元，季调 | BEA | `gap_new_source` | `fred_api` | [IEAI](https://fred.stlouisfed.org/series/IEAI) | FRED 官方页核对：负债净增加/金融流入为正；1999-Q1→2026-Q1，共 109 期 | 同上 | ①-2 | none | ✅ 未占用 |
| 6 | `fred:IEANLF` | 金融账户净借贷 | 季 | 百万美元，季调 | BEA | `gap_new_source` | `fred_api` | [IEANLF](https://fred.stlouisfed.org/series/IEANLF) | FRED 官方页核对：净贷出为正、净借入为负，口径含金融衍生品净交易；1999-Q1→2026-Q1，共 109 期 | 加入 `us.bea.international_transactions`，跟随发布日历 | ①-2 | none | ✅ 未占用；采用官方总量，不由 IEAA/IEAI 自行推算 |
| 7 | `fred:IEAIDI` | 直接投资负债流量 | 季 | 百万美元，季调 | BEA | `gap_new_source` | `fred_api` | [IEAIDI](https://fred.stlouisfed.org/series/IEAIDI) | FRED 官方页核对 Frequency/Units/Release；1999-Q1→2026-Q1，共 109 期 | 加入 `us.bea.international_transactions`，跟随发布日历 | ①-3 | none | ✅ 未占用 |
| 8 | `fred:IEAIPI` | 证券投资负债流量 | 季 | 百万美元，季调 | BEA | `gap_new_source` | `fred_api` | [IEAIPI](https://fred.stlouisfed.org/series/IEAIPI) | 同上；1999-Q1→2026-Q1，共 109 期 | 同上 | ①-3 | none | ✅ 未占用 |
| 9 | `fred:IEAIOI` | 其他投资负债流量 | 季 | 百万美元，季调 | BEA | `gap_new_source` | `fred_api` | [IEAIOI](https://fred.stlouisfed.org/series/IEAIOI) | 同上；1999-Q1→2026-Q1，共 109 期 | 同上 | ①-3 | none | ✅ 未占用 |
| 10 | `fred:IIPDIRELMVQ` | 直接投资负债存量（市场价值） | 季末 | 百万美元，未季调 | BEA | `gap_new_source` | `fred_api` | [IIPDIRELMVQ](https://fred.stlouisfed.org/series/IIPDIRELMVQ) | FRED 官方 IIP 页核对期末口径；2006-Q1→2026-Q1，共 81 期 | 加入既有发布包 `us.bea.iip`，probe 168h | ①-4 | none | ✅ 未占用；≠ 净 IIP `IIPUSNETIQ` |
| 11 | `fred:IIPPORTLQ` | 证券投资负债存量 | 季末 | 百万美元，未季调 | BEA | `gap_new_source` | `fred_api` | [IIPPORTLQ](https://fred.stlouisfed.org/series/IIPPORTLQ) | 同上；2006-Q1→2026-Q1，共 81 期 | 同上 | ①-4 | none | ✅ 未占用；≠ 净 IIP `IIPUSNETIQ` |
| 12 | `fred:IIPOTHELQ` | 其他投资负债存量 | 季末 | 百万美元，未季调 | BEA | `gap_new_source` | `fred_api` | [IIPOTHELQ](https://fred.stlouisfed.org/series/IIPOTHELQ) | 同上；2006-Q1→2026-Q1，共 81 期 | 同上 | ①-4 | none | ✅ 未占用；≠ 净 IIP `IIPUSNETIQ` |

### 3.1 发布包设计

| 包 id | 现状 | 本维度追加成员 | 说明 |
|-------|------|----------------|------|
| `us.bea.international_transactions` | 已存在并复用；季度发布日历 | BOP现行标准口径108条，其中复用 `IEABC`、本域负责107条 | 同属 BEA *U.S. International Transactions*；只扩充成员，不新建包或平行抓取链 |
| `us.bea.iip` | 已存在，当前含 `IIPUSNETIQ`；季度，probe 168h | `IIPDIRELMVQ`、`IIPPORTLQ`、`IIPOTHELQ` | 同属 BEA *U.S. International Investment Position*；只扩充成员，不新建包 |

### 3.2 需要新数据源的指标（Agent C 输入）

无。全部原始缺口均可由现有 FRED API 适配器接入，Agent C 跳过。

### 3.3 Agent B 入库与更新证据

| 范围 | 入库结果 | 发布包与更新方式 | 下次检查时间（本地验收库） |
|------|----------|------------------|----------------------------|
| `IEABCS`、`IEABCPI`、`IEABCSI`、`IEAA`、`IEAI`、`IEANLF`、`IEAIDI`、`IEAIPI`、`IEAIOI` | 每条 109 期，1999-Q1→2026-Q1 | FRED API；`us.bea.international_transactions`；`economic_calendar` | 均有值；随 Current Account 发布事件更新 |
| `IIPDIRELMVQ`、`IIPPORTLQ`、`IIPOTHELQ` | 每条 81 期，2006-Q1→2026-Q1 | FRED API；`us.bea.iip`；季度 `probe_interval=168h` | 均有值；幂等 seed 后为 `2026-08-19T03:07:48Z` 附近 |

两个发布包均沿用现有 BEA/FRED 通道。国际交易账户已改为匹配 Current Account 经济日历，IIP继续按 `probe_interval=168h` 独立探测；`data:worker` 到期后经统一FRED adapter和writer增量upsert。部署时 `npm run data:apply` 会通过catalog registry幂等重建注册、发布包成员和调度配置。

### 3.4 Agent B完整BOP科目补充（2026-08-21）

- 官方全集盘点：FRED release 49 共550条，剔除228条已停更系列；余下口径中有108条“Quarterly, Seasonally Adjusted, Millions of Dollars”，作为不重复的季度标准事实。季度未季调、年度未季调和十亿美元缩放副本不重复入库。
- 复用门：108条中数据库原有10条；`IEABC`继续由 `external-dollar` 域持有，其他9条是本模板已有指标。本轮只新增剩余98条，没有新增adapter、事实表、writer或平行计算链。
- 官方页核验：108/108条逐一核对FRED公开页的Frequency、Units、Seasonal Adjustment和Release字段；98条新增序列全部通过统一FRED API完成历史回填。
- 目录分组：国际收支总表14、金融账户资产22、金融账户负债14、经常账户借方28、经常账户贷方30；均低于单一末端组48条上限。98条补充项只进入指标目录，不自动占用内置模板槽位，因此不写入 `USED-INDICATORS.md`。
- 更新：`us.bea.international_transactions`含108个成员，2026-08-21本地日历校准到2026-09-24 Current Account事件；IIP包保持168小时探测。
- 例外：`IEASAD`仍在官方现行发布页中，但最新非空观测停在2019Q4。保留84期真实历史并继续随发布包探测，不补零、不合成、不把其标成来源正常更新。
- 验收：专项DB校验108/108 BOP成员、4/4 IIP成员通过；六个业务分组的Instrument、Subscription、来源、频率、单位、历史和调度全部通过。

---

## §4 图表介绍与分析方法（Agent D 的文案输入）

### 4.1 模板 description

- ①：从经常账户的非货物缓冲、跨境资金的资产负债两端、外部融资的工具结构和外部负债存量四步，判断美国对外融资依赖的来源、稳定性与潜在脆弱点。

### 4.2 chartIntroNotes 草稿

**模板 ①**

1. 图 1：先看服务顺差能否覆盖初次收入和二次收入的净流出。服务顺差扩大通常改善非货物经常项目；初次收入由顺差转为逆差，意味着美国海外资产收益相对外国持有美国资产的收益优势减弱。该图必须与既有经常账户总差额和贸易差额联读，不能单独当作完整经常账户。
2. 图 2：再看资金的两端。资产取得上升表示美国居民增加海外资产、形成金融流出；负债发生上升表示境外投资者增加美国资产、形成金融流入。官方金融账户净借贷综合资产、负债和金融衍生品净交易：正值为净贷出，负值为净借入；净借入绝对值扩大表示美国从境外获得的净融资增加。
3. 图 3：把负债发生拆为直接投资、证券投资和其他投资。直接投资通常期限更长、黏性更高；证券投资对收益率、风险偏好和资产价格更敏感；其他投资主要含存贷款、贷款和贸易信贷，短期跳升常提示银行与美元流动性渠道在主导。负值表示撤资或负债净偿还，不应截断。
4. 图 4：最后看流量沉淀后的外部负债存量。证券投资占比高意味着美国依靠深厚资本市场吸收全球储蓄，同时也让负债市值更受利率和资产价格重估影响；其他投资上升则提高对银行融资和短期流动性的敏感度。期末存量变化包含交易、价格、汇率和其他调整，不能用图 3 流量直接解释全部变化。

### 4.3 决策树（观察 → 对照图位 → 典型结论）

| 观察 | 对照图位 | 典型结论 |
|------|----------|----------|
| 服务顺差扩大，初次收入仍为顺差或改善 | ①-1 + 既有经常账户总差额 | 非货物项目在缓冲货物贸易逆差，外部失衡质量好于只看贸易差额所得结论 |
| 初次收入由顺差转逆差且持续恶化 | ①-1 + 既有净 IIP | 净负债扩大与外资收益支付上升开始侵蚀美国长期“收益优势”，经常账户压力趋于结构化 |
| 负债发生显著高于资产取得，金融账户净借贷为负且净借入扩大 | ①-2 | 美国对外净融资需求上升；需转图 3 判断资金是否稳定 |
| 净借入扩大且主要由直接投资负债流量贡献 | ①-2 + ①-3 | 融资黏性相对较高，短期突然逆转风险较低，但仍需看直接投资流是否由债务工具扭曲 |
| 净借入扩大且主要由证券投资负债流量贡献 | ①-2 + ①-3 | 融资更依赖全球风险偏好和美国资产回报；美元、利率或资产价格冲击的敏感度上升 |
| 其他投资负债流量跳升，同时其他投资负债存量抬升 | ①-3 + ①-4 | 银行、存贷款或短期流动性渠道主导，应联读美元流动性和金融条件模板 |
| 证券投资负债存量上升但当期证券流入不强 | ①-3 + ①-4 | 更可能由市场价格或汇率估值推动，不能误判为当期外国资金大举流入 |
| 经常账户恶化、净资金流入扩大、外部负债存量同步上升 | 既有总量 + ①-2 + ①-4 | 外部融资依赖正在累积；若融资结构同时转向证券/其他投资，脆弱性高于直接投资主导情形 |

---

## §5 交付物清单（评审通过后执行）

| 交付物 | 路径 | 执行 Agent |
|--------|------|-----------|
| FRED seed catalog | `src/lib/data/scheduler/usBalanceOfPaymentsFredSeedCatalog.ts` | B |
| seed / verify 脚本 | `scripts/data-worker/seed-us-balance-of-payments.ts` / `verify-us-balance-of-payments.ts`，并注册 `seedCatalogRegistry.ts`、`package.json` | B |
| 发布包成员扩充 | `src/lib/data/scheduler/releasePackageCatalog.ts` | B |
| 模板 layout | `src/lib/data/usBalanceOfPaymentsAnalysisLayout.ts` | D |
| 模板注册 | `src/lib/data/macroPresetTemplates.ts` | D |
| 分析文档 | `docs/US_BALANCE_OF_PAYMENTS_ANALYSIS.md` | D |
| 框架 prompt | `.cursor/prompts/us-balance-of-payments-analysis-framework.md` | D |
| 负面清单更新 | `docs/specs/USED-INDICATORS.md` | E（仅验收通过后） |

---

## §6 验收清单

**数据（Agent B 完成后）**

- [x] 12 条原始指标全部创建 `Instrument`、`DataSubscription` 并完成历史回填
- [x] 补齐98条目录指标；BOP现行标准口径达到108条且无同义频率/季调/缩放副本
- [x] 108条官方FRED页面逐条核验，98条新增序列历史回填成功
- [x] 交易流序列覆盖 1999-Q1→2026-Q1；IIP 存量序列覆盖 2006-Q1→2026-Q1
- [x] `data:verify -- --catalog=us-balance-of-payments -- --db` 通过
- [x] 两个既有 BEA 发布包包含本维度新增成员，全部订阅的 `nextRunAt` 有值
- [x] 来源、FRED 数据源、`fetchAcquisition=known`、目录分类和发布包字段经专项 DB 校验完整；管理页需管理员会话，未在匿名页面重复验证
- [x] 未启动网页抓取，未重复实现已存在 FRED adapter

**模板（Agent D 完成后）**

- [x] 四图均渲染为 4 个 canvas；零轴、负值、stackGroup、单位和符号说明正确
- [x] 图 2 使用官方 `IEANLF`，符号说明严格为“正=净贷出、负=净借入”，未反向解释
- [x] 图 3 为交易流量、图 4 为期末存量，文案明确区分交易与估值变化
- [x] 模板介绍 Tab 显示 description、四段 chartIntroNotes 和分析顺序
- [x] 与现有美国全部内置模板零指标重复，对照 `USED-INDICATORS.md` 通过
- [x] docs / layout / prompt 三处指标、符号与口径一致
- [x] 新 layout 测试 2/2、`npx tsc --noEmit`、定向 ESLint 和 `npm run build` 通过
- [x] 未改动任何现有模板 id、migration 或 `MacroSection.tsx` 整体结构；仅做增量注册

补充：全仓 `npm run lint` 会扫描 `.claude/worktrees/*/.next` 生成物并报 35 个既有 webpack 规则错误；本次改动的 11 个 TypeScript/TSX 文件定向 ESLint 为 0 error，生产构建成功。`data:verify-catalog -- --db` 还报告 530 条全库既有 MANUAL/BULK 订阅问题，本维度 12 条专项校验全部通过且不在失败项内。

**当前阶段**

- [x] Agent A：完成框架、模板、候选指标、去重和本地入库盘点
- [x] 人工评审通过
- [x] Agent B：指标接入、历史回填、发布包与更新调度
- [x] Agent C：跳过（无抓取源）
- [x] Agent D：模板与文档实现
- [x] Agent E：端到端验收与负面清单更新
