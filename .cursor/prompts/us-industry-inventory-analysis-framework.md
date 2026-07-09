# Prompt：美国制造业与库存周期分析框架（宏观页内置模板）

> 与 `docs/US_INDUSTRY_INVENTORY_ANALYSIS.md`、`src/lib/data/industryInventoryAnalysisLayout.ts` 保持一致。

## 框架定位

回答：**制造景气扩张还是收缩？订单/积压能否支撑产出？库存处于补库还是去库？产能是否过热？** 落地框架页 `activity`（生产与景气）。

分工：INDPRO 归 Overview；CMRMTSPL 归 cycle-risk；就业归 labor；本框架用 ISM + M3 订单 + IPMAN/库存/库销比/MCUMFN。

## 双模板结构（文件夹 folder-builtin-us-industry-inventory）

### ① builtin-us-industry-inventory-orders — 制造业 · 景气与订单

| 图 | 主题 | 序列（键） | calc |
|----|------|-----------|------|
| 1 | 软景气 | mds:ism_us_ism_headline、mds:ism_us_ism_new_orders | none |
| 2 | 硬订单 | DGORDER、ADXTNO | yoy |
| 3 | 资本品 | NEWORDER | yoy |
| 4 | 积压 | AMDMUO（左）、mds:ism_us_ism_inventories（右） | yoy / none |

### ② builtin-us-industry-inventory-cycle — 制造业 · 产出库存与产能

| 图 | 主题 | 序列（FRED id） | calc |
|----|------|------------------|------|
| 1 | 产出 | IPMAN | yoy |
| 2 | 库存 | BUSINV、AMTMTI | yoy |
| 3 | 库销比 | ISRATIO、MNFCTRIRSA | none |
| 4 | 产能 | MCUMFN | none |

## 分析要点

1. **ISM 新订单领先产出**；与硬订单同向才确认转折。
2. **ADXTNO 去运输噪音**，比 DGORDER 更稳。
3. **NEWORDER** 盯设备投资与利率敏感 capex。
4. **AMDMUO↑ + ISM 库存↑ + 新订单↓** = 被动积压。
5. **库销比上行** = 去库压力；**下行** = 补库空间。
6. **MCUMFN** 看产能松紧（长期 >80% 偏紧）。

## 决策树

| 观察 | 图位 | 结论 |
|------|------|------|
| ISM<50 + 硬订单负 | ①1+①2 | 需求收缩 |
| 订单回升 + 积压↑ | ①1+①4 | 景气延续 |
| 订单弱 + 库销比↑ + IPMAN↓ | ①2+②3+②1 | 去库/衰退风险 |
| 库销比↓ + 产能回升 | ②3+②4 | 补库启动 |

## 数据与更新

- seed：`industryInventoryFredSeedCatalog.ts`；ISM 复用 TE 抓取。
- 发布包：m3 / mtis / g17_capacity；IPMAN→industrial_production。
- 自检：`npm run data:verify-industry-inventory -- --db`。

## 维护规则

- 零重复：避开 INDPRO / CMRMTSPL / MANEMP / TCU。
- 耐用品除运输键为 **ADXTNO**。
