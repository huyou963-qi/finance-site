# 量化平台 Phase 1：因子库与横截面宽表

> 接 Phase 0（PIT 数据地基，commit 10f1904）。本阶段产出月频 PIT 因子快照表
> `mds.factor_snapshot` + 行业聚合表 `mds.factor_sector_snapshot` 及其构建/验证管线。
> 不含 UI（screener 为 Phase 2）。

## 数据表

### `factor_snapshot`（长表，约 182 万行 / 321 期）

| 列 | 含义 |
| --- | --- |
| `symbol, date, factor_key` | 唯一键；`date` = 宇宙月末快照日（`index_constituent.as_of_date` 对齐，2000-01 起） |
| `value` | 原始因子值（口径见下表） |
| `zscore` | 当月截面标准分：winsorize（±3×1.4826×MAD，MAD 退化时回退 p1/p99）后 (x−mean)/std；有效样本 <8 或零离散度为 null |
| `sector_zscore` | 同法在 GICS sector 内计算（分组 <8 只为 null） |

### `factor_sector_snapshot`（行业月频序列）

`(sector, date, factor_key) → median / p25 / p75 / coverage / sample_count`。
coverage 分母 = 当月宇宙 ∩ 该 sector（现值 GICS）成分数；样本 <3 不落行。

## 因子清单（28 个，定义单一来源 `src/lib/quant/factorRegistry.ts`）

| 类别 | 因子 | 口径 | 方向 | 起点 |
| --- | --- | --- | --- | --- |
| 估值 | `earningsYield` | TTM 净利 / PIT 市值（E/P） | ↑ | 2021 |
| 估值 | `bookYield` | 最新季股东权益 / 市值（B/P） | ↑ | 2021 |
| 估值 | `salesYield` | TTM 营收 / 市值（S/P） | ↑ | 2021 |
| 估值 | `fcfYield` | TTM (OCF−CapEx) / 市值 | ↑ | 2021 |
| 估值 | `dividendYield` | TTM \|分红\| / 市值（TTM 窗口成立时分红缺失按 0） | ↑ | 2021 |
| 估值 | `ocfToEv` | TTM OCF / (市值+长期债务−现金)；EV/OCF 倒数 | ↑ | 2021 |
| 质量 | `roeTtm` | TTM 净利 / 平均股东权益（本季与 4 季前均值） | ↑ | 2021 |
| 质量 | `grossMargin` / `opMargin` | 最新可见季利润率 | ↑ | 2021 |
| 质量 | `ocfToNetIncome` | TTM OCF / TTM 净利（净利>0） | ↑ | 2021 |
| 质量 | `debtToAssets` | 最新季总负债 / 总资产 | ↓ | 2021 |
| 质量 | `accrualsToAssets` | (TTM 净利 − TTM OCF) / 平均总资产 | ↓ | 2021 |
| 成长 | `revenueYoY` | 最新可见季营收 / 上年同季 − 1（fiscalDate 差 330–400 天匹配） | ↑ | 2021 |
| 成长 | `epsYoY` | 同上，上年 EPS>0 才给值 | ↑ | 2021 |
| 成长 | `revenueAccel` | 本季营收 YoY − 上季营收 YoY | ↑ | 2021 |
| 动量 | `ret1m/3m/6m/12m` | 21/63/126/252 交易日总收益（前复权 adjClose） | ↑ | 2000 |
| 动量 | `mom12_1` | T−252 → T−21 总收益 | ↑ | 2000 |
| 动量 | `dist52wHigh` | close / 252 日最高 − 1 | ↑ | 2000 |
| 波动 | `vol60d` | 60 日对数收益标准差 × √252 | ↓ | 2000 |
| 波动 | `beta252d` | 对 SPY 日对数收益回归斜率（重叠 ≥200 日） | ↓ | 2000 |
| 波动 | `maxDrawdown12m` | 252 日最大回撤（负值，越接近 0 越好） | ↑ | 2000 |
| 量价 | `turnover20d` | 20 日均成交额 / PIT 市值 | ↑ | 2021 |
| 量价 | `dollarVolPctile` | 20 日均成交额当月宇宙分位（0–1，并列取平均秩） | ↑ | 2000 |
| 量价 | `volTrend20_120` | 20 日均量 / 120 日均量 − 1 | ↑ | 2000 |
| 规模 | `logMarketCap` | ln(PIT 市值) | ↓ | 2021 |

## 关键口径（实施中核实）

1. **市值拆股口径**：`equity_fundamental_snapshot.shares_outstanding`（及 eps）在摄入时
   已被 `scaleFactorsBackward` 归一到**最新拆股刻度**，与 `equity_daily_bar.close`
   （Yahoo 拆股回溯调整）一致 → 市值 = close(T) × shares **直乘**。切勿再乘
   `computeSplitFactors`（会重复 N 倍）。残余风险：新拆股发生后、`equity:sync-fundamentals`
   重跑前，该股刻度错位。
2. **成交额**：名义价 × 名义量 = (close×S) × (volume/S) = 库内 `close × volume`，
   拆股因子相消，直接两列相乘即可。
3. **估值方向**：一律收益率（E/P 等），亏损股为负值仍单调可排序；EV/EBITDA 无 D&A
   字段做不了，以 `ocfToEv` 替代。
4. **GICS 非 PIT**：sector 归属取 `equity_security` 现值近似（幸存偏差：早年退市股多无
   归属 → sector_zscore null）。不建历史 GICS。
5. **基本面起点 ~2020H2**：Q 快照仅回填 24 季；技术面因子 2000 起。构建脚本对
   2020-06 之前月份跳过基本面 pass。
6. **PIT 可见性**：季度行仅当 `first_reported_at ≤ T` 参与；`first_reported_at` 为 null
   的行（未回填/退市股）保守剔除，方向无前视。
7. **退市股**：宇宙来自历史成分，含已退市 symbol；无价格者（delisting 表
   not_found/no_data，~189 只）技术面因子缺失。覆盖率分母用「T 时点有价格宇宙」
   （coverage 区间覆盖 [T−7d, T]），Yahoo 历史不完整/已退市的归当月无价格桶单列。
8. **陈旧与断档守卫**（GOOGL/TSLA 换 tag 时代留洞暴露）：最新可见季距 T >200 天 →
   该股全部基本面因子不出；TTM 类因子一律经 `computeTtm` 的 240–300 天连续性校验
   （勿用 `computeQuarterRatios.sumWindow`——它不查断档，会把跨年不连续 4 季加总）；
   4 季前期末行（roeTtm/accruals 的平均分母、YoY 匹配）须真在 330–400 天前；
   revenueAccel 的上季须在 45–130 天前。ticker 复用股（S/SE 等）靠 PIT 可见性 +
   陈旧守卫避免新公司财报污染老时代因子。
9. **被移出成员的基本面**：sync-fundamentals 历史上只跑现任 SP500 成分；Phase 1 为
   delisting 表 ∩ equity_security 的 119 只移出成员补跑了 Q 同步（仍在上市的可完整
   回补；已被收购退市的公司 SEC ticker 映射缺失，无法覆盖，属遗留缺口）。

## 管线与命令

```bash
npm run quant:build-factors                    # 增量：补 factor_snapshot 缺的最新月
npm run quant:build-factors -- --month=2023-06 # 重建单月
npm run quant:build-factors -- --full          # 全量重建（约 25 分钟）
npm run quant:build-factors -- --full --from=2010-01   # 断点续跑

npm run quant:build-sector-factors             # 行业聚合（同样支持 --full / --month）
npm run quant:verify-factors                   # 验收套件（A–E；--skip-incremental 跳过重建对比）
```

构建管线三个 pass：技术面（symbol 主序，日线分批全量载入内存）→ 基本面（月主序，
`buildPitCrossSection`）→ 标准化+落库（逐月，先 delete 当月再插，幂等）。

## 模块

- `src/lib/quant/factorRegistry.ts` — 因子定义（key/中英文名/类别/方向/数据面/起点）
- `src/lib/quant/pitCrossSection.ts` — WS2 装配层：宇宙 + 可见季度 + close(T) + 市值
- `src/lib/quant/factorCompute.ts` — 技术面/基本面因子计算 + winsorize/zscore/分位
- `scripts/quant/build-factors.ts` / `build-sector-factors.ts` / `verify-factors.ts`

## 验收（scripts/quant/verify-factors.ts）

A. 20 样本股（含拆股 NVDA/AAPL、财年错位 AAPL/MU）× 2 月末，独立内联公式重算全部因子对比落库值；
B. 无前视：全量快照显式剔除 `firstReportedAt > T` 行重算不变 + 装配层可见性断言；
C. 覆盖率：技术面 2000 起 ≥95%（有价格宇宙）、基本面 2021 起 ≥90%，退市无价格股单列；
D. `--month` 增量重建与全量结果逐行一致；
E. 行业聚合中位数/四分位与个股现算一致。
