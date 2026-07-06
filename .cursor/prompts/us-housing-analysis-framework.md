# Prompt：美国住房与地产分析框架（宏观页内置模板）

> 与 `docs/US_HOUSING_ANALYSIS.md`、`src/lib/data/housingAnalysisLayout.ts` 保持一致。三处同步更新。

## 框架定位

回答：**房地产周期在扩张/见顶/收缩哪一段？利率对购房需求压制到哪一步？** 住房是利率最敏感、领先整体经济 2–4 季度的部门。

分工：总开工 HOUST 归经济 Overview（本框架用单户开工 HOUST1F）；CPI 居住成本归通胀域；国债/政策利率归货币域（本框架只用抵押利率）。

## 双模板结构（文件夹 folder-builtin-us-housing）

### ① builtin-us-housing-activity — 供需与景气（量）

| 图 | 主题 | 序列（FRED id） | calc |
|----|------|------------------|------|
| 1 | 领先 | PERMIT、HOUST1F | yoy |
| 2 | 销售 | HSN1F | yoy |
| 3 | 库存 | MSACSR | level（月数） |
| 4 | 完工 | COMPUTSA | yoy |

### ② builtin-us-housing-price-finance — 价格与融资（价）

| 图 | 主题 | 序列（FRED id） | calc |
|----|------|------------------|------|
| 1 | 房价 | CSUSHPINSA | yoy |
| 2 | 融资 | MORTGAGE30US、MORTGAGE15US | 月均 |
| 3 | 自有率 | RHORUSQ156N | level |
| 4 | 信用 | DRSFRMACBS | level |

## 分析要点（chartIntroNotes 底稿）

1. **建筑许可领先开工 1–2 月、领先房价/GDP 2–4 季度**；许可同比转负=见顶最早信号。
2. **新屋销售利率最敏感**，先于开工与房价反应。
3. **库存月数**：<4 紧俏支撑房价，>6 过剩压价；跳升先于开工下滑。
4. **完工滞后开工 6–12 月**，高位+销售弱=供给压力利空房价。
5. **房价同比转负历史少见**，是深度调整信号；领先 CPI 住房 12–18 月。
6. **抵押利率是月供核心**，↑压制需求；对照新屋销售看压制是否生效。
7. **自有率**反映可负担性；高利率+高房价→见顶回落。
8. **单户抵押拖欠率**是信用质量、周期最后确认；与货币域信用卡/工商拖欠对照。

## 决策树

| 观察 | 图位 | 结论 |
|------|------|------|
| 许可转负 + 库存跳升 | ①1+①3 | 见顶，开工/价格承压 |
| 利率高 + 新屋销售弱 | ②2+①2 | 利率压制生效 |
| 房价放缓 + 完工高 | ②1+①4 | 房价下行风险 |
| 拖欠抬头 + 自有率落 | ②4+②3 | 信用周期下行 |
| 许可回升 + 利率见顶落 | ①1+②2 | 触底，地产先复苏 |

## 数据与更新

- 11 条全 FRED；seed catalog `housingFredSeedCatalog.ts`（含日历型 Census 月频 + probe 型周/季频）。
- 发布包：Census 新建住宅并入现有 `us.bls.housing_starts`；新增 `us.census.new_home_sales`、`us.nar.existing_home_sales`、`us.freddiemac.pmms`、`us.census.homeownership`；DRSFRMACBS 并入现有 `us.frb.chargeoff_delinquency`；CSUSHPINSA 用现有 `us.case_shiller`。
- **成屋销售 EXHOSLUSM495S**：NAR 许可 FRED 仅回约 1 年，已入库累积但暂不进模板。
- 自检：`npm run data:verify-housing -- --db`。

## 维护规则

- 零重复：单户开工 HOUST1F ≠ 总开工 HOUST（后者属经济 Overview）。
- DB 只存水平值；yoy/月均在 `seriesCalcConfigMap`。
- 新增序列走 Agent B 手册六步 + 发布包归组，先入库 verify 通过再进模板。
