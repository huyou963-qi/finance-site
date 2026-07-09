# 美国制造业与库存周期分析框架

本文档与宏观页内置模板、`industryInventoryAnalysisLayout.ts`、`.cursor/prompts/us-industry-inventory-analysis-framework.md` 保持一致。
Spec 与接入记录见 [specs/us-industry-inventory.spec.md](./specs/us-industry-inventory.spec.md)。

## 核心问题（L0）

> 制造业景气是在扩张还是收缩？新订单/积压是否足以支撑产出？库存周期处于主动补库、被动积压，还是主动去库？产能利用率是否接近过热或深度闲置？

## 分析层级

| 层级 | 问题 | 主要指标 | 默认模板 |
|------|------|----------|----------|
| L1 软景气 | ISM 制造扩张/收缩？ | ISM PMI、ISM 新订单 | ① 图 1 |
| L2 硬订单 | Census M3 是否确认？ | 耐用品、耐用品(除运输) | ① 图 2 |
| L3 资本品 | 设备投资前瞻？ | 核心资本品新订单 | ① 图 3 |
| L4 积压 | 积压在积还是消？ | 未完成订单、ISM 库存 | ① 图 4 |
| L5 产出 | 制造产出动能？ | IPMAN | ② 图 1 |
| L6 库存 | 库存堆积还是消化？ | 总商业/制造业库存 | ② 图 2 |
| L7 库销比 | 相对销售的压力？ | 总业务/制造业库销比 | ② 图 3 |
| L8 产能 | 过热还是闲置？ | MCUMFN | ② 图 4 |

## 两模板链条

内置 **2 个** 四图模板（`layoutMode: 4`），文件夹 `folder-builtin-us-industry-inventory`。

| 顺序 | 模板 ID | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-industry-inventory-orders` | 制造业 · 景气与订单 | **默认第一步** |
| ② | `builtin-us-industry-inventory-cycle` | 制造业 · 产出库存与产能 | 订单说不清时 |

### 模板 ① — 景气与订单

| 图 | slotTitle | 序列 |
|----|-----------|------|
| 1 | L1 软景气 | ISM 制造业 PMI、ISM 新订单 |
| 2 | L2 硬订单 | 耐用品新订单同比、耐用品(除运输)同比 |
| 3 | L3 资本品 | 非国防资本品(除飞机)新订单同比 |
| 4 | L4 积压 | 耐用品未完成订单同比、ISM 库存分项（右轴） |

### 模板 ② — 产出库存与产能

| 图 | slotTitle | 序列 |
|----|-----------|------|
| 1 | L5 产出 | 工业生产·制造业同比 |
| 2 | L6 库存 | 总商业库存同比、制造业库存同比 |
| 3 | L7 库销比 | 总业务库销比、制造业库销比 |
| 4 | L8 产能 | 制造业产能利用率 |

## 与其他模板分工

| 相邻主题 | 归属 | 本维度不做 |
|----------|------|------------|
| INDPRO | 经济 Overview | 用 IPMAN |
| CMRMTSPL | cycle-risk | 引用他域销售 |
| MANEMP | 就业 | 不做就业端 |
| TCU | 框架页 mock | 用 MCUMFN |

## 决策树

| 观察 | 对照图位 | 典型结论 |
|------|----------|----------|
| ISM 新订单<50 + 硬订单同比转负 | ①1+①2 | 需求收缩，易转去库 |
| 新订单回升 + 未完成订单同比↑ | ①1+①4 | 积压加深，景气延续 |
| 订单弱 + 库销比上行 + IPMAN↓ | ①2+②3+②1 | 被动积压→主动去库 |
| 库销比下行 + 产能回升 | ②3+②4 | 去库尾声或补库 |
| 核心资本品订单持续扩张 | ①3 | 设备投资前景改善 |

## 数据与更新

- 13 序列：10 新 FRED（`industryInventoryFredSeedCatalog.ts`）+ 3 条 ISM（`mds:ism_us_ism_*`，首次占槽）。
- 发布包：`us.census.m3` / `us.census.mtis` / `us.frb.g17_capacity`；IPMAN 并入现有 `us.bls.industrial_production`。
- 自检：`npm run data:verify-industry-inventory -- --db`。

## 维护规则

- 零重复：IPMAN≠INDPRO，MCUMFN≠TCU；避开 CMRMTSPL/MANEMP。
- 模板 ① 混用 `mds:`（ISM）与 `fred:`；耐用品除运输用 **ADXTNO**（非过时的 ADEXUS）。
- 新增序列走 Agent B 手册六步 + 发布包归组。
