# Prompt：美国消费与居民资产负债分析框架（宏观页内置模板）

> 与 `docs/US_CONSUMER_BALANCE_ANALYSIS.md`、`src/lib/data/consumerBalanceAnalysisLayout.ts` 保持一致。三处同步更新。

## 框架定位

回答：**居民消费动能在加速还是熄火？家庭资产负债表是支撑还是拖累？消费信贷扩张是否伴随信用恶化？**

分工：Overview 用 PCEC96/RSAFS 扫一眼；本框架用 RSXFS + PCE 耐用品/服务分项。收入动能归周期域（DSPIC96/W875RX1）；拖欠率归货币域（本框架用核销率 CORCCACBS）。

## 双模板结构（文件夹 folder-builtin-us-consumer-balance）

### ① builtin-us-consumer-balance-spending — 消费 · 支出与景气

| 图 | 主题 | 序列（FRED id） | calc |
|----|------|------------------|------|
| 1 | 零售贸易 | RSXFS | yoy |
| 2 | PCE 结构 | PCEDGC96、PCESC96 | yoy |
| 3 | 信心 | UMCSENT | level |
| 4 | 储蓄 | PSAVERT | level |

### ② builtin-us-consumer-balance-balance-sheet — 居民 · 资产负债与信用

| 图 | 主题 | 序列（FRED id） | calc |
|----|------|------------------|------|
| 1 | 净财富 | TNWBSHNO | yoy |
| 2 | 偿债 | TDSP | level |
| 3 | 消费信贷 | TOTALSL、REVOLSL | yoy |
| 4 | 核销 | CORCCACBS | level |

## 分析要点（chartIntroNotes 底稿）

1. **RSXFS ≠ RSAFS**：零售贸易 vs 含餐饮总额，口径互补。
2. **耐用品先于服务转弱**是软着陆常见形态；同掉则需求全面收缩。
3. **密歇根信心**领先硬数据；与零售背离时以硬数据为准。
4. **储蓄率**高 = 缓冲或预防性储蓄，需对照支出图。
5. **净财富同比**转负后消费常滞后 1–2 季。
6. **偿债比率**抬升限制加杠杆。
7. **循环信贷**比总量更敏感。
8. **核销率**滞后于拖欠率，是信用周期确认信号。

## 决策树

| 观察 | 图位 | 结论 |
|------|------|------|
| 零售转负 + 耐用品先掉 | ①1+①2 | 商品收缩，盯服务 |
| 信心跌、零售稳 | ①3+①1 | 情绪噪声 |
| 储蓄低 + 偿债升 | ①4+②2 | 缓冲耗尽 |
| 净财富负 + 零售弱 | ②1+①1 | 财富效应拖累 |
| 循环信贷↑ + 核销抬头 | ②3+②4 | 信用风险上升 |

## 数据与更新

- 11 条全 FRED（10 新 seed + UMCSENT 复用）；catalog `consumerBalanceFredSeedCatalog.ts`。
- 发布包：零售/个人收入/核销并入现有包；新建 G.19、Z.1、DSR 三个 probe 包。
- 自检：`npm run data:verify-consumer-balance -- --db`。

## 维护规则

- 零重复：RSXFS≠RSAFS；CORCCACBS≠DRCCLACBS；不占 PCEC96/DSPIC96。
- DB 只存水平值；yoy 在 `seriesCalcConfigMap`。
- 新增序列走 Agent B 手册六步 + 发布包归组。
