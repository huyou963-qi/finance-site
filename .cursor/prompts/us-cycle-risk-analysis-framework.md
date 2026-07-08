# Prompt：美国增长动能与衰退风险分析框架（宏观页内置模板）

> 与 `docs/US_CYCLE_RISK_ANALYSIS.md`、`src/lib/data/cycleRiskAnalysisLayout.ts` 保持一致。

## 框架定位

回答：**周期在扩张/见顶/收缩哪一段？衰退概率多高、哪种法先亮灯？增长动能加速还是熄火？** 为顶层周期定位与衰退择时服务。

分工：期限利差归货币域（本框架用概率/规则/活动指数）；就业/IP 归各域（本框架补实际收入、实际销售两条 NBER 同步硬数据）。

## 双模板结构（文件夹 folder-builtin-us-cycle-risk）

### ① builtin-us-cycle-risk-signals — 衰退风险 · 概率与规则

| 图 | 主题 | 序列（键） | calc |
|----|------|-----------|------|
| 1 | 模型概率 | mds:nyfed_us_recession_prob、RECPROUSM156N | none；RECPRO 需 x100 |
| 2 | Sahm 规则 | SAHMREALTIME | none |
| 3 | 活动综合 | CFNAI | none |
| 4 | NBER 校准 | USREC（柱） | none |

### ② builtin-us-cycle-risk-momentum — 增长动能 · 硬数据

| 图 | 主题 | 序列（FRED id） | calc |
|----|------|------------------|------|
| 1 | 实际个人收入(除转移) | W875RX1 | yoy |
| 2 | 实际制造与贸易销售 | CMRMTSPL | yoy |
| 3 | 实际可支配收入 | DSPIC96 | yoy |
| 4 | 实际最终销售 | FINSLC1 | yoy(季) |

## 分析要点（chartIntroNotes 底稿）

1. **NY Fed 概率（曲线模型，领先）先升；平滑概率（Chauvet-Piger 因子，同步）确认**。>50% 强信号。
2. **Sahm 规则**：3 月均失业率较前 12 月低点 +0.5pp 触发；极少假阳性。
3. **CFNAI**（85 指标，0=趋势）；3 月均 <-0.7 标志衰退。
4. **USREC** 作历史校准基准，看信号领先/滞后 NBER 多少。
5. **NBER 同步四指标**：就业/IP（他域）+ 实际个人收入(除转移) + 实际制造贸易销售；同比转负=硬确认。
6. **实际最终销售**剔除库存，比 GDP 更干净反映动能。

## 决策树

| 观察 | 图位 | 结论 |
|------|------|------|
| NY Fed 高 + Sahm 逼近 0.5 | ①1+①2 | 衰退风险上升 |
| CFNAI 深负 + 实际销售转负 | ①3+②2 | 衰退进行中 |
| 信号未亮 + 收入/最终销售正增 | ①+②1/④ | 扩张延续 |
| Sahm 触发 + 可支配收入转负 | ①2+②3 | 消费拖累临近 |
| NY Fed 回落 + 最终销售回升 | ①1+②4 | 风险缓解，或触底 |

## 数据与更新

- 9 序列：6 新 FRED（seed catalog `cycleRiskFredSeedCatalog.ts`）+ CFNAI/USREC(phase2 复用) + NY Fed 概率(Agent C 抓取，mds 键)。
- **RECPROUSM156N 源为分数**，模板用 `unit:"x100"` 与 NY Fed 概率(已百分比)对齐。
- BEA 个人收入/GDP 走经济日历包；其余月/季 probe。
- 自检：`npm run data:verify-cycle-risk -- --db`。

## 维护规则

- 零重复：避开利差(货币域)/就业·IP(他域)，用概率/规则/收入销售。
- 模板 ① 混用 `mds:`（nyfed）与 `fred:` 键——nyfed 需在 `fredCatalog.ts` loadMdsCatalog 的 `nyfed_` 前缀内才进 allowlist。
- 新增序列走 Agent B 手册六步 + 发布包归组。
