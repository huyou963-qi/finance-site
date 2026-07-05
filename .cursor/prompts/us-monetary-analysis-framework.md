# Prompt：美国货币政策与金融条件分析框架（宏观页内置模板）

> 与 `docs/US_MONETARY_ANALYSIS.md`、`src/lib/data/monetaryAnalysisLayout.ts` 保持一致。
> 修改模板结构/指标/文案时，三处同步更新。

## 框架定位

回答：**货币政策多紧？沿「利率 → 金融条件 → 银行信贷 → 信用质量」的传导走到了哪一步？**

与相邻框架分工：目标利率与 10Y-2Y 归经济 Overview；通胀预期锚定归 CPI 域；TGA/财政流动性归财政域；本框架专注政策立场与传导链。

## 双模板结构（文件夹 folder-builtin-us-monetary）

### ① builtin-us-monetary-overview — 货币政策 · 立场与流动性

| 图 | 主题 | 序列（FRED id） | calc |
|----|------|------------------|------|
| 1 | 政策利率 vs 市场定价 | EFFR、DGS2 | 月均 |
| 2 | 实际利率分解 | DFII10、T10YIE | 月均 |
| 3 | 联储资产 vs RRP | WALCL（左）、RRPONTSYD（右） | 月均 |
| 4 | 期限结构 | DGS10（左）、T10Y3M（右） | 月均 |

### ② builtin-us-monetary-conditions — 金融条件 · 信贷与压力

| 图 | 主题 | 序列（FRED id） | calc |
|----|------|------------------|------|
| 1 | 金融条件 | NFCI | 月均 |
| 2 | 信用利差 | BAMLH0A0HYM2、BAMLC0A0CM | 月均 |
| 3 | 银行信贷量价 | DRTSCILM（柱，左）、BUSLOANS（右） | SLOOS 原值；BUSLOANS yoy+季末对齐 |
| 4 | 拖欠率 | DRCCLACBS、DRBLACBS | 季频原值 |

## 分析要点（chartIntroNotes 的知识底稿）

1. **2Y 是政策预期的定价**：2Y−EFFR 剪刀差方向先于政策转向。
2. **名义 = 实际 + 预期**：10Y ≈ DFII10 + T10YIE；实际利率 >2% 历史限制区；实际利率驱动的紧缩才真正压估值/地产。
3. **RRP 是 QT 缓冲垫**：RRP 趋零后 QT 直接抽银行准备金，流动性事件风险上升（2019 回购危机先例）。
4. **10Y-3M 优于 10Y-2Y 做衰退模型**（NY Fed 口径）；解除倒挂的方式决定含义（bull steepening=降息将至 / bear steepening=期限溢价）。
5. **NFCI 是传导计分卡**：加息但 NFCI 不升 = 传导被金融市场抵消 → Fed 更鹰。
6. **SLOOS 领先贷款增速 2–4 个季度**；贷款同比转负多伴随衰退。
7. **拖欠率是最后确认**：信用卡（居民）先于工商贷款（企业）恶化。

## 决策树

| 观察 | 图位 | 结论 |
|------|------|------|
| 2Y < EFFR + 10Y-3M 倒挂 | ①1+①4 | 定价宽松将至 |
| 实际利率高 + NFCI 松 | ①2+②1 | 传导被抵消，更紧更久 |
| RRP 归零 + QT 继续 | ①3 | 准备金稀缺风险 |
| SLOOS 紧 + HY 阔 | ②3+②2 | 信贷收缩前兆 |
| 拖欠加速 + 贷款负增 | ②4+②3 | 信用周期下行确认，转向临近 |

## 数据与更新

- 15 条全 FRED；seed catalog `monetaryFredSeedCatalog.ts`；发布包分组见 `releasePackageCatalog.ts` 的 probePkg 段（按 FRED 官方 Release 字段分组）。
- ICE OAS 两条历史仅近 3 年（许可限制），持续累积。
- 自检：`npm run data:verify-monetary -- --db`。

## 维护规则

- 指标零重复：不得复制 DFEDTARU/T10Y2Y/T5YIE（分属其他模板）。
- DB 只存水平值；YoY/月均/季对齐全部在 `seriesCalcConfigMap`。
- 新增序列走 Agent B 手册六步 + 发布包归组，先入库 verify 通过再进模板。
