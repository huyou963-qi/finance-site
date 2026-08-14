# Spec：美国宏观阶段—行业基本面—行业收益传导

> 本文件是 `/equity/sectors`「阶段传导实验室」的研究与产品单一事实来源。
> 当前已完成阶段 A、B、C、D1、D2、D3、E、F、G 与 H：研究口径、数据服务、API、单阶段传导面板、市值代理收益桥、三层历史事实闸门、严格端点重建、D1/D3 双轨对账、覆盖/无前视/性能/视觉总验收、Regime 的扩展窗口伪样本外检验、宏观 vintage 与不可回写真实前瞻账本，以及生产自动化与连续监控。后续观察与复评必须以本 Spec 为准，若实现中改变
> 时间对齐、数据可见性、聚合或归因口径，必须先回写本文件并重新评审。

---

## §0 元信息

| 字段 | 值 |
|------|----|
| dimension id | `us-sector-transmission` |
| 中文名 | 美国宏观阶段—行业基本面—行业收益传导 |
| 页面 | `/equity/sectors` |
| 状态 | `stage-g-live-ledger`（真实前瞻观察已启动） |
| 研究模式 | 历史复盘 + 近似 PIT 传导验证；不构成投资建议 |
| 数据审计日 | 2026-08-13 |
| 评审记录 | 2026-08-13：D3 完成严格端点与双轨对账；E 对 30 阶段、66 个响应、726 个行业行完成自动验收。最大响应 80.2KB，冷查询 p95 318.5ms，热命中低于计时分辨率；1440/822/390px 实页、URL 状态、模式/聚合/行业联动均通过。XLK 当前试点严格覆盖通过，历史阶段因缺少早期持仓/GICS 观察继续诚实回退 D1 |

### 0.1 阶段状态

| 阶段 | 内容 | 状态 | 停止门 |
|------|------|------|--------|
| A | 研究口径、数据字典、无前视规则、UI线框、API契约 | **已完成** | 本 Spec 人工确认 |
| B | 阶段聚合数据服务 + 三个代表阶段真实数据原型 | **已完成** | 数据逐项复算通过 |
| C | 单阶段传导面板 UI | **已完成** | 页面与交互验收通过 |
| D1 | 市值口径收益桥、实际分红贡献与显式残差 | **已完成** | 加总恒等式、覆盖与版本测试通过 |
| D2 | filing vintage、历史 GICS、ETF 历史权重的存储/摄入/覆盖闸门 | **已完成** | 三层约束、试点摄入与首尾闸门通过 |
| D3 | 用三层事实重建严格基本面与 ETF 权重收益桥 | **已完成** | 无前视回放、D1/D3 对账与残差稳定性通过 |
| E | 覆盖率、无前视、行业分类、性能与视觉总验收 | **已完成** | 生产构建 + 实页验收 |
| F | Regime 前瞻能力与样本外研究 | **已完成** | 独立研究报告 + 无前视/切分/API/视觉验收通过 |
| G | 宏观 vintage、月度信号冻结与到期评分账本 | **已完成** | insert-only 契约、首个真实快照、API/页面/实库验收通过 |

---

## §1 研究目标与边界

### 1.1 核心问题

> 在一个可复核的美国宏观历史阶段中，增长、通胀、政策与信用条件如何影响行业经营，
> 经营变化是否进入营收、利润、现金流和资产负债表，市场又如何通过估值提前或滞后定价，
> 最终形成怎样的行业绝对收益与相对 SPY 超额收益？

研究链固定为：

`历史事件/政策 → 月度 Regime → 行业经营条件 → 基本面变化 → 估值变化 → ETF 收益 → 理论是否兑现`

任何自动文案都只能解释这条链条中已经有数据支持的连接，不能把相关性写成因果。

### 1.2 三类信息必须分开

| 类型 | 定义 | 页面表现 |
|------|------|----------|
| 事实 | 官方事件、已披露财报、历史行情、已计算 Regime | 正文数值和时间轴 |
| 研究假设 | 某宏观变量影响某行业的传导机制 | 「理论受益」「理论压力」标签 |
| 研究判断 | 理论是否兑现、收益主要由何种机制驱动 | 规则生成结论，附计算依据 |

### 1.3 本模块要做

1. 把现有 30 个历史阶段与月度 `MacroRegime` 对齐。
2. 为 11 个 GICS 行业提供阶段初、阶段末和阶段内路径的基本面证据。
3. 同时显示行业 ETF 绝对收益、相对 SPY 超额收益与最大回撤。
4. 区分基本面驱动、估值驱动、共振、相对防御、理论未兑现和数据不足。
5. 明确价格领先或滞后基本面的时间关系。
6. 对所有结论显示数据覆盖率、可见性口径和分类口径。

### 1.4 本模块暂不做

1. 不把历史收益直接外推为下一阶段收益预测。
2. 不用当前季度数据或当前 PE 回填历史阶段。
3. 不在亏损或盈利穿越零时强行计算 PE 变化。
4. 不把公司中位数当成市值加权 ETF 的精确收益归因。
5. 不把 1998–2009 缺少的公司级 XBRL 数据补造成历史事实。
6. 不在阶段 A 改 Prisma、API、页面组件或生产数据。

---

## §2 现有数据审计

### 2.1 可复用资产

| 数据面 | 现有对象 | 本地覆盖（2026-08-13 审计） | 用途 |
|--------|----------|------------------------------|------|
| 历史阶段 | `SECTOR_HISTORICAL_PERIODS` | 1998-12 至今，30 段 | 结构性历史边界、事件和理论机制 |
| 宏观 Regime | `mds.macro_regime` | 2000-01 至 2026-07，319 期 | 阶段内月度增长/通胀路径 |
| 行业因子 | `mds.factor_sector_snapshot` | 2000-01 至 2026-07，82,127 行 | 行业中位数、P25/P75、覆盖率 |
| 季度基本面 | `mds.equity_fundamental_snapshot` | 42,836 条 Q；财季最早 2008-03；首披露最早 2009-04 | PIT 可见性与公司级基础数据 |
| 历史成分 | `mds.index_constituent` | 2000-01 至 2026-07，161,278 行 | T 时点标普 500 宇宙 |
| ETF 行情 | `mds.equity_daily_bar` + 复权层 | Sector SPDR 共同样本自 1998-12 | SPY/行业总收益、净值、回撤 |
| 因子装配 | `buildPitCrossSection` | 任意 T 取当时宇宙、可见财报、T 时点价格 | 阶段聚合和复算基础 |

### 2.2 指标实际可用起点

| 指标组 | 原始最早值 | 产品有效起点 | 原因 |
|--------|------------|--------------|------|
| ETF 收益、波动、动量 | 1998-12 / 2000-01 | 2000-01 | 共同交易样本与滚动窗口 |
| Regime | 2000-01 | 2000-01 | 月度网格已落库 |
| 基本面部分单项 | 2010-01 | 2012-01 | 2010–2011 用作 TTM 预热，覆盖率不足 |
| TTM 估值/现金流 | 2010-04 | 2012-01 | 需要连续四季并通过 240–300 天连续性检查 |
| 机构持仓 | 2013-05 | 2013-08 | 13F 披露窗口和环比需要上一期 |

### 2.3 已知局限

#### A. 财报版本局限

现有季度表通过 `firstReportedAt ≤ T` 控制历史时点可见性，但唯一键是
`symbol + period`，同一财季的后续重述会覆盖旧值。因此当前能力是：

- **发布日期安全**：T 之后首次披露的财季不会进入 T；
- **数值版本近似**：T 当时看到的原始值可能被后来重述值替代；
- 第一版必须标记「近似 PIT · 最新重述值」；
- 未建设 filing vintage 前不得标记「严格 PIT」。

#### B. 历史行业分类局限

历史指数成员是 PIT，但 `FactorSectorSnapshot` 的行业分组采用 `EquitySecurity` 当前 GICS。
公司历史上的行业迁移、并购和退市会造成分类偏差。第一版必须标记：

> 历史成员为 PIT；行业归属为现值 GICS 近似。

#### C. ETF 与公司聚合口径不同

行业 ETF 收益是可交易产品的市值加权结果；现有行业因子是公司中位数。中位数适合回答
「典型公司是否改善」，不能回答「ETF 的每一个百分点来自哪里」。在市值加权聚合建成前，
第一版只做解释性桥接，不做精确会计归因。

---

## §3 时间、可见性与比较规则

### 3.1 阶段时点

每个阶段固定派生四个时点：

| 记号 | 定义 | 用途 |
|------|------|------|
| `S` | 阶段定义开始日 | ETF 收益起点 |
| `E` | 阶段定义结束日；开放阶段取最新交易日 | ETF 收益终点 |
| `T0` | 严格早于或等于 S 的最近一个可用月末截面 | 阶段初基本面和估值 |
| `T1` | 早于或等于 E 的最近一个可用月末截面 | 阶段末「当时可见」状态 |
| `T2` | T1 后第一个完整财报确认窗口，默认 T1+120 日 | 后验兑现观察，禁止用于事前结论 |

若 S 或 E 位于月中，不能使用其后的月末截面。API 必须返回实际命中的 T0/T1，而不能只回传请求日期。

### 3.2 两种观察模式

| 模式 | 数据截止 | 默认 | 可用于预测力检验 |
|------|----------|------|------------------|
| `asOf` 当时可见 | `firstReportedAt ≤ T0/T1` | 是 | 是 |
| `realized` 后验兑现 | 允许观察到 T2 | 否 | 否，只能复盘 |

切换到 `realized` 时，页面必须显示醒目的「包含阶段结束后财报」提示。

### 3.3 收益口径

1. SPY 与行业 ETF 使用前复权日线，即含分红的总收益近似口径。
2. 起点取 `S` 当日或之后首个交易日；终点取 `E` 当日或之前最后交易日。
3. 区间内少于两个交易日返回 null。
4. ETF 晚于阶段上市返回 null，不得借用区间外样本。
5. `absoluteReturn = end / start - 1`。
6. `excessReturn = sectorReturn - spyReturn`；页面明确这是算术超额，不是对数超额。
7. 最大回撤使用同一阶段内归一化净值计算。

### 3.4 开放阶段

1. `E` 自动截断到最新可得 SPY 交易日。
2. `T1` 取最新已构建月频因子截面。
3. 卡片标记「开放阶段，排序仍在变化」。
4. 不把当前领先行业写成已完成周期结论。

---

## §4 指标字典

### 4.1 宏观与 Regime

| 字段 | 来源 | 频率 | 页面用途 | 约束 |
|------|------|------|----------|------|
| `regime` | `MacroRegime.regime` | 月 | 水平×通胀动量象限 | 与 Dalio 象限分开 |
| `dalioRegime` | `MacroRegime.dalioRegime` | 月 | 增长方向×通胀方向色带 | UI 默认使用此色带 |
| `growthState` | `MacroRegime.growthState` | 月 | 增长高/低状态 | 不等同 GDP 正负增长 |
| `growthDirection` | `MacroRegime.growthDirection` | 月 | 增长改善/恶化方向 | 允许 null |
| `inflationState` | `MacroRegime.inflationState` | 月 | 通胀上/下方向 | 说明输入及阈值 |
| `recession` | NBER 真值 overlay | 月 | 历史衰退背景 | 只作复盘，不参与可交易 Regime |
| `inputs` | `MacroRegime.inputs` | 月 | 展开查看分类依据 | UI 默认折叠 |

阶段摘要同时返回：每种 Regime 月数、占比、转移次数、首月、末月和最长连续段。

### 4.2 行业基本面

| 指标 | factorKey | 单位 | T0/T1 展示 | 变化 | 主要解释 |
|------|-----------|------|------------|------|----------|
| 营收同比 | `revenueYoY` | % | 中位/P25/P75 | T1−T0，百分点 | 终端需求与定价 |
| 营收加速度 | `revenueAccel` | pct pt | 中位 | T1−T0 | 增长边际变化 |
| EPS 同比 | `epsYoY` | % | 中位/P25/P75 | T1−T0，百分点 | 盈利弹性 |
| 毛利率 | `grossMargin` | % | 中位 | T1−T0，bp | 产品定价与投入成本 |
| 营业利润率 | `opMargin` | % | 中位 | T1−T0，bp | 经营杠杆 |
| ROE TTM | `roeTtm` | % | 中位 | T1−T0，bp | 盈利质量与资本效率 |
| 现金含量 | `ocfToNetIncome` | 倍 | 中位 | T1−T0 | 盈余质量 |
| 应计比率 | `accrualsToAssets` | % | 中位 | T1−T0 | 高值代表利润现金质量较弱 |
| 资产负债率 | `debtToAssets` | % | 中位 | T1−T0，bp | 信用与再融资脆弱性 |

默认矩阵只显示：营收同比、EPS 同比、营业利润率；其余放入行业详情，避免一屏过载。

### 4.3 估值与现金回报

| 指标 | factorKey | 默认显示 | 规则 |
|------|-----------|----------|------|
| 盈利收益率 E/P | `earningsYield` | 是 | 主估值指标；允许负值，但负值不倒数为 PE |
| 销售收益率 S/P | `salesYield` | 详情 | 盈利不稳定行业的替代观察 |
| FCF 收益率 | `fcfYield` | 详情 | 现金流估值 |
| OCF/EV | `ocfToEv` | 详情 | 资本结构影响 |
| 股息率 | `dividendYield` | 详情/归因 | 防御与收益贡献 |
| 账面收益率 B/P | `bookYield` | 金融/地产详情 | 不作为所有行业统一核心指标 |

页面可在 E/P>0 时显示辅助 PE=`1/E/P`，但排序、聚合和变化计算均以 E/P 为准，避免负 PE 失真。

### 4.4 市场结果

| 指标 | 口径 | 矩阵显示 |
|------|------|----------|
| SPY 总收益 | S→E 前复权 | 阶段基准 |
| 行业总收益 | S→E 前复权 | 是 |
| 相对 SPY 超额 | 行业−SPY | 是，默认排序 |
| 最大回撤 | 阶段内净值峰谷 | 详情 |
| 收益领先月数 | 超额趋势拐点与基本面确认点之差 | 阶段 D；必须显示算法 |
| 理论兑现状态 | 理论受益集合 vs 实际结果 | 是 |

### 4.5 覆盖率

每一个基本面/估值指标必须伴随：

- `sampleCount`：有值公司数；
- `coverage`：有值公司数 / T 时点该行业有价格的历史成分数；
- `p25/p75`：行业内部离散度；
- `asOf`：实际截面日期；
- `classificationMode`：`current-gics-approx` 或未来的 `historical-gics`；
- `vintageMode`：`latest-restated-asof-visible` 或未来的 `strict-filing-vintage`。

---

## §5 聚合与缺失值规则

### 5.1 第一版聚合

阶段 B 第一版只开放 `median`：直接复用 `FactorSectorSnapshot` 的 median/P25/P75/coverage。
这回答「典型公司与行业广度如何变化」。

### 5.2 市值加权聚合

阶段 D1 开放 `capWeighted`。实现直接读取已经由 `buildPitCrossSection` 构建并持久化的
`FactorSnapshot`，其中 `logMarketCap` 是 T 时点 PIT 市值。不得用“公司 PE 的市值加权平均”作为行业 PE：

- 行业总市值=`Σ exp(logMarketCap)`；
- 行业总盈利=`Σ (earningsYield × PIT marketCap)`；
- 行业 E/P=`行业总盈利 / 行业总市值`；
- 行业 P/E 仅在总盈利>0时=`行业总市值 / 行业总盈利`；
- TTM 营收、FCF 与分红同理由 `salesYield`、`fcfYield`、`dividendYield` 乘 PIT 市值后求和；
- 营收同比、盈利同比和利润率在 D1 仍是 PIT 市值加权公司指标，页面必须明确标注，不能称为行业总量同比；
- `coverage` 改为有效公司 PIT 市值 / 已知行业 PIT 市值；
- ETF 历史权重、成分变动、股本变化和当前 GICS 近似造成的不可比部分进入残差。

选择持久化月度因子而不是请求时重建两个完整截面，是因为两者无前视口径相同，而前者可把冷请求从约 12 秒降到约 1 秒。定义版本升级为 `2026-08-13.d1`。

### 5.3 D3 严格 ETF 持仓聚合

通过三层事实闸门的单一行业按以下规则整体替换 D1：

1. T0、T1/T2 分别选择不晚于 T 且滞后不超过 7 日的 ETF 持仓；
2. 成分必须命中 T 时点有效且置信度≥0.8 的 GICS，行业必须与 ETF 对应；
3. 每个 `symbol+period` 只选择 `filedAt≤T` 的最后 accession；
4. 财务因子继续复用同一 `computeTtm` 连续性、财报陈旧、股本和价格质量约束；
5. 公司指标按 ETF 权重聚合，coverage=有值 ETF 权重/全部持仓权重；
6. 任一端任一事实层未通过时，该行业首尾两端全部保留 D1，不允许部分拼接；
7. 活动口径与 D1 基线同时写入 `strictAudit`，用于指标差与收益桥残差对账。

定义版本升级为 `2026-08-13.d3`。严格重建能力已完成，但历史阶段能否实际启用取决于首尾真实数据覆盖，不因代码完成而伪造 A 级结果。

### 5.4 缺失处理

1. 不插值季度财务指标。
2. T0/T1 某指标缺失时，该指标变化为 null。
3. 行业样本少于 3 不落结论。
4. `coverage < 60%` 时不生成驱动标签，只显示「覆盖不足」。
5. 亏损或 E/P≤0 时不显示 PE 和 PE 变化。
6. 只有一个行业有值时不计算跨行业标准分。
7. null 永远排在有值行业之后，但仍固定显示全部 11 行业。

---

## §6 解释性归因与标签规则

### 6.1 第一版不是精确会计分解

第一版采用三组证据：

- `F` 基本面变化：营收同比、EPS 同比、营业利润率的行业相对变化；
- `V` 估值变化：E/P 变化所隐含的估值扩张/收缩；
- `R` 市场结果：相对 SPY 超额收益。

为避免不同指标单位混用，F/V 都在同一阶段的 11 行业横截面内做稳健标准化：

1. 计算行业 T1−T0 变化；
2. 对有值行业做 median/MAD 标准化；
3. 单项截断到 ±3；
4. `F` 为可用基本面单项 z 的等权平均；少于 2 项则 F=null；
5. `V` 以 `ln(E/P_T0 / E/P_T1)` 表示估值扩张，要求两端 E/P>0；
6. R 保留真实超额收益，不强行 z 化展示。

### 6.2 标签阈值

以下阈值已在阶段 B 三个原型上验证，并以 `definitionsVersion=2026-08-13.b1` 锁定；后续修改须升级版本并重跑验收：

| 条件 | 标签 |
|------|------|
| F≥0.5 且 V≥0.5 且 R>0 | 盈利与估值共振 |
| F≥0.5 且 -0.5<V<0.5 且 R>0 | 基本面驱动 |
| -0.5<F<0.5 且 V≥0.5 且 R>0 | 估值驱动 |
| F≥0.5 且 V≤-0.5 且 R>0 | 盈利抵消估值收缩 |
| F≤-0.5 且 V≥0.5 且 R>0 | 预期先行，基本面尚未兑现 |
| F≤-0.5 且 R<0 | 基本面恶化 |
| 行业属防御、绝对收益<0但R>0 | 相对防御有效 |
| 理论受益且 R≤0 | 理论未兑现 |
| coverage<60% 或 F=null | 数据不足，不归因 |

任何标签都必须返回 `evidence[]`，列出触发字段、数值和阈值；UI 点击标签可展开。

### 6.3 理论兑现

历史阶段定义中的 `expectedLeaders` 是事前机制假设，不随实际收益重写。

| 状态 | 条件 |
|------|------|
| `confirmed` | 理论受益行业实际超额>0且进入可比行业前 3 |
| `partial` | 理论受益行业超额>0但未进入前 3，或基本面改善但收益未领先 |
| `rejected` | 有充分数据且超额≤0、基本面也未改善 |
| `inconclusive` | ETF或基本面覆盖不足 |

### 6.4 阶段 D 精确归因目标

阶段 D1 实际采用可加总的对数收益桥：

`ln(1+总收益) = 基本面贡献 + 估值贡献 + 股息贡献 + 残差`

其中：

1. `基本面贡献 = ln(Flow_T1 / Flow_T0)`；Flow 优先为行业总 TTM 盈利。
2. `估值贡献 = ln[(MCap/Flow)_T1 / (MCap/Flow)_T0]`。
3. `股息贡献 = ETF 对数总回报 − ETF 对数价格回报`；总回报用 `adjClose`，价格回报用仅拆股调整的 `close`，因此是阶段内实际 ETF 分红贡献，不使用年化股息率近似。
4. `残差 = ETF 对数总回报 − 基本面 − 估值 − 股息`，不强行分摊。
5. 盈利任一端非正或市值覆盖<60%时，依次回退 TTM 营收、TTM FCF；仍不满足则停止分解。

残差来源包括 ETF 权重与 S&P 500 公司集合差异、成分调整、股本变化、当前 GICS 近似、ETF 费用及 S/E 与 T0/T1 的时间错位。残差不是 alpha，也不是可交易预测。

D3 在严格行业上改用匹配成分桥：只保留首尾都存在且流量为正的公司，使用归一化起点 ETF 权重计算公司流量增长与估值倍数变化；首尾匹配权重均须≥60%。ETF 总回报、实际分红和残差定义不变。因为权重固定在起点，调仓、新增/移除成分、未匹配持仓、费用与时间错位仍进入残差，所以 D3 是更严格的解释桥，不冒充逐日持仓会计归因。

---

## §7 数据可信度分级

### 7.1 多维质量字段

API 不只返回一个总等级，还必须返回：

```ts
type DataQuality = {
  overall: "A" | "B" | "C" | "D" | "macro-only";
  fundamentalCoverage: number | null;
  vintageMode: "latest-restated-asof-visible" | "strict-filing-vintage" | "none";
  classificationMode: "current-gics-approx" | "historical-gics" | "none";
  aggregationMode: "median" | "cap-weighted";
  weightMode: "historical-etf-holdings" | "market-cap-proxy" | "none";
  strictPipelineApplied: boolean;
  factLayers: {
    filingVintage: FactLayerGate;
    historicalClassification: FactLayerGate;
    etfHoldings: FactLayerGate;
  } | null;
  warnings: string[];
};
```

### 7.2 当前等级规则

| 区间/条件 | 等级 | 允许结论 |
|-----------|------|----------|
| 1998–2009 | `macro-only` | 宏观、Regime、ETF收益；不显示公司级基本面 |
| 2010–2011 或覆盖<75% | D | 只显示方向和覆盖，不生成强归因 |
| 2012–2017 且覆盖≥75% | C | 近似PIT、中位数解释性归因 |
| 2018+且覆盖≥90% | B | 较高覆盖的近似PIT归因 |
| strict vintage + historical GICS + 高覆盖 | A | 严格PIT归因；当前尚不可达到 |

只要仍使用当前 GICS、最新重述值或市值代理权重，整体等级最高为 B。D2 的闸门通过只代表数据就绪；`strictPipelineApplied=false` 时不得升级 A。

---

## §8 页面与交互规格

### 8.1 插入位置

传导面板位于：

`历史净值主图 → 传导面板 → 30张历史阶段卡 → 其他行业内容`

未选择阶段时不显示大面板，只显示一条引导：「选择下方阶段，查看宏观到行业收益的传导验证」。

### 8.2 面板结构

```text
┌ 阶段标题 / 日期 / 数据等级 / asOf-realized 切换 ┐
│ 宏观摘要：增长、通胀、政策、信用               │
├ Regime 月度色带 + 关键事件 + SPY/选中行业超额 ┤
├ 11行业矩阵：成长 | 周期 | 防御                 ┤
│ 行业  营收  EPS  利润率  E/P  收益  超额  标签 │
├ 选中行业详情                                   ┤
│ 基本面路径 | 估值路径 | 收益路径 | 证据与风险  │
└ 口径、覆盖率、实际T0/T1、数据警告              ┘
```

### 8.3 视觉规则

1. 行业顺序固定：成长 → 周期 → 防御；组内顺序沿用 `STYLE_BUCKETS`。
2. 矩阵默认按风格固定顺序，不按收益重排；提供「按超额排序」按钮。
3. Regime 颜色固定且全站一致：复苏绿、过热橙、滞胀红、衰退式蓝、未知灰。
4. 正负数颜色继续沿用现有站点，但不能只依赖颜色表达，必须保留正负号。
5. 第一列和表头在横向/纵向滚动时固定。
6. 覆盖不足使用灰色斜纹/空心标识，不用红色，避免把缺数误读为利空。
7. `asOf` 为默认；`realized` 切换采用琥珀提示条。
8. 页面保持全宽，桌面优先；窄屏以横向滚动保证不压缩数据列。

### 8.4 联动规则

1. 点击阶段卡：选中阶段、主图缩放、加载该阶段传导面板。
2. 点击行业行：主图确保 SPY 与该 ETF 可见；详情切换到该行业。
3. ETF 按钮关闭某行业不应清空详情，只影响主图曲线。
4. URL 参数保存 `stage`、`sector`、`mode`，支持刷新和分享。
5. 已加载阶段在客户端缓存；重复点击不重新请求。

### 8.5 自动文案约束

自动摘要使用规则模板而非自由生成，结构固定为：

> 【事实】该行业营收/利润率/估值如何变化；
> 【判断】收益更符合哪种驱动；
> 【风险】覆盖率、分类或版本口径有什么限制。

单行业摘要最多三句，禁止使用“必然、证明、确定、未来将”等确定性表述。

---

## §9 阶段 B API 契约

### 9.1 Endpoint

`GET /api/equity/sector-history/stages/:stageId/transmission`

Query：

| 参数 | 值 | 默认 | 阶段 B 支持 |
|------|----|------|-------------|
| `mode` | `asOf | realized` | `asOf` | 两者；realized带警告 |
| `aggregation` | `median | capWeighted` | `median` | 两者均开放；默认保持 median |
| `sector` | GICS sector slug | 无 | 可选，仅影响详情预选 |

### 9.2 Response Type

```ts
type SectorStageTransmissionResponse = {
  stage: {
    id: string;
    label: string;
    start: string;
    end: string;
    t0: string | null;
    t1: string | null;
    t2: string | null;
    open: boolean;
  };
  mode: "asOf" | "realized";
  aggregation: "median" | "capWeighted";
  macro: {
    summary: { growth: string; inflation: string; policy: string; credit: string };
    regimePath: Array<{
      date: string;
      regime: string;
      dalioRegime: string | null;
      growthState: string;
      growthDirection: string | null;
      inflationState: string;
      recession: number;
    }>;
    composition: Record<string, { months: number; share: number }>;
    transitions: number;
  };
  benchmark: {
    etf: "SPY";
    return: number | null;
    startTradeDate: string | null;
    endTradeDate: string | null;
  };
  sectors: Array<{
    sector: string;
    slug: string;
    nameZh: string;
    etf: string;
    style: "growth" | "cyclical" | "defensive";
    expectedLeader: boolean;
    fundamentals: Record<string, {
      start: number | null;
      end: number | null;
      delta: number | null;
      p25Start: number | null;
      p75Start: number | null;
      p25End: number | null;
      p75End: number | null;
      coverageStart: number | null;
      coverageEnd: number | null;
      sampleStart: number | null;
      sampleEnd: number | null;
    }>;
    market: {
      absoluteReturn: number | null;
      priceReturn: number | null;
      excessVsSpy: number | null;
      maxDrawdown: number | null;
    };
    returnBridge: null | {
      available: boolean;
      method: "market-cap-total" | "etf-holdings-matched-start-weight";
      basis: "earnings" | "sales" | "cashFlow" | null;
      totalLogReturn: number | null;
      fundamentalContribution: number | null;
      valuationContribution: number | null;
      dividendContribution: number | null;
      residual: number | null;
      coverage: number | null;
      holdingSnapshotStart: string | null;
      holdingSnapshotEnd: string | null;
      warnings: string[];
    };
    strictAudit: {
      eligible: boolean;
      applied: boolean;
      activeMethod: "median" | "market-cap-proxy" | "historical-etf-holdings";
      fallbackReason: string | null;
      holdingSnapshotStart: string | null;
      holdingSnapshotEnd: string | null;
      metricDeltaVsD1: Record<"revenueYoY" | "epsYoY" | "opMargin" | "earningsYield", number | null>;
      bridgeResidual: { d1: number | null; strict: number | null; delta: number | null };
    };
    attribution: {
      fundamentalScore: number | null;
      valuationScore: number | null;
      label: string | null;
      evidence: Array<{ metric: string; value: number; threshold: number; message: string }>;
    };
    theoryValidation: "confirmed" | "partial" | "rejected" | "inconclusive";
    quality: DataQuality;
  }>;
  quality: DataQuality;
  definitionsVersion: string;
};
```

### 9.3 错误与降级

| 场景 | 行为 |
|------|------|
| 未知 stageId | 404 |
| 阶段早于 Regime 覆盖 | 返回阶段和收益；regimePath=[]并警告 |
| 阶段早于基本面覆盖 | 返回 `macro-only`，fundamentals值为null |
| 某行业ETF未上市 | 该行业仍返回，market=null |
| 某指标覆盖不足 | 指标保留，attribution 不使用该项 |
| 非法 aggregation | 400，错误码 `INVALID_AGGREGATION` |
| 数据库不可用 | 503，不返回伪造默认值 |

### 9.4 性能与缓存

1. 单阶段 API 不读取全历史全部 ETF；只读 S→E 范围与必要回撤预热。
2. Regime 和行业因子使用日期范围批量查询，禁止 11×指标 N+1。
3. 服务端缓存键包含：stageId、mode、aggregation、definitionsVersion、数据最大日期。
4. 客户端缓存已访问 stageId。
5. 目标：缓存命中 <200ms；本地冷查询 <1s；单阶段 JSON <150KB。

阶段 D1 实测三个原型 JSON 约 60KB；市值口径冷查询约 1 秒，服务端缓存命中低于 200ms。不同机器与数据库负载下允许波动，验收脚本不硬编码墙钟时间。

---

## §10 阶段 B 实现边界

### 10.1 计划新增

| 文件 | 职责 |
|------|------|
| `src/lib/equity/sectorStageTransmission.ts` | 时间对齐、批量查询、聚合与响应装配 |
| `src/lib/equity/sectorStageAttribution.ts` | 纯函数归因、标签与理论验证 |
| `src/app/api/equity/sector-history/stages/[stageId]/transmission/route.ts` | API 参数、错误与缓存 |
| `src/lib/equity/sectorStageTransmission.test.ts` | 时点、覆盖、缺失和无前视测试 |
| `src/lib/equity/sectorStageAttribution.test.ts` | 标签阈值和边界测试 |
| `docs/US_EQUITY_SECTOR_TRANSMISSION.md` | 数据口径与研究使用说明 |

### 10.2 阶段 B 不做

- 不改 Prisma schema；
- 不新增财报版本表；
- 不新增历史 GICS 表；
- 不改 `HistoricalSectorRotation` 页面布局；
- 不删除当前底部基本面表；
- 不实现 capWeighted；
- 不实现前瞻预测。

---

## §11 三个代表阶段原型

阶段 B 先只产出三个真实 API 样例，口径通过后再覆盖全部阶段。

### 11.1 2018 同步紧缩、贸易摩擦与增长下修

验证重点：

- 高利率/QT/贸易摩擦是否对应增长和利润率下修；
- 防御行业是基本面更稳，还是仅相对估值/风险偏好占优；
- 绝对收益为负时能否正确表达「相对防御」。

不得预设防御行业一定第一，最终只按数据输出。

### 11.2 2020 政策救援与居家经济

验证重点：

- Regime 快速切换能否正确显示；
- 科技/通信的价格是否领先财报确认；
- asOf 与 realized 是否能明显区分；
- 极短阶段与财报季频错位如何展示。

### 11.3 2023 SVB、BTFP 与 AI

验证重点：

- 金融信用压力和系统流动性托底能否同时表达；
- 科技/通信基本面改善与估值扩张能否分开；
- 11 行业完整返回与高覆盖阶段的标签是否稳定。

### 11.4 原型验收输出

每个阶段必须交付：

1. 原始 API JSON；
2. 人工复算表（T0/T1日期、3个核心基本面、E/P、SPY与ETF收益）；
3. 自动标签与逐条证据；
4. 数据覆盖及全部 warnings；
5. 一段不超过三句的规则摘要；
6. 明确指出理论与实际不一致之处。

---

## §12 验收清单

### 12.1 阶段 A（本轮）

- [x] 核心问题与研究链冻结
- [x] 事实/假设/判断分离规则冻结
- [x] S/E/T0/T1/T2 时间规则冻结
- [x] asOf/realized 双模式冻结
- [x] ETF收益与缺失样本规则冻结
- [x] 宏观、基本面、估值、市场指标字典冻结
- [x] 中位数与市值加权职责分离
- [x] 财报重述与历史GICS风险显式记录
- [x] 数据可信度分级冻结
- [x] UI结构、联动和视觉规则冻结
- [x] 阶段 B API 契约冻结
- [x] 三个代表阶段原型及停止门冻结
- [x] 人工确认阶段 A，授权进入阶段 B

### 12.2 阶段 B

- [x] 30个 stageId 均能解析；3个原型返回完整数据
- [x] T0/T1 均为请求时点之前最近可用截面
- [x] 上游 `buildPitCrossSection` 显式剔除 `firstReportedAt > T` 数据
- [x] API 只读已持久化的历史截面；未来首次披露财报不会自动进入过去截面
- [x] 1998–2009 返回 macro-only，不生成基本面结论
- [x] 11行业固定返回，缺失为 null，不删除行业
- [x] 覆盖<60%不生成强归因标签
- [x] ETF收益与现有区间收益复算一致
- [x] 标签附 evidence，人工可逐条复算
- [x] 三个代表阶段样例经人工评审并写入研究文档
- [x] `npx tsc --noEmit`、定向 ESLint、专项测试、生产构建通过

### 12.3 阶段 C

- [x] 选择阶段后才展开传导面板；未选择时仅显示轻量引导
- [x] Regime、事件、行业矩阵和行业详情完整
- [x] 风格顺序为成长→周期→防御，并提供按超额排序切换
- [x] asOf默认、realized有强提示且切换 T1/T2 数据
- [x] 覆盖率、实际T0/T1/T2、定义版本、口径和风险可见
- [x] URL状态、客户端缓存、键盘和窄屏内部横向滚动可用
- [x] 点击行业确保主图显示 SPY 与该 ETF；关闭主图曲线不清空详情
- [x] 页面刷新保留 `stage`、`sector`、`mode`，未破坏主图和阶段卡交互

### 12.4 阶段 D1

- [x] API 开放 `aggregation=capWeighted`，默认仍为 `median`
- [x] 市值、盈利、营收、FCF 与分红使用 T 时点持久化 PIT 因子批量聚合
- [x] 行业 E/P 由总盈利/总市值计算，不平均公司 PE
- [x] ETF 实际分红贡献由 `adjClose` 与 `close` 的对数收益差计算
- [x] 收益桥四项精确加总到 ETF 对数总回报
- [x] 盈利非正或覆盖不足时按营收→FCF 降级，仍不足则停止分解
- [x] 残差始终展示；绝对值≥10pp 时出现强警告
- [x] UI 支持 `median/capWeighted × asOf/realized`，URL 刷新恢复
- [x] 390px 窄屏下收益桥纵向排列，矩阵继续组件内横向滚动
- [x] 明确标记近似 PIT、当前 GICS、非 ETF 历史权重，质量等级最高仍为 B

### 12.5 阶段 D2

- [x] SEC filing vintage 按 accession/filedAt 保存并可在任意 T 回放
- [x] 历史 GICS 有效期表、重叠校验与来源/置信度字段
- [x] Sector ETF 每日持仓归档、带日期历史文件导入与权重校验
- [x] 三层首尾覆盖闸门与明确降级原因

### 12.6 阶段 D3

- [x] 严格端点只选择 `filedAt≤T` 的最后版本
- [x] 严格端点只命中 T 时点有效的 GICS，SEC SIC 不冒充 GICS
- [x] 公司指标按 ETF 实际权重聚合，coverage 按 ETF 权重计算
- [x] 严格收益桥使用首尾匹配成分与起点 ETF 权重
- [x] 单行业全有或全无切换，不混用 D1/D3 端点
- [x] `strictAudit` 返回活动方法、首尾持仓/filing 日期、回退原因和 D1/D3 对账

### 12.7 阶段 E

- [x] 30 阶段 × median/capWeighted 及 3 个代表阶段 realized 自动验收
- [x] 66 响应、726 行业行覆盖率、日期边界、分类、降级和收益桥恒等式通过
- [x] 当前 XLK 严格试点无前视、覆盖门槛和定价有效性通过
- [x] 历史分类无反向区间、无重叠、无重复开放区间
- [x] 最大 JSON 80.2KB，低于 150KB；冷查询 p95 318.5ms，热命中 <200ms
- [x] HTTP 200/400/404、错误码、缓存头和 11 行业契约通过
- [x] 1440px、默认宽度、390px 无页面级横向溢出；矩阵仅组件内滚动
- [x] asOf/realized、median/capWeighted、排序、行业—主图联动与 URL 刷新恢复通过
- [x] 全量测试、TypeScript、定向 ESLint、生产构建与实页控制台通过

---

## §13 已完成事实层与阶段 F 后续升级

### 13.1 严格财报版本

新增独立版本表，不覆盖现有当前快照。建议唯一键包含：

`symbol + period + accession + filedAt`

必须保存 form、fiscalDate、首次/修订标记及标准化财务字段。T 时点只能选择 `filedAt ≤ T`
的最新版本。SEC companyfacts/submissions 提供 accession 与 filed date，可作为事实来源。

### 13.2 历史行业分类

建议新增 `EquitySectorClassificationHistory`：

`symbol, sector, industry, validFrom, validTo, source, confidence`

在可靠历史 GICS 来源不可得时，允许使用 SEC SIC 作为辅助但不能冒充 GICS。

### 13.3 Regime 前瞻检验

严格区分：

- T 时可见 Regime；
- T+3/6/12月行业超额收益；
- T+1/2/4季基本面变化；
- unconditional、regime-only、regime+valuation、regime+fundamental 四组对照；
- 训练、验证、2020+样本外测试；
- 报告样本数、置信区间、命中率、IC、最大回撤与换手。

阶段 F 的研究结论不得反向修改历史阶段边界或理论受益行业。

### 13.4 阶段 F 已实现口径与结论

- 月度信号从 2000-01 起，Regime 有效 316 期；行业因子原始行从 2010-01 起，但估值/基本面增强层严格从 2012-01 才启用，2010–2011 只作 TTM 预热。
- 训练使用扩展窗口，只有 `labelEnd≤T` 的结果可进入 T 时估计。
- 训练集截至 2014-12，验证集 2015–2019，测试集从 2020-01 起；跨切分边界的未完成标签 purge，不进入模型选择。
- 固定对照为 unconditional、Regime、Regime+估值、Regime+基本面；增强层固定 50/50，不用测试集调权。
- 3/6/12 月重叠收益的 IC 均值区间采用 Newey–West，滞后阶数为 `horizon−1`。
- 只有 3 月 Regime+基本面在验证集平均 IC 为正并获锁定；6/12 月没有候选通过验证门槛，保留 Regime 基线仅作失败复核。
- 2020+ 测试集中三种前瞻期均未同时通过 IC 区间、Top 3 超额与命中率门槛，总结论为「样本外不支持」。
- Regime 对未来 1/2/4 季基本面变化同样未形成一致证据；不可把当前模型排序写成预测收益或投资建议。
- 因底层宏观输入使用最新修订值而非 ALFRED/实时 vintage，证据等级固定为 C，表述为「回溯式伪样本外」。

### 13.5 阶段 G 已实现契约

- `MacroObservation` 继续作为最新值快表；`MacroObservationVintage` 按 `instrument+obsDate+availableAt` 只追加版本。
- FRED 输入用官方 real-time period / `output_type=3` 回填新增与修订；ISM 从 worker 捕获日起留痕，历史缺口必须显示。
- 预测快照唯一键为 `signalDate+modelVersion`；保存完整输入、预注册规则与 SHA-256，不提供 update 路径。
- 数据归属月与计分起点分离；计分从冻结日次日起第一根可得收盘开始，绝不使用冻结前已发生行情。
- 逐行业结果只在 `evaluatedAt IS NULL` 时一次性写入；数据库约束要求六个结果字段要么全空、要么全齐。
- 3/6/12 月分别到期；只有阶段 F 验证通过的期限进入主要证据，其余保留作失败复核。
- 过程完整性为 B、统计推断保持 C；至少 36 个独立月度冻结信号后才进入正式复评，不自动升级。

### 13.6 阶段 H 已实现契约

- 日常任务只编排已有 FRED Adapter、Vintage writer、MacroRegime、行业因子与行情查询服务，不建立平行底层。
- ALFRED 日常拉取使用 45 天 realtime window；全历史命令仅用于首次回填或明确维护窗口。
- 首次运行允许把当前快表中已可见、但版本账本尚无同值记录的值追加为 `stage_h_bootstrap`；`availableAt` 必须取真实执行时刻，禁止倒填成发布日期或伪造历史版本。
- 每次成功运行持久化 heartbeat；独立 monitor 必须能在日常任务完全缺跑时告警。
- 告警固定覆盖任务缺跑、最新观测 Vintage 缺口/值不一致、冻结哈希漂移、已到期结果缺价四类。
- 相同告警指纹按冷却期抑制；通知复用 `DATA_LAG_*` Slack/Webhook transport，无第二套 webhook 配置。
- 生产 cron 必须 `flock` 防重入；部署只安装 cron 定义，不在部署会话执行外部拉取。
- 未取得 ISM 书面授权前，不自动下载或归档其报告内容；ISM 历史只能继续 live capture，不得伪造版本。
- A–H 工程完成后进入观察期；复评前不得修改阶段 F 门槛、模型版本或历史理论标签。

---

## §14 研究来源

1. SEC EDGAR API：Company Facts、Company Concept、Frames 与 Submissions 的官方说明：
   <https://www.sec.gov/search-filings/edgar-application-programming-interfaces>
2. Federal Reserve：企业利息覆盖率、融资约束与货币政策传导：
   <https://www.federalreserve.gov/econres/notes/feds-notes/information-in-interest-coverage-ratios-of-the-us-nonfinancial-corporate-sector-20190110.html>
3. Federal Reserve：2022–2023紧缩向企业债务成本传导：
   <https://www.federalreserve.gov/econres/notes/feds-notes/monetary-policy-tightening-and-debt-servicing-costs-of-nonfinancial-companies-20231201.html>
4. Campbell（NBER）：股票收益的现金流消息与预期收益变化分解：
   <https://www.nber.org/papers/w3246>
5. 本仓库 PIT/因子口径：`docs/QUANT_PHASE1_FACTORS.md`、
   `src/lib/quant/pitCrossSection.ts`、`src/lib/quant/macroRegime.ts`。
