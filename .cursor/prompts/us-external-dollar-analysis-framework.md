# Prompt：美国对外部门与美元分析框架（宏观页内置模板）

> 与 `docs/US_EXTERNAL_DOLLAR_ANALYSIS.md`、`src/lib/data/externalDollarAnalysisLayout.ts` 保持一致。三处同步更新。

## 框架定位

回答：**美元强弱周期走到哪？贸易逆差由出口还是进口主导？外部融资与净头寸是否可持续？**

分工：实际出口/进口（EXPGSC1/IMPGSC1）归经济 Overview（本框架用 BOP 名义流量）；政策利率/金融条件归货币域；能源分项归通胀域。

## 双模板结构（文件夹 folder-builtin-us-external-dollar）

### ① builtin-us-external-dollar-overview — 美元与贸易流量

| 图 | 主题 | 序列（FRED id） | calc |
|----|------|------------------|------|
| 1 | 广义美元 | DTWEXBGS | 月均 |
| 2 | 结构 | DTWEXAFEGS、DTWEXEMEGS | 月均 |
| 3 | 贸易差额 | BOPGSTB | level |
| 4 | 流量 | BOPTEXP、BOPTIMP | yoy |

### ② builtin-us-external-dollar-balance — 外部均衡与贸易条件

| 图 | 主题 | 序列（FRED id） | calc |
|----|------|------------------|------|
| 1 | 经常账户 | IEABC | level |
| 2 | NIIP | IIPUSNETIQ | level |
| 3 | 贸易价格 | IQ、IR | yoy |
| 4 | 贸易条件 | W369RG3Q066SBEA | level |

## 分析要点（chartIntroNotes 底稿）

1. **广义美元**定汇率大方向；强美元压制出口、利好进口与压低进口通胀。
2. **AFE/EME** 看发达 vs 新兴结构；EME 单独走强常对应新兴风险/商品周期。
3. **贸易差额**负值扩大=逆差扩大；对照进出口同比拆主导方。
4. **BOP 出口/进口同比**与 Overview 实际进出口互补（名义 vs 实际）。
5. **经常账户**定外部融资需求；与贸易差额背离时看收入账户。
6. **NIIP** 是存量；估值效应可短期改善而不改流量。
7. **进出口价格同比**连接通胀与贸易条件；进口价格↑是滞胀通道。
8. **贸易条件指数**确认出口相对进口价格。

## 决策树

| 观察 | 图位 | 结论 |
|------|------|------|
| 美元↑ + 出口同比弱 | ①1+①4 | 汇率压制外需 |
| 逆差扩大 + 进口主导 | ①3+①4 | 内需/库存驱动 |
| EME 单独走强 | ①2 | 新兴侧美元压力 |
| 经常账户↓ + NIIP↓ | ②1+②2 | 外部脆弱性上升 |
| 进口价格↑ + 贸易条件↓ | ②3+②4 | 进口成本冲击 |

## 数据与更新

- 12 条相关 FRED（10 新 seed + DTWEXBGS/DEXUSEU 复用；DEXUSEU 仅归 H.10 包不进模板）。
- seed：`externalDollarFredSeedCatalog.ts`；自检：`npm run data:verify-external-dollar -- --db`。
- 发布包：`us.frb.h10_fx`、`us.census.international_trade`、`us.bls.import_export_prices`、`us.bea.international_transactions`、`us.bea.iip`；贸易条件并入 `us.bea.gdp`。

## 维护规则

- 零重复：BOPTEXP/BOPTIMP ≠ EXPGSC1/IMPGSC1；IEABC ≠ NETFI。
- DB 只存水平值；yoy/月均在 `seriesCalcConfigMap`。
- 新增序列走 Agent B 手册六步 + 发布包归组。
