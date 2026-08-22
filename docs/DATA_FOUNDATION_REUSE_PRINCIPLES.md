# 数据底层复用与单一事实源设计原则

> 状态：Accepted（2026-08-13）  
> 适用范围：宏观、量化、美股行情、美股行业、历史回测、PIT/Vintage 与后续新增研究功能。

## 1. 目标

项目只维护一套可复用的数据底座。页面和研究功能可以有不同的派生模型与展示方式，但不得为同一来源、同一业务事实再次建立平行抓取器、平行事实表或含义相近却无法对账的计算链。

核心原则：

1. **一个外部来源只对应一个 Source Adapter**：协议、认证、限速、分页、重试和源字段解析只能在 adapter 中实现。
2. **一个事实只对应一个 canonical fact store**：业务模块不得复制行情、宏观观测、因子、行业分类或基本面事实。
3. **一个写入语义只对应一个 writer/service**：幂等键、append-only、修订覆盖和事务边界集中管理。
4. **多个消费者共享查询与计算服务**：量化页面、宏观页面和行业页面不得各自重写 as-of、交易日对齐、复权或 Regime 算法。
5. **新表必须表达新的事实语义**：缓存、版本账本、预测冻结和事后评分可以单独建表，但必须写清与现有事实表的主从关系及不可替代性。

## 2. 分层架构

```text
外部官方/市场数据
        ↓
Source Adapter（协议、限速、解析）
        ↓
Scheduler / Ingest Service（调度、日志、重试、编排）
        ↓
Canonical Fact Store（唯一事实源）
        ↓
Shared Query / As-of / Adjustment Service
        ↓
Derived Model（Regime、因子、传导、预测）
        ↓
API / 页面
```

禁止从页面、API route 或某个专题研究模块直接跨层实现外部抓取与事实写入。

## 3. 当前 canonical 底座

| 业务事实 | Canonical 存储 | 统一能力 | 主要消费者 |
|---|---|---|---|
| 宏观当前最新值 | `mds.MacroObservation` | scheduler + `upsertMacroObservations` | 宏观页面、量化 Regime |
| 宏观可见版本 | `mds.MacroObservationVintage` | `appendMacroObservationVintages` | PIT 查询、信号审计 |
| FRED/ALFRED 协议 | 不单独落表 | `scheduler/adapters/fredAdapter.ts` | 普通增量、版本回填 |
| 美股日线 | `mds.EquityDailyBar` | `equityPriceStore.ts` | 行情、量化、行业收益、预测评分 |
| 拆股与复权 | `mds.EquitySplit` | `priceAdjustment.ts` / `equityPriceStore.ts` | 所有收益计算 |
| 月频 Regime | `mds.MacroRegime` | `quant/macroRegime.ts` | 量化与行业研究 |
| 个股因子 | `mds.FactorSnapshot` | 量化因子流水线 | 回测、筛选、行业聚合 |
| 行业因子 | `mds.FactorSectorSnapshot` | 量化行业因子流水线 | 行业传导与前瞻研究 |
| GICS 当前定义 | `mds.EquitySecurity` + `GICS_SECTOR_DEFS` | equity 公共定义 | 所有行业页面 |
| GICS 历史事实 | `mds.SectorClassificationHistory` | 历史分类服务 | 严格历史重建 |
| SEC 财报版本 | `mds.EquityFundamentalVintage` | filing vintage 服务 | PIT 基本面 |
| ETF 历史持仓 | `mds.SectorEtfHolding` | ETF holdings 服务 | 严格行业端点 |

`MacroObservationVintage` 与 `MacroObservation` 不是两套同类底层：前者是 append-only 的版本事实账本，后者是供日常查询使用的最新值投影。二者必须通过统一写入服务保持一致。

`SectorRegimeSignalSnapshot` / `SectorRegimeForecast` 也不是第二套 Regime：它们只保存不可回写的模型输出与未来评分；宏观状态仍来自 canonical `MacroRegime`。

## 4. 强制开发规则

### 4.1 新功能开始前

必须先搜索：

- 是否已有同源 adapter；
- 是否已有事实表或版本表；
- 是否已有 as-of、复权、交易日对齐、聚合、Regime 或因子函数；
- 量化、宏观和行业模块是否已经消费同一数据。

设计说明必须列出“复用项”和“确需新增项”。无法证明新事实语义时，不得新增底层表。

### 4.2 Source Adapter

- 同一来源不得在业务模块内再次调用 HTTP。
- FRED 最新值与 ALFRED vintage 共用 `fredAdapter.ts` 和 `fredRateLimiter.ts`。
- 业务模块只传入序列选择和时间范围，不解析来源协议。

### 4.3 写入与版本

- 宏观最新值统一经过 `upsertMacroObservations`。
- 宏观版本统一经过 `appendMacroObservationVintages`，不得直接 `createMany`。
- Append-only 表不得 update/delete 历史版本；修正采用新增更正版本。
- 最新值快表首次纳入版本审计时，只能按真实执行时刻追加 current projection；不得把当前值倒填为过去已知。该锚定仍须经过统一 writer，并保留明确 source/metadata。
- 同一批最新值与 worker capture 必须在同一事务写入。

### 4.4 查询和计算

- 行情日期对齐统一放在 `equityPriceStore.ts`；业务模块不得自行写 `EquityDailyBar.findFirst`。
- 复权统一使用 `priceAdjustment.ts`，前端不得再次复权。
- Regime 只由 `quant/macroRegime.ts` 定义和计算；行业模块只能消费结果。
- Regime 的实时监测也必须调用 `quant/macroRegime.ts`：正式月度 `MacroRegime` 是可审计锚，周度 Nowcast 只能在查询时复用最新 `MacroObservation` 计算，不得另建同义状态表、独立抓取器或覆盖正式快照。
- 因子只由量化因子流水线生成；行业模块消费 `FactorSnapshot` / `FactorSectorSnapshot`，不得复制因子计算。
- 性能原因允许共享数据层内部使用专门的批量 SQL，但必须保持同一事实表、同一口径，并用对账测试证明结果一致。

### 4.5 派生表准入

新增派生表必须同时满足：

1. 表达的不是已有事实；
2. 有明确主键、数据版本和上游血缘；
3. 能说明重建方式；
4. 不会被另一个页面独立重算后覆盖；
5. 若用于预测审计，必须 insert-only 或保留完整版本。

## 5. 本次收敛结果

| 原问题 | 收敛后 |
|---|---|
| Vintage 模块单独实现 FRED URL、分页和超时 | 合并到现有 `fredAdapter.ts` |
| ALFRED 绕过 FRED 全局限速与 429 重试 | 与普通 FRED 增量共用 `fredRateLimiter.ts` |
| worker capture 与 ALFRED 分别直接写版本表 | 共用 `appendMacroObservationVintages` |
| 行业预测评分自行查询价格窗口 | 下沉并复用 `equityPriceStore.ts` |
| 行业研究自行重算 Regime/因子 | 保持直接消费 `MacroRegime` 与 `FactorSectorSnapshot` |
| 页面把月度 signalDate 当作“系统最新日期” | 拆成正式月度锚、最新官方输入、实时监测截至三种日期 |
| 为周度 Regime 另建行情/宏观链 | `regime-nowcast` 复用统一 scheduler、`MacroObservation` 与同一分类器，只输出临时查询结果 |

`data:sync-regime-vintages` 仍保留为运维命令，但它只是“选择 Regime 所需序列”的薄编排器，不再拥有独立来源协议和独立写入逻辑。

周度 Nowcast 的边界：高频确认项只用于判断增长/风险、通胀代理与利率方向；过期超过 10 天的日频项不投票；结果不写入 `MacroRegime`、不冻结进前瞻账本、不进入历史回测，也不直接产生行业预期收益。关键输入只在既有 `DataSubscription.priority` 中提升优先级，实际更新仍由统一 data worker 与发布包完成。Stage H 的新鲜度兜底也只能调用统一 `runDataSubscription`：日频最多每天、月频最多每周补检一次，并使用 `preserveNextRunAt` 保留既有发布包日程，禁止因单成员提前检查而推进整包、漏掉同包其他指标。

## 6. 尚需在后续阶段统一的能力

1. 建立通用 `Macro as-of` 查询：优先读取 Vintage，缺版本时显式降级为估算发布日。
2. 让 `macroRegime` 接受统一数据提供器，支持 `latest` 与 `strict-pit`，量化和行业共用。
3. 通用 maintenance-run 审计未来可扩展 `FetchRun` 之外的运维任务；当前 Stage H 已复用 FRED Adapter、统一 writer、数据 worker 冗余入口和 scheduler 告警 transport，独立 heartbeat 只表达新的“组合任务是否运行”事实。
4. 为直接批量 SQL 增加与公共查询服务的口径对账测试。

在上述 strict-PIT 统一完成前，历史 Regime 仍必须标记为“最新修订值下的近似 PIT”，不得升级证据等级。

## 7. Code Review 检查清单

- [ ] 是否先证明现有底层不能复用？
- [ ] 是否新增了第二个同源 HTTP 客户端？
- [ ] 是否绕过 scheduler、统一 writer 或 canonical query service？
- [ ] 是否复制了复权、as-of、交易日对齐、Regime 或因子算法？
- [ ] 新表是否表达新事实，并记录上游版本与可重建方式？
- [ ] 量化、宏观、行业三个消费者对同一日期是否可以对账？
- [ ] 文档是否明确 latest、vintage、PIT、估算口径和降级行为？
