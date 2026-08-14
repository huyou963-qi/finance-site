# 美国宏观阶段—行业基本面—行业收益传导

> 本研究的所有后续阶段必须遵守 [`DATA_FOUNDATION_REUSE_PRINCIPLES.md`](./DATA_FOUNDATION_REUSE_PRINCIPLES.md)，优先复用宏观、量化、行情和行业事实底座。

> 页面目标：解释一个历史宏观阶段中，宏观条件如何进入行业基本面与估值，并最终表现为行业 ETF 的绝对收益和相对 SPY 超额收益。
>
> 当前状态：阶段 A–H 已完成。页面既能解释单个历史阶段的宏观—基本面—估值—收益传导，也包含 Regime 锁定测试、不可回写的真实前瞻走查账本及生产连续监控。阶段 F 的 2020+ 测试未证明稳定行业排序能力；阶段 G/H 只负责诚实积累和守护未来证据，不把当前排序升级为可交易预测器。

## 1. 研究链与边界

固定研究链：

`历史事件/政策 → 月度 Regime → 行业经营条件 → 基本面变化 → 估值变化 → ETF 收益 → 理论是否兑现`

三类内容必须分开：

- **事实**：阶段日期、月度 Regime、已披露财报、ETF 行情。
- **研究假设**：某种宏观变化通常通过什么机制影响行业。
- **研究判断**：本阶段收益更接近基本面驱动、估值驱动、共同驱动，还是理论未兑现。

当前结果只做解释性桥接，不把公司中位数写成 ETF 市值加权收益的精确会计归因，也不把历史阶段直接外推为未来预测。

## 2. API

### 2.1 Endpoint

```text
GET /api/equity/sector-history/stages/:stageId/transmission
```

Query：

| 参数 | 可用值 | 默认 | 说明 |
|------|--------|------|------|
| `mode` | `asOf` / `realized` | `asOf` | `realized` 使用 T2 财报确认，只能后验复盘 |
| `aggregation` | `median` / `capWeighted` | `median` | 典型公司中位数或 PIT 市值口径 |
| `sector` | GICS sector slug | 无 | 只做参数校验，供后续页面详情预选 |

三个原型的原始 JSON：

- [2018 同步紧缩](http://localhost:3000/api/equity/sector-history/stages/qt-trade-tightening/transmission?mode=asOf)
- [2020 政策救援（asOf）](http://localhost:3000/api/equity/sector-history/stages/policy-rescue-stayhome/transmission?mode=asOf)
- [2020 政策救援（realized）](http://localhost:3000/api/equity/sector-history/stages/policy-rescue-stayhome/transmission?mode=realized)
- [2023 SVB、BTFP 与 AI](http://localhost:3000/api/equity/sector-history/stages/svb-btfp-ai/transmission?mode=asOf)

### 2.2 错误语义

| 场景 | HTTP | code |
|------|------|------|
| 未知阶段 | 404 | `STAGE_NOT_FOUND` |
| 非法 mode | 400 | `INVALID_MODE` |
| 非法 aggregation | 400 | `INVALID_AGGREGATION` |
| 非法行业 | 400 | `INVALID_SECTOR` |
| 数据库不可用 | 503 | `SECTOR_TRANSMISSION_UNAVAILABLE` |

## 3. 时间与数据可见性

| 时点 | 定义 | 用途 |
|------|------|------|
| S | 阶段定义开始日 | ETF 收益起点 |
| E | 阶段定义结束日；开放阶段截到最新 SPY 交易日 | ETF 收益终点 |
| T0 | 不晚于 S 的最近行业因子月末 | 阶段初基本面与估值 |
| T1 | 不晚于 E 的最近行业因子月末 | 阶段末当时可见状态 |
| T2 | T1 后 120 天内可得的最近行业因子月末 | 后验财报确认 |

`asOf` 使用 T0→T1；`realized` 使用 T0→T2。API 同时返回实际命中的 T0/T1/T2，不能把请求日伪装成数据截面日。

### 3.1 PIT 能力边界

行业因子来自月频 `FactorSectorSnapshot`，其上游 `buildPitCrossSection` 只纳入 `firstReportedAt <= T` 的财报，因此未来首次披露的财季不会进入 T 截面。

但当前季度表对 `symbol + period` 只保存一份数值，历史值可能被后续重述覆盖。因此准确表述是：

> 发布日期安全、数值采用最新重述值的近似 PIT。

同样，历史指数成分是 PIT，但行业归属仍使用公司当前 GICS。升级 filing vintage 与历史 GICS 前，整体质量等级最高只能为 B。

## 4. 数据装配

单次请求批量读取：

1. `MacroRegime`：S→E 的月度路径，默认按 Dalio 象限统计构成与转换次数；缺失明确记为 `unknown`。
2. `FactorSectorSnapshot`：T0 和 T1/T2 的 15 个行业中位数因子、P25/P75、覆盖率与样本数。
3. `EquityDailyBar.adjClose`：SPY 与 11 个 Sector ETF 在 S→E 内的前复权总收益曲线。
4. `SECTOR_HISTORICAL_PERIODS`：阶段事件、宏观摘要、机制假设和理论受益行业。

价格查询只读取当前阶段区间；API 不再为一个阶段拖取全部 ETF 全历史。服务端缓存键包含阶段、模式、定义版本与三类数据的最大日期。

## 5. 聚合、打分和标签

### 5.1 基本面

第一版聚合为公司中位数。核心基本面只使用：

- 营收同比 `revenueYoY`
- EPS 同比 `epsYoY`
- 营业利润率 `opMargin`

对每个指标先计算 T1/T2−T0，再在同一阶段 11 行业横截面内计算 `median/MAD` 稳健 z 分数，并截断在 ±3。至少两项有效且核心覆盖率不低于 60%时，三项有效分数等权得到 `fundamentalScore`。

### 5.2 估值

估值扩张原值：

```text
ln(E/P_T0 ÷ E/P_T1)
```

只有两端 E/P 都为正且覆盖率合格才参与计算，再对 11 行业做同阶段稳健 z 标准化，得到 `valuationScore`。亏损行业不把负 E/P 倒数成失真的负 PE。

### 5.3 市场结果

```text
行业总收益 = 终点前复权收盘价 ÷ 起点前复权收盘价 − 1
相对超额 = 行业总收益 − SPY 总收益
最大回撤 = min(当日净值 ÷ 历史峰值 − 1)
```

起点取 S 当日或之后首个交易日，终点取 E 当日或之前最后交易日。ETF 未上市或不足两个交易日时保持 null，不借用区间外数据。

### 5.4 自动标签

标签只由固定规则生成，并在 `evidence[]` 中返回触发数值和阈值：

- 盈利与估值共振
- 基本面驱动
- 估值驱动
- 盈利抵消估值收缩
- 预期先行，基本面尚未兑现
- 基本面恶化
- 相对防御有效
- 理论未兑现
- 数据不足，不归因

标签不是因果证明。没有达到阈值时保持 null，不为了填满表格而强行命名。

## 6. 数据质量

每个行业和整个阶段都返回：

- `overall`：A/B/C/D/macro-only
- `fundamentalCoverage`
- `vintageMode`
- `classificationMode`
- `aggregationMode`
- `weightMode`
- `strictPipelineApplied`
- `factLayers.filingVintage / historicalClassification / etfHoldings`：每层的首尾覆盖率、门槛、快照日期与是否通过
- `warnings[]`

当前警告按事实层覆盖动态生成：

1. SEC filing vintage 首尾覆盖不足时，财报继续标为最新重述值的近似 PIT。
2. 历史 GICS 有效期首尾覆盖不足时，行业归属继续标为当前分类近似。
3. ETF 首尾持仓快照缺失或超过 7 天时，权重继续标为公司市值代理。
4. 三层数据即使全部就绪，在严格重建真正启用前也不会升级为 A。
5. `realized` 包含阶段结束后的财报，只能用于后验复盘。

## 7. 三个真实数据原型

以下结果来自 2026-08-13 本地数据库。百分比均为小数口径转换后的展示值；未来重新构建因子或价格数据时，应以 API 最新返回为准。

### 7.1 2018：同步紧缩、贸易摩擦与增长预期下修

| 项目 | 结果 |
|------|------|
| S→E | 2018-01-26 → 2018-12-24 |
| T0/T1/T2 | 2017-12-31 / 2018-11-30 / 2019-02-28 |
| Dalio Regime | reflation 6个月（54.5%）→ stagflation 5个月（45.5%） |
| 转换次数 | 1 |
| SPY | -16.68% |
| 整体质量 | D；核心基本面覆盖率 73.1% |

收益前三：

| ETF | 绝对收益 | 相对 SPY | 自动标签 | 理论验证 |
|-----|---------:|---------:|----------|----------|
| XLU | +4.52% | +21.19% | — | confirmed |
| XLRE | -3.86% | +12.82% | 数据不足，不归因 | inconclusive |
| XLV | -10.45% | +6.22% | 相对防御有效 | confirmed |

人工复算表：

| ETF | 营收同比 T0→T1 | EPS同比 T0→T1 | 营业利润率 T0→T1 | E/P T0→T1 | 绝对/超额 |
|-----|------------------|----------------|---------------------|-----------|-----------|
| XLU | -2.56%→3.74% | 0.00%→2.86% | 24.91%→22.83% | 4.54%→4.88% | +4.52% / +21.19% |
| XLV | 7.41%→7.93% | 16.54%→29.08% | 14.73%→14.62% | 3.33%→1.88% | -10.45% / +6.22% |
| XLP | 3.06%→3.86% | 7.28%→15.96% | 17.38%→16.35% | 3.96%→5.18% | -14.52% / +2.16% |

规则摘要：**事实**是 SPY 深跌，而 XLU 获得正绝对收益，XLV/XLP 虽下跌但明显跑赢。**判断**是防御机制得到价格验证，但三类防御行业的利润率并未一致改善，不能统一写成基本面驱动。**风险**是阶段整体覆盖率只有 73.1%，故降为 D，不做强行业归因。

理论与实际不一致：理论受益行业中的 XLU、XLV 得到确认，XLP 只有部分兑现；房地产意外排名第二，但覆盖不足，不能据此倒推一个强基本面故事。

### 7.2 2020：政策救援、居家经济与估值重建

| 项目 | 结果 |
|------|------|
| S→E | 2020-03-23 → 2020-11-09 |
| T0/T1/T2 | 2020-02-29 / 2020-10-31 / 2021-02-28 |
| Dalio Regime | stagflation 3个月（37.5%）→ deflation 5个月（62.5%） |
| 转换次数 | 1 |
| SPY | +60.37% |
| 整体质量 | C；asOf覆盖率82.9%，realized覆盖率82.7% |

收益前四：

| ETF | 绝对收益 | 相对 SPY | asOf 标签 | 理论验证 |
|-----|---------:|---------:|------------|----------|
| XLB | +83.16% | +22.79% | — | inconclusive |
| XLY | +74.73% | +14.36% | 预期先行，基本面尚未兑现 | confirmed |
| XLI | +73.90% | +13.53% | — | inconclusive |
| XLK | +72.30% | +11.93% | 基本面驱动 | partial |

asOf 与 realized 复算：

| 观察 | 营收同比 T0→终点 | EPS同比 T0→终点 | 营业利润率 T0→终点 | E/P T0→终点 | F / V | 标签 |
|------|-------------------|-----------------|----------------------|------------|-------|------|
| XLK asOf | 3.75%→1.62% | 6.63%→12.05% | 18.25%→18.42% | 3.91%→3.10% | 0.76 / 0.00 | 基本面驱动 |
| XLK realized | 3.75%→9.72% | 6.63%→22.50% | 18.25%→19.49% | 3.91%→2.44% | 0.82 / 0.79 | 盈利与估值共振 |
| XLY asOf | 3.92%→-11.31% | 10.54%→-47.09% | 13.40%→3.71% | 4.99%→2.24% | -2.11 / 3.00 | 预期先行，基本面尚未兑现 |

规则摘要：**事实**是材料、可选消费、工业和科技均大幅跑赢 SPY，但当时可见财报并不支持所有赢家。**判断**是 XLK 从 asOf 的相对基本面改善，经过 T2 后升级为盈利与估值共振；XLY 的强收益主要先于行业中位数基本面。**风险**是 realized 结论使用阶段结束后的财报，不能回填到 2020-11-09 的事前决策。

理论与实际不一致：XLY 进入前三并确认，XLK 排名第四所以只算 partial；理论受益的 XLC 绝对上涨 57.30%，但仍落后 SPY 3.07%，因此被判 rejected。材料和工业超预期领先，说明“政策救援+重启 beta”比单纯“居家经济”覆盖更广。

### 7.3 2023：SVB、BTFP 与生成式 AI 盈利重估

| 项目 | 结果 |
|------|------|
| S→E | 2023-03-10 → 2023-07-27 |
| T0/T1/T2 | 2023-02-28 / 2023-06-30 / 2023-09-30 |
| Dalio Regime | deflation 3个月（75%）→ goldilocks 1个月（25%） |
| 转换次数 | 1 |
| SPY | +18.14% |
| 整体质量 | C；核心基本面覆盖率 83.6% |

收益前三：

| ETF | 绝对收益 | 相对 SPY | 自动标签 | 理论验证 |
|-----|---------:|---------:|----------|----------|
| XLK | +29.86% | +11.72% | 估值驱动 | confirmed |
| XLC | +29.69% | +11.55% | — | confirmed |
| XLY | +23.55% | +5.41% | — | confirmed |

人工复算表：

| ETF | 营收同比 T0→T1 | EPS同比 T0→T1 | 营业利润率 T0→T1 | E/P T0→T1 | 绝对/超额 | F / V |
|-----|------------------|----------------|---------------------|-----------|-----------|-------|
| XLK | 7.02%→3.85% | -0.64%→4.41% | 21.42%→22.10% | 3.72%→2.92% | +29.86% / +11.72% | -0.24 / 3.00 |
| XLC | 3.49%→2.66% | -11.62%→-19.12% | 13.25%→16.18% | 1.73%→2.20% | +29.69% / +11.55% | 0.18 / — |
| XLF | 4.85%→9.22% | -6.25%→7.10% | 23.72%→29.14% | 6.61%→6.74% | +7.69% / -10.45% | 1.19 / -0.27 |

规则摘要：**事实**是 XLK/XLC/XLY 恰好占据超额收益前三，理论方向得到价格确认。**判断**是截至 T1，XLK 的领先更接近估值扩张，AI 盈利改善尚未广泛进入行业中位数，而不是已经完成全面盈利兑现。**风险**是通信服务估值覆盖不足、整体覆盖率只有83.6%，所以保持 C 级并允许标签为空。

理论与实际不一致：金融行业中位数基本面分数为正，但 XLF 落后 SPY 10.45%，说明行业中位数财报没有完整捕捉区域银行久期、存款与信用冲击；这正是宏观事件与会计数据不能互相替代的案例。

## 8. 阶段 D1：市值口径与 ETF 收益桥

页面的聚合切换包含：

- `median`：行业公司中位数，回答“典型公司怎样变化”；
- `capWeighted`：以 `FactorSnapshot.logMarketCap` 还原 T 时点市值，对公司指标做 PIT 市值加权，并以收益率因子乘市值还原行业总盈利、总营收和总 FCF。

收益桥使用可加总的对数收益：

```text
ETF 对数总回报 = Flow 增长 + 估值变化 + ETF 实际分红 + 残差
```

Flow 默认使用行业总 TTM 盈利；任一端非正或覆盖不足 60% 时依次降级到 TTM 营收、TTM FCF。ETF 实际分红不是用年化股息率估算，而是以含分红 `adjClose` 和仅拆股调整 `close` 的区间对数收益差计算。

残差始终保留。它包含 ETF 历史权重与 S&P 500 公司集合差异、成分变动、股本变化、当前 GICS 近似、ETF 费用以及 S/E 与 T0/T1 时间错位。残差较大只说明两套口径不可互换，不代表存在 alpha。

阶段 D1 仍不是严格 ETF 会计归因：当前财报值是发布日期安全但采用最新重述值的近似 PIT，行业分类是当前 GICS，且没有 Sector ETF 历史持仓权重。因此质量等级最高保持 B。

## 9. 阶段 D2：三层历史事实与覆盖闸门

### 9.1 数据模型

| 表 | 主键语义 | 严格口径用途 |
|----|----------|--------------|
| `mds.equity_fundamental_vintage` | `symbol + period + accession` | 选择 `filedAt<=T` 的最后申报版本，保留 10-Q/10-K/A 重述 |
| `mds.equity_sector_classification_history` | `symbol + scheme + validFrom` | 以 `validFrom/validTo` 回放分类；`sec-sic` 不得冒充 `gics` |
| `mds.sector_etf_holding` | `etf + asOfDate + holdingKey` | 保存 State Street 每日持仓或授权历史文件中的真实权重 |

SEC 回放不是把当前季度快照复制多份：标准化器按 accession 顺序逐份装配 Company Facts，窗口第一份写完整 checkpoint，后续只写发生变化的季度。没有 accession/filed 的事实点不会进入严格层。

State Street 官网公开文件是每日快照，不是免费历史档案。系统从接入日起逐日归档；更早权重只能导入带明确 as-of date 的可靠文件。S&P 的历史 GICS 同理，当前 `equity_security` 只能从观察日起建立开放有效期，不能倒填到过去。

### 9.2 覆盖闸门

页面在阶段标题下显示三张闸门卡，分别检查 T0 与 T1/T2：

| 事实层 | 通过门槛 | 额外条件 |
|--------|----------|----------|
| SEC filing vintage | ETF 权重覆盖两端均 ≥80% | 每个证券至少 4 个当时可见季度 |
| 历史 GICS | 两端均 ≥95% | GICS 有效期命中且行业与 ETF 对应 |
| ETF 历史权重 | 两端均 ≥95% | 官方快照不晚于截面且滞后不超过 7 天 |

闸门是“数据是否就绪”，不是“当前计算已经使用”。API 额外返回 `strictPipelineApplied=false`；因此即使某个当代截面三层数据都齐全，D2 页面也不会提前把近似 D1 指标标成严格 PIT。

### 9.3 摄入与验证

```bash
npm run db:migrate
npm run equity:sync-fundamental-vintages -- --symbols=AAPL,MSFT,NVDA --last-filings=20
npm run equity:sync-sector-etf-holdings
npm run equity:import-sector-etf-holdings -- --file=<archived.xlsx> --etf=XLK --source=<source>
npm run equity:snapshot-current-classifications -- --as-of=2026-08-11
npm run equity:import-sector-classifications -- --file=<licensed-history.csv> --source=<source>
npm run equity:verify-sector-history-facts -- --date=2026-08-11
```

2026-08-13 首次落库结果：

- 12 个 ETF（SPY + 11 Sector SPDR）共 1,036 条 2026-08-11 持仓，逐 ETF 权重合计 99.85%–100.02%；
- 当前 GICS 观察 503 条，只从 2026-08-11 起有效；
- AAPL/MSFT/NVDA 试点 299 条 filing vintage；XLK 按 ETF 权重计的四季度 vintage 覆盖 36.4%；
- 分类有效期无重叠，所有 ETF 快照权重验收通过；历史阶段因缺旧快照继续明确显示“未通过”。

## 10. 阶段 D3：严格端点重建与双轨对账

### 10.1 全有或全无切换

D3 不允许把历史持仓、当前分类与最新重述财报拼成一个“半严格”结果。对每一个行业分别检查 T0 与 T1/T2：

1. 两端 SEC filing vintage、历史 GICS、ETF 持仓三层闸门全部通过；
2. 两端都能产出严格截面；
3. 只有此时该行业的 `strictPipelineApplied=true`，否则整条保留 D1 市值代理结果；
4. 一个行业通过不代表全部 11 行业通过，因此总面板只有在 11 行业全通过时才升为全局严格。

这条规则保证页面中的同一行业不会出现“起点 D1、终点 D3”或“基本面 D3、收益桥 D1”的混用。

### 10.2 T 时点严格截面

`sectorStrictHistorical.ts` 的端点重建顺序固定为：

```text
T 之前最近 ETF 持仓（滞后≤7日）
  → 每只成分命中 validFrom≤T≤validTo 的 GICS
  → 每个 symbol+period 选择 filedAt≤T 的最后 accession
  → 取 T 日或之前最近收盘价，并校正财报披露后的拆股单位
  → 复用 computeFundamentalFactors / computeTtm
  → 按 ETF 实际权重聚合指标
```

公司指标使用“有值权重内归一化”，并同时返回“有值 ETF 权重 / 全部持仓权重”的 coverage。盈利、营收与 FCF 流量由公司收益率因子乘公司 PIT 市值还原；缺价格、陈旧财报、错误股本或不属于该历史行业的成分不被当成 0。

### 10.3 严格收益桥

D3 收益桥只使用首尾两端都存在、且对应流量为正的匹配成分，权重固定为归一化后的起点 ETF 权重：

```text
ETF 对数总回报
= Σ 起点权重 × ln(公司期末流量 / 公司期初流量)
 + Σ 起点权重 × ln(公司期末估值倍数 / 公司期初估值倍数)
 + ETF 实际分红
 + 残差
```

主桥依次尝试 TTM 盈利、TTM 营收、TTM FCF；首尾匹配 ETF 权重均须达到 60%。残差继续保留调仓、新增/移除成分、未匹配持仓、费用和 S/E 与 T0/T1 时间错位，不称为 alpha，也不强行摊入其他项。

API 的 `strictAudit` 保留：是否就绪、是否实际应用、活动方法、回退原因、首尾持仓日期、四个核心指标相对 D1 的变化差，以及 D1/D3 残差并排对账。`returnBridge.method` 明确区分 `market-cap-total` 与 `etf-holdings-matched-start-weight`。

### 10.4 2026-08-11 XLK 试点

为验证算法而不伪造历史，试点只扩展真实观察日起的数据：

- 41 只 XLK 主要成分共落库 5,917 条 accession vintage，ETF 权重覆盖 93.4%；
- 历史 GICS 有效期命中 99.9%，持仓总权重约 100%；
- 39/41 只成分有有效价格，营收同比、营业利润率、盈利收益率覆盖分别为 93.4%、89.7%、92.1%；
- 严格收益桥使用 TTM 盈利，正盈利首尾匹配权重 87.6%，加总误差为 0；
- 最晚使用 filing date 为 2026-08-07，没有越过 2026-08-11 端点。

该试点证明严格计算链可运行，不代表 2026-08-11 之前已经拥有 ETF 持仓或 GICS 历史。现有 30 个历史阶段仍会因起点事实不足回退 D1；只有未来逐日归档或导入带明确 as-of date 的可靠历史文件后，相关阶段才会自动切到 D3。

验收命令：

```bash
npm run equity:verify-sector-strict-history -- --date=2026-08-11 --etf=XLK
npm run equity:verify-sector-transmission
```

## 11. 验收结果

| 检查 | 结果 |
|------|------|
| 30 个 stageId 解析 | 30/30，通过 |
| 每阶段固定返回 11 行业 | 30/30，通过 |
| macro-only 阶段 | 9 个，未生成公司基本面强结论 |
| T0≤S、T1≤E | 通过 |
| 低覆盖阻断强归因 | 通过 |
| 与既有区间收益 API 复算 | 三个原型、SPY+11行业全部一致；最大绝对误差 `2.22e-16` |
| 阶段 E 响应体积 | 66 个响应最大 80.2KB，低于 150KB 目标 |
| 阶段 E 性能 | 三个代表阶段冷查询 p95 318.5ms；短 TTL 数据指纹 + 响应缓存热命中 <200ms |
| 收益桥加总 | 三个原型的所有可用行业均精确加总到 ETF 对数总回报 |
| 降级与残差 | 盈利→营收→FCF 顺序固定；高残差强提示通过 |
| 专项单元测试 | 通过 |
| D2 事实层单元测试 | accession 重述回放、GICS 区间重叠、ETF 权重/陈旧快照闸门均通过 |
| D2/D3 实库校验 | 5,917 vintage、503 分类观察、1,036 ETF 持仓；XLK 当前试点 vintage 93.4%、GICS 99.9% |
| 阶段 E 全面审计 | 30 阶段、66 响应、726 行业行；严格/回退原子性与无前视审计通过 |
| HTTP 契约 | 有效请求 200；非法 mode/aggregation/sector 为 400；未知阶段 404；缓存头通过 |
| TypeScript | `npx tsc --noEmit` 通过 |
| 定向 ESLint | 通过 |
| 页面冷加载与缓存命中 | 选择阶段均能定位并打开传导面板 |
| URL 状态 | `stage`、`sector`、`mode`、`aggregation` 刷新后完整保留 |
| 主图联动 | 行业行可补开对应 ETF；关闭曲线不清空行业详情 |
| 响应式 | 390px 宽度无页面级横向溢出；11 行业矩阵在组件内滚动 |

数据库环境可运行：

```bash
npm run equity:verify-sector-transmission
npm run equity:verify-sector-stage-e
npm run equity:verify-sector-stage-e-http # 需先启动本地服务
```

该脚本复核 30 阶段、T0/T1 边界、11 行业完整性、低覆盖阻断规则，并对三个原型的市值口径收益桥执行加总恒等式与覆盖率检查。

## 12. 阶段 F：Regime 前瞻研究

### 12.1 样本和无前视设计

- 月度 Regime：2000-01 至 2026-07，共 319 期，Dalio 象限有效 316 期。
- 行业因子原始行：2010-01 至 2026-07，共 20,887 行，平均覆盖率 71.4%；增强模型从 2012-01 才启用，2010–2011 只作预热。
- 收益标签：行业 Sector SPDR 相对 SPY 的 T+3/6/12 月总收益。
- 基本面标签：行业成长、利润率、ROE 与杠杆复合分数的 T+1/2/4 季相对变化。
- 每个 T 只用 `labelEnd≤T` 的历史结果；训练/验证边界设置 purge 带，跨边界标签不进入模型选择。
- 训练 ≤2014-12，验证 2015–2019，测试 2020+。只在验证集选择模型，测试集不调参。
- 四组固定模型：无条件历史基准、Regime、Regime+估值、Regime+基本面。增强模型只用预设 50/50 组合。
- 重叠收益的平均 IC 用 Newey–West 95% 区间，滞后阶数固定为前瞻月数减一。

### 12.2 锁定测试结果

| 前瞻期 | 验证集锁定模型 | 验证 IC | 2020+ 测试 IC [95%] | Top 3 胜率 | Top 3 平均超额 | 结论 |
|--------|----------------|--------:|----------------------:|-----------:|----------------:|------|
| 3月 | Regime+基本面 | +0.055 | +0.105 [-0.018, +0.229] | 48.7% | +0.5% | 不支持 |
| 6月 | 无模型通过；Regime 基线复核 | -0.178 | +0.079 [-0.053, +0.211] | 42.5% | -0.0% | 不支持 |
| 12月 | 无模型通过；Regime 基线复核 | -0.246 | +0.066 [-0.163, +0.296] | 43.3% | -1.6% | 不支持 |

Regime 相比无条件历史均值改善了行业横截面排序方向，但置信区间跨零、Top 3 胜率不足，6/12 月验证集甚至没有候选模型通过。2020+ 月频 Top 3 组合中 Regime 基线年化超额约 +0.8%，但最大回撤约 -24.3%、月均换手约 17.9%，不能替代横截面统计门槛，也不足以证明稳健可交易性。

### 12.3 未来基本面

T+1 季 IC 为 -0.105，95% 区间完全低于零；T+2 季 IC +0.012，区间跨零；T+4 季 IC -0.029。Regime 没有稳定指示未来行业基本面相对改善，历史传导页面里的“理论受益行业”仍只用于情境解释。

### 12.4 证据边界

当前口径是「回溯式伪样本外」，证据等级 C：发布日做了近似隔离，但宏观底层值是最新修订值，不是当时实际发布 vintage。FRED/ALFRED 的 vintage date 能区分不同发布与修订版本；在接入这些实时版本前，不得把结果称为严格 PIT。重叠收益区间采用 Newey–West HAC 方法，处理异方差与序列相关。

验证命令：

```bash
npm run equity:verify-sector-stage-f
npm run equity:verify-sector-stage-f-http # 需先启动本地服务
```

## 13. 阶段 G：宏观 vintage 与真实前瞻账本

### 13.1 三层数据必须物理分离

| 层 | 表 | 写入规则 |
|----|----|----------|
| 宏观版本 | `mds.macro_observation_vintage` | ALFRED 官方 revision 或 worker 实时捕获；只追加，不覆盖 |
| 预测快照 | `mds.sector_regime_signal_snapshot` | `modelVersion × signalDate` 首次写入后锁定，保存输入、规则与 SHA-256 哈希 |
| 逐行业结果 | `mds.sector_regime_forecast` | 3/6/12 月分别到期；结果字段只在空值时写一次，并保存结果哈希 |

`signalDate` 是宏观/因子数据归属月，不是回测起点。首个快照虽归属 2026-07-13，但在 2026-08-13 才正式冻结，因此 `returnStartDate` 固定为 2026-08-14；冻结前已经发生的行情完全不计入未来结果。入场取该日及之后七天内第一根复权收盘，出场取目标日及之前七天内最后一根复权收盘，目标仍是行业 Sector SPDR 总收益减 SPY 总收益。

### 13.2 版本数据

FRED `series/observations` 的 real-time period 定义“信息在何时已知”；`output_type=3` 返回新增和修订观测。系统把 JSON 宽表中的 `SERIES_YYYYMMDD` 展开为逐观测、逐发布日期的版本链，并计算到下一版本前的有效期。1998-01-01 至 2026-08-13 首次导入：

- 6 个 FRED 序列共 51,979 条版本（含只作衰退 overlay 的 USREC）；
- 进入 Regime 预测的 5 个 FRED 输入共有 51,817 条版本；
- ISM 制造业与服务业没有同等公开历史 vintage API，现阶段从 worker 首次捕获新增/修订起留痕，不伪造旧版本。

阶段 H 首次上线另做一次保守的 current projection bootstrap：若最新快表值尚没有同值版本，只以**实际执行时刻**作为 `availableAt` 追加一条 `stage_h_bootstrap` 记录。该记录只证明“系统在此刻已看到该值”，不倒推原始发布日期，也不替代 ALFRED 官方历史。首次实跑为 7 个输入中的 6 个追加当前锚点，其中包含两个 ISM 输入；之后同值运行幂等为零。

### 13.3 预注册与证据等级

- 模型版本固定为 `stage-f-2026-08-13-v1`，协议版本固定为 `stage-g-v1`；修改模型必须产生新版本，不能重写旧 cohort。
- 只有阶段 F 验证集通过的 3 月 Regime+基本面模型计入主要证据；6/12 月 Regime 基线继续保存，但明确标成失败复核。
- 每个完整横截面报告 Spearman IC、Top 3 正超额胜率、Top 3 平均超额和 Top−Bottom；行业未全部到期前不提前计算 IC。
- 过程完整性升为 B：信号和结果不可回写、计分严格发生在冻结后。
- 统计推断仍保持 C：模型选择历史仍受最新修订宏观值影响，而且真实前瞻样本目前只有 1 个月、0 个成熟结果。
- 预注册复评点为至少 36 个独立月度冻结信号；达到月数并不自动升级，仍需重新检查 IC 区间、命中率、收益差与模型漂移。

首个快照冻结 33 条判断（3 个期限 × 11 行业）：3 月到期日 2026-11-14，6 月 2027-02-14，12 月 2027-08-14。当前全部为 pending，未回填任何已知收益。

运行与验收：

```bash
npm run db:migrate
npm run data:sync-regime-vintages -- --start=1998-01-01
npm run equity:run-sector-regime-ledger
npm run equity:verify-sector-stage-g
```

## 14. 阶段 H：生产自动化与连续监控

阶段 H 已完成，并且没有修改阶段 F 的历史门槛或模型选择。日常任务统一执行：

1. 通过共享 FRED Adapter 拉取最近 45 天 ALFRED revision，并经统一 append writer 幂等入库；
2. 对尚未被版本账本覆盖的当前快表值做执行时点锚定；不回填历史发布时间；
3. 冻结当前 `signalDate × modelVersion` 首次信号；若已有信号只比较哈希，不覆盖；
4. 结算所有已到期且价格齐备的行业预测；
5. 写入 `.data/sector-regime-stage-h-state.json` 成功 heartbeat；
6. 复用数据调度器的 Slack/Webhook transport 发出运维告警。

监控固定覆盖四类故障：

| 告警 | 判定 |
|---|---|
| 任务缺跑 | 最后成功 heartbeat 超过 36 小时，或最近任务失败 |
| 输入 Vintage 缺口 | 任一 Regime 最新观测无版本、最新值不一致，或应有的 ALFRED 历史缺失 |
| 信号哈希漂移 | 同一 `signalDate × modelVersion` 重算哈希不同，旧快照保持不变 |
| 到期价格缺失 | `targetDate≤today` 但仍未一次性结算的 Forecast 大于 0 |

生产部署会幂等安装 `scripts/ops/finance-site-sector-regime.cron`：北京时间每日 23:35 运行完整任务，每小时第 17 分运行独立 monitor；两者均使用 `flock` 防重入。也可设置 `SECTOR_REGIME_MONITOR_AFTER_WORKER=1`，让既有 `data:worker` 成为冗余监控入口，但不会创建第二套状态。

运行与验收：

```bash
npm run equity:run-sector-regime-stage-h
npm run equity:monitor-sector-regime-stage-h -- --dry-run
npm run equity:verify-sector-stage-h -- --run
```

### 14.1 ISM 历史档案结论

ISM 官方提供 Manufacturing/Services 的固定发布规则与年度日历，并在当前报告页提供当前月和上月报告；官方也声明时间序列连续。可审计入口：

- 发布日历：<https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/>
- PMI 报告入口：<https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/>
- 官方关于历史连续性的说明：<https://www.ismworld.org/supply-management-news-and-reports/news-publications/releases/2025/institute-for-supply-management-updates-monthly-economic-indicators-branding-ism-pmi-reports/>

但当前报告许可明确禁止未经书面授权的自动下载、归档、复制或构建派生时间序列。因此本项目不新增 ISM 历史爬虫，也不把搜索引擎或二手转载写成官方 vintage。合规路径只有两条：取得 ISM 书面授权/数据许可后接入统一 Source Adapter，或继续从系统 worker 首次捕获日起积累不可回写版本。

## 15. 工程完成后的观察期

A–H 工程路线至此完成。后续不是继续调整模型，而是等待 3/6/12 月 cohort 自然到期。只有达到至少 36 个独立月度冻结信号的预注册复评点，才重新检查 IC 区间、Top 3 命中率与 Top−Bottom；在此之前统计推断等级保持 C。
